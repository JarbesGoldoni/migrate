import { existsSync } from "node:fs"
import { readdir, readFile, stat } from "node:fs/promises"
import { extname, join, normalize, relative, resolve, sep } from "node:path"
import { Hono } from "hono"
import { streamSSE } from "hono/streaming"
import { isBatchPhase, isLocale, isProjectPhase, type HttpRequestSpec, type ModelRef, type ServerEvent } from "../shared/types"
import type { EventBus } from "./bus"
import { systemOpener, type WorkspaceOpener } from "./editors"
import type { Engine } from "./engine/engine"
import { listDirectory } from "./fsbrowse"
import { NotFoundError, type Pipeline } from "./pipeline"
import { runPreflight } from "./preflight"
import { createSample } from "./sample"
import type { Store } from "./store"
import type { Exec } from "./util/exec"

export type AppDeps = {
  pipeline: Pipeline
  engine: Engine
  store: Store
  bus: EventBus
  exec: Exec
  webRoot?: string
  version: string
  opener?: WorkspaceOpener
}

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".json": "application/json",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
}

export function createApp(deps: AppDeps) {
  const app = new Hono()
  const { pipeline, engine, store, bus, exec } = deps
  const opener = deps.opener ?? systemOpener(exec)

  app.onError((error, c) => {
    const status = error instanceof NotFoundError ? 404 : 500
    return c.json({ error: error.message }, status)
  })

  app.get("/api/health", (c) => c.json({ ok: true, version: deps.version }))

  app.get("/api/engine", async (c) => c.json(await engine.info()))

  app.get("/api/editors", (c) => c.json(opener.editors()))

  app.get("/api/fs", async (c) => {
    try {
      return c.json(await listDirectory(c.req.query("path")))
    } catch (error) {
      return c.json({ error: (error as Error).message }, 400)
    }
  })

  app.get("/api/preflight", async (c) => {
    const path = c.req.query("path")
    if (!path) return c.json({ error: "path is required" }, 400)
    return c.json(await runPreflight(path, { exec, engine: () => engine.info() }))
  })

  app.post("/api/sample", async (c) => c.json({ path: await createSample(exec) }))

  app.get("/api/projects", async (c) => c.json(await store.list()))

  app.get("/api/migrations", async (c) => c.json(await pipeline.migrations()))

  app.post("/api/projects", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as {
      source?: string
      model?: ModelRef
      target?: string
      stack?: unknown
      language?: string
    }
    if (!body.source) return c.json({ error: "source is required" }, 400)
    return c.json(
      await pipeline.createProject({
        source: body.source,
        model: body.model,
        target: body.target,
        stack: body.stack,
        language: isLocale(body.language) ? body.language : undefined,
      }),
    )
  })

  app.get("/api/projects/:id", async (c) => c.json(await pipeline.snapshot(c.req.param("id"))))

  app.get("/api/projects/:id/history", async (c) => c.json(await pipeline.history(c.req.param("id"))))

  app.patch("/api/projects/:id", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as {
      model?: ModelRef
      target?: string
      stack?: unknown
      language?: string
    }
    return c.json(
      await pipeline.updateProject(c.req.param("id"), {
        model: body.model,
        target: body.target,
        stack: body.stack,
        language: isLocale(body.language) ? body.language : undefined,
      }),
    )
  })

  app.delete("/api/projects/:id", async (c) =>
    c.json(await pipeline.deleteProject(c.req.param("id"), { branch: c.req.query("branch") === "1" })),
  )

  app.post("/api/projects/:id/export", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { branch?: string }
    return c.json(await pipeline.exportBranch(c.req.param("id"), body.branch))
  })

  app.post("/api/projects/:id/open", async (c) => {
    const project = await pipeline.project(c.req.param("id"))
    const body = (await c.req.json().catch(() => ({}))) as { editor?: string }
    const opened = body.editor ? await opener.editor(project.workspace, body.editor) : await opener.folder(project.workspace)
    return opened
      ? c.json({ opened, path: project.workspace })
      : c.json({ opened, path: project.workspace, error: `Could not open ${project.workspace}` }, 422)
  })

  app.post("/api/projects/:id/run", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { phase?: string; batch?: string }
    const phase = body.phase ?? ""
    if (!isProjectPhase(phase) && !isBatchPhase(phase)) return c.json({ error: `Unknown phase ${phase}` }, 400)
    const result = await pipeline.start(c.req.param("id"), phase, isBatchPhase(phase) ? body.batch : undefined)
    return c.json(result, result.started ? 202 : 409)
  })

  app.post("/api/projects/:id/stop", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { phase?: string; batch?: string }
    const phase = body.phase ?? ""
    if (!isProjectPhase(phase) && !isBatchPhase(phase)) return c.json({ error: `Unknown phase ${phase}` }, 400)
    return c.json({ stopped: pipeline.stop(c.req.param("id"), phase, body.batch) })
  })

  app.post("/api/projects/:id/runtime", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { action?: string }
    const action = body.action === "down" ? "down" : "up"
    return c.json(await pipeline.runtime(c.req.param("id"), action))
  })

  app.post("/api/projects/:id/playground", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { side?: string; request?: Partial<HttpRequestSpec> }
    const side = body.side === "legacy" || body.side === "v2" ? body.side : "both"
    const request: HttpRequestSpec = {
      method: (body.request?.method ?? "GET").toUpperCase(),
      path: body.request?.path ?? "/",
      headers: body.request?.headers ?? {},
      query: body.request?.query ?? {},
      body: body.request?.body,
    }
    return c.json(await pipeline.playground(c.req.param("id"), side, request))
  })

  app.get("/api/projects/:id/file", async (c) => {
    const project = await pipeline.project(c.req.param("id"))
    const root = resolve(project.workspace)
    const rel = (c.req.query("path") ?? "").replace(/^\/+/, "")
    const file = [rel, `legacy/${rel}`]
      .map((r) => resolve(root, r))
      .find((f) => f.startsWith(root + sep) && existsSync(f))
    const info = file ? await stat(file) : undefined
    if (!file || !info?.isFile()) return c.json({ error: "File not found" }, 404)
    const path = relative(root, file)
    if (isCompiled(path)) return c.json({ path, from: 0, to: 0, total: 0, lines: [], size: info.size, binary: true })
    if (info.size > 2_000_000) return c.json({ error: "File too large" }, 413)
    const buffer = await readFile(file)
    if (buffer.subarray(0, 8000).includes(0)) return c.json({ path, from: 0, to: 0, total: 0, lines: [], size: info.size, binary: true })
    const lines = buffer.toString("utf8").split("\n")
    const start = Number.parseInt(c.req.query("start") ?? "", 10)
    const end = Number.parseInt(c.req.query("end") ?? "", 10)
    const cap = c.req.query("full") === "1" ? 20_000 : 400
    const from = Number.isFinite(start) ? Math.max(1, start - 4) : 1
    const to = Number.isFinite(end) ? Math.min(lines.length, Math.max(end, start) + 4) : Math.min(lines.length, cap)
    return c.json({ path, from, to, total: lines.length, lines: lines.slice(from - 1, to), size: info.size })
  })

  app.get("/api/projects/:id/tree", async (c) => {
    const project = await pipeline.project(c.req.param("id"))
    const root = resolve(project.workspace)
    const dir = resolve(root, (c.req.query("dir") ?? "v2").replace(/^\/+/, ""))
    if (!dir.startsWith(root + sep) && dir !== root) return c.json({ error: "Outside workspace" }, 400)
    return c.json(await listFiles(dir, root))
  })

  app.get("/api/projects/:id/events", async (c) => {
    const id = c.req.param("id")
    await pipeline.project(id)
    return streamSSE(c, async (stream) => {
      const queue: ServerEvent[] = []
      let wake: (() => void) | undefined
      let closed = false
      const unsubscribe = bus.subscribe(id, (event) => {
        queue.push(event)
        wake?.()
      })
      stream.onAbort(() => {
        closed = true
        unsubscribe()
        wake?.()
      })
      await stream.writeSSE({ event: "ready", data: "{}" })
      while (!closed) {
        if (!queue.length) {
          await Promise.race([new Promise<void>((r) => (wake = r)), stream.sleep(15_000)])
          wake = undefined
        }
        if (closed) break
        if (!queue.length) {
          await stream.writeSSE({ event: "ping", data: "{}" })
          continue
        }
        for (const event of queue.splice(0)) await stream.writeSSE({ data: JSON.stringify(event) })
      }
      unsubscribe()
    })
  })

  if (deps.webRoot) {
    const webRoot = resolve(deps.webRoot)
    app.get("*", async (c) => {
      const pathname = decodeURIComponent(new URL(c.req.url).pathname)
      if (pathname.startsWith("/api/")) return c.json({ error: "Not found" }, 404)
      const candidate = normalize(join(webRoot, pathname))
      const file =
        candidate.startsWith(webRoot) && existsSync(candidate) && (await stat(candidate)).isFile()
          ? candidate
          : join(webRoot, "index.html")
      const body = await readFile(file)
      const cache = file.includes(`${sep}assets${sep}`) ? "public, max-age=31536000, immutable" : "no-cache"
      return c.body(body, 200, {
        "content-type": MIME[extname(file)] ?? "application/octet-stream",
        "cache-control": cache,
      })
    })
  }

  return app
}

// Folders people never want to browse: dependencies, caches and build output.
const SKIP = new Set([
  ".git",
  "node_modules",
  "vendor",
  ".gitkeep",
  "__pycache__",
  ".pytest_cache",
  ".mypy_cache",
  ".ruff_cache",
  ".venv",
  "venv",
  "target",
  "_build",
  "deps",
  ".gradle",
  ".idea",
  ".vscode",
  "obj",
  "bin",
  "coverage",
  ".next",
  ".turbo",
  ".DS_Store",
])

const COMPILED = /\.(pyc|pyo|class|o|obj|so|dll|dylib|exe|jar|war|beam|wasm|a|lib)$/i

export function isCompiled(path: string) {
  return COMPILED.test(path)
}

async function listFiles(dir: string, root: string, limit = 5000) {
  const files: string[] = []
  let truncated = false
  const walk = async (current: string) => {
    const entries = await readdir(current, { withFileTypes: true }).catch(() => [])
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (SKIP.has(entry.name) || entry.name.endsWith(".tmp")) continue
      const full = join(current, entry.name)
      if (entry.isDirectory()) await walk(full)
      else if (isCompiled(entry.name)) continue
      else if (files.length < limit) files.push(relative(root, full))
      else truncated = true
    }
  }
  await walk(dir)
  return { files, truncated }
}

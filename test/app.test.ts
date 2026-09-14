import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { join } from "node:path"
import { createApp } from "../src/server/app"
import type { WorkspaceOpener } from "../src/server/editors"
import { EventBus } from "../src/server/bus"
import { Pipeline } from "../src/server/pipeline"
import { Store } from "../src/server/store"
import { FakeEngine, gitRepo, isolatedExec, tempDir, writeFiles } from "./helpers"

let previousHome: string | undefined

beforeAll(async () => {
  previousHome = process.env.MIGRATE_HOME
  process.env.MIGRATE_HOME = await tempDir()
})

afterAll(() => {
  if (previousHome === undefined) delete process.env.MIGRATE_HOME
  else process.env.MIGRATE_HOME = previousHome
})

async function makeApp(webRoot?: string, opener?: WorkspaceOpener) {
  const home = await tempDir()
  const engine = new FakeEngine()
  const bus = new EventBus()
  const store = new Store(join(home, "projects.json"))
  const pipeline = new Pipeline({ store, engine, bus, exec: isolatedExec, workspaces: join(home, "ws"), bootTimeoutMs: 500, httpTimeoutMs: 500 })
  const app = createApp({ pipeline, engine, store, bus, exec: isolatedExec, webRoot, version: "9.9.9", opener })
  const json = async (path: string, init?: RequestInit) => {
    const response = await app.request(path, init)
    return { status: response.status, body: (await response.json()) as any }
  }
  const post = (path: string, body: unknown, method = "POST") =>
    json(path, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
  return { app, json, post, engine, bus }
}

describe("HTTP API", () => {
  test("serves engine, targets, filesystem and preflight", async () => {
    const { json } = await makeApp()
    expect((await json("/api/health")).body).toEqual({ ok: true, version: "9.9.9" })
    expect((await json("/api/engine")).body.ready).toBe(true)
    const targets = (await json("/api/targets")).body
    expect(targets.find((t: { id: string }) => t.id === "go")).toEqual({ id: "go", label: "Go", cost: 1, recommended: true })
    expect(targets.map((t: { id: string }) => t.id)).toContain("rust")
    expect(Array.isArray((await json("/api/editors")).body)).toBe(true)
    const dir = await tempDir()
    await writeFiles(dir, { "app/package.json": "{}" })
    expect((await json(`/api/fs?path=${encodeURIComponent(dir)}`)).body.entries[0].markers).toEqual(["node"])
    expect((await json(`/api/fs?path=${encodeURIComponent(join(dir, "none"))}`)).status).toBe(400)
    expect((await json("/api/preflight")).status).toBe(400)
    const preflight = await json(`/api/preflight?path=${encodeURIComponent(join(dir, "app"))}`)
    expect(preflight.body.checks.find((c: { id: string }) => c.id === "engine").ok).toBe(true)
  })

  test("creates and drives a migration", async () => {
    const { json, post, app, engine, bus } = await makeApp()
    const repo = await gitRepo({ "src/app.js": "line1\nline2\nline3\nline4\nline5\nline6\nline7\nline8\nline9\nline10" })
    expect((await post("/api/projects", {})).status).toBe(400)
    const created = await post("/api/projects", { source: repo, target: "typescript", language: "pt-BR" })
    const id = created.body.id
    expect(created.body.target).toBe("typescript")
    expect(created.body.language).toBe("pt-BR")
    expect((await json("/api/projects")).body).toHaveLength(1)
    expect((await json(`/api/projects/${id}`)).body.project.id).toBe(id)
    expect((await json("/api/projects/nope")).status).toBe(404)
    expect((await post(`/api/projects/${id}`, { target: "go" }, "PATCH")).body.target).toBe("go")
    expect((await post(`/api/projects/${id}`, { language: "es" }, "PATCH")).body.language).toBe("es")
    expect((await post(`/api/projects/${id}`, { language: "klingon" }, "PATCH")).body.language).toBe("es")
    const migrations = await json("/api/migrations")
    expect(migrations.body).toHaveLength(1)
    expect(migrations.body[0].summary).toMatchObject({ missing: false, steps: 0 })
    expect((await json(`/api/projects/${id}/history`)).body).toEqual([])
    expect((await json("/api/projects/nope/history")).status).toBe(404)

    expect((await post(`/api/projects/${id}/run`, { phase: "bogus" })).status).toBe(400)
    const blocked = await post(`/api/projects/${id}/run`, { phase: "entrypoints" })
    expect(blocked).toEqual({ status: 409, body: { started: false, reason: "Map the architecture first" } })
    engine.hang = true
    expect((await post(`/api/projects/${id}/run`, { phase: "discover" })).status).toBe(202)
    await Bun.sleep(30)
    expect((await post(`/api/projects/${id}/stop`, { phase: "nope" })).status).toBe(400)
    expect((await post(`/api/projects/${id}/stop`, { phase: "discover" })).body).toEqual({ stopped: true })

    const file = await json(`/api/projects/${id}/file?path=src/app.js&start=6&end=7`)
    expect(file.body).toMatchObject({ path: "legacy/src/app.js", from: 2, to: 10, total: 10 })
    expect((await json(`/api/projects/${id}/file?path=legacy/src/app.js`)).body.lines).toHaveLength(10)
    expect((await json(`/api/projects/${id}/file?path=../../../../etc/passwd`)).status).toBe(404)
    expect((await json(`/api/projects/${id}/file?path=legacy`)).status).toBe(404)
    expect((await json(`/api/projects/${id}/tree?dir=legacy`)).body.files).toEqual(["legacy/src/app.js"])
    expect((await json(`/api/projects/${id}/tree?dir=../..`)).status).toBe(400)

    const played = await post(`/api/projects/${id}/playground`, { side: "legacy", request: { path: "/x" } })
    expect(played.body.legacy.status).toBe(0)
    expect((await post(`/api/projects/${id}/playground`, {})).body.v2.status).toBe(0)
    expect((await post(`/api/projects/${id}/runtime`, { action: "down" })).status).toBe(500)

    const controller = new AbortController()
    const response = await app.request(`/api/projects/${id}/events`, { signal: controller.signal })
    const reader = response.body!.getReader()
    const first = new TextDecoder().decode((await reader.read()).value)
    expect(first).toContain("event: ready")
    bus.emit(id, { type: "changed", artifact: "x" })
    const second = new TextDecoder().decode((await reader.read()).value)
    expect(second).toContain('"artifact":"x"')
    controller.abort()
    await reader.cancel().catch(() => {})
    expect((await json("/api/projects/nope/events")).status).toBe(404)
  })

  test("opens, exports and deletes a migration", async () => {
    const opened: string[] = []
    const opener: WorkspaceOpener = {
      editors: () => [{ id: "code", label: "VS Code" }],
      editor: async (path, id) => (opened.push(`${id}:${path}`), true),
      folder: async (path) => (opened.push(`folder:${path}`), false),
    }
    const { json, post, app } = await makeApp(undefined, opener)
    const repo = await gitRepo({ "a.js": "1" })
    const id = (await post("/api/projects", { source: repo })).body.id
    expect((await json("/api/editors")).body).toEqual([{ id: "code", label: "VS Code" }])
    expect((await post(`/api/projects/${id}/open`, { editor: "code" })).body.opened).toBe(true)
    const folder = await post(`/api/projects/${id}/open`, {})
    expect(folder.status).toBe(422)
    expect(folder.body.error).toContain("Could not open")
    expect(opened.map((o) => o.split(":")[0])).toEqual(["code", "folder"])

    const exported = await post(`/api/projects/${id}/export`, { branch: "review/v2" })
    expect(exported.body).toMatchObject({ branch: "review/v2", command: "git checkout review/v2" })
    const deleted = await app.request(`/api/projects/${id}?branch=1`, { method: "DELETE" })
    expect(await deleted.json()).toEqual({ deleted: true })
    expect((await json("/api/projects")).body).toEqual([])
  })

  test("creates the sample project", async () => {
    const { post } = await makeApp()
    const sample = await post("/api/sample", {})
    expect(sample.body.path).toContain("legacy-shop-")
  })

  test("serves the built web app with SPA fallback", async () => {
    const web = await tempDir()
    await writeFiles(web, { "index.html": "<html>app</html>", "assets/app.js": "console.log(1)", "logo.svg": "<svg/>" })
    const { app } = await makeApp(web)
    const index = await app.request("/")
    expect(await index.text()).toBe("<html>app</html>")
    expect(index.headers.get("cache-control")).toBe("no-cache")
    const asset = await app.request("/assets/app.js")
    expect(asset.headers.get("content-type")).toContain("javascript")
    expect(asset.headers.get("cache-control")).toContain("immutable")
    expect((await app.request("/logo.svg")).headers.get("content-type")).toBe("image/svg+xml")
    expect(await (await app.request("/projects/abc")).text()).toBe("<html>app</html>")
    expect((await app.request("/api/unknown")).status).toBe(404)
  })
})

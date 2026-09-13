import { type ChildProcess, spawn } from "node:child_process"
import { randomUUID } from "node:crypto"
import { existsSync } from "node:fs"
import { mkdir, readFile } from "node:fs/promises"
import { homedir } from "node:os"
import { join } from "node:path"
import type { EngineInfo, ModelOption, ModelRef } from "../../shared/types"
import { engineDir } from "../paths"
import { freePort } from "../util/ports"
import { toActivity } from "./activity"
import { resolveEngineBinary } from "./binary"
import type { Engine, RunOptions, RunResult } from "./engine"
import { readSse, type SseEvent } from "./sse"

const PERMISSIONS = { edit: "allow", bash: "allow", webfetch: "allow", external_directory: "allow" }

type Providers = {
  providers: Array<{ id: string; name: string; models: Record<string, { id: string; name: string }> }>
  default: Record<string, string>
}

export class OpencodeEngine implements Engine {
  private proc?: ChildProcess
  private base?: string
  private starting?: Promise<void>
  private readonly password = randomUUID()
  private stderr = ""
  private cachedInfo?: { at: number; info: EngineInfo }

  // The engine treats its working directory as a project; an empty home keeps
  // it from scanning a large folder such as the user's home on startup.
  private readonly home: string

  constructor(private readonly options: { binary?: string; home?: string } = {}) {
    this.home = options.home ?? engineDir()
  }

  async info(): Promise<EngineInfo> {
    if (this.cachedInfo && Date.now() - this.cachedInfo.at < 60_000) return this.cachedInfo.info
    try {
      await this.start()
      const providers = await this.call<Providers>("GET", "/config/providers", this.home)
      const models: ModelOption[] = providers.providers.flatMap((p) =>
        Object.values(p.models).map((m) => ({
          providerID: p.id,
          providerName: p.name,
          modelID: m.id,
          name: m.name || m.id,
        })),
      )
      const info: EngineInfo = {
        ready: true,
        models,
        defaultModel: (await recentModel(models)) ?? firstDefault(providers, models),
      }
      this.cachedInfo = { at: Date.now(), info }
      return info
    } catch (error) {
      return { ready: false, models: [], error: error instanceof Error ? error.message : String(error) }
    }
  }

  async run(options: RunOptions): Promise<RunResult> {
    await this.start()
    const dir = options.directory
    const sessionId = await this.session(options)
    const stream = new AbortController()
    const response = await fetch(`${this.base}/event?directory=${encodeURIComponent(dir)}`, {
      headers: this.headers(),
      signal: stream.signal,
    })
    if (!response.ok || !response.body) throw new Error(`Engine event stream failed (${response.status})`)

    const userMessages = new Set<string>()
    const texts = new Map<string, string>()
    const writes = new Set<string>()
    let error: string | undefined
    let connected: () => void = () => {}
    const ready = new Promise<void>((resolve) => (connected = resolve))
    const onAbort = () => this.call("POST", `/session/${sessionId}/abort`, dir).catch(() => {})
    options.signal?.addEventListener("abort", onAbort)

    const handle = (event: SseEvent) => {
      const props = event.properties ?? {}
      if (event.type === "server.connected") connected()
      const sid = props.sessionID ?? props.part?.sessionID ?? props.info?.sessionID
      if (sid !== sessionId) return false
      if (event.type === "message.updated") {
        if (props.info?.role === "user") userMessages.add(props.info.id)
        if (props.info?.error) error = describeError(props.info.error)
      }
      if (event.type === "message.part.updated") {
        const part = props.part
        if (part?.type === "text" && part.text?.trim() === options.prompt.trim()) userMessages.add(part.messageID)
        if (part?.type === "text" && !userMessages.has(part.messageID)) texts.set(part.id, part.text ?? "")
        const filePath = part?.state?.input?.filePath
        if (part?.type === "tool" && typeof filePath === "string" && ["write", "edit"].includes(part.tool)) {
          writes.add(filePath)
        }
        const activity = toActivity(event as never, {
          phase: options.phase,
          root: dir,
          isUserMessage: (id) => userMessages.has(id),
        })
        if (activity) options.onActivity(activity)
      }
      if (event.type === "permission.asked") {
        this.call("POST", `/permission/${props.id}/reply`, dir, { reply: "always" }).catch(() => {})
      }
      if (event.type === "question.asked") {
        this.call("POST", `/question/${props.id}/reject`, dir).catch(() => {})
      }
      if (event.type === "session.status" && props.status?.type === "retry") {
        options.onActivity({
          id: `retry-${props.status.attempt}`,
          at: Date.now(),
          phase: options.phase,
          kind: "system",
          title: `Provider busy, retrying (attempt ${props.status.attempt})`,
          detail: props.status.message,
        })
      }
      if (event.type === "session.error") error = describeError(props.error)
      return event.type === "session.idle"
    }

    const finished = (async () => {
      for await (const event of readSse(response.body!)) {
        if (handle(event)) return true
      }
      return false
    })().catch(() => false)

    await Promise.race([ready, new Promise((r) => setTimeout(r, 5_000))])
    await this.call("POST", `/session/${sessionId}/prompt_async`, dir, {
      ...(options.model ? { model: options.model } : {}),
      parts: [{ type: "text", text: options.prompt }],
    })

    const idle = await finished
    stream.abort()
    options.signal?.removeEventListener("abort", onAbort)
    if (!idle && !error) error = options.signal?.aborted ? "Stopped" : "The engine stopped unexpectedly"
    const text = [...texts.values()].filter((t) => t.trim()).at(-1) ?? ""
    return { sessionId, text, writes: [...writes], error: options.signal?.aborted ? "Stopped" : error }
  }

  stop() {
    this.proc?.kill()
    this.proc = undefined
    this.base = undefined
    this.starting = undefined
  }

  private async session(options: RunOptions) {
    if (options.sessionId) {
      const existing = await this.call<{ id: string }>("GET", `/session/${options.sessionId}`, options.directory).catch(
        () => undefined,
      )
      if (existing?.id) return existing.id
    }
    const created = await this.call<{ id: string }>("POST", "/session", options.directory, { title: options.title })
    return created.id
  }

  private headers() {
    return { authorization: `Basic ${Buffer.from(`opencode:${this.password}`).toString("base64")}` }
  }

  private async call<T>(method: string, path: string, directory: string, body?: unknown): Promise<T> {
    const url = `${this.base}${path}?directory=${encodeURIComponent(directory)}`
    const response = await fetch(url, {
      method,
      headers: { ...this.headers(), ...(body === undefined ? {} : { "content-type": "application/json" }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const text = await response.text()
    if (!response.ok) throw new Error(`${method} ${path} failed (${response.status}): ${text.slice(0, 300)}`)
    return (text ? JSON.parse(text) : undefined) as T
  }

  private start() {
    if (this.base) return Promise.resolve()
    if (this.starting) return this.starting
    this.starting = this.boot().catch((error) => {
      this.starting = undefined
      throw error
    })
    return this.starting
  }

  private async boot() {
    const binary = this.options.binary ?? resolveEngineBinary()
    if (!binary || !existsSync(binary)) throw new Error("The AI engine is not installed")
    const port = await freePort()
    this.stderr = ""
    await mkdir(this.home, { recursive: true })
    const proc = spawn(binary, ["serve", "--port", String(port), "--hostname", "127.0.0.1"], {
      cwd: this.home,
      stdio: ["ignore", "ignore", "pipe"],
      env: {
        ...process.env,
        OPENCODE_SERVER_PASSWORD: this.password,
        OPENCODE_CONFIG_CONTENT: JSON.stringify({ permission: PERMISSIONS }),
      },
    })
    this.proc = proc
    proc.stderr?.on("data", (d: Buffer) => {
      this.stderr = (this.stderr + d.toString()).slice(-4000)
    })
    proc.on("error", (error) => {
      this.stderr += error.message
    })
    proc.on("exit", () => {
      if (this.proc !== proc) return
      this.proc = undefined
      this.base = undefined
      this.starting = undefined
    })
    const base = `http://127.0.0.1:${port}`
    const deadline = Date.now() + 60_000
    while (Date.now() < deadline) {
      if (!this.proc) throw new Error(`The AI engine exited during startup. ${this.stderr.trim()}`)
      const ok = await fetch(`${base}/global/health`, { headers: this.headers(), signal: AbortSignal.timeout(2_000) })
        .then((r) => r.ok)
        .catch(() => false)
      if (ok) {
        this.base = base
        return
      }
      await new Promise((r) => setTimeout(r, 400))
    }
    proc.kill()
    throw new Error("The AI engine did not start within 60s")
  }
}

function describeError(error: unknown) {
  if (!error || typeof error !== "object") return String(error ?? "Unknown engine error")
  const e = error as { name?: string; message?: string; data?: { message?: string } }
  return e.data?.message ?? e.message ?? e.name ?? "Unknown engine error"
}

export async function recentModel(
  models: ModelOption[],
  stateHome = process.env.XDG_STATE_HOME ?? join(homedir(), ".local", "state"),
): Promise<ModelRef | undefined> {
  const raw = await readFile(join(stateHome, "opencode", "model.json"), "utf8").catch(() => "")
  if (!raw) return undefined
  const parsed = (() => {
    try {
      return JSON.parse(raw) as { recent?: ModelRef[] }
    } catch {
      return {}
    }
  })()
  const hit = (parsed.recent ?? []).find((r) =>
    models.some((m) => m.providerID === r.providerID && m.modelID === r.modelID),
  )
  return hit ? { providerID: hit.providerID, modelID: hit.modelID } : undefined
}

export function firstDefault(providers: Providers, models: ModelOption[]): ModelRef | undefined {
  for (const [providerID, modelID] of Object.entries(providers.default)) {
    if (models.some((m) => m.providerID === providerID && m.modelID === modelID)) return { providerID, modelID }
  }
  const first = models[0]
  return first ? { providerID: first.providerID, modelID: first.modelID } : undefined
}

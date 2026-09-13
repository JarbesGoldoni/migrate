import { randomBytes } from "node:crypto"
import { readFile } from "node:fs/promises"
import { basename, join } from "node:path"
import type { Batch } from "../shared/contracts"
import {
  type Activity,
  type BuildStep,
  type HttpRequestSpec,
  type ModelRef,
  type PhaseName,
  type PhaseState,
  type ProjectRecord,
  type ProjectSnapshot,
  type ProjectState,
  type Runtime,
  phaseKey,
} from "../shared/types"
import type { EventBus } from "./bus"
import type { Engine, RunResult } from "./engine/engine"
import { type Compose, compose, detectCompose, waitForHttp } from "./env/compose"
import { workspacesDir } from "./paths"
import { PHASES, type PhaseDefinition, type PhaseOps } from "./phases"
import { probeProject } from "./preflight"
import { composeProject, TARGETS, type PromptContext, targetOf } from "./prompts"
import { artifacts, readJson, type Store, writeJson } from "./store"
import { compareExpectation, compareResponses } from "./testing/compare"
import { writeCurlScripts } from "./testing/curl"
import { sendRequest } from "./testing/http"
import { type Exec, output } from "./util/exec"
import { extractJson } from "./util/json"
import { freePort } from "./util/ports"
import { commitAll, createWorkspace } from "./workspace"

export class NotFoundError extends Error {}

export type PipelineDeps = {
  store: Store
  engine: Engine
  bus: EventBus
  exec: Exec
  workspaces?: string
  httpTimeoutMs?: number
  bootTimeoutMs?: number
}

export type Snapshot = ProjectSnapshot & { activity: Activity[] }

export class Pipeline {
  private states = new Map<string, ProjectState>()
  private controllers = new Map<string, AbortController>()
  private locks = new Map<string, Promise<unknown>>()
  private composeCommand?: Promise<string[] | undefined>

  constructor(private readonly deps: PipelineDeps) {}

  async createProject(input: { source: string; model?: ModelRef; target?: string }) {
    const probe = await probeProject(input.source, this.deps.exec)
    if (!probe.exists) throw new Error(`Folder not found: ${probe.path}`)
    const id = randomBytes(3).toString("hex")
    const { workspace, branch } = await createWorkspace({
      probe,
      id,
      baseDir: this.deps.workspaces ?? workspacesDir(),
      exec: this.deps.exec,
    })
    const used = (await this.deps.store.list()).flatMap((p) => [p.ports.legacy, p.ports.v2])
    const legacy = await freePort(18080 + used.length, used)
    const v2 = await freePort(legacy + 1, [...used, legacy])
    const record: ProjectRecord = {
      id,
      name: probe.name,
      source: probe.path,
      workspace,
      branch,
      createdAt: Date.now(),
      model: input.model,
      target: input.target && TARGETS[input.target] ? input.target : "go",
      ports: { legacy, v2 },
    }
    await this.deps.store.put(record)
    return record
  }

  async project(id: string) {
    const project = await this.deps.store.get(id)
    if (!project) throw new NotFoundError(`Unknown migration ${id}`)
    return project
  }

  async updateProject(id: string, patch: { model?: ModelRef; target?: string }) {
    const project = await this.project(id)
    const next = {
      ...project,
      ...(patch.model ? { model: patch.model } : {}),
      ...(patch.target && TARGETS[patch.target] ? { target: patch.target } : {}),
    }
    await this.deps.store.put(next)
    return next
  }

  async snapshot(id: string): Promise<Snapshot> {
    const project = await this.project(id)
    const state = await this.stateOf(project)
    const snapshot = await this.deps.store.snapshot(project, state)
    return { ...snapshot, activity: this.deps.bus.activity(id) }
  }

  /** Start a phase in the background. Returns why it cannot start, if it cannot. */
  async start(id: string, phase: PhaseName, batchId?: string): Promise<{ started: boolean; reason?: string }> {
    const project = await this.project(id)
    const definition = PHASES[phase]
    if (!definition) return { started: false, reason: `Unknown phase ${phase}` }
    const key = phaseKey(phase, batchId)
    if (this.controllers.has(`${id}:${key}`)) return { started: false, reason: "Already running" }
    const snapshot = await this.snapshot(id)
    const batch = this.batchOf(snapshot, batchId)
    if (batchId && !batch) return { started: false, reason: `Unknown batch ${batchId}` }
    const blocked = definition.requires(snapshot, batch)
    if (blocked) return { started: false, reason: blocked }
    void this.runPhase(project, definition, batchId).catch(() => {})
    return { started: true }
  }

  stop(id: string, phase: PhaseName, batchId?: string) {
    const controller = this.controllers.get(`${id}:${phaseKey(phase, batchId)}`)
    controller?.abort()
    return Boolean(controller)
  }

  async playground(id: string, side: "legacy" | "v2" | "both", request: HttpRequestSpec) {
    const project = await this.project(id)
    const send = (port: number) =>
      sendRequest(`http://127.0.0.1:${port}`, request, { timeoutMs: this.deps.httpTimeoutMs })
    const [legacy, v2] = await Promise.all([
      side === "v2" ? undefined : send(project.ports.legacy),
      side === "legacy" ? undefined : send(project.ports.v2),
    ])
    const comparison = legacy && v2 ? compareResponses(legacy, v2) : undefined
    return { legacy, v2, comparison }
  }

  async runtime(id: string, action: "up" | "down") {
    const project = await this.project(id)
    const composer = await this.composer(project)
    if (!composer) throw new Error("The legacy environment is not ready")
    return this.lock(`${id}:runtime`, async () => {
      if (action === "down") {
        const result = await composer.down({ volumes: true })
        await this.setRuntime(project, { legacy: "down", v2: "down", message: undefined })
        return result
      }
      const snapshot = await this.snapshot(id)
      const services = ["legacy", ...(Object.keys(snapshot.ports).length ? ["v2"] : [])]
      await this.setRuntime(project, { legacy: "starting", ...(services.includes("v2") ? { v2: "starting" as const } : {}) })
      const result = await composer.up(services, { build: false })
      await this.checkRuntime(project, snapshot, services)
      return result
    })
  }

  // ── Phase execution ─────────────────────────────────────────────────────

  private async runPhase(project: ProjectRecord, definition: PhaseDefinition, batchId?: string, parent?: AbortSignal) {
    const key = phaseKey(definition.name, batchId)
    const controller = new AbortController()
    const onParentAbort = () => controller.abort()
    parent?.addEventListener("abort", onParentAbort)
    this.controllers.set(`${project.id}:${key}`, controller)
    await this.setPhase(project, key, { status: "running", startedAt: Date.now(), finishedAt: undefined, error: undefined, note: undefined })
    try {
      const note = await this.execute(project, definition, batchId, controller.signal)
      await this.setPhase(project, key, { status: "done", finishedAt: Date.now(), note })
    } catch (error) {
      const message = controller.signal.aborted ? "Stopped" : error instanceof Error ? error.message : String(error)
      this.activity(project, key, { kind: "error", title: `${definition.title} failed`, detail: message })
      await this.setPhase(project, key, { status: "failed", finishedAt: Date.now(), error: message })
      throw error
    } finally {
      parent?.removeEventListener("abort", onParentAbort)
      this.controllers.delete(`${project.id}:${key}`)
      await writeJson(join(project.workspace, artifacts.activity), this.deps.bus.activity(project.id)).catch(() => {})
    }
  }

  private async execute(project: ProjectRecord, definition: PhaseDefinition, batchId: string | undefined, signal: AbortSignal) {
    const key = phaseKey(definition.name, batchId)
    let snapshot = await this.snapshot(project.id)
    const batch = this.batchOf(snapshot, batchId)
    let note: string | undefined

    if (definition.prompt && definition.output && definition.parse) {
      const state = await this.stateOf(project)
      const sessionKey = definition.session === "batch" ? `batch:${batchId}` : "project"
      const promptContext: PromptContext = {
        project,
        composeCommand: ((await this.composeCommandOf()) ?? ["docker", "compose"]).join(" "),
        discovery: snapshot.discovery,
        entrypoints: snapshot.entrypoints,
        batch,
        parity: batchId ? snapshot.parity[batchId] : undefined,
        tests: batchId ? snapshot.tests[batchId] : undefined,
      }
      this.activity(project, key, { kind: "system", title: `${definition.title}${batch ? ` · ${batch.title}` : ""}` })
      const result = await this.deps.engine.run({
        directory: project.workspace,
        phase: key,
        title: `${definition.title}${batch ? ` · ${batch.title}` : ""}`,
        prompt: definition.prompt(promptContext),
        model: project.model,
        sessionId: state.sessions[sessionKey],
        onActivity: (activity) => this.deps.bus.emit(project.id, { type: "activity", activity }),
        signal,
      })
      state.sessions[sessionKey] = result.sessionId
      await this.deps.store.saveState(project, state)
      if (signal.aborted) throw new Error("Stopped")
      const output = definition.output(batch)
      const raw = await locateOutput(project.workspace, output, result)
      if (raw === undefined) {
        throw new Error(result.error ? `The agent stopped: ${result.error}` : `The agent finished without writing ${output}`)
      }
      await writeJson(join(project.workspace, output), definition.parse(raw))
      this.changed(project, output)
      snapshot = await this.snapshot(project.id)
    }

    const message = definition.commit(batch)
    if (definition.after) {
      await definition.after({ snapshot, batch, ops: this.ops(project, key, signal, message, (n) => (note = n)) })
    }
    await this.commit(project, message)
    return note
  }

  private ops(
    project: ProjectRecord,
    key: string,
    signal: AbortSignal,
    commitMessage: string,
    setNote: (note: string) => void,
  ): PhaseOps {
    return {
      verifyLegacy: async () => setNote(await this.verifyLegacy(project, key, signal)),
      writeCurls: async (batch) => {
        const snapshot = await this.snapshot(project.id)
        const tests = snapshot.tests[batch]
        if (tests) await writeCurlScripts(join(project.workspace, artifacts.curl(batch)), tests)
      },
      runLegacyTests: async (batch) => setNote(await this.runLegacyTests(project, batch, key, signal)),
      buildV2: (batch) => this.buildV2(project, batch, key, signal),
      runParity: async (batch) => {
        const run = await this.runParity(project.id, batch, signal)
        setNote(run.error ?? `${run.matched}/${run.total} responses identical`)
      },
      runInline: async (phase, batch) => {
        // Commit this phase's work first so the child phase's commit stays its own.
        await this.commit(project, commitMessage)
        await this.runPhase(project, PHASES[phase], batch, signal)
      },
    }
  }

  private async verifyLegacy(project: ProjectRecord, key: string, signal: AbortSignal) {
    const snapshot = await this.snapshot(project.id)
    const composer = await this.composer(project)
    if (!composer) {
      await this.setRuntime(project, { legacy: "failed", message: "No container runtime available" })
      return "No container runtime available — legacy cannot be started"
    }
    return this.lock(`${project.id}:runtime`, async () => {
      await this.setRuntime(project, { legacy: "starting" })
      const url = `http://127.0.0.1:${project.ports.legacy}`
      const health = snapshot.discovery?.run.healthPath || "/"
      if (await waitForHttp(url, health, 5_000)) {
        await this.setRuntime(project, { legacy: "up" })
        this.activity(project, key, { kind: "success", title: `Legacy answers on ${url}` })
        return "Legacy is running"
      }
      if (signal.aborted) throw new Error("Stopped")
      this.activity(project, key, { kind: "system", title: "Starting legacy containers" })
      const up = await composer.up(["legacy"], { onOutput: this.streamOutput(project, key, "compose-legacy") })
      const alive = up.ok && (await waitForHttp(url, health, this.deps.bootTimeoutMs ?? 180_000))
      if (!alive) {
        const logs = await composer.logs("legacy").catch(() => "")
        await this.setRuntime(project, { legacy: "failed", message: tail(logs || up.output) })
        this.activity(project, key, { kind: "error", title: "Legacy did not answer over HTTP", detail: tail(logs || up.output) })
        return "Legacy could not be started"
      }
      await this.setRuntime(project, { legacy: "up" })
      this.activity(project, key, { kind: "success", title: `Legacy answers on ${url}` })
      return "Legacy is running"
    })
  }

  private async runLegacyTests(project: ProjectRecord, batchId: string, key: string, signal: AbortSignal) {
    const snapshot = await this.snapshot(project.id)
    const tests = snapshot.tests[batchId]
    if (!tests) throw new Error("No characterization tests for this batch")
    const baseUrl = `http://127.0.0.1:${project.ports.legacy}`
    const composer = await this.composer(project)
    const run = await this.lock(`${project.id}:runtime`, async () => {
      if (composer) {
        this.activity(project, key, { kind: "system", title: "Resetting legacy to freshly seeded state" })
        await composer.down({ volumes: true })
        await this.setRuntime(project, { legacy: "starting", v2: "down" })
        await composer.up(["legacy"], { build: false, onOutput: this.streamOutput(project, key, "compose-reset") })
      }
      const alive = await waitForHttp(baseUrl, snapshot.discovery?.run.healthPath || "/", this.deps.bootTimeoutMs ?? 180_000)
      await this.setRuntime(project, { legacy: alive ? "up" : "failed" })
      if (!alive) return { batch: batchId, at: Date.now(), baseUrl, results: [], error: "Legacy did not answer over HTTP" }
      const results = []
      for (const testCase of tests.cases) {
        if (signal.aborted) throw new Error("Stopped")
        const response = await sendRequest(baseUrl, testCase.request, { timeoutMs: this.deps.httpTimeoutMs })
        const expectation = compareExpectation(testCase.expect, response, testCase.ignore)
        results.push({ caseId: testCase.id, response, expectation })
        this.activity(project, key, {
          id: `legacy-${batchId}-${testCase.id}`,
          kind: response.error ? "error" : "bash",
          title: `${testCase.request.method} ${testCase.request.path} → ${response.error ? "no response" : response.status}`,
          detail: testCase.title,
        })
      }
      return { batch: batchId, at: Date.now(), baseUrl, results }
    })
    await writeJson(join(project.workspace, artifacts.batch(batchId, "legacy-run")), run)
    this.changed(project, artifacts.batch(batchId, "legacy-run"))
    if (run.error) return run.error
    const agreed = run.results.filter((r) => r.expectation.match).length
    this.activity(project, key, {
      kind: "success",
      title: `Legacy recorded ${run.results.length} responses · ${agreed} matched the predicted behavior`,
    })
    return `${agreed}/${run.results.length} responses matched the predicted behavior`
  }

  private async buildV2(project: ProjectRecord, batchId: string, key: string, signal: AbortSignal) {
    const steps: BuildStep[] = []
    const v2 = join(project.workspace, "v2")
    if (project.target === "go") {
      const go = await this.deps.exec("go", ["version"])
      if (go.code === 0) {
        for (const [name, args] of [
          ["go build", ["build", "./..."]],
          ["go test", ["test", "./..."]],
        ] as const) {
          if (signal.aborted) throw new Error("Stopped")
          this.activity(project, key, { id: `build-${batchId}-${name}`, kind: "bash", title: name, status: "running" })
          const result = await this.deps.exec("go", [...args], { cwd: v2, timeoutMs: 10 * 60_000 })
          steps.push({ name, ok: result.code === 0, output: tail(output(result)) })
          this.activity(project, key, {
            id: `build-${batchId}-${name}`,
            kind: result.code === 0 ? "success" : "error",
            title: `${name} ${result.code === 0 ? "passed" : "failed"}`,
            detail: tail(output(result), 1500),
            status: result.code === 0 ? "done" : "error",
          })
        }
      } else steps.push({ name: "go build", ok: true, skipped: true, output: "Go is not installed locally; building in a container" })
    }

    const composer = await this.composer(project)
    if (composer) {
      await this.lock(`${project.id}:runtime`, async () => {
        this.activity(project, key, { kind: "system", title: "Building and starting v2" })
        await this.setRuntime(project, { v2: "starting" })
        const up = await composer.up(["v2"], { onOutput: this.streamOutput(project, key, "compose-v2") })
        steps.push({ name: "container build", ok: up.ok, output: tail(up.output) })
        // v2 reproduces the legacy routes, so the legacy health path also tells when its dependencies are ready.
        const health = (await this.snapshot(project.id)).discovery?.run.healthPath || "/"
        const alive = up.ok && (await waitForHttp(`http://127.0.0.1:${project.ports.v2}`, health, this.deps.bootTimeoutMs ?? 180_000))
        steps.push({ name: "v2 answers HTTP", ok: alive, output: alive ? "" : tail(await composer.logs("v2").catch(() => "")) })
        await this.setRuntime(project, { v2: alive ? "up" : "failed" })
      })
    } else steps.push({ name: "container build", ok: false, output: "No container runtime or environment available" })

    const report = { batch: batchId, at: Date.now(), ok: steps.every((s) => s.ok), steps }
    await writeJson(join(project.workspace, artifacts.batch(batchId, "build")), report)
    this.changed(project, artifacts.batch(batchId, "build"))
    const running = steps.find((s) => s.name === "v2 answers HTTP")?.ok ?? false
    this.activity(project, key, {
      kind: report.ok ? "success" : "error",
      title: report.ok ? "v2 built and running" : "v2 build has problems",
    })
    return running
  }

  async runParity(id: string, batchId: string, signal?: AbortSignal) {
    const project = await this.project(id)
    const key = phaseKey("parity", batchId)
    const snapshot = await this.snapshot(id)
    const tests = snapshot.tests[batchId]
    if (!tests) throw new Error("No characterization tests for this batch")
    const composer = await this.composer(project)
    const legacyUrl = `http://127.0.0.1:${project.ports.legacy}`
    const v2Url = `http://127.0.0.1:${project.ports.v2}`
    const run = await this.lock(`${id}:runtime`, async () => {
      if (composer) {
        this.activity(project, key, { kind: "system", title: "Resetting legacy and v2 to freshly seeded state" })
        await composer.down({ volumes: true })
        await this.setRuntime(project, { legacy: "starting", v2: "starting" })
        await composer.up(["legacy", "v2"], { build: false, onOutput: this.streamOutput(project, key, "compose-parity") })
      }
      const [legacyAlive, v2Alive] = await Promise.all([
        waitForHttp(legacyUrl, snapshot.discovery?.run.healthPath || "/", this.deps.bootTimeoutMs ?? 180_000),
        waitForHttp(v2Url, snapshot.discovery?.run.healthPath || "/", this.deps.bootTimeoutMs ?? 180_000),
      ])
      await this.setRuntime(project, { legacy: legacyAlive ? "up" : "failed", v2: v2Alive ? "up" : "failed" })
      const results = []
      for (const testCase of tests.cases) {
        if (signal?.aborted) throw new Error("Stopped")
        const legacy = await sendRequest(legacyUrl, testCase.request, { timeoutMs: this.deps.httpTimeoutMs })
        const v2 = await sendRequest(v2Url, testCase.request, { timeoutMs: this.deps.httpTimeoutMs })
        const comparison = compareResponses(legacy, v2, testCase.ignore)
        results.push({ caseId: testCase.id, legacy, v2, comparison })
        this.activity(project, key, {
          id: `parity-${batchId}-${testCase.id}`,
          kind: comparison.match ? "success" : "error",
          title: `${comparison.match ? "Identical" : "Different"} · ${testCase.title}`,
        })
      }
      const matched = results.filter((r) => r.comparison.match).length
      return {
        batch: batchId,
        at: Date.now(),
        matched,
        total: results.length,
        results,
        error: legacyAlive && v2Alive ? undefined : "Legacy or v2 did not answer over HTTP",
      }
    })
    await writeJson(join(project.workspace, artifacts.batch(batchId, "parity")), run)
    this.changed(project, artifacts.batch(batchId, "parity"))
    return run
  }

  // ── Helpers ─────────────────────────────────────────────────────────────

  private batchOf(snapshot: ProjectSnapshot, batchId?: string): Batch | undefined {
    return batchId ? snapshot.entrypoints?.batches.find((b) => b.id === batchId) : undefined
  }

  private async stateOf(project: ProjectRecord) {
    const cached = this.states.get(project.id)
    if (cached) return cached
    const state = await this.deps.store.loadState(project)
    const activity = await readJson(join(project.workspace, artifacts.activity))
    // Nothing is running right after a restart, so replayed items cannot still be in progress.
    if (Array.isArray(activity)) {
      this.deps.bus.seed(
        project.id,
        (activity as Activity[]).map((a) => (a.status === "running" ? { ...a, status: "done" as const } : a)),
      )
    }
    this.states.set(project.id, state)
    return state
  }

  private async setPhase(project: ProjectRecord, key: string, patch: Partial<PhaseState>) {
    const state = await this.stateOf(project)
    const next = { ...(state.phases[key] ?? { status: "idle" }), ...patch } as PhaseState
    state.phases[key] = next
    await this.deps.store.saveState(project, state)
    this.deps.bus.emit(project.id, { type: "phase", key, state: next })
  }

  private async setRuntime(project: ProjectRecord, patch: Partial<Runtime>) {
    const state = await this.stateOf(project)
    state.runtime = { ...state.runtime, ...patch }
    this.deps.bus.emit(project.id, { type: "runtime", runtime: state.runtime })
  }

  private async checkRuntime(project: ProjectRecord, snapshot: ProjectSnapshot, services: string[]) {
    const timeout = this.deps.bootTimeoutMs ?? 180_000
    const [legacy, v2] = await Promise.all([
      waitForHttp(`http://127.0.0.1:${project.ports.legacy}`, snapshot.discovery?.run.healthPath || "/", timeout),
      services.includes("v2")
        ? waitForHttp(`http://127.0.0.1:${project.ports.v2}`, snapshot.discovery?.run.healthPath || "/", timeout)
        : Promise.resolve(false),
    ])
    await this.setRuntime(project, {
      legacy: legacy ? "up" : "failed",
      ...(services.includes("v2") ? { v2: v2 ? ("up" as const) : ("failed" as const) } : {}),
    })
  }

  private activity(project: ProjectRecord, phase: string, item: Omit<Activity, "id" | "at" | "phase"> & { id?: string }) {
    this.deps.bus.emit(project.id, {
      type: "activity",
      activity: { ...item, id: item.id ?? `${phase}-${Date.now()}-${randomBytes(2).toString("hex")}`, at: Date.now(), phase },
    })
  }

  private streamOutput(project: ProjectRecord, key: string, id: string) {
    let last = 0
    return (chunk: string) => {
      const line = chunk.trim().split("\n").filter(Boolean).at(-1)
      if (!line || Date.now() - last < 400) return
      last = Date.now()
      this.activity(project, key, { id: `${id}-${key}`, kind: "bash", title: line.slice(0, 140), status: "running" })
    }
  }

  private changed(project: ProjectRecord, artifact: string) {
    this.deps.bus.emit(project.id, { type: "changed", artifact })
  }

  private async commit(project: ProjectRecord, message: string) {
    await this.lock(`${project.id}:git`, () => commitAll(this.deps.exec, project.workspace, message)).catch(() => false)
  }

  private composeCommandOf() {
    this.composeCommand ??= detectCompose(this.deps.exec).then((c) => c?.command)
    return this.composeCommand
  }

  private async composer(project: ProjectRecord): Promise<Compose | undefined> {
    const command = await this.composeCommandOf()
    if (!command) return undefined
    const environment = await this.snapshot(project.id).then((s) => s.environment)
    if (!environment) return undefined
    return compose(this.deps.exec, command, environment.composeFile, composeProject(project), project.workspace)
  }

  private lock<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const previous = this.locks.get(key) ?? Promise.resolve()
    const next = previous.catch(() => {}).then(fn)
    this.locks.set(key, next)
    return next
  }
}

/**
 * Find the phase output even when the model wrote it somewhere slightly off:
 * the expected path first, then any file it wrote with the same name, then
 * JSON embedded in its final reply.
 */
export async function locateOutput(root: string, output: string, result: Pick<RunResult, "writes" | "text">) {
  const expected = join(root, output)
  const tail2 = output.split("/").slice(-2).join("/")
  const name = basename(output)
  const candidates = [
    expected,
    ...result.writes.filter((w) => w.endsWith(tail2)),
    ...result.writes.filter((w) => basename(w) === name),
  ]
  for (const candidate of [...new Set(candidates)]) {
    const content = await readFile(candidate, "utf8").catch(() => undefined)
    if (content === undefined) continue
    const parsed = extractJson(content)
    if (parsed && typeof parsed === "object") return parsed
  }
  const fromText = extractJson(result.text)
  return fromText && typeof fromText === "object" ? fromText : undefined
}

function tail(text: string, max = 4000) {
  return text.length > max ? `…${text.slice(text.length - max)}` : text
}

export function targetLabel(project: ProjectRecord) {
  return targetOf(project).label
}

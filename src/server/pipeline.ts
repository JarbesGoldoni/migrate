import { randomBytes } from "node:crypto"
import { existsSync, statSync } from "node:fs"
import { readFile, rm } from "node:fs/promises"
import { basename, join, resolve, sep } from "node:path"
import type { Batch } from "../shared/contracts"
import { type Message, msg } from "../shared/messages"
import {
  type Activity,
  type BuildStep,
  type HttpRequestSpec,
  isLocale,
  type Locale,
  type MigrationListItem,
  type MigrationSummary,
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
import { defaultStack, normalizeLanguage, sanitizeStack, type StackChoice, stackOf } from "../shared/stacks"
import { composeProject, type PromptContext, targetOf } from "./prompts"
import { artifacts, type Store, writeJson } from "./store"
import { type Captures, resolveRequest } from "./testing/captures"
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

type Note = { text: string; message?: Message }

export class Pipeline {
  private states = new Map<string, ProjectState>()
  private controllers = new Map<string, AbortController>()
  private locks = new Map<string, Promise<unknown>>()
  private composeCommand?: Promise<string[] | undefined>

  constructor(private readonly deps: PipelineDeps) {}

  async createProject(input: { source: string; model?: ModelRef; target?: string; stack?: unknown; language?: Locale }) {
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
    const stack = chosenStack(input)
    const record: ProjectRecord = {
      id,
      name: probe.name,
      source: probe.path,
      workspace,
      branch,
      createdAt: Date.now(),
      model: input.model,
      ...(stack ? { target: stack.language, stack } : {}),
      language: isLocale(input.language) ? input.language : "en",
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

  async updateProject(id: string, patch: { model?: ModelRef; target?: string; stack?: unknown; language?: Locale }) {
    const project = await this.project(id)
    const stack = chosenStack(patch)
    const next = {
      ...project,
      ...(patch.model ? { model: patch.model } : {}),
      ...(stack ? { target: stack.language, stack } : {}),
      ...(isLocale(patch.language) ? { language: patch.language } : {}),
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

  /** Everything the agent and the pipeline did, oldest first — the material for a replay. */
  async history(id: string): Promise<Activity[]> {
    const project = await this.project(id)
    await this.stateOf(project)
    const byId = new Map((await this.deps.store.loadActivity(project)).map((a) => [a.id, a]))
    for (const item of this.deps.bus.activity(id)) byId.set(item.id, item)
    return [...byId.values()].sort((a, b) => a.at - b.at)
  }

  async migrations(): Promise<MigrationListItem[]> {
    const records = await this.deps.store.list()
    return Promise.all(
      records.map(async (project) => {
        const missing = !existsSync(project.workspace)
        const summary = summarize(missing ? undefined : await this.snapshot(project.id), missing)
        return { project, summary: { ...summary, linked: isLinkedWorktree(project.workspace) } }
      }),
    )
  }

  /** Remove a migration: its containers, its workspace and, when asked, its branch in the original repository. */
  async deleteProject(id: string, options: { branch?: boolean } = {}) {
    const project = await this.project(id)
    await this.assertIdle(project)
    const composer = await this.composer(project).catch(() => undefined)
    if (composer) await composer.down({ volumes: true }).catch(() => undefined)
    const linked = isLinkedWorktree(project.workspace)
    if (linked) {
      await this.deps.exec("git", ["worktree", "remove", "--force", project.workspace], { cwd: project.source })
      if (options.branch) await this.deps.exec("git", ["branch", "-D", project.branch], { cwd: project.source })
    }
    // Only ever delete folders this app created.
    const root = resolve(this.deps.workspaces ?? workspacesDir())
    if (resolve(project.workspace).startsWith(root + sep)) await rm(project.workspace, { recursive: true, force: true })
    if (linked) await this.deps.exec("git", ["worktree", "prune"], { cwd: project.source })
    await this.deps.store.remove(id)
    this.states.delete(id)
    return { deleted: true }
  }

  /** Copy the migration branch into the original repository, where it can be checked out and reviewed. */
  async exportBranch(id: string, name?: string) {
    const project = await this.project(id)
    await this.assertIdle(project)
    const probe = await probeProject(project.source, this.deps.exec)
    if (!probe.isGit) throw new Error("The original folder is not a git repository. Run git init there, then try again.")
    const branch = name?.trim() || exportBranchName(project)
    const git = (args: string[], cwd = project.source) => this.deps.exec("git", args, { cwd, timeoutMs: 5 * 60_000 })
    if ((await git(["check-ref-format", "--branch", branch])).code !== 0) throw new Error(`"${branch}" is not a valid branch name`)
    const linked = isLinkedWorktree(project.workspace)
    if (linked && branch === project.branch) throw new Error(`"${branch}" is the migration's working branch; pick another name`)
    const current = (await git(["symbolic-ref", "--quiet", "--short", "HEAD"])).stdout.trim()
    if (current === branch) throw new Error(`"${branch}" is checked out in your repository; pick another name`)
    await this.commit(project, "migrate: save work in progress")
    const commit = (await git(["rev-parse", "HEAD"], project.workspace)).stdout.trim()
    const result = linked
      ? await git(["branch", "--force", branch, commit])
      : await git(["fetch", "--no-tags", project.workspace, `+refs/heads/${project.branch}:refs/heads/${branch}`])
    if (result.code !== 0) throw new Error(`Could not create ${branch}: ${output(result).slice(0, 400)}`)
    return { branch, commit, repository: project.source, command: `git checkout ${branch}` }
  }

  private async assertIdle(project: ProjectRecord) {
    const state = await this.stateOf(project)
    if (Object.values(state.phases).some((phase) => phase.status === "running")) {
      throw new Error("A step is still running. Stop it or wait for it to finish.")
    }
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
    const startedAt = Date.now()
    await this.setPhase(project, key, {
      status: "running",
      startedAt,
      finishedAt: undefined,
      error: undefined,
      note: undefined,
      noteMessage: undefined,
    })
    // Save the history and release the phase before announcing the result, so whoever
    // reacts to "done" or "failed" finds both in place.
    const settle = async () => {
      parent?.removeEventListener("abort", onParentAbort)
      this.controllers.delete(`${project.id}:${key}`)
      const items = this.deps.bus.activity(project.id).filter((a) => a.phase === key && a.at >= startedAt)
      await this.deps.store.saveActivity(project, key, items).catch(() => {})
    }
    try {
      const note = await this.execute(project, definition, batchId, controller.signal)
      await settle()
      await this.setPhase(project, key, { status: "done", finishedAt: Date.now(), note: note?.text, noteMessage: note?.message })
    } catch (error) {
      const reason = controller.signal.aborted ? "Stopped" : error instanceof Error ? error.message : String(error)
      this.activity(project, key, {
        kind: "error",
        title: `${definition.title} failed`,
        message: msg("activity.phaseFailed", { phase: definition.name }),
        detail: reason,
      })
      await settle()
      await this.setPhase(project, key, { status: "failed", finishedAt: Date.now(), error: reason })
      throw error
    }
  }

  private async execute(
    project: ProjectRecord,
    definition: PhaseDefinition,
    batchId: string | undefined,
    signal: AbortSignal,
  ): Promise<Note | undefined> {
    const key = phaseKey(definition.name, batchId)
    let snapshot = await this.snapshot(project.id)
    const batch = this.batchOf(snapshot, batchId)
    let note: Note | undefined

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
        legacyRun: batchId ? snapshot.legacyRuns[batchId] : undefined,
      }
      const title = `${definition.title}${batch ? ` · ${batch.title.en}` : ""}`
      this.activity(project, key, {
        kind: "system",
        title,
        message: batch
          ? msg("activity.phaseStartedBatch", { phase: definition.name, batch: batch.title })
          : msg("activity.phaseStarted", { phase: definition.name }),
      })
      const result = await this.deps.engine.run({
        directory: project.workspace,
        phase: key,
        title,
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
      const parsed = definition.parse(raw)
      const value = definition.complete ? definition.complete(parsed, snapshot, await this.snapshot(project.id), batch) : parsed
      await writeJson(join(project.workspace, output), value)
      this.changed(project, output)
      snapshot = await this.snapshot(project.id)
    }

    const commitMessage = definition.commit(batch)
    if (definition.after) {
      await definition.after({ snapshot, batch, ops: this.ops(project, key, signal, commitMessage, (n) => (note = n)) })
    }
    await this.commit(project, commitMessage)
    return note
  }

  private ops(
    project: ProjectRecord,
    key: string,
    signal: AbortSignal,
    commitMessage: string,
    setNote: (note: Note) => void,
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
        setNote(
          run.error
            ? { text: run.error, message: msg("note.parityNoAnswer") }
            : {
                text: `${run.matched}/${run.total} responses identical`,
                message: msg("note.parity", { matched: run.matched, total: run.total }),
              },
        )
      },
      runInline: async (phase, batch) => {
        // Commit this phase's work first so the child phase's commit stays its own.
        await this.commit(project, commitMessage)
        await this.runPhase(project, PHASES[phase], batch, signal)
      },
    }
  }

  private async verifyLegacy(project: ProjectRecord, key: string, signal: AbortSignal): Promise<Note> {
    const snapshot = await this.snapshot(project.id)
    const composer = await this.composer(project)
    if (!composer) {
      await this.setRuntime(project, { legacy: "failed", message: "No container runtime available" })
      return { text: "No container runtime available — legacy cannot be started", message: msg("note.noRuntime") }
    }
    const running: Note = { text: "Legacy is running", message: msg("note.legacyRunning") }
    return this.lock(`${project.id}:runtime`, async () => {
      await this.setRuntime(project, { legacy: "starting" })
      const url = `http://127.0.0.1:${project.ports.legacy}`
      const health = snapshot.discovery?.run.healthPath || "/"
      const answers = () =>
        this.activity(project, key, { kind: "success", title: `Legacy answers on ${url}`, message: msg("activity.legacyAnswers", { url }) })
      if (await waitForHttp(url, health, 5_000)) {
        await this.setRuntime(project, { legacy: "up" })
        answers()
        return running
      }
      if (signal.aborted) throw new Error("Stopped")
      this.activity(project, key, { kind: "system", title: "Starting legacy containers", message: msg("activity.startingLegacy") })
      const up = await composer.up(["legacy"], { onOutput: this.streamOutput(project, key, "compose-legacy") })
      const alive = up.ok && (await waitForHttp(url, health, this.deps.bootTimeoutMs ?? 180_000))
      if (!alive) {
        const logs = await composer.logs("legacy").catch(() => "")
        await this.setRuntime(project, { legacy: "failed", message: tail(logs || up.output) })
        this.activity(project, key, {
          kind: "error",
          title: "Legacy did not answer over HTTP",
          message: msg("activity.legacyNoAnswer"),
          detail: tail(logs || up.output),
        })
        return { text: "Legacy could not be started", message: msg("note.legacyFailed") }
      }
      await this.setRuntime(project, { legacy: "up" })
      answers()
      return running
    })
  }

  private async runLegacyTests(project: ProjectRecord, batchId: string, key: string, signal: AbortSignal): Promise<Note> {
    const snapshot = await this.snapshot(project.id)
    const tests = snapshot.tests[batchId]
    if (!tests) throw new Error("No characterization tests for this batch")
    const baseUrl = `http://127.0.0.1:${project.ports.legacy}`
    const composer = await this.composer(project)
    const run = await this.lock(`${project.id}:runtime`, async () => {
      if (composer) {
        this.activity(project, key, {
          kind: "system",
          title: "Resetting legacy to freshly seeded state",
          message: msg("activity.resetLegacy"),
        })
        await composer.down({ volumes: true })
        await this.setRuntime(project, { legacy: "starting", v2: "down" })
        await composer.up(["legacy"], { build: false, onOutput: this.streamOutput(project, key, "compose-reset") })
      }
      const alive = await waitForHttp(baseUrl, snapshot.discovery?.run.healthPath || "/", this.deps.bootTimeoutMs ?? 180_000)
      await this.setRuntime(project, { legacy: alive ? "up" : "failed" })
      if (!alive) return { batch: batchId, at: Date.now(), baseUrl, results: [], error: "Legacy did not answer over HTTP" }
      const results = []
      const captured: Captures = new Map()
      for (const testCase of tests.cases) {
        if (signal.aborted) throw new Error("Stopped")
        const response = await sendRequest(baseUrl, resolveRequest(testCase.request, captured), { timeoutMs: this.deps.httpTimeoutMs })
        captured.set(testCase.id, response)
        const expectation = compareExpectation(testCase.expect, response, testCase.ignore)
        results.push({ caseId: testCase.id, response, expectation })
        const { method, path } = testCase.request
        this.activity(project, key, {
          id: `legacy-${batchId}-${testCase.id}`,
          kind: response.error ? "error" : "bash",
          title: `${method} ${path} → ${response.error ? "no response" : response.status}`,
          message: response.error
            ? msg("activity.requestNoResponse", { method, path })
            : msg("activity.request", { method, path, status: response.status }),
          detail: testCase.title.en,
        })
      }
      return { batch: batchId, at: Date.now(), baseUrl, results }
    })
    await writeJson(join(project.workspace, artifacts.batch(batchId, "legacy-run")), run)
    this.changed(project, artifacts.batch(batchId, "legacy-run"))
    if (run.error) return { text: run.error, message: msg("note.legacyNoAnswer") }
    const agreed = run.results.filter((r) => r.expectation.match).length
    const total = run.results.length
    this.activity(project, key, {
      kind: "success",
      title: `Legacy recorded ${total} responses · ${agreed} matched the predicted behavior`,
      message: msg("activity.legacyRecorded", { total, agreed }),
    })
    return {
      text: `${agreed}/${total} responses matched the predicted behavior`,
      message: msg("note.legacyMatched", { agreed, total }),
    }
  }

  private async buildV2(project: ProjectRecord, batchId: string, key: string, signal: AbortSignal) {
    const steps: BuildStep[] = []
    const v2 = join(project.workspace, "v2")
    if (stackOf(project)?.language === "go") {
      const go = await this.deps.exec("go", ["version"])
      if (go.code === 0) {
        for (const [name, args] of [
          ["go build", ["build", "./..."]],
          ["go test", ["test", "./..."]],
        ] as const) {
          if (signal.aborted) throw new Error("Stopped")
          const id = `build-${batchId}-${name}`
          this.activity(project, key, { id, kind: "bash", title: name, message: msg("activity.buildStepRunning", { name }), status: "running" })
          const result = await this.deps.exec("go", [...args], { cwd: v2, timeoutMs: 10 * 60_000 })
          const ok = result.code === 0
          steps.push({ name, ok, output: tail(output(result)) })
          this.activity(project, key, {
            id,
            kind: ok ? "success" : "error",
            title: `${name} ${ok ? "passed" : "failed"}`,
            message: msg(ok ? "activity.buildStepPassed" : "activity.buildStepFailed", { name }),
            detail: tail(output(result), 1500),
            status: ok ? "done" : "error",
          })
        }
      } else steps.push({ name: "go build", ok: true, skipped: true, output: "Go is not installed locally; building in a container" })
    }

    const composer = await this.composer(project)
    if (composer) {
      await this.lock(`${project.id}:runtime`, async () => {
        this.activity(project, key, { kind: "system", title: "Building and starting v2", message: msg("activity.buildingV2") })
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
      message: msg(report.ok ? "activity.v2Running" : "activity.v2Problems"),
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
    const health = snapshot.discovery?.run.healthPath || "/"
    const run = await this.lock(`${id}:runtime`, async () => {
      if (composer) {
        this.activity(project, key, {
          kind: "system",
          title: "Resetting legacy and v2 to freshly seeded state",
          message: msg("activity.resetBoth"),
        })
        await composer.down({ volumes: true })
        await this.setRuntime(project, { legacy: "starting", v2: "starting" })
        await composer.up(["legacy", "v2"], { build: false, onOutput: this.streamOutput(project, key, "compose-parity") })
      }
      const [legacyAlive, v2Alive] = await Promise.all([
        waitForHttp(legacyUrl, health, this.deps.bootTimeoutMs ?? 180_000),
        waitForHttp(v2Url, health, this.deps.bootTimeoutMs ?? 180_000),
      ])
      await this.setRuntime(project, { legacy: legacyAlive ? "up" : "failed", v2: v2Alive ? "up" : "failed" })
      const results = []
      // Each side captures its own values: tokens and ids differ between legacy and v2.
      const legacyCaptured: Captures = new Map()
      const v2Captured: Captures = new Map()
      for (const testCase of tests.cases) {
        if (signal?.aborted) throw new Error("Stopped")
        const legacy = await sendRequest(legacyUrl, resolveRequest(testCase.request, legacyCaptured), { timeoutMs: this.deps.httpTimeoutMs })
        const v2 = await sendRequest(v2Url, resolveRequest(testCase.request, v2Captured), { timeoutMs: this.deps.httpTimeoutMs })
        legacyCaptured.set(testCase.id, legacy)
        v2Captured.set(testCase.id, v2)
        const comparison = compareResponses(legacy, v2, testCase.ignore)
        results.push({ caseId: testCase.id, legacy, v2, comparison })
        this.activity(project, key, {
          id: `parity-${batchId}-${testCase.id}`,
          kind: comparison.match ? "success" : "error",
          title: `${comparison.match ? "Identical" : "Different"} · ${testCase.title.en}`,
          message: msg(comparison.match ? "activity.parityIdentical" : "activity.parityDifferent", { title: testCase.title }),
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
    const activity = await this.deps.store.loadActivity(project)
    // Nothing is running right after a restart, so replayed items cannot still be in progress.
    this.deps.bus.seed(
      project.id,
      activity.map((a) => (a.status === "running" ? { ...a, status: "done" as const } : a)),
    )
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
    const health = snapshot.discovery?.run.healthPath || "/"
    const [legacy, v2] = await Promise.all([
      waitForHttp(`http://127.0.0.1:${project.ports.legacy}`, health, timeout),
      services.includes("v2") ? waitForHttp(`http://127.0.0.1:${project.ports.v2}`, health, timeout) : Promise.resolve(false),
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

/** Headline numbers for the migrations library. */
export function summarize(snapshot: ProjectSnapshot | undefined, missing: boolean): MigrationSummary {
  const empty = { missing, linked: false, running: false, steps: 0, batches: 0, batchesProven: 0, entrypoints: 0, rules: 0, cases: 0, matched: 0, compared: 0 }
  if (!snapshot) return empty
  const batches = snapshot.entrypoints?.batches ?? []
  const parity = Object.values(snapshot.parity)
  const perBatch = batches.reduce(
    (n, b) =>
      n + [snapshot.rules[b.id], snapshot.tests[b.id], snapshot.legacyRuns[b.id], snapshot.ports[b.id], snapshot.parity[b.id]].filter(Boolean).length,
    0,
  )
  const phases = Object.values(snapshot.state.phases)
  const times = phases.flatMap((p) => [p.startedAt, p.finishedAt]).filter((t): t is number => typeof t === "number")
  return {
    ...empty,
    running: phases.some((p) => p.status === "running"),
    steps: [snapshot.discovery, snapshot.entrypoints, snapshot.environment].filter(Boolean).length + perBatch,
    batches: batches.length,
    batchesProven: batches.filter((b) => {
      const run = snapshot.parity[b.id]
      return Boolean(run && run.total > 0 && run.matched === run.total)
    }).length,
    entrypoints: snapshot.entrypoints?.entrypoints.length ?? 0,
    rules: Object.values(snapshot.rules).reduce((n, r) => n + r.entrypoints.reduce((m, e) => m + e.rules.length, 0), 0),
    cases: Object.values(snapshot.tests).reduce((n, t) => n + t.cases.length, 0),
    matched: parity.reduce((n, p) => n + p.matched, 0),
    compared: parity.reduce((n, p) => n + p.total, 0),
    lastActivity: times.length ? Math.max(...times) : undefined,
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

/** A linked git worktree has a .git file pointing at its repository; a standalone repository has a .git folder. */
export function isLinkedWorktree(workspace: string) {
  try {
    return statSync(join(workspace, ".git")).isFile()
  } catch {
    return false
  }
}

/** migrate/v2 becomes simplify/v2, so the exported branch never collides with the working one. */
export function exportBranchName(project: Pick<ProjectRecord, "branch">) {
  return project.branch.replace(/^migrate\//, "simplify/")
}

export function targetLabel(project: ProjectRecord) {
  return targetOf(project).label
}

/** A full stack choice wins; a bare language id gets that language's first stack. */
function chosenStack(input: { target?: string; stack?: unknown }): StackChoice | undefined {
  return sanitizeStack(input.stack) ?? defaultStack(normalizeLanguage(input.target) ?? "")
}

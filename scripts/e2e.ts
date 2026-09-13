// Drives the real engine through the pipeline without the UI.
// Usage: bun scripts/e2e.ts [source-folder]   (defaults to a fresh sample shop)
// E2E_UNTIL=<phase> stops after that phase; E2E_BATCH picks the batch.
import { EventBus } from "../src/server/bus"
import { OpencodeEngine } from "../src/server/engine/opencode"
import { Pipeline } from "../src/server/pipeline"
import { createSample } from "../src/server/sample"
import { Store } from "../src/server/store"
import { exec } from "../src/server/util/exec"
import { type PhaseName, phaseKey } from "../src/shared/types"

const started = Date.now()
const log = (line: string) => console.log(`${((Date.now() - started) / 1000).toFixed(0).padStart(5)}s ${line}`)

const engine = new OpencodeEngine()
const bus = new EventBus()
const pipeline = new Pipeline({ store: new Store(), engine, bus, exec })

const info = await engine.info()
log(`engine ready=${info.ready} models=${info.models.length} default=${JSON.stringify(info.defaultModel)} ${info.error ?? ""}`)
if (!info.ready) process.exit(1)

// E2E_PROJECT=<id> resumes an existing migration, skipping phases that already produced output.
const project = process.env.E2E_PROJECT
  ? await pipeline.project(process.env.E2E_PROJECT)
  : await pipeline.createProject({ source: process.argv[2] ?? (await createSample(exec)), model: info.defaultModel })
log(`project ${project.id} workspace=${project.workspace} ports=${JSON.stringify(project.ports)}`)
const produced = async (phase: PhaseName, batch?: string) => {
  const s = await pipeline.snapshot(project.id)
  const outputs = {
    discover: s.discovery,
    entrypoints: s.entrypoints,
    environment: s.environment,
    rules: batch ? s.rules[batch] : undefined,
    tests: batch ? s.tests[batch] : undefined,
    legacy: batch ? s.legacyRuns[batch] : undefined,
    port: batch ? s.ports[batch] : undefined,
    parity: batch ? s.parity[batch] : undefined,
    reconcile: batch ? s.reconcile[batch] : undefined,
  }
  return outputs[phase] !== undefined
}

bus.subscribe(project.id, (event) => {
  if (event.type === "activity" && event.activity.status !== "running") {
    log(`   · [${event.activity.phase}] ${event.activity.kind.padEnd(6)} ${event.activity.title}`)
  }
  if (event.type === "phase") {
    const s = event.state
    log(`■ ${event.key} → ${s.status}${s.error ? ` ✗ ${s.error}` : ""}${s.note ? ` — ${s.note}` : ""}`)
  }
  if (event.type === "runtime") log(`   runtime ${JSON.stringify(event.runtime)}`)
})

const until = process.env.E2E_UNTIL as PhaseName | undefined

async function run(phase: PhaseName, batch?: string) {
  if (await produced(phase, batch)) {
    log(`↷ ${phaseKey(phase, batch)} already done, skipping`)
    return true
  }
  const result = await pipeline.start(project.id, phase, batch)
  if (!result.started) {
    log(`✗ ${phase} did not start: ${result.reason}`)
    return false
  }
  const key = phaseKey(phase, batch)
  while (true) {
    await Bun.sleep(2_000)
    const snapshot = await pipeline.snapshot(project.id)
    const status = snapshot.state.phases[key]?.status
    if (status === "done" || status === "failed") return status === "done"
  }
}

const finish = (code: number) => {
  log(`finished — workspace ${project.workspace}`)
  engine.stop()
  process.exit(code)
}

for (const phase of ["discover", "entrypoints", "environment"] as const) {
  if (!(await run(phase))) finish(1)
  if (until === phase) finish(0)
}

const snapshot = await pipeline.snapshot(project.id)
const batches = snapshot.entrypoints?.batches ?? []
log(`batches: ${batches.map((b) => `${b.id}(${b.entrypoints.length})`).join(", ")}`)
const batch = batches.find((b) => b.id === process.env.E2E_BATCH) ?? batches[0]
if (!batch) finish(1)

for (const phase of ["rules", "tests", "legacy", "port"] as const) {
  if (!(await run(phase, batch.id))) finish(1)
  if (until === phase) finish(0)
}

const final = await pipeline.snapshot(project.id)
const parity = final.parity[batch.id]
log(`parity: ${parity ? `${parity.matched}/${parity.total}` : "not run"}`)
if (parity && parity.matched < parity.total && until !== "parity") {
  await run("reconcile", batch.id)
  const after = (await pipeline.snapshot(project.id)).parity[batch.id]
  log(`parity after reconcile: ${after ? `${after.matched}/${after.total}` : "not run"}`)
}
finish(0)

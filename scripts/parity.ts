// Re-run the side-by-side comparison for one batch without the model.
// Usage: bun scripts/parity.ts <project-id> <batch-id>
import { EventBus } from "../src/server/bus"
import { OpencodeEngine } from "../src/server/engine/opencode"
import { Pipeline } from "../src/server/pipeline"
import { Store } from "../src/server/store"
import { exec } from "../src/server/util/exec"

const [id, batch] = process.argv.slice(2)
const pipeline = new Pipeline({ store: new Store(), engine: new OpencodeEngine(), bus: new EventBus(), exec })

// Going through start() records the phase state and history like a run from the UI.
const started = await pipeline.start(id, "parity", batch)
if (!started.started) {
  console.error(started.reason)
  process.exit(1)
}
while (true) {
  await Bun.sleep(1_000)
  const snapshot = await pipeline.snapshot(id)
  const state = snapshot.state.phases[`parity:${batch}`]
  if (state?.status === "running") continue
  for (const r of snapshot.parity[batch]?.results ?? []) {
    const extra = r.comparison.match ? "" : ` ${JSON.stringify(r.comparison.diffs.slice(0, 3))}`
    console.log(`${r.comparison.match ? "✓" : "✗"} ${r.caseId} legacy=${r.legacy.status} v2=${r.v2.status}${extra}`)
  }
  console.log(`parity ${state?.status}: ${state?.note ?? state?.error ?? ""}`)
  process.exit(state?.status === "done" ? 0 : 1)
}

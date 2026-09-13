// Re-run the side-by-side comparison for one batch without the model.
// Usage: bun scripts/parity.ts <project-id> <batch-id>
import { EventBus } from "../src/server/bus"
import { OpencodeEngine } from "../src/server/engine/opencode"
import { Pipeline } from "../src/server/pipeline"
import { Store } from "../src/server/store"
import { exec } from "../src/server/util/exec"

const [id, batch] = process.argv.slice(2)
const pipeline = new Pipeline({ store: new Store(), engine: new OpencodeEngine(), bus: new EventBus(), exec })
const run = await pipeline.runParity(id, batch)
for (const r of run.results) {
  console.log(`${r.comparison.match ? "✓" : "✗"} ${r.caseId} legacy=${r.legacy.status} v2=${r.v2.status}${r.comparison.match ? "" : ` ${JSON.stringify(r.comparison.diffs.slice(0, 3))}`}`)
}
console.log(`parity ${run.matched}/${run.total}${run.error ? ` (${run.error})` : ""}`)
process.exit(0)

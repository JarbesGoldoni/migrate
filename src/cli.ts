import { existsSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { parseArgs } from "node:util"
import { serve } from "@hono/node-server"
import pkg from "../package.json" with { type: "json" }
import { createApp } from "./server/app"
import { EventBus } from "./server/bus"
import { OpencodeEngine } from "./server/engine/opencode"
import { openBrowser } from "./server/open"
import { Pipeline } from "./server/pipeline"
import { Store } from "./server/store"
import { exec } from "./server/util/exec"
import { freePort } from "./server/util/ports"

const HELP = `
  simplify-migrate — watch AI migrate a legacy system

  Usage
    simplify-migrate [options]

  Options
    --port <n>     Port to listen on (default 4800, or the next free one)
    --host <h>     Host to bind (default 127.0.0.1)
    --no-open      Do not open the browser
    -v, --version  Print the version
    -h, --help     Show this help
`

const { values } = parseArgs({
  options: {
    port: { type: "string" },
    host: { type: "string", default: "127.0.0.1" },
    "no-open": { type: "boolean", default: false },
    "api-only": { type: "boolean", default: false },
    version: { type: "boolean", short: "v", default: false },
    help: { type: "boolean", short: "h", default: false },
  },
  allowPositionals: true,
})

if (values.help) {
  console.log(HELP)
  process.exit(0)
}
if (values.version) {
  console.log(pkg.version)
  process.exit(0)
}

const webRoot = values["api-only"]
  ? undefined
  : [fileURLToPath(new URL("./web/", import.meta.url)), fileURLToPath(new URL("../dist/web/", import.meta.url))].find(
      (dir) => existsSync(`${dir}/index.html`),
    )

if (!values["api-only"] && !webRoot) {
  console.error("The web interface is not built. Run `bun run build` first.")
  process.exit(1)
}

const port = values.port ? Number(values.port) : await freePort(4800)
const engine = new OpencodeEngine()
const store = new Store()
const bus = new EventBus()
const pipeline = new Pipeline({ store, engine, bus, exec })
const app = createApp({ pipeline, engine, store, bus, exec, webRoot, version: pkg.version })

serve({ fetch: app.fetch, port, hostname: values.host }, async () => {
  const url = `http://${values.host === "0.0.0.0" ? "127.0.0.1" : values.host}:${port}`
  const amber = (s: string) => `\x1b[38;5;214m${s}\x1b[0m`
  const cyan = (s: string) => `\x1b[38;5;51m${s}\x1b[0m`
  const dim = (s: string) => `\x1b[2m${s}\x1b[0m`
  console.log(`\n  ${amber("legacy")} ${dim("━━━━▶")} ${cyan("v2")}   ${dim(`migrate ${pkg.version}`)}\n`)
  console.log(`  Ready on ${cyan(url)}`)
  console.log(dim("  Press Ctrl+C to stop\n"))
  void engine.info()
  if (!values["no-open"] && !values["api-only"]) {
    const opened = await openBrowser(url, exec)
    if (!opened) console.log(dim(`  Open ${url} in your browser`))
  }
})

const shutdown = () => {
  engine.stop()
  process.exit(0)
}
process.on("SIGINT", shutdown)
process.on("SIGTERM", shutdown)

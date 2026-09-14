import { spawn } from "node:child_process"
import { existsSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { parseArgs } from "node:util"
import { serve } from "@hono/node-server"
import pkg from "../package.json" with { type: "json" }
import { createApp } from "./server/app"
import { EventBus } from "./server/bus"
import { resolveEngineBinary } from "./server/engine/binary"
import { OpencodeEngine } from "./server/engine/opencode"
import { openBrowser } from "./server/open"
import { Pipeline } from "./server/pipeline"
import { Store } from "./server/store"
import { exec } from "./server/util/exec"
import { freePort } from "./server/util/ports"
import { openAppWindow, resolveAppWindow } from "./server/window"

const HELP = `
  simplify-migrate — watch AI migrate a legacy system

  Usage
    simplify-migrate [options]        start the app in its own window (or your browser)
    simplify-migrate auth login       connect an AI provider (OpenAI, Copilot, Z.AI, ...)
    simplify-migrate auth list        show connected providers
    simplify-migrate auth logout      disconnect a provider
    simplify-migrate models           list the models you can use

  Options
    --port <n>     Port to listen on (default 4800, or the next free one)
    --host <h>     Host to bind (default 127.0.0.1)
    --browser      Open in the browser instead of the app window
    --no-open      Do not open anything
    -v, --version  Print the version
    -h, --help     Show this help
`

// Provider setup is delegated to the bundled engine's own interactive commands.
const subcommand = process.argv[2]
if (subcommand === "auth" || subcommand === "models") {
  const binary = resolveEngineBinary()
  if (!binary) {
    console.error("The AI engine is not installed. Reinstall simplify-migrate.")
    process.exit(1)
  }
  const child = spawn(binary, process.argv.slice(2), { stdio: "inherit" })
  child.on("exit", (code) => process.exit(code ?? 0))
  await new Promise(() => {})
}

const { values } = parseArgs({
  options: {
    port: { type: "string" },
    host: { type: "string", default: "127.0.0.1" },
    "no-open": { type: "boolean", default: false },
    browser: { type: "boolean", default: false },
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
  if (values["no-open"] || values["api-only"]) return
  const window = values.browser ? undefined : resolveAppWindow(import.meta.url)
  // Closing the app window stops the app.
  if (window && (await openAppWindow(window, url, shutdown))) return
  const opened = await openBrowser(url, exec)
  if (!opened) console.log(dim(`  Open ${url} in your browser`))
})

const shutdown = () => {
  engine.stop()
  process.exit(0)
}
process.on("SIGINT", shutdown)
process.on("SIGTERM", shutdown)

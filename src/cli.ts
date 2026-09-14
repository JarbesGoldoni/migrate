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
import { ensureOpencode, ensureProviders, INSTALLERS, type SetupIO } from "./server/setup"
import { Store } from "./server/store"
import { link, onKeys, paint, select, spin } from "./server/terminal"
import { exec } from "./server/util/exec"
import { freePort } from "./server/util/ports"

const HELP = `
  simplify-migrate — watch AI migrate a legacy system

  Usage
    simplify-migrate [options]        check opencode, then start the app on localhost
    simplify-migrate auth login       sign opencode in to an AI provider
    simplify-migrate auth list        show the providers opencode is signed in to

  Options
    --port <n>     Port to listen on (default 4800, or the next free one)
    --host <h>     Host to bind (default 127.0.0.1)
    --open         Open the browser as soon as the app is ready
    --yes          Skip the questions and use what opencode already has
    -v, --version  Print the version
    -h, --help     Show this help
`

const attached = (command: string, args: string[]) =>
  new Promise<number>((resolve) => {
    const child = spawn(command, args, { stdio: "inherit" })
    child.on("error", () => resolve(127))
    child.on("exit", (code) => resolve(code ?? 0))
  })

// Provider sign-in is opencode's own interactive flow.
const subcommand = process.argv[2]
if (subcommand === "auth" || subcommand === "models") {
  const binary = resolveEngineBinary()
  if (!binary) {
    console.error(`opencode is not installed. Install it with: ${INSTALLERS[0].command}`)
    process.exit(1)
  }
  process.exit(await attached(binary, process.argv.slice(2)))
}

const { values } = parseArgs({
  options: {
    port: { type: "string" },
    host: { type: "string", default: "127.0.0.1" },
    open: { type: "boolean", default: false },
    yes: { type: "boolean", short: "y", default: false },
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

const tty = Boolean(process.stdin.isTTY && process.stdout.isTTY)
const io: SetupIO = {
  interactive: tty && !values.yes && !values["api-only"],
  log: (line) => console.log(line),
  select: (question, choices) => select(question, choices, { input: process.stdin, output: process.stdout }),
  run: attached,
  spin: (text, task) => spin(text, task, process.stdout),
}

console.log(`\n  ${paint.amber("legacy")} ${paint.dim("━━━━▶")} ${paint.cyan("v2")}   ${paint.dim(`migrate ${pkg.version}`)}\n`)

const found = await ensureOpencode(io, { resolve: resolveEngineBinary, exec })
if (!found) process.exit(1)
const engine = new OpencodeEngine({ binary: found.binary })

if (!values["api-only"]) {
  await ensureProviders(io, {
    // A sign-in only shows up in a freshly started server.
    list: () => {
      engine.stop()
      return engine.providers().catch(() => [])
    },
    login: () => attached(found.binary, ["auth", "login"]),
  })
}

const port = values.port ? Number(values.port) : await freePort(4800)
const store = new Store()
const bus = new EventBus()
const pipeline = new Pipeline({ store, engine, bus, exec })
const app = createApp({ pipeline, engine, store, bus, exec, webRoot, version: pkg.version })

const shutdown = () => {
  engine.stop()
  process.exit(0)
}
process.on("SIGINT", shutdown)
process.on("SIGTERM", shutdown)

serve({ fetch: app.fetch, port, hostname: values.host }, () => {
  const url = `http://${values.host === "0.0.0.0" ? "127.0.0.1" : values.host}:${port}`
  void engine.info()
  if (values["api-only"]) {
    console.log(`  ${paint.green("✓")} API on ${url}\n`)
    return
  }
  console.log(`\n  ${paint.green("✓")} ${paint.bold("Ready")}\n`)
  console.log(`  ${paint.cyan("➜")}  ${paint.bold("Open")}  ${link(url, paint.underline(paint.cyan(url)))}\n`)
  if (values.open) void openBrowser(url, exec)
  if (!tty) return
  console.log(paint.dim(`     Click the link, or press ${paint.bold("o")} to open it in your browser · ${paint.bold("q")} to quit\n`))
  onKeys(process.stdin, (key) => {
    if ((key.ctrl && key.name === "c") || key.name === "q") shutdown()
    if (key.name === "o" || key.name === "return") void openBrowser(url, exec)
  })
})

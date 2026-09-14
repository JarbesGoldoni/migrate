import { homedir } from "node:os"
import { firstVersion } from "./env/compose"
import { type Choice, paint } from "./terminal"
import { type Exec, output } from "./util/exec"

/** Everything the startup checks need from the terminal, so they can run against a script in tests. */
export type SetupIO = {
  interactive: boolean
  log(line: string): void
  select(question: string, choices: Choice[]): Promise<number | undefined>
  /** Run a command attached to the terminal and resolve with its exit code. */
  run(command: string, args: string[]): Promise<number>
  spin<T>(text: string, task: () => Promise<T>): Promise<T>
}

export type Provider = { id: string; name: string }

export const INSTALLERS = [
  { id: "script", tool: "curl", label: "Install with the official script", command: "curl -fsSL https://opencode.ai/install | bash" },
  { id: "npm", tool: "npm", label: "Install with npm", command: "npm install -g opencode-ai" },
] as const

/** OpenCode Zen's free models are always listed; they do not count as the user's own provider. */
export const BUILT_IN_PROVIDER = "opencode"

const home = (path: string) => (path.startsWith(homedir()) ? `~${path.slice(homedir().length)}` : path)

/** Find opencode, offering to install it when it is missing. */
export async function ensureOpencode(
  io: SetupIO,
  deps: { resolve: () => string | undefined; exec: Exec },
): Promise<{ binary: string; version: string } | undefined> {
  let binary = deps.resolve()
  if (!binary) {
    io.log(`  ${paint.amber("!")} ${paint.bold("opencode is not installed.")} migrate runs its agents on opencode.`)
    const available = []
    for (const installer of INSTALLERS) {
      if ((await deps.exec(installer.tool, ["--version"])).code === 0) available.push(installer)
    }
    const manual = () => {
      io.log(`    Install it with ${paint.cyan(INSTALLERS[0].command)}`)
      io.log(`    or ${paint.cyan(INSTALLERS[1].command)}, then run migrate again.`)
    }
    if (!io.interactive || available.length === 0) {
      manual()
      return undefined
    }
    const pick = await io.select("Install opencode now?", [
      ...available.map((installer) => ({ label: installer.label, hint: installer.command })),
      { label: "I'll install it myself" },
    ])
    const installer = pick === undefined ? undefined : available[pick]
    if (!installer) {
      manual()
      return undefined
    }
    const code = await io.run("sh", ["-c", installer.command])
    binary = deps.resolve()
    if (code !== 0 || !binary) {
      io.log(`  ${paint.red("✗")} The install did not finish. Open a new terminal and run migrate again.`)
      return undefined
    }
  }
  const version = firstVersion(output(await deps.exec(binary, ["--version"]))) ?? "unknown"
  io.log(`  ${paint.green("✓")} opencode ${version}  ${paint.dim(home(binary))}`)
  return { binary, version }
}

/** Show the providers opencode is signed in to and let the user keep them or connect another one. */
export async function ensureProviders(io: SetupIO, deps: { list: () => Promise<Provider[]>; login: () => Promise<number> }) {
  for (let round = 0; ; round++) {
    const providers = await io.spin("Checking your AI providers", deps.list)
    const own = providers.filter((p) => p.id !== BUILT_IN_PROVIDER)
    const names = own.map((p) => p.name).join(", ")
    if (own.length) io.log(`  ${paint.green("✓")} Signed in to ${names}`)
    else io.log(`  ${paint.amber("!")} opencode is not signed in to any AI provider yet`)
    if (!io.interactive || round >= 5) return providers

    const choices: Choice[] = own.length
      ? [
          { label: own.length === 1 ? `Use ${names}` : "Use these providers", hint: "you pick the model in the app" },
          { label: "Sign in to another provider", hint: "opencode auth login" },
        ]
      : [
          { label: "Sign in to a provider", hint: "opencode auth login" },
          { label: providers.length ? "Continue with the free OpenCode Zen models" : "Continue without a provider" },
        ]
    const pick = await io.select(own.length ? "Which AI should run the migration?" : "Sign in now?", choices)
    const wantsLogin = own.length ? pick === 1 : pick === 0
    if (!wantsLogin) return providers
    await deps.login()
  }
}

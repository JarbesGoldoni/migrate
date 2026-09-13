import { existsSync } from "node:fs"
import { createRequire } from "node:module"
import { homedir } from "node:os"
import { delimiter, dirname, join } from "node:path"

export function resolveEngineBinary(
  env: NodeJS.ProcessEnv = process.env,
  bundled: () => string | undefined = bundledBinary,
): string | undefined {
  if (env.MIGRATE_ENGINE_BIN) return existing(env.MIGRATE_ENGINE_BIN)
  return (
    bundled() ?? findOnPath("opencode", env) ?? existing(join(env.HOME ?? homedir(), ".opencode", "bin", "opencode"))
  )
}

export function bundledBinary() {
  try {
    const require = createRequire(import.meta.url)
    const pkg = require.resolve("opencode-ai/package.json")
    return existing(join(dirname(pkg), "bin", "opencode.exe")) ?? existing(join(dirname(pkg), "bin", "opencode"))
  } catch {
    return undefined
  }
}

export function findOnPath(name: string, env: NodeJS.ProcessEnv) {
  const dirs = (env.PATH ?? "").split(delimiter).filter(Boolean)
  return dirs.map((dir) => join(dir, name)).find((path) => existsSync(path))
}

function existing(path: string) {
  return existsSync(path) ? path : undefined
}

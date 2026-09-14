import { existsSync } from "node:fs"
import { homedir } from "node:os"
import { delimiter, join } from "node:path"

/** The user's own opencode install: an explicit override, then PATH, then the official installer's location. */
export function resolveEngineBinary(env: NodeJS.ProcessEnv = process.env): string | undefined {
  if (env.MIGRATE_ENGINE_BIN) return existing(env.MIGRATE_ENGINE_BIN)
  return findOnPath("opencode", env) ?? existing(join(env.HOME ?? homedir(), ".opencode", "bin", "opencode"))
}

export function findOnPath(name: string, env: NodeJS.ProcessEnv) {
  const dirs = (env.PATH ?? "").split(delimiter).filter(Boolean)
  return dirs.map((dir) => join(dir, name)).find((path) => existsSync(path))
}

function existing(path: string) {
  return existsSync(path) ? path : undefined
}

import { type ChildProcess, spawn } from "node:child_process"
import { existsSync } from "node:fs"
import { fileURLToPath } from "node:url"

/** The native window (src-tauri) is a thin frame around the local server. */
export function appWindowName(platform: NodeJS.Platform = process.platform) {
  return platform === "win32" ? "simplify-migrate-app.exe" : "simplify-migrate-app"
}

export function appWindowCandidates(
  base: string | URL,
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
  arch: string = process.arch,
) {
  const name = appWindowName(platform)
  const at = (relative: string) => fileURLToPath(new URL(relative, base))
  return [
    env.MIGRATE_APP_BIN,
    // Published package: dist/cli.js next to dist/app/<platform>-<arch>/.
    at(`./app/${platform}-${arch}/${name}`),
    // Development: src/cli.ts with a local build.
    at(`../dist/app/${platform}-${arch}/${name}`),
    at(`../src-tauri/target/release/${name}`),
  ].filter((path): path is string => Boolean(path))
}

export function resolveAppWindow(base: string | URL, env: NodeJS.ProcessEnv = process.env, exists = existsSync) {
  return appWindowCandidates(base, env).find((path) => exists(path))
}

type Spawner = (command: string, args: string[], options: { stdio: "ignore" }) => ChildProcess

/**
 * Open the app window. Resolves false when it cannot start or exits right away (no display,
 * missing webview libraries), so the caller can fall back to the browser. Once it is up,
 * closing the window calls onClose.
 */
export function openAppWindow(binary: string, url: string, onClose: () => void, spawner: Spawner = spawn, graceMs = 2_500) {
  return new Promise<boolean>((resolve) => {
    let started = false
    const child = spawner(binary, [url], { stdio: "ignore" })
    child.once("error", () => resolve(false))
    child.once("exit", () => (started ? onClose() : resolve(false)))
    setTimeout(() => {
      if (child.exitCode !== null) return
      started = true
      resolve(true)
    }, graceMs)
  })
}

import { readFileSync } from "node:fs"
import type { Exec } from "./util/exec"

export function isWsl(env: NodeJS.ProcessEnv = process.env, readVersion = () => readFileSync("/proc/version", "utf8")) {
  if (env.WSL_DISTRO_NAME) return true
  try {
    return readVersion().toLowerCase().includes("microsoft")
  } catch {
    return false
  }
}

export function browserCommands(url: string, platform: NodeJS.Platform, wsl: boolean): Array<[string, string[]]> {
  if (wsl) return [["wslview", [url]], ["cmd.exe", ["/c", "start", "", url]], ["explorer.exe", [url]]]
  if (platform === "darwin") return [["open", [url]]]
  if (platform === "win32") return [["cmd", ["/c", "start", "", url]]]
  return [["xdg-open", [url]]]
}

export async function openBrowser(url: string, exec: Exec, platform = process.platform, wsl = isWsl()) {
  for (const [cmd, args] of browserCommands(url, platform, wsl)) {
    const result = await exec(cmd, args, { timeoutMs: 10_000 })
    // explorer.exe exits with 1 even when it opens the URL.
    if (result.code === 0 || (cmd === "explorer.exe" && result.code === 1)) return true
  }
  return false
}

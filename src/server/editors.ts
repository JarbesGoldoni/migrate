import { spawn } from "node:child_process"
import { findOnPath } from "./engine/binary"
import { isWsl } from "./open"
import type { Exec } from "./util/exec"

export type Editor = { id: string; label: string; command: string }

export const EDITORS: Editor[] = [
  { id: "code", label: "VS Code", command: "code" },
  { id: "cursor", label: "Cursor", command: "cursor" },
  { id: "windsurf", label: "Windsurf", command: "windsurf" },
  { id: "zed", label: "Zed", command: "zed" },
  { id: "idea", label: "IntelliJ IDEA", command: "idea" },
  { id: "goland", label: "GoLand", command: "goland" },
  { id: "webstorm", label: "WebStorm", command: "webstorm" },
  { id: "subl", label: "Sublime Text", command: "subl" },
]

type Lookup = (name: string, env: NodeJS.ProcessEnv) => string | undefined
export type Launch = (command: string, args: string[]) => Promise<boolean>

/** Editors whose command-line launcher is on PATH. */
export function detectEditors(env: NodeJS.ProcessEnv = process.env, lookup: Lookup = findOnPath) {
  return EDITORS.filter((editor) => lookup(editor.command, env))
}

/** Start a program without waiting for it; editors keep running after the request returns. */
export const launch: Launch = (command, args) =>
  new Promise((resolve) => {
    const child = spawn(command, args, { detached: true, stdio: "ignore" })
    child.once("error", () => resolve(false))
    child.once("spawn", () => {
      child.unref()
      resolve(true)
    })
  })

export async function openInEditor(
  path: string,
  editorId: string,
  options: { env?: NodeJS.ProcessEnv; lookup?: Lookup; run?: Launch } = {},
) {
  const editor = detectEditors(options.env, options.lookup).find((e) => e.id === editorId)
  if (!editor) throw new Error(`${editorId} is not installed`)
  return (options.run ?? launch)(editor.command, [path])
}

/** Show a folder in the system file manager (Windows Explorer from WSL). */
export async function openFolder(path: string, exec: Exec, platform = process.platform, wsl = isWsl()) {
  if (wsl) {
    const windowsPath = (await exec("wslpath", ["-w", path])).stdout.trim()
    // explorer.exe exits with 1 even when it opens the folder.
    const result = await exec("explorer.exe", [windowsPath || path], { timeoutMs: 10_000 })
    return result.code === 0 || result.code === 1
  }
  const command = platform === "darwin" ? "open" : platform === "win32" ? "explorer" : "xdg-open"
  const result = await exec(command, [path], { timeoutMs: 10_000 })
  return result.code === 0 || (platform === "win32" && result.code === 1)
}

export type WorkspaceOpener = {
  editors(): Array<Pick<Editor, "id" | "label">>
  editor(path: string, id: string): Promise<boolean>
  folder(path: string): Promise<boolean>
}

export function systemOpener(exec: Exec): WorkspaceOpener {
  return {
    editors: () => detectEditors().map(({ id, label }) => ({ id, label })),
    editor: (path, id) => openInEditor(path, id),
    folder: (path) => openFolder(path, exec),
  }
}

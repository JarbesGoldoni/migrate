import { describe, expect, test } from "bun:test"
import { EventEmitter } from "node:events"
import type { ChildProcess } from "node:child_process"
import { detectEditors, launch, openFolder, openInEditor, systemOpener } from "../src/server/editors"
import { appWindowCandidates, appWindowName, openAppWindow, resolveAppWindow } from "../src/server/window"
import type { Exec } from "../src/server/util/exec"

const lookup = (name: string) => (name === "code" || name === "zed" ? `/bin/${name}` : undefined)

describe("opening the workspace", () => {
  test("detects editors on PATH and opens the chosen one", async () => {
    expect(detectEditors({}, lookup).map((e) => e.id)).toEqual(["code", "zed"])
    const calls: string[][] = []
    const run = async (command: string, args: string[]) => (calls.push([command, ...args]), true)
    expect(await openInEditor("/ws", "zed", { env: {}, lookup, run })).toBe(true)
    expect(calls).toEqual([["zed", "/ws"]])
    await expect(openInEditor("/ws", "idea", { env: {}, lookup, run })).rejects.toThrow("not installed")
  })

  test("opens folders with the platform's file manager", async () => {
    const calls: string[][] = []
    const exec: Exec = async (cmd, args) => {
      calls.push([cmd, ...args])
      return { code: cmd === "explorer.exe" ? 1 : 0, stdout: cmd === "wslpath" ? "C:\\ws\n" : "", stderr: "" }
    }
    expect(await openFolder("/ws", exec, "linux", false)).toBe(true)
    expect(await openFolder("/ws", exec, "darwin", false)).toBe(true)
    expect(await openFolder("/ws", exec, "linux", true)).toBe(true)
    expect(calls).toEqual([["xdg-open", "/ws"], ["open", "/ws"], ["wslpath", "-w", "/ws"], ["explorer.exe", "C:\\ws"]])

    const opener = systemOpener(exec)
    expect(Array.isArray(opener.editors())).toBe(true)
    expect(await opener.folder("/other")).toBe(true)
    await expect(opener.editor("/ws", "no-such-editor")).rejects.toThrow("not installed")
  })

  test("launch reports whether the program started", async () => {
    expect(await launch("definitely-not-a-real-command-xyz", [])).toBe(false)
    expect(await launch("true", [])).toBe(true)
  })
})

function fakeChild() {
  const child = new EventEmitter() as ChildProcess & { exitCode: number | null }
  child.exitCode = null
  return child
}

describe("app window", () => {
  test("looks next to the bundle, then in development builds", () => {
    expect(appWindowName("win32")).toBe("simplify-migrate-app.exe")
    const candidates = appWindowCandidates("file:///pkg/dist/cli.js", { MIGRATE_APP_BIN: "/custom/app" }, "linux", "x64")
    expect(candidates).toEqual([
      "/custom/app",
      "/pkg/dist/app/linux-x64/simplify-migrate-app",
      "/pkg/dist/app/linux-x64/simplify-migrate-app",
      "/pkg/src-tauri/target/release/simplify-migrate-app",
    ])
    expect(resolveAppWindow("file:///pkg/dist/cli.js", {}, (path) => String(path).includes("src-tauri"))).toContain("src-tauri")
    expect(resolveAppWindow("file:///pkg/dist/cli.js", {}, () => false)).toBeUndefined()
  })

  test("falls back when the window cannot start, and reports when it closes", async () => {
    const failing = fakeChild()
    const failed = openAppWindow("/app", "http://x", () => {}, () => failing, 20)
    failing.emit("error", new Error("ENOENT"))
    expect(await failed).toBe(false)

    const quitting = fakeChild()
    const quit = openAppWindow("/app", "http://x", () => {}, () => quitting, 20)
    quitting.exitCode = 1
    quitting.emit("exit", 1)
    expect(await quit).toBe(false)

    let closed = false
    const running = fakeChild()
    const args: string[][] = []
    const opened = openAppWindow("/app", "http://x", () => (closed = true), (command, list) => (args.push([command, ...list]), running), 20)
    expect(await opened).toBe(true)
    expect(args).toEqual([["/app", "http://x"]])
    running.emit("exit", 0)
    expect(closed).toBe(true)
  })
})

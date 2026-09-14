import { describe, expect, test } from "bun:test"
import { detectEditors, launch, openFolder, openInEditor, systemOpener } from "../src/server/editors"
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

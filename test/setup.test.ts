import { describe, expect, test } from "bun:test"
import { PassThrough } from "node:stream"
import { BUILT_IN_PROVIDER, ensureOpencode, ensureProviders, INSTALLERS, type SetupIO } from "../src/server/setup"
import { link, onKeys, paint, renderChoices, select, spin } from "../src/server/terminal"
import type { Exec } from "../src/server/util/exec"

function scripted(answers: Array<number | undefined>, interactive = true) {
  const lines: string[] = []
  const questions: string[] = []
  const runs: string[][] = []
  const io: SetupIO = {
    interactive,
    log: (line) => lines.push(line),
    select: async (question) => {
      questions.push(question)
      return answers.shift()
    },
    run: async (command, args) => {
      runs.push([command, ...args])
      return 0
    },
    spin: (_text, task) => task(),
  }
  return { io, lines, questions, runs, text: () => plain(lines.join("\n")) }
}

const plain = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, "")

describe("opencode check", () => {
  test("uses the installed opencode and shows its version", async () => {
    const { io, text, questions } = scripted([])
    const exec: Exec = async (cmd) => ({ code: 0, stdout: cmd === "/bin/opencode" ? "1.17.18\n" : "", stderr: "" })
    expect(await ensureOpencode(io, { resolve: () => "/bin/opencode", exec })).toEqual({ binary: "/bin/opencode", version: "1.17.18" })
    expect(text()).toContain("opencode 1.17.18")
    expect(questions).toEqual([])
  })

  test("offers the installers it can run and installs the chosen one", async () => {
    let installed = false
    const { io, runs, questions } = scripted([1])
    io.run = async (command, args) => {
      runs.push([command, ...args])
      installed = true
      return 0
    }
    const exec: Exec = async (cmd) => ({ code: ["curl", "npm", "/home/opencode"].includes(cmd) ? 0 : 1, stdout: "opencode 1.2.3", stderr: "" })
    expect(await ensureOpencode(io, { resolve: () => (installed ? "/home/opencode" : undefined), exec })).toEqual({
      binary: "/home/opencode",
      version: "1.2.3",
    })
    expect(runs).toEqual([["sh", "-c", INSTALLERS[1].command]])
    expect(questions).toEqual(["Install opencode now?"])
  })

  test("explains how to install when declined, headless or when the install fails", async () => {
    const onlyCurl: Exec = async (cmd) => ({ code: cmd === "curl" ? 0 : 1, stdout: "", stderr: "" })
    const declined = scripted([1])
    expect(await ensureOpencode(declined.io, { resolve: () => undefined, exec: onlyCurl })).toBeUndefined()
    expect(declined.text()).toContain(INSTALLERS[0].command)

    const headless = scripted([], false)
    expect(await ensureOpencode(headless.io, { resolve: () => undefined, exec: onlyCurl })).toBeUndefined()
    expect(headless.questions).toEqual([])

    const failing = scripted([0])
    failing.io.run = async () => 1
    expect(await ensureOpencode(failing.io, { resolve: () => undefined, exec: onlyCurl })).toBeUndefined()
    expect(failing.text()).toContain("did not finish")
  })
})

describe("provider check", () => {
  test("keeps the providers opencode is signed in to", async () => {
    const { io, text, questions } = scripted([0])
    const providers = [
      { id: "anthropic", name: "Anthropic" },
      { id: BUILT_IN_PROVIDER, name: "OpenCode Zen" },
    ]
    let logins = 0
    expect(await ensureProviders(io, { list: async () => providers, login: async () => (logins++, 0) })).toEqual(providers)
    expect(text()).toContain("Signed in to Anthropic")
    expect(text()).not.toContain("OpenCode Zen")
    expect(questions).toEqual(["Which AI should run the migration?"])
    expect(logins).toBe(0)
  })

  test("signs in to another provider and lists them again", async () => {
    const { io, text } = scripted([1, 0])
    const lists = [
      [{ id: "google", name: "Google" }],
      [
        { id: "google", name: "Google" },
        { id: "zai", name: "Z.AI" },
      ],
    ]
    let logins = 0
    const result = await ensureProviders(io, { list: async () => lists.shift()!, login: async () => (logins++, 0) })
    expect(logins).toBe(1)
    expect(result.map((p) => p.id)).toEqual(["google", "zai"])
    expect(text()).toContain("Signed in to Google, Z.AI")
  })

  test("asks to sign in when nothing is connected, and never asks when headless", async () => {
    const empty = scripted([1])
    expect(await ensureProviders(empty.io, { list: async () => [{ id: BUILT_IN_PROVIDER, name: "Zen" }], login: async () => 0 })).toHaveLength(1)
    expect(empty.questions).toEqual(["Sign in now?"])
    expect(empty.text()).toContain("not signed in")

    const headless = scripted([], false)
    await ensureProviders(headless.io, { list: async () => [], login: async () => 0 })
    expect(headless.questions).toEqual([])
  })
})

type Key = { name?: string; sequence?: string; ctrl?: boolean }

async function choose(keys: Key[]) {
  const input = new PassThrough()
  let output = ""
  const pending = select("Pick", [{ label: "A" }, { label: "B" }, { label: "C" }], { input, output: { write: (s: string) => (output += s) } })
  for (const key of keys) input.emit("keypress", key.sequence ?? "", key)
  return { value: await pending, output: plain(output) }
}

describe("terminal", () => {
  test("renders choices, links and colors", () => {
    expect(renderChoices("Pick", [{ label: "A", hint: "first" }, { label: "B" }], 1).map(plain)).toEqual(["  ? Pick", "    A  first", "  ❯ B"])
    expect(link("http://x", "open")).toBe("\x1b]8;;http://x\x1b\\open\x1b]8;;\x1b\\")
    expect(plain(paint.underline(paint.cyan("x")))).toBe("x")
  })

  test("select moves with arrows, j/k and numbers, and cancels with escape or Ctrl+C", async () => {
    expect((await choose([{ name: "down" }, { name: "down" }, { name: "up" }, { name: "return" }])).value).toBe(1)
    expect((await choose([{ name: "k" }, { name: "enter" }])).value).toBe(2)
    expect((await choose([{ name: "j" }, { name: "x" }, { sequence: "9" }, { sequence: "3" }])).value).toBe(2)
    expect((await choose([{ name: "escape" }])).value).toBeUndefined()
    const cancelled = await choose([{ name: "c", ctrl: true }])
    expect(cancelled.value).toBeUndefined()
    expect(cancelled.output).toContain("cancelled")
    expect((await choose([{ name: "return" }])).output).toContain("Pick › A")
  })

  test("onKeys stops listening when disposed", () => {
    const input = new PassThrough()
    const seen: string[] = []
    const stop = onKeys(input, (key) => seen.push(key.name ?? ""))
    input.emit("keypress", "o", { name: "o" })
    stop()
    input.emit("keypress", "q", { name: "q" })
    expect(seen).toEqual(["o"])
  })

  test("spin animates only on a terminal and returns the task's result", async () => {
    let output = ""
    const tty = { isTTY: true, write: (s: string) => (output += s) }
    expect(await spin("Checking", () => Bun.sleep(30).then(() => 7), tty, 5)).toBe(7)
    expect(plain(output)).toContain("Checking")
    let quiet = ""
    expect(await spin("Checking", async () => 1, { write: (s: string) => (quiet += s) })).toBe(1)
    expect(quiet).toBe("")
  })
})

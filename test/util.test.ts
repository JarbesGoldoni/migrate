import { describe, expect, test } from "bun:test"
import { createServer } from "node:net"
import { EventBus } from "../src/server/bus"
import { browserCommands, isWsl, openBrowser } from "../src/server/open"
import { migrateHome, projectsFile, samplesDir, workspacesDir } from "../src/server/paths"
import { exec, output } from "../src/server/util/exec"
import { extractJson } from "../src/server/util/json"
import { freePort, isPortFree } from "../src/server/util/ports"
import { phaseKey, isBatchPhase, isProjectPhase } from "../src/shared/types"

describe("extractJson", () => {
  test("parses whole documents, fenced blocks and embedded objects", () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 })
    expect(extractJson("Here you go:\n```json\n[1,2]\n```")).toEqual([1, 2])
    expect(extractJson('Sure! {"text":"brace } inside","n":{"x":[1]}} trailing')).toEqual({ text: "brace } inside", n: { x: [1] } })
    expect(extractJson('escaped {"q":"say \\"hi\\""}')).toEqual({ q: 'say "hi"' })
  })

  test("returns undefined when nothing parses", () => {
    expect(extractJson("")).toBeUndefined()
    expect(extractJson("no json {here")).toBeUndefined()
    expect(extractJson("mismatch {]")).toBeUndefined()
    expect(extractJson("```json\n{bad}\n```")).toBeUndefined()
  })
})

describe("exec", () => {
  test("captures output and exit codes", async () => {
    const chunks: string[] = []
    const ok = await exec("sh", ["-c", "echo out; echo err 1>&2"], { onOutput: (c) => chunks.push(c) })
    expect(ok.code).toBe(0)
    expect(ok.stdout.trim()).toBe("out")
    expect(output(ok)).toContain("err")
    expect(chunks.join("")).toContain("out")
    expect((await exec("sh", ["-c", "exit 3"])).code).toBe(3)
  })

  test("reports missing binaries and timeouts", async () => {
    expect((await exec("definitely-not-a-binary-xyz", [])).code).toBe(127)
    const slow = await exec("sleep", ["5"], { timeoutMs: 50 })
    expect(slow.code).not.toBe(0)
  })
})

describe("ports", () => {
  test("finds free ports and detects busy ones", async () => {
    const port = await freePort()
    expect(port).toBeGreaterThan(0)
    const server = createServer()
    await new Promise<void>((r) => server.listen(port, "127.0.0.1", r))
    expect(await isPortFree(port)).toBe(false)
    const next = await freePort(port, [])
    expect(next).not.toBe(port)
    expect(await freePort(port + 1, [port + 1])).not.toBe(port + 1)
    await new Promise<void>((r) => server.close(() => r()))
  })
})

describe("EventBus", () => {
  test("delivers events, upserts activity and caps the feed", () => {
    const bus = new EventBus()
    const seen: string[] = []
    const off = bus.subscribe("p", (e) => seen.push(e.type))
    const item = { id: "a", at: 1, phase: "discover", kind: "read" as const, title: "Read" }
    bus.emit("p", { type: "activity", activity: item })
    bus.emit("p", { type: "activity", activity: { ...item, title: "Read again" } })
    bus.emit("p", { type: "changed", artifact: "x" })
    expect(seen).toEqual(["activity", "activity", "changed"])
    expect(bus.activity("p")).toEqual([{ ...item, title: "Read again" }])
    off()
    bus.emit("p", { type: "changed", artifact: "y" })
    expect(seen).toHaveLength(3)
    for (let i = 0; i < 2100; i++) bus.emit("q", { type: "activity", activity: { ...item, id: `i${i}` } })
    expect(bus.activity("q")).toHaveLength(2000)
    bus.seed("q", [])
    expect(bus.activity("q")).toHaveLength(2000)
    bus.seed("r", [item])
    expect(bus.activity("r")).toEqual([item])
    expect(bus.activity("none")).toEqual([])
  })
})

describe("open", () => {
  test("detects WSL", () => {
    expect(isWsl({ WSL_DISTRO_NAME: "Ubuntu" })).toBe(true)
    expect(isWsl({}, () => "Linux version 6.6.87.2-microsoft-standard-WSL2")).toBe(true)
    expect(isWsl({}, () => "Linux version 6.9 generic")).toBe(false)
    expect(
      isWsl({}, () => {
        throw new Error("no proc")
      }),
    ).toBe(false)
  })

  test("chooses a browser command per platform", () => {
    expect(browserCommands("http://x", "linux", true)[0]).toEqual(["wslview", ["http://x"]])
    expect(browserCommands("http://x", "darwin", false)).toEqual([["open", ["http://x"]]])
    expect(browserCommands("http://x", "win32", false)[0][0]).toBe("cmd")
    expect(browserCommands("http://x", "linux", false)).toEqual([["xdg-open", ["http://x"]]])
  })

  test("falls through candidates", async () => {
    const tried: string[] = []
    const fake = (code: (cmd: string) => number) => async (cmd: string) => {
      tried.push(cmd)
      return { code: code(cmd), stdout: "", stderr: "" }
    }
    expect(await openBrowser("http://x", fake((c) => (c === "explorer.exe" ? 1 : 127)), "linux", true)).toBe(true)
    expect(tried).toEqual(["wslview", "cmd.exe", "explorer.exe"])
    expect(await openBrowser("http://x", fake(() => 1), "linux", false)).toBe(false)
  })
})

describe("paths", () => {
  test("live under MIGRATE_HOME", () => {
    const previous = process.env.MIGRATE_HOME
    process.env.MIGRATE_HOME = "/tmp/migrate-home"
    expect(migrateHome()).toBe("/tmp/migrate-home")
    expect(workspacesDir()).toBe("/tmp/migrate-home/workspaces")
    expect(samplesDir()).toBe("/tmp/migrate-home/samples")
    expect(projectsFile()).toBe("/tmp/migrate-home/projects.json")
    if (previous === undefined) delete process.env.MIGRATE_HOME
    else process.env.MIGRATE_HOME = previous
  })
})

describe("phase keys", () => {
  test("compose and classify", () => {
    expect(phaseKey("rules", "catalog")).toBe("rules:catalog")
    expect(phaseKey("discover")).toBe("discover")
    expect(isBatchPhase("legacy")).toBe(true)
    expect(isProjectPhase("environment")).toBe(true)
    expect(isProjectPhase("rules")).toBe(false)
  })
})

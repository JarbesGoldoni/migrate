import { afterAll, describe, expect, test } from "bun:test"
import { chmod, mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { relativePath, toActivity, toolKind } from "../src/server/engine/activity"
import { bundledBinary, findOnPath, resolveEngineBinary } from "../src/server/engine/binary"
import { firstDefault, OpencodeEngine, recentModel } from "../src/server/engine/opencode"
import { parseSse, readSse } from "../src/server/engine/sse"
import type { Activity } from "../src/shared/types"
import { tempDir } from "./helpers"

const ctx = { phase: "discover", root: "/ws", isUserMessage: (id: string) => id === "user", now: 5 }
const toolEvent = (tool: string, status: string, input: Record<string, unknown> = {}, extra = {}) => ({
  type: "message.part.updated",
  properties: { part: { id: `p-${tool}`, messageID: "m", type: "tool", tool, state: { status, input, ...extra } } },
})

describe("activity mapping", () => {
  test("maps tools to kinds and relative titles", () => {
    expect(toolKind("grep")).toBe("search")
    expect(toolKind("mystery")).toBe("agent")
    expect(relativePath("/ws/legacy/a.js", "/ws")).toBe("legacy/a.js")
    expect(relativePath("/ws", "/ws")).toBe(".")
    expect(relativePath(3, "/ws")).toBe("")
    const cases: Array<[string, Record<string, unknown>, string]> = [
      ["read", { filePath: "/ws/legacy/a.js" }, "Read legacy/a.js"],
      ["glob", { pattern: "**/*.go", path: "/ws/legacy" }, "Scan **/*.go in legacy"],
      ["list", {}, "List ."],
      ["grep", { pattern: "router" }, "Search “router”"],
      ["edit", { filePath: "/ws/v2/main.go" }, "Edit v2/main.go"],
      ["write", { filePath: "/ws/migration/x.json" }, "Write migration/x.json"],
      ["bash", { description: "Build v2", command: "go build" }, "Run Build v2"],
      ["webfetch", { url: "https://x" }, "Fetch https://x"],
      ["websearch", { query: "pgx" }, "Search the web for “pgx”"],
      ["todowrite", { todos: [{ content: "a" }, { content: "b" }] }, "Plan 2 steps"],
      ["task", { description: "Explore" }, "Delegate Explore"],
      ["custom_tool", {}, "custom_tool"],
    ]
    for (const [tool, input, title] of cases) {
      expect(toActivity(toolEvent(tool, "running", input), ctx)?.title).toBe(title)
    }
    expect(toActivity(toolEvent("bash", "completed", { command: "ls" }), ctx)).toMatchObject({ kind: "bash", detail: "ls", status: "done" })
    expect(toActivity(toolEvent("todowrite", "completed", { todos: [{ content: "a" }, "x"] }), ctx)?.detail).toBe("a")
    expect(toActivity(toolEvent("read", "error", {}, { error: "denied" }), ctx)).toMatchObject({ kind: "error", detail: "denied", status: "error" })
    expect(toActivity(toolEvent("read", "pending"), ctx)).toBeUndefined()
  })

  test("maps reasoning and text, skipping user messages and empty parts", () => {
    const long = `# Plan\n${"x".repeat(200)}`
    const reasoning = toActivity(
      { type: "message.part.updated", properties: { part: { id: "r", messageID: "m", type: "reasoning", text: long, time: { end: 2 } } } },
      ctx,
    )
    expect(reasoning).toMatchObject({ kind: "think", title: "Plan", status: "done", detail: long, at: 5 })
    const text = toActivity({ type: "message.part.updated", properties: { part: { id: "t", messageID: "m", type: "text", text: "short" } } }, ctx)
    expect(text).toMatchObject({ kind: "text", title: "short", status: "running", detail: undefined })
    expect(toActivity({ type: "message.part.updated", properties: { part: { id: "u", messageID: "user", type: "text", text: "hi" } } }, ctx)).toBeUndefined()
    expect(toActivity({ type: "message.part.updated", properties: { part: { id: "e", messageID: "m", type: "text", text: " " } } }, ctx)).toBeUndefined()
    expect(toActivity({ type: "message.part.updated", properties: { part: { id: "s", type: "step-start" } } }, ctx)).toBeUndefined()
    expect(toActivity({ type: "message.part.updated", properties: {} }, ctx)).toBeUndefined()
    expect(toActivity({ type: "session.idle" }, ctx)).toBeUndefined()
  })
})

describe("sse", () => {
  test("parses complete events and keeps the tail", () => {
    const parsed = parseSse('data: {"type":"a"}\r\n\r\ndata: not json\n\nevent: x\ndata: {"type":"b"}\n\ndata: {"type":"c"')
    expect(parsed.events.map((e) => e.type)).toEqual(["a", "b"])
    expect(parsed.rest).toBe('data: {"type":"c"')
    expect(parseSse(": comment\n\n").events).toEqual([])
  })

  test("reads a stream split mid-event", async () => {
    const encoder = new TextEncoder()
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"type":"one"}\n\ndata: {"ty'))
        controller.enqueue(encoder.encode('pe":"two"}\n\n'))
        controller.close()
      },
    })
    const types: string[] = []
    for await (const event of readSse(stream)) types.push(event.type ?? "")
    expect(types).toEqual(["one", "two"])
  })
})

describe("binary resolution", () => {
  test("honors an explicit binary and finds the bundled engine", async () => {
    const dir = await tempDir()
    const bin = join(dir, "engine")
    await writeFile(bin, "#!/bin/sh\n")
    expect(resolveEngineBinary({ MIGRATE_ENGINE_BIN: bin })).toBe(bin)
    expect(resolveEngineBinary({ MIGRATE_ENGINE_BIN: join(dir, "missing") })).toBeUndefined()
    expect(resolveEngineBinary({ PATH: "" })).toBeDefined()
    expect(bundledBinary()).toBeDefined()
  })

  test("falls back to PATH and the home install", async () => {
    const pathDir = await tempDir()
    await writeFile(join(pathDir, "opencode"), "#!/bin/sh\n")
    const none = () => undefined
    expect(findOnPath("opencode", { PATH: `/nope:${pathDir}` })).toBe(join(pathDir, "opencode"))
    expect(findOnPath("opencode", {})).toBeUndefined()
    expect(resolveEngineBinary({ PATH: pathDir }, none)).toBe(join(pathDir, "opencode"))
    const home = await tempDir()
    await mkdir(join(home, ".opencode", "bin"), { recursive: true })
    await writeFile(join(home, ".opencode", "bin", "opencode"), "#!/bin/sh\n")
    expect(resolveEngineBinary({ PATH: "", HOME: home }, none)).toBe(join(home, ".opencode", "bin", "opencode"))
    expect(resolveEngineBinary({ PATH: "", HOME: pathDir }, none)).toBeUndefined()
  })
})

describe("default model", () => {
  const models = [
    { providerID: "a", providerName: "A", modelID: "x", name: "X" },
    { providerID: "b", providerName: "B", modelID: "y", name: "Y" },
  ]

  test("prefers the most recent model that is still available", async () => {
    const state = await tempDir()
    const file = join(state, "opencode", "model.json")
    await mkdir(join(state, "opencode"), { recursive: true })
    await writeFile(file, JSON.stringify({ recent: [{ providerID: "gone", modelID: "z" }, { providerID: "b", modelID: "y" }] }))
    expect(await recentModel(models, state)).toEqual({ providerID: "b", modelID: "y" })
    await writeFile(file, JSON.stringify({ recent: [{ providerID: "gone", modelID: "z" }] }))
    expect(await recentModel(models, state)).toBeUndefined()
    await writeFile(file, "{broken")
    expect(await recentModel(models, state)).toBeUndefined()
    expect(await recentModel(models, join(state, "missing"))).toBeUndefined()
  })

  test("falls back to provider defaults, then the first model", () => {
    expect(firstDefault({ providers: [], default: { gone: "z", a: "x" } }, models)).toEqual({ providerID: "a", modelID: "x" })
    expect(firstDefault({ providers: [], default: {} }, models)).toEqual({ providerID: "a", modelID: "x" })
    expect(firstDefault({ providers: [], default: {} }, [])).toBeUndefined()
  })
})

describe("OpencodeEngine against a fake engine server", async () => {
  const dir = await tempDir()
  const workspace = join(dir, "workspace")
  await mkdir(workspace)
  const fixture = join(import.meta.dir, "fixtures", "fake-engine.ts")
  const wrapper = join(dir, "fake-engine")
  await writeFile(wrapper, `#!/bin/sh\nexec "${process.execPath}" "${fixture}" "$@"\n`)
  await chmod(wrapper, 0o755)
  const engine = new OpencodeEngine({ binary: wrapper })
  afterAll(() => engine.stop())

  test("lists models", async () => {
    const info = await engine.info()
    expect(info.ready).toBe(true)
    expect(info.models).toEqual([{ providerID: "fake", providerName: "Fake AI", modelID: "smart", name: "Smart" }])
    expect(info.defaultModel).toEqual({ providerID: "fake", modelID: "smart" })
    expect(await engine.info()).toBe(info)
  })

  test("runs a prompt, streams activity and reports written files", async () => {
    const activity: Activity[] = []
    const result = await engine.run({
      directory: workspace,
      phase: "discover",
      title: "Map",
      prompt: "Write out.json please",
      model: { providerID: "fake", modelID: "smart" },
      onActivity: (a) => activity.push(a),
    })
    expect(result.sessionId).toBe("ses_fake")
    expect(result.text).toBe("All done.")
    expect(result.writes).toEqual([join(workspace, "out.json")])
    expect(result.error).toBeUndefined()
    expect(await Bun.file(join(workspace, "out.json")).json()).toEqual({ ok: true })
    const kinds = activity.map((a) => a.kind)
    expect(kinds).toContain("think")
    expect(kinds).toContain("write")
    expect(kinds).toContain("system")
    expect(activity.some((a) => a.title.includes("Write out.json please"))).toBe(false)
  })

  test("reuses an existing session and surfaces engine errors", async () => {
    const result = await engine.run({
      directory: workspace,
      phase: "entrypoints",
      title: "Entry points",
      prompt: "please fail",
      sessionId: "ses_fake",
      onActivity: () => {},
    })
    expect(result.sessionId).toBe("ses_fake")
    expect(result.error).toBe("Quota exceeded")
  })

  test("creates a new session when the old one is gone", async () => {
    const result = await engine.run({
      directory: workspace,
      phase: "rules",
      title: "Rules",
      prompt: "anything",
      sessionId: "ses_gone",
      onActivity: () => {},
    })
    expect(result.sessionId).toBe("ses_fake")
  })

  test("reports a missing binary", async () => {
    const broken = new OpencodeEngine({ binary: join(dir, "nope") })
    const info = await broken.info()
    expect(info.ready).toBe(false)
    expect(info.error).toBeDefined()
  })
})

import { describe, expect, test } from "bun:test"
import { Layers, ShoppingCart } from "lucide-react"
import { parseDiscovery, parseEntryPoints, parseTests } from "../src/shared/contracts"
import type { ProjectState } from "../src/shared/types"
import type { Snapshot } from "../web/src/lib/api"
import { curlFor } from "../web/src/lib/curl"
import { sortVariants } from "../web/src/lib/effort"
import { ancestors, buildTree, fileName, filterFiles, formatBytes, languageOf } from "../web/src/lib/files"
import { classify, richTokens } from "../web/src/lib/rich"
import { serverText } from "../web/src/lib/server-text"
import { choiceFor, sameChoice, targetOptions } from "../web/src/lib/target"
import { clockTime, cn, duration, methodStyle, shortPath, statusTone } from "../web/src/lib/format"
import { jsonLines, pretty, touches } from "../web/src/lib/json"
import { batchProgress, canReplay, hasOutput, isRunning, nextBatchPhase, phaseState, phaseStatus, totals } from "../web/src/lib/pipeline"
import { batchIcon, brandIcon, readableHex } from "../web/src/lib/tech"

function snapshot(overrides: Partial<Snapshot> = {}, phases: ProjectState["phases"] = {}): Snapshot {
  return {
    project: { id: "p", name: "shop", source: "/s", workspace: "/w", branch: "migrate/v2", createdAt: 1, target: "go", ports: { legacy: 1, v2: 2 } },
    state: { phases, sessions: {}, runtime: { legacy: "down", v2: "down" } },
    rules: {},
    tests: {},
    legacyRuns: {},
    ports: {},
    builds: {},
    parity: {},
    reconcile: {},
    verify: {},
    activity: [],
    ...overrides,
  }
}

describe("json lines", () => {
  test("track JSONPath per line and tone per token", () => {
    const lines = jsonLines({ a: 1, list: [{ b: "x" }, true], empty: {}, none: [], nil: null })
    expect(lines.map((l) => l.path)).toEqual(["$", "$.a", "$.list", "$.list[0]", "$.list[0].b", "$.list[0]", "$.list[1]", "$.list", "$.empty", "$.none", "$.nil", "$"])
    expect(lines[1].tokens.map((t) => t.tone)).toEqual(["key", "punct", "number", "punct"])
    expect(lines[4].tokens.at(-1)).toEqual({ text: '"x"', tone: "string" })
    expect(jsonLines(undefined)[0].tokens[0]).toEqual({ text: "undefined", tone: "literal" })
    expect(touches("$.list[0].b", ["$.list[0]"])).toBe(true)
    expect(touches("$.listing", ["$.list"])).toBe(false)
    expect(touches("$.a", ["$"])).toBe(false)
    expect(pretty(undefined)).toBe("")
    expect(pretty("raw")).toBe("raw")
    expect(pretty({ a: 1 })).toBe('{\n  "a": 1\n}')
  })
})

describe("pipeline progress", () => {
  const entrypoints = parseEntryPoints({ entrypoints: [{ id: "list", path: "/p" }], batches: [{ id: "catalog", entrypoints: ["list"] }] })

  test("walks a batch through its steps", () => {
    const empty = snapshot({ entrypoints })
    expect(nextBatchPhase(empty, "catalog")).toBe("rules")
    expect(batchProgress(empty, "catalog")).toEqual({ done: 0, total: 5, proven: false })
    expect(phaseState(undefined, "discover")).toEqual({ status: "idle" })

    const tests = parseTests({ cases: [{ id: "c", request: { path: "/p" } }] })
    const parity = { batch: "catalog", at: 1, matched: 1, total: 2, results: [] }
    const midway = snapshot(
      {
        entrypoints,
        rules: { catalog: { batch: "catalog", entrypoints: [{ entrypoint: "list", flow: [], rules: [{ id: "r", title: { en: "", "pt-BR": "", es: "" }, kind: "other", description: { en: "", "pt-BR": "", es: "" }, file: "", lineStart: 0, lineEnd: 0, decisions: [] }] }] } },
        tests: { catalog: tests },
        legacyRuns: { catalog: { batch: "catalog", at: 1, baseUrl: "", results: [] } },
        ports: { catalog: { batch: "catalog", files: [], routes: [], mapping: [], notes: [] } },
        parity: { catalog: parity },
      },
      { "port:catalog": { status: "running" }, discover: { status: "failed" } },
    )
    expect(nextBatchPhase(midway, "catalog")).toBe("reconcile")
    expect(batchProgress(midway, "catalog")).toEqual({ done: 5, total: 5, proven: false })
    expect(isRunning(midway, "catalog")).toBe(true)
    expect(isRunning(midway, "other")).toBe(false)
    expect(isRunning(midway)).toBe(true)
    expect(isRunning(undefined)).toBe(false)
    expect(canReplay(midway)).toBe(false)
    expect(canReplay(undefined)).toBe(false)
    expect(canReplay(empty)).toBe(false)
    expect(canReplay(snapshot({}, { discover: { status: "done", startedAt: 1, finishedAt: 2 } }))).toBe(true)
    expect(phaseStatus(midway, "discover")).toBe("failed")
    expect(totals(midway)).toEqual({ entrypoints: 1, batches: 1, rules: 1, cases: 1, matched: 1, compared: 2 })

    const proven = { ...midway, parity: { catalog: { ...parity, matched: 2 } } }
    expect(nextBatchPhase(proven, "catalog")).toBeUndefined()
    expect(batchProgress(proven, "catalog").proven).toBe(true)
    for (const phase of ["discover", "entrypoints", "environment", "reconcile"] as const) {
      expect(hasOutput(proven, phase, "catalog")).toBe(phase === "entrypoints")
    }
  })
})

describe("curl", () => {
  test("builds a runnable command", () => {
    const [get, post, raw] = parseTests({
      cases: [
        { request: { method: "GET", path: "/p", query: { q: "a b" }, body: { ignored: true } } },
        { request: { method: "POST", path: "/o", headers: { "Idempotency-Key": "it's" }, body: { a: 1 } } },
        { request: { method: "PUT", path: "/r", headers: { "content-type": "text/plain" }, body: "hi" } },
      ],
    }).cases
    expect(curlFor(get, "http://h")).toBe('curl -sS -i -X GET \\\n  "http://h/p?q=a+b"')
    expect(curlFor(post, "http://h")).toBe(
      `curl -sS -i -X POST \\\n  "http://h/o" \\\n  -H 'Idempotency-Key: it'\\''s' \\\n  -H 'Content-Type: application/json' \\\n  --data-raw '{"a":1}'`,
    )
    expect(curlFor(raw, "http://h")).toBe(`curl -sS -i -X PUT \\\n  "http://h/r" \\\n  -H 'content-type: text/plain' \\\n  --data-raw 'hi'`)
  })
})

describe("format", () => {
  test("durations, relative times and tones", () => {
    expect(duration(undefined)).toBe("")
    expect(duration(-1)).toBe("")
    expect(duration(420)).toBe("420ms")
    expect(duration(42_000)).toBe("42s")
    expect(duration(125_000)).toBe("2m 05s")
    expect(clockTime(-5)).toBe("0:00")
    expect(clockTime(125_400)).toBe("2:05")
    expect(methodStyle("get")).toContain("emerald")
    expect(methodStyle("TRACE")).toContain("slate")
    expect([0, 200, 302, 404, 500].map(statusTone)).toEqual(["text-rose-300", "text-emerald-300", "text-sky-300", "text-amber-300", "text-rose-300"])
    expect(shortPath("a/b/c/d/e")).toBe("…/c/d/e")
    expect(shortPath("a/b")).toBe("a/b")
    expect(cn("px-2", false && "hidden", "px-4")).toBe("px-4")
  })
})

describe("tech icons", () => {
  test("resolve brands, lift dark colors and map batch icons", () => {
    expect(brandIcon("PostgreSQL")?.title).toBe("PostgreSQL")
    expect(brandIcon("node 20")?.title).toBe("Node.js")
    expect(brandIcon("redis7")?.title).toBe("Redis")
    expect(brandIcon("something unknown")).toBeUndefined()
    expect(brandIcon(undefined)).toBeUndefined()
    expect(readableHex("000000")).toBe("#d5dbe7")
    expect(readableHex("22D3EE")).toBe("#22D3EE")
    expect(batchIcon("shopping-cart")).toBe(ShoppingCart)
    expect(batchIcon("ShoppingCart")).toBe(ShoppingCart)
    expect(batchIcon("cart-items")).toBe(ShoppingCart)
    expect(batchIcon("mystery")).toBe(Layers)
    expect(batchIcon()).toBe(Layers)
  })
})

describe("code explorer helpers", () => {
  test("nest files under folders, folders first", () => {
    const tree = buildTree(["v2/go.mod", "v2/cmd/server/main.go", "v2/internal/a.go", "v2/Dockerfile"], "v2")
    expect(tree.map((n) => n.name)).toEqual(["cmd", "internal", "Dockerfile", "go.mod"])
    expect(tree[0].children?.[0]).toMatchObject({ name: "server", path: "v2/cmd/server" })
    expect(tree[0].children?.[0].children?.[0]).toEqual({ name: "main.go", path: "v2/cmd/server/main.go" })
    expect(ancestors("v2/cmd/server/main.go")).toEqual(["v2/cmd", "v2/cmd/server"])
    expect(ancestors("v2/go.mod")).toEqual([])
    expect(filterFiles(["a/Main.go", "b/x.py"], " main ")).toEqual(["a/Main.go"])
    expect(filterFiles(["a"], "")).toEqual(["a"])
    expect(fileName("a/b/c.ts")).toBe("c.ts")
    expect([500, 2048, 3 * 1024 * 1024].map(formatBytes)).toEqual(["500 B", "2.0 KB", "3.0 MB"])
  })

  test("know languages by file name and extension", () => {
    expect(languageOf("v2/Dockerfile")).toMatchObject({ id: "dockerfile", tech: "docker" })
    expect(languageOf("migration/env/legacy.Dockerfile").id).toBe("dockerfile")
    expect(languageOf("v2/go.mod")).toMatchObject({ label: "Go module", tech: "go" })
    expect(languageOf("lib/app.ex").id).toBe("elixir")
    expect(languageOf(".env.local").id).toBe("dotenv")
    expect(languageOf("README")).toEqual({ label: "Plain text" })
  })
})

describe("rich explanations", () => {
  test("markup and a few literals become typed tokens; apostrophes and bare words stay prose", () => {
    expect(richTokens("v2 used **local time**; now `422 too_late` like GET /x and user_id in app/a.go")).toEqual([
      { kind: "text", text: "v2 used " },
      { kind: "bold", text: "local time" },
      { kind: "text", text: "; now " },
      { kind: "code", text: "422 too_late" },
      { kind: "text", text: " like " },
      { kind: "method", text: "GET /x" },
      { kind: "text", text: " and user_id in " },
      { kind: "path", text: "app/a.go" },
    ])
    const lit = richTokens(`Go's mux serves 'GET <path>' with status 404, "ok", $.items[0], {{login.$.token}} and write_success(200, {"a": 1})`)
      .filter((t) => t.kind !== "text")
      .map((t) => [t.kind, t.text])
    expect(lit).toEqual([
      ["string", "'GET <path>'"],
      ["status", "404"],
      ["string", '"ok"'],
      ["json", "$.items[0]"],
      ["json", "{{login.$.token}}"],
      ["call", 'write_success(200, {"a": 1})'],
    ])
    expect(["$.id", '"x"', "v2/a.go", "getUser", "POST /x", "run()"].map(classify)).toEqual(["json", "string", "path", "code", "method", "call"])
    expect(richTokens("")).toEqual([])
  })
})

describe("server text", () => {
  test("known reasons and errors follow the viewer's language; anything else stays as sent", () => {
    const t = (key: string, params?: Record<string, unknown>) => (params ? `${key}(${params.detail})` : key)
    expect(serverText("Run the tests against legacy before building v2", t as never)).toBe("server.legacyFirst")
    expect(serverText("The agent stopped: Stopped", t as never)).toBe("server.agentStopped(server.stopped)")
    expect(serverText("Unknown migration ab12", t as never)).toBe("server.unknownMigration(ab12)")
    expect(serverText("Something unexpected", t as never)).toBe("Something unexpected")
    expect(serverText(undefined, t as never)).toBe("")
  })
})

describe("target choice", () => {
  test("suggestions fall back to general picks, and choices are built from stacks", () => {
    expect(targetOptions(undefined).map((o) => [o.kind, o.language, o.ai])).toEqual([
      ["finops", "go", false],
      ["scale", "elixir", false],
      ["scale", "erlang", false],
    ])
    expect(targetOptions(parseDiscovery({ stack: { languages: ["go", "typescript"] } }))[2].language).toBe("erlang")
    expect(targetOptions(parseDiscovery({ stack: { languages: ["Java"] } }))[2]).toMatchObject({ kind: "upgrade", language: "java", version: "21" })
    const suggested = parseDiscovery({ recommendations: [{ kind: "finops", language: "go", stacks: [{ id: "chi" }] }] })
    expect(targetOptions(suggested)).toEqual([expect.objectContaining({ language: "go", ai: true })])
    expect(choiceFor("go", "1.22", { id: "chi", name: "chi", components: ["chi"] })).toEqual({ language: "go", version: "1.22", stack: "chi", name: "chi", components: ["chi"] })
    expect(choiceFor("go", "")).toMatchObject({ stack: "stdlib", version: "1.23" })
    expect(choiceFor("cobol", "1")).toBeUndefined()
    expect(sameChoice(undefined, undefined)).toBe(true)
    expect(sameChoice(choiceFor("go", ""), choiceFor("rust", ""))).toBe(false)
    expect(sortVariants(["max", "custom", "low", "high", "none"])).toEqual(["none", "low", "high", "max", "custom"])
  })
})

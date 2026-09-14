import { describe, expect, test } from "bun:test"
import { Layers, ShoppingCart } from "lucide-react"
import { parseEntryPoints, parseTests } from "../src/shared/contracts"
import type { ProjectState } from "../src/shared/types"
import type { Snapshot } from "../web/src/lib/api"
import { curlFor } from "../web/src/lib/curl"
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

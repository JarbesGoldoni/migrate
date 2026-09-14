import { describe, expect, test } from "bun:test"
import { parseDiscovery, parseEntryPoints, parseEnvironment, parseTests } from "../src/shared/contracts"
import type { Activity, ProjectState } from "../src/shared/types"
import type { Snapshot } from "../web/src/lib/api"
import { buildClock, clockFor, compress, frameAt, phaseWindows, replayableHistory, viewFor } from "../web/src/lib/replay"

const T = 1_000_000

function source(phases: ProjectState["phases"]): Snapshot {
  return {
    project: { id: "p", name: "shop", source: "/s", workspace: "/w", branch: "migrate/v2", createdAt: T, target: "go", ports: { legacy: 1, v2: 2 } },
    state: { phases, sessions: {}, runtime: { legacy: "down", v2: "down" } },
    discovery: parseDiscovery({ summary: "Shop" }),
    entrypoints: parseEntryPoints({ entrypoints: [{ id: "list" }], batches: [{ id: "b", entrypoints: ["list"] }] }),
    environment: parseEnvironment({ services: [{ name: "legacy", role: "legacy" }] }),
    rules: {},
    tests: { b: parseTests({ cases: [{ id: "c", request: { path: "/p" } }] }) },
    legacyRuns: { b: { batch: "b", at: T + 19_000, baseUrl: "", results: [] } },
    ports: {},
    builds: {},
    parity: { b: { batch: "b", at: T + 40_000, matched: 1, total: 1, results: [] } },
    reconcile: {},
    verify: {},
    activity: [],
  }
}

const item = (id: string, phase: string, at: number, status?: Activity["status"]): Activity => ({ id, phase, at, kind: "read", title: id, status })

describe("replay clock", () => {
  test("compresses gaps and maps both ways", () => {
    expect(compress(-5)).toBe(0)
    expect(compress(400)).toBe(200)
    expect(compress(11_000)).toBe(1_500)
    expect(compress(600_000)).toBe(2_500)

    const clock = buildClock([T + 60_000, T, T + 500, T + 500, Number.NaN])
    expect(clock.start).toBe(T)
    expect(clock.total).toBe(250 + 2_500 + 1_500)
    expect(clock.toReal(0)).toBe(T)
    expect(clock.toReal(-10)).toBe(T)
    expect(clock.toReal(250)).toBe(T + 500)
    expect(clock.toReal(1_500)).toBeCloseTo(T + 500 + (1_250 / 2_500) * 59_500)
    expect(clock.toReal(2_750 + 100)).toBe(T + 60_100)
    expect(clock.toPosition(T + 500)).toBe(250)
    expect(clock.toPosition(T - 5)).toBe(0)
    expect(Math.round(clock.toPosition(clock.toReal(1_234)))).toBe(1_234)

    const empty = buildClock([])
    expect(empty.total).toBe(0)
    expect(empty.toReal(10)).toBe(0)
    expect(empty.toPosition(10)).toBe(0)
    expect(buildClock([T, T]).toReal(5)).toBe(T + 5)
  })
})

describe("replay frames", () => {
  const phases: ProjectState["phases"] = {
    discover: { status: "done", startedAt: T, finishedAt: T + 5_000 },
    entrypoints: { status: "failed", startedAt: T + 6_000, error: "Interrupted" },
    environment: { status: "running", startedAt: T + 9_500, finishedAt: T + 9_900 },
    "tests:b": { status: "done", startedAt: T + 10_000, finishedAt: T + 20_000, note: "done" },
    "legacy:b": { status: "done", startedAt: T + 15_000, finishedAt: T + 19_000, note: "1/1" },
  }
  const history = [
    item("stale", "discover", T - 60_000),
    item("d1", "discover", T + 1_000),
    item("d2", "discover", T + 4_000, "running"),
    item("e1", "entrypoints", T + 8_000),
    item("t1", "tests:b", T + 12_000),
    item("free", "unknown", T + 13_000),
  ]
  const snapshot = source(phases)
  const clock = clockFor(snapshot, history)
  const at = (real: number) => frameAt(snapshot, history, clock, clock.toPosition(real))

  test("derives phase windows, ending interrupted runs at their last activity and parents at their inline child", () => {
    const windows = phaseWindows(snapshot, history)
    expect(windows.get("entrypoints")).toMatchObject({ start: T + 6_000, end: T + 8_000 })
    expect(windows.get("tests:b")).toMatchObject({ start: T + 10_000, end: T + 15_000 })
    expect(replayableHistory(snapshot, history).map((a) => a.id)).not.toContain("stale")
  })

  test("reveals phases and artifacts as they happened", () => {
    const early = at(T + 2_000)
    expect(early.snapshot.state.phases.discover).toEqual({ status: "running", startedAt: T })
    expect(early.snapshot.discovery).toBeUndefined()
    expect(early.snapshot.entrypoints).toBeUndefined()
    expect(early.snapshot.activity.map((a) => [a.id, a.status])).toEqual([["d1", "running"]])
    expect(early.current).toBe("discover")

    const afterDiscover = at(T + 5_500)
    expect(afterDiscover.snapshot.discovery?.summary).toBe("Shop")
    expect(afterDiscover.snapshot.state.phases.discover.status).toBe("done")
    expect(afterDiscover.snapshot.activity.find((a) => a.id === "d2")?.status).toBe("done")

    const afterEntrypoints = at(T + 8_500)
    expect(afterEntrypoints.snapshot.state.phases.entrypoints).toMatchObject({ status: "done", finishedAt: T + 8_000, error: undefined })
    expect(afterEntrypoints.snapshot.entrypoints?.batches).toHaveLength(1)

    const duringLegacy = at(T + 16_000)
    expect(duringLegacy.snapshot.state.phases["tests:b"].status).toBe("done")
    expect(duringLegacy.snapshot.tests.b.cases).toHaveLength(1)
    expect(duringLegacy.snapshot.state.phases["legacy:b"].status).toBe("running")
    expect(duringLegacy.snapshot.legacyRuns.b).toBeUndefined()
    expect(duringLegacy.snapshot.state.runtime).toEqual({ legacy: "up", v2: "down" })
    expect(duringLegacy.current).toBe("legacy:b")

    const end = frameAt(snapshot, history, clock, clock.total)
    expect(end.snapshot.legacyRuns.b).toBeDefined()
    expect(end.snapshot.parity.b?.matched).toBe(1)
    expect(end.snapshot.state.phases.environment.status).toBe("done")
    expect(end.snapshot.activity.map((a) => a.id)).toContain("free")
    expect(end.snapshot.state.phases["tests:b"].note).toBe("done")
  })

  test("keeps failed phases without output failed", () => {
    const failing = source({ discover: { status: "failed", startedAt: T, finishedAt: T + 1_000, error: "boom" } })
    const bare = { ...failing, discovery: undefined }
    const frame = frameAt(bare, [], clockFor(bare, []), 10_000)
    expect(frame.snapshot.state.phases.discover).toMatchObject({ status: "failed", error: "boom" })
  })

  test("maps phases to screens", () => {
    expect(viewFor("discover")).toBe("discover")
    expect(viewFor("parity:checkout")).toBe("batch/checkout")
  })
})

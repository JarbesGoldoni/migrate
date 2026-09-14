import { afterAll, describe, expect, test } from "bun:test"
import { existsSync, writeFileSync } from "node:fs"
import { writeFile } from "node:fs/promises"
import { join } from "node:path"
import { EventBus } from "../src/server/bus"
import { locateOutput, NotFoundError, Pipeline, summarize, targetLabel } from "../src/server/pipeline"
import { artifacts, Store } from "../src/server/store"
import { exec } from "../src/server/util/exec"
import { FakeEngine, gitRepo, isolatedExec, tempDir, waitPhase } from "./helpers"

const servers: Array<{ stop: (force?: boolean) => void }> = []
afterAll(() => {
  for (const s of servers) s.stop(true)
})

function fakeShop(port: number, variant: "legacy" | "v2") {
  const server = Bun.serve({
    port,
    hostname: "127.0.0.1",
    fetch(request) {
      const url = new URL(request.url)
      if (url.pathname === "/health") return Response.json({ status: "ok" })
      if (url.pathname === "/api/products") return Response.json({ items: [{ sku: "KEY-001" }, { sku: "MOU-002" }], count: 2 })
      if (url.pathname === "/api/products/KEY-001") return Response.json({ sku: "KEY-001" })
      if (url.pathname === "/api/products/NOPE") {
        return Response.json({ error: variant === "legacy" ? "product_not_found" : "not_found" }, { status: 404 })
      }
      return new Response("missing", { status: 404 })
    },
  })
  servers.push(server)
  return server
}

async function setup() {
  const repo = await gitRepo({ "src/server.js": "require('express')", "package.json": "{}" })
  const home = await tempDir()
  const engine = new FakeEngine()
  const bus = new EventBus()
  const store = new Store(join(home, "projects.json"))
  const pipeline = new Pipeline({
    store,
    engine,
    bus,
    exec: isolatedExec,
    workspaces: join(home, "workspaces"),
    httpTimeoutMs: 2_000,
    bootTimeoutMs: 3_000,
  })
  return { repo, home, engine, bus, store, pipeline }
}

describe("Pipeline", () => {
  test("runs the whole migration flow in order", async () => {
    const { repo, engine, bus, pipeline } = await setup()
    const events: string[] = []
    const project = await pipeline.createProject({ source: repo, model: { providerID: "p", modelID: "m" } })
    bus.subscribe(project.id, (e) => events.push(e.type))
    expect(project.branch).toBe("migrate/v2")
    expect(project.target).toBe("go")
    expect(project.ports.v2).toBeGreaterThan(project.ports.legacy)
    expect(targetLabel(project)).toBe("Go")

    expect(await pipeline.start(project.id, "entrypoints")).toEqual({ started: false, reason: "Map the architecture first" })
    expect((await pipeline.start(project.id, "rules", "ghost")).reason).toBe("Unknown batch ghost")
    expect((await pipeline.start(project.id, "rules")).reason).toBe("Pick a batch first")

    engine.outputs.discover = () => ({
      path: artifacts.discovery,
      data: { summary: "Shop API", nodes: [{ id: "api", label: "API" }], run: { port: 3000, healthPath: "/health" } },
    })
    expect(await pipeline.start(project.id, "discover")).toEqual({ started: true })
    expect((await pipeline.start(project.id, "discover")).reason).toBe("Already running")
    let snapshot = await waitPhase(pipeline, project.id, "discover")
    expect(snapshot.state.phases.discover.status).toBe("done")
    expect(snapshot.discovery?.summary).toBe("Shop API")
    expect(snapshot.state.sessions.project).toBe("ses-discover")
    expect(snapshot.activity.some((a) => a.title === "Read legacy/app.js")).toBe(true)
    expect(engine.calls[0].model).toEqual({ providerID: "p", modelID: "m" })

    // The model writes to a slightly wrong place; the pipeline still finds it.
    engine.outputs.entrypoints = (options) => ({
      path: "elsewhere/migration/entrypoints.json",
      data: {
        entrypoints: [
          { id: "list-products", method: "GET", path: "/api/products" },
          { id: "get-product", method: "GET", path: "/api/products/{sku}" },
        ],
        batches: [{ id: "catalog", title: "Catalog", entrypoints: ["list-products", "get-product"] }],
      },
    })
    await pipeline.start(project.id, "entrypoints")
    snapshot = await waitPhase(pipeline, project.id, "entrypoints")
    expect(snapshot.entrypoints?.batches[0].entrypoints).toHaveLength(2)
    expect(engine.calls[1].sessionId).toBe("ses-discover")

    expect((await pipeline.start(project.id, "legacy", "catalog")).reason).toBe("Write the characterization tests first")

    engine.outputs.environment = () => ({ path: artifacts.environment, data: { services: [{ name: "legacy", role: "legacy" }] } })
    await pipeline.start(project.id, "environment")
    snapshot = await waitPhase(pipeline, project.id, "environment")
    expect(snapshot.state.phases.environment).toMatchObject({ status: "done", note: expect.stringContaining("No container runtime") })

    engine.outputs.rules = () => ({
      path: artifacts.batch("catalog", "rules"),
      data: { batch: "catalog", entrypoints: [{ entrypoint: "list-products", rules: [{ title: "Limit", decisions: [{ when: "a", then: "b" }] }] }] },
    })
    await pipeline.start(project.id, "rules", "catalog")
    snapshot = await waitPhase(pipeline, project.id, "rules:catalog")
    expect(snapshot.rules.catalog.entrypoints[0].rules[0].id).toBe("list-products-r1")
    expect(snapshot.state.sessions["batch:catalog"]).toBe("ses-rules:catalog")

    fakeShop(project.ports.legacy, "legacy")
    engine.outputs.tests = () => ({
      text: JSON.stringify({
        batch: "catalog",
        cases: [
          { id: "list", title: "List products", request: { method: "GET", path: "/api/products" }, expect: { status: 200, body: { count: 2 }, match: "subset" } },
          { id: "missing", title: "Unknown product", request: { method: "GET", path: "/api/products/NOPE" }, expect: { status: 404, body: { error: "product_not_found" }, match: "exact" } },
          { id: "wrong", title: "Wrong prediction", request: { method: "GET", path: "/api/products" }, expect: { status: 201 } },
          // Takes the sku from the first case's response.
          { id: "first", title: "First product", request: { method: "GET", path: "/api/products/{{list.$.items[0].sku}}" }, expect: { status: 200, body: { sku: "KEY-001" }, match: "exact" } },
        ],
      }),
    })
    expect((await pipeline.start(project.id, "port", "catalog")).reason).toBe("Run the tests against legacy before building v2")
    expect((await pipeline.start(project.id, "verify", "catalog")).reason).toBe("Write the characterization tests first")
    await pipeline.start(project.id, "tests", "catalog")
    snapshot = await waitPhase(pipeline, project.id, "tests:catalog")
    expect(snapshot.tests.catalog.cases).toHaveLength(4)
    expect(existsSync(join(project.workspace, artifacts.curl("catalog"), "list.sh"))).toBe(true)
    expect(snapshot.state.phases["legacy:catalog"]).toMatchObject({ status: "done", note: "3/4 responses matched the predicted behavior" })
    expect(snapshot.legacyRuns.catalog.results.map((r) => r.response.status)).toEqual([200, 404, 200, 200])

    // Fix / validate: the agent adapts the wrong prediction, then legacy is replayed right away.
    engine.outputs.verify = (options) => {
      expect(options.prompt).toContain("### wrong")
      expect(options.prompt).not.toContain("### list")
      const tests = snapshot.tests.catalog
      writeFileSync(
        join(project.workspace, artifacts.batch("catalog", "tests")),
        JSON.stringify({ ...tests, cases: tests.cases.map((c) => (c.id === "wrong" ? { ...c, expect: { status: 200, body: null, match: "status" } } : c)) }),
      )
      return { path: artifacts.batch("catalog", "verify"), data: { batch: "catalog", fixes: [{ case: "wrong", cause: "prediction", action: "expectation", change: "expects 200" }] } }
    }
    await pipeline.start(project.id, "verify", "catalog")
    snapshot = await waitPhase(pipeline, project.id, "verify:catalog")
    expect(snapshot.verify.catalog.fixes[0]).toMatchObject({ case: "wrong", action: "expectation" })
    expect(snapshot.state.phases["legacy:catalog"].note).toBe("4/4 responses matched the predicted behavior")
    expect((await pipeline.start(project.id, "verify", "catalog")).reason).toBe("Every legacy response already matches the prediction")

    engine.outputs.port = () => ({ path: artifacts.batch("catalog", "port"), data: { batch: "catalog", files: [{ path: "v2/main.go" }] } })
    await pipeline.start(project.id, "port", "catalog")
    snapshot = await waitPhase(pipeline, project.id, "port:catalog")
    expect(snapshot.state.phases["port:catalog"].status).toBe("done")
    expect(snapshot.builds.catalog.ok).toBe(false)
    expect(snapshot.builds.catalog.steps.map((s) => s.name)).toEqual(["go build", "container build"])
    expect(snapshot.state.phases["parity:catalog"]).toBeUndefined()

    fakeShop(project.ports.v2, "v2")
    await pipeline.start(project.id, "parity", "catalog")
    snapshot = await waitPhase(pipeline, project.id, "parity:catalog")
    expect(snapshot.parity.catalog).toMatchObject({ matched: 3, total: 4 })
    expect(snapshot.parity.catalog.results.find((r) => r.caseId === "first")?.v2.status).toBe(200)
    expect(snapshot.state.phases["parity:catalog"].note).toBe("3/4 responses identical")
    expect(snapshot.state.phases["parity:catalog"].noteMessage).toEqual({ key: "note.parity", params: { matched: 3, total: 4 } })
    expect(snapshot.state.phases["legacy:catalog"].noteMessage).toEqual({ key: "note.legacyMatched", params: { agreed: 4, total: 4 } })
    expect(summarize(snapshot, false)).toMatchObject({
      steps: 8,
      batches: 1,
      batchesProven: 0,
      entrypoints: 2,
      rules: 1,
      cases: 4,
      matched: 3,
      compared: 4,
      running: false,
    })
    expect(summarize(undefined, true)).toMatchObject({ missing: true, steps: 0 })
    expect(summarize(undefined, true).lastActivity).toBeUndefined()

    engine.outputs.reconcile = (options) => {
      expect(options.prompt).toContain("### missing")
      return { path: artifacts.batch("catalog", "reconcile"), data: { batch: "catalog", fixes: [{ case: "missing", cause: "error code" }] } }
    }
    await pipeline.start(project.id, "reconcile", "catalog")
    snapshot = await waitPhase(pipeline, project.id, "reconcile:catalog")
    expect(snapshot.reconcile.catalog.fixes[0].case).toBe("missing")

    const played = await pipeline.playground(project.id, "both", { method: "GET", path: "/api/products/NOPE", headers: {}, query: {} })
    expect(played.legacy?.status).toBe(404)
    expect(played.comparison?.match).toBe(false)
    const onlyV2 = await pipeline.playground(project.id, "v2", { method: "GET", path: "/health", headers: {}, query: {} })
    expect(onlyV2.legacy).toBeUndefined()
    expect(onlyV2.comparison).toBeUndefined()

    await expect(pipeline.runtime(project.id, "up")).rejects.toThrow("not ready")
    expect(events).toContain("phase")
    expect(events).toContain("changed")

    const commits = (await exec("git", ["log", "--format=%s"], { cwd: project.workspace })).stdout
    expect(commits).toContain("migrate: map architecture and dependencies")
    expect(commits).toContain("migrate(catalog): characterization tests")
    expect(commits).toContain("migrate(catalog): reconcile divergences")
  }, 60_000)

  test("records failures, supports stopping and updates projects", async () => {
    const { repo, engine, pipeline } = await setup()
    const project = await pipeline.createProject({ source: repo, target: "python" })
    expect(project.target).toBe("python")

    await pipeline.start(project.id, "discover")
    let snapshot = await waitPhase(pipeline, project.id, "discover")
    expect(snapshot.state.phases.discover).toMatchObject({ status: "failed", error: "The agent stopped: no scripted output" })
    expect(snapshot.activity.some((a) => a.kind === "error")).toBe(true)

    engine.outputs.discover = () => ({ text: "I could not do it" })
    await pipeline.start(project.id, "discover")
    await Bun.sleep(50)
    snapshot = await waitPhase(pipeline, project.id, "discover")
    expect(snapshot.state.phases.discover.error).toBe("The agent finished without writing migration/discovery.json")

    engine.hang = true
    await pipeline.start(project.id, "discover")
    await Bun.sleep(50)
    expect(pipeline.stop(project.id, "discover")).toBe(true)
    await Bun.sleep(50)
    snapshot = await waitPhase(pipeline, project.id, "discover")
    expect(snapshot.state.phases.discover).toMatchObject({ status: "failed", error: "Stopped" })
    expect(pipeline.stop(project.id, "discover")).toBe(false)

    const updated = await pipeline.updateProject(project.id, { model: { providerID: "x", modelID: "y" }, target: "unknown" })
    expect(updated.model).toEqual({ providerID: "x", modelID: "y" })
    expect(updated.target).toBe("python")
    await expect(pipeline.snapshot("nope")).rejects.toBeInstanceOf(NotFoundError)
    await expect(pipeline.createProject({ source: join(repo, "missing") })).rejects.toThrow("Folder not found")
    expect((await pipeline.start(project.id, "bogus" as never)).reason).toBe("Unknown phase bogus")
  }, 30_000)

  test("keeps a replayable history, lists migrations and writes in the chosen language", async () => {
    const { repo, engine, store, pipeline } = await setup()
    const project = await pipeline.createProject({ source: repo, language: "pt-BR" })
    expect(project.language).toBe("pt-BR")
    expect((await pipeline.createProject({ source: repo, language: "xx" as never })).language).toBe("en")

    engine.outputs.discover = () => ({ path: artifacts.discovery, data: { summary: "Loja", nodes: [{ id: "api" }] } })
    await pipeline.start(project.id, "discover")
    await waitPhase(pipeline, project.id, "discover")
    expect(engine.calls.at(-1)?.prompt).toContain("in Brazilian Portuguese")

    const history = await pipeline.history(project.id)
    expect(history.find((a) => a.kind === "system")?.message).toEqual({ key: "activity.phaseStarted", params: { phase: "discover" } })
    expect(existsSync(join(project.workspace, artifacts.phaseActivity("discover")))).toBe(true)

    const reloaded = new Pipeline({ store, engine, bus: new EventBus(), exec: isolatedExec })
    expect((await reloaded.history(project.id)).map((a) => a.id)).toEqual(history.map((a) => a.id))
    const listed = await reloaded.migrations()
    expect(listed.find((m) => m.project.id === project.id)?.summary).toMatchObject({ missing: false, steps: 1, running: false })
    expect(listed.find((m) => m.project.id === project.id)?.summary.lastActivity).toBeGreaterThan(0)

    await store.put({ ...project, id: "gone", workspace: join(project.workspace, "missing") })
    expect((await reloaded.migrations()).find((m) => m.project.id === "gone")?.summary).toMatchObject({ missing: true, steps: 0 })

    expect((await pipeline.updateProject(project.id, { language: "es" })).language).toBe("es")
    expect((await pipeline.updateProject(project.id, { language: "xx" as never })).language).toBe("es")
  }, 30_000)

  test("locateOutput prefers the expected path, then writes, then the reply", async () => {
    const root = await tempDir()
    await writeFile(join(root, "stray.json"), '{"from":"stray"}')
    expect(await locateOutput(root, "migration/x.json", { writes: [join(root, "stray.json")], text: "" })).toBeUndefined()
    await writeFile(join(root, "x.json"), 'Result:\n```json\n{"from":"write"}\n```')
    expect(await locateOutput(root, "migration/x.json", { writes: [join(root, "x.json")], text: "" })).toEqual({ from: "write" })
    expect(await locateOutput(root, "migration/x.json", { writes: [], text: 'Here: {"from":"text"}' })).toEqual({ from: "text" })
    expect(await locateOutput(root, "migration/x.json", { writes: [], text: "[1]" })).toEqual([1])
    expect(await locateOutput(root, "migration/x.json", { writes: [], text: "nothing" })).toBeUndefined()
  })
})

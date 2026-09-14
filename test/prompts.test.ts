import { describe, expect, test } from "bun:test"
import {
  composeProject,
  discoverPrompt,
  entrypointsPrompt,
  environmentPrompt,
  portPrompt,
  type PromptContext,
  reconcilePrompt,
  rulesPrompt,
  TARGETS,
  targetOf,
  testsPrompt,
  verifyPrompt,
} from "../src/server/prompts"
import { parseDiscovery, parseEntryPoints } from "../src/shared/contracts"
import type { ProjectRecord } from "../src/shared/types"

const project: ProjectRecord = {
  id: "AB12",
  name: "shop",
  source: "/src/shop",
  workspace: "/ws/shop-ab12",
  branch: "migrate/v2",
  createdAt: 1,
  target: "go",
  ports: { legacy: 18080, v2: 18081 },
}

const entrypoints = parseEntryPoints({
  entrypoints: [
    { id: "list-products", method: "GET", path: "/api/products", file: "legacy/src/routes/catalog.js", line: 20, summary: "List" },
    { id: "nightly", kind: "job", name: "Nightly", file: "legacy/jobs.js", summary: "Cleanup" },
  ],
  batches: [{ id: "catalog", title: "Catalog", entrypoints: ["list-products", "nightly"] }],
})

const ctx: PromptContext = {
  project,
  composeCommand: "podman compose",
  discovery: parseDiscovery({
    run: { start: "node src/server.js", port: 3000, healthPath: "/health" },
    dependencies: [{ id: "postgres", name: "PostgreSQL", kind: "database", strategy: "container", image: "docker.io/library/postgres:16" }, { id: "pay", name: "Payments", strategy: "mock" }],
  }),
  entrypoints,
  batch: entrypoints.batches[0],
}

describe("prompts", () => {
  test("every prompt names the workspace and its output file", () => {
    const outputs: Array<[string, string]> = [
      [discoverPrompt(ctx), "migration/discovery.json"],
      [entrypointsPrompt(ctx), "migration/entrypoints.json"],
      [environmentPrompt(ctx), "migration/environment.json"],
      [rulesPrompt(ctx), "migration/batches/catalog/rules.json"],
      [testsPrompt(ctx), "migration/batches/catalog/tests.json"],
      [portPrompt(ctx), "migration/batches/catalog/port.json"],
    ]
    for (const [prompt, output] of outputs) {
      expect(prompt).toContain("/ws/shop-ab12")
      expect(prompt).toContain(`"${output}"`)
      expect(prompt).toContain("never modify")
      expect(prompt).toContain('{"en": "...", "pt-BR": "...", "es": "..."}')
    }
    // Examples show every human-readable value in the three languages.
    expect(rulesPrompt(ctx)).toContain('"pt-BR": "Agendamentos exigem 24h de antecedência"')
  })

  test("targets describe how to build each stack, with Go as the lowest-cost recommendation", () => {
    const recommended = Object.entries(TARGETS).filter(([, target]) => target.recommended)
    expect(recommended.map(([id]) => id)).toEqual(["go"])
    expect(TARGETS.go.cost).toBe(1)
    for (const target of Object.values(TARGETS)) {
      expect(target.architecture).toContain("Dockerfile")
      expect(target.verify.length).toBeGreaterThan(0)
      expect([1, 2, 3]).toContain(target.cost)
    }
    expect(portPrompt({ ...ctx, project: { ...project, target: "rust" } })).toContain("axum")
  })

  test("environment prompt carries ports, compose command and dependencies", () => {
    const prompt = environmentPrompt(ctx)
    expect(prompt).toContain("name: migrate-ab12")
    expect(prompt).toContain("host port 18080")
    expect(prompt).toContain(
      "podman compose -f migration/env/compose.yml -p migrate-ab12 build && podman compose -f migration/env/compose.yml -p migrate-ab12 up -d legacy",
    )
    expect(prompt).toContain("http://127.0.0.1:18080/health")
    expect(prompt).toContain("- postgres: PostgreSQL (database, strategy container, image docker.io/library/postgres:16)")
    expect(environmentPrompt({ ...ctx, discovery: undefined })).toContain("- none recorded")
  })

  test("batch prompts list the batch entry points and target architecture", () => {
    const rules = rulesPrompt(ctx)
    expect(rules).toContain("- list-products: GET /api/products — legacy/src/routes/catalog.js:20 — List")
    expect(rules).toContain("- nightly: Nightly — legacy/jobs.js — Cleanup")
    const port = portPrompt(ctx)
    expect(port).toContain("net/http")
    expect(port).toContain("host port 18081")
    expect(port).toContain("go build ./... && go test ./...")
    expect(portPrompt({ ...ctx, project: { ...project, target: "python" } })).toContain("FastAPI")
    expect(targetOf({ ...project, target: "cobol" }).label).toBe("Go")
    expect(composeProject(project)).toBe("migrate-ab12")
  })

  test("reconcile prompt lists mismatches only, clipped", () => {
    const big = "x".repeat(2000)
    const prompt = reconcilePrompt({
      ...ctx,
      tests: { cases: [{ id: "c1", request: { method: "GET", path: "/api/products" } }] },
      parity: {
        batch: "catalog",
        at: 1,
        matched: 1,
        total: 2,
        results: [
          { caseId: "c0", legacy: { status: 200, body: {}, headers: {}, text: "", durationMs: 1 }, v2: { status: 200, body: {}, headers: {}, text: "", durationMs: 1 }, comparison: { match: true, diffs: [] } },
          { caseId: "c1", legacy: { status: 200, body: big, headers: {}, text: "", durationMs: 1 }, v2: { status: 0, body: undefined, headers: {}, text: "", durationMs: 1, error: "refused" }, comparison: { match: false, diffs: [{ path: "$", kind: "error" }] } },
        ],
      },
    })
    expect(prompt).toContain("found 1 of 2 cases")
    expect(prompt).toContain("### c1")
    expect(prompt).not.toContain("### c0")
    expect(prompt).toContain("v2: error refused")
    expect(prompt).toContain('request: {"method":"GET","path":"/api/products"}')
    expect(prompt).toContain("…")
    expect(prompt).toContain('"migration/batches/catalog/reconcile.json"')
  })

  test("tests and verify prompts explain captures; verify lists legacy mismatches only", () => {
    expect(testsPrompt(ctx)).toContain("{{<earlier case id>.$.")
    const ok = { status: 200, body: { a: 1 }, headers: {}, text: "", durationMs: 1 }
    const prompt = verifyPrompt({
      ...ctx,
      tests: { cases: [{ id: "c1", request: { method: "GET", path: "/api/products" }, expect: { status: 201 } }] },
      legacyRun: {
        batch: "catalog",
        at: 1,
        baseUrl: "",
        results: [
          { caseId: "c0", response: ok, expectation: { match: true, diffs: [] } },
          { caseId: "c1", response: ok, expectation: { match: false, diffs: [{ path: "$.status", kind: "changed", expected: 201, actual: 200 }] } },
          { caseId: "c2", response: { ...ok, status: 0, error: "refused" }, expectation: { match: false, diffs: [] } },
        ],
      },
    })
    expect(prompt).toContain("2 of 3 cases")
    expect(prompt).toContain("### c1")
    expect(prompt).not.toContain("### c0")
    expect(prompt).toContain('predicted: {"status":201}')
    expect(prompt).toContain('legacy: 200 {"a":1}')
    expect(prompt).toContain("legacy: error refused")
    expect(prompt).toContain("{{<earlier case id>.$.")
    expect(prompt).toContain('"migration/batches/catalog/verify.json"')
  })
})

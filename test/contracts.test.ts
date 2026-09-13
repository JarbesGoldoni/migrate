import { describe, expect, test } from "bun:test"
import {
  bool,
  dict,
  int,
  oneOf,
  parseDiscovery,
  parseEntryPoints,
  parseEnvironment,
  parsePort,
  parseReconcile,
  parseRules,
  parseTests,
  slug,
  text,
} from "../src/shared/contracts"

describe("lenient primitives", () => {
  test("text, int, bool and oneOf fall back instead of failing", () => {
    expect(text("x").parse(undefined)).toBe("x")
    expect(text().parse("  hi ")).toBe("hi")
    expect(text().parse(7)).toBe("7")
    expect(int(3).parse("12px")).toBe(12)
    expect(int(3).parse("nope")).toBe(3)
    expect(int(0).parse(4.8)).toBe(4)
    expect(bool(false).parse("true")).toBe(true)
    expect(bool(true).parse("false")).toBe(false)
    expect(bool(true).parse(1)).toBe(true)
    expect(oneOf(["a", "b"] as const, "a").parse(" B ")).toBe("b")
    expect(oneOf(["a", "b"] as const, "a").parse("c")).toBe("a")
  })

  test("dict keeps strings and stringifies the rest", () => {
    expect(dict().parse({ a: "1", b: 2, c: null, d: { e: 1 } })).toEqual({ a: "1", b: "2", d: '{"e":1}' })
    expect(dict().parse(["x"])).toEqual({})
  })

  test("slug", () => {
    expect(slug("Hello World!")).toBe("hello-world")
    expect(slug("***", "fallback")).toBe("fallback")
  })
})

describe("parseDiscovery", () => {
  test("tolerates garbage", () => {
    const d = parseDiscovery("not json")
    expect(d.nodes).toEqual([])
    expect(d.edges).toEqual([])
    expect(d.run.healthPath).toBe("/")
  })

  test("normalizes nodes, resolves edges by id or label and dedupes ids", () => {
    const d = parseDiscovery({
      summary: 42,
      nodes: [
        {},
        { id: "API", label: "Shop API", kind: "Service", tech: "express" },
        { label: "PostgreSQL", kind: "weird" },
        { id: "api", label: "Duplicate" },
      ],
      edges: [
        { from: "Shop API", to: "postgresql", label: "SQL", kind: "data" },
        { from: "api", to: "missing" },
        { from: "api", to: "API" },
      ],
      dependencies: [{ name: "Redis", strategy: "CONTAINER", kind: "cache" }, { id: "x", strategy: "?" }],
      run: { port: "3000", env: [{ name: "A", required: "true" }] },
    })
    expect(d.summary).toBe("42")
    expect(d.nodes.map((n) => n.id)).toEqual(["api", "postgresql", "api-2"])
    expect(d.nodes[0].kind).toBe("service")
    expect(d.nodes[1]).toMatchObject({ kind: "module", label: "PostgreSQL" })
    expect(d.edges).toHaveLength(1)
    expect(d.edges[0]).toMatchObject({ from: "api", to: "postgresql", kind: "data" })
    expect(d.dependencies.map((x) => [x.id, x.name, x.strategy])).toEqual([
      ["redis", "Redis", "container"],
      ["x", "x", "mock"],
    ])
    expect(d.run.port).toBe(3000)
    expect(d.run.env[0].required).toBe(true)
  })
})

describe("parseEntryPoints", () => {
  test("uppercases methods, generates ids and batches orphans", () => {
    const e = parseEntryPoints({
      entrypoints: [
        {},
        { id: "list", method: "get", path: "/api/products" },
        { path: "/api/cart/quote", method: "post" },
        { kind: "job", name: "Nightly" },
      ],
      batches: [
        { title: "Catalog", entrypoints: ["LIST", "list", "ghost"] },
        { id: "empty", entrypoints: [] },
      ],
    })
    expect(e.entrypoints.map((x) => x.id)).toEqual(["list", "post-api-cart-quote", "nightly"])
    expect(e.entrypoints.map((x) => x.method)).toEqual(["GET", "POST", ""])
    expect(e.batches).toEqual([
      expect.objectContaining({ id: "catalog", title: "Catalog", entrypoints: ["list"] }),
      expect.objectContaining({ id: "other", entrypoints: ["post-api-cart-quote", "nightly"] }),
    ])
  })

  test("avoids clashing with a batch already called other", () => {
    const e = parseEntryPoints({
      entrypoints: [{ id: "a" }, { id: "b" }],
      batches: [{ id: "other", entrypoints: ["a"] }],
    })
    expect(e.batches.map((b) => b.id)).toEqual(["other", "other-entrypoints"])
  })
})

describe("other contracts", () => {
  test("parseEnvironment drops unnamed services and defaults the compose file", () => {
    const env = parseEnvironment({ services: [{ name: "legacy", role: "LEGACY" }, { role: "mock" }], limitations: ["x", 3] })
    expect(env.composeFile).toBe("migration/env/compose.yml")
    expect(env.services).toEqual([{ name: "legacy", role: "legacy", image: "", notes: "" }])
    expect(env.limitations).toEqual(["x", "3"])
  })

  test("parseRules generates stable unique ids", () => {
    const rules = parseRules({
      batch: "catalog",
      entrypoints: [
        {
          entrypoint: "List Products",
          rules: [
            { title: "", description: "Limit must be between 1 and 50", lineStart: 10, lineEnd: 2, decisions: [{ when: "limit > 50", then: "400" }, {}] },
            { id: "dup", title: "A" },
            { id: "dup", title: "B", decisions: [{ id: "custom", when: "x", then: "y" }] },
          ],
        },
        { rules: [{ id: "ignored" }] },
      ],
    })
    expect(rules.entrypoints).toHaveLength(1)
    const [first, second, third] = rules.entrypoints[0].rules
    expect(first).toMatchObject({ id: "list-products-r1", title: "Limit must be between 1 and 50", lineEnd: 10 })
    expect(first.decisions).toEqual([{ id: "list-products-r1.1", when: "limit > 50", then: "400" }])
    expect(second.id).toBe("dup")
    expect(third.id).toBe("dup-2")
    expect(third.decisions[0].id).toBe("custom")
  })

  test("parseTests normalizes requests", () => {
    const tests = parseTests({
      cases: [
        { title: "List", request: { method: "get", path: "api/products", query: { limit: 5 } }, expect: { status: "201" } },
        { request: { path: "" } },
        { id: "post", request: { method: "POST", path: "/api/x", body: { a: 1 } }, expect: { match: "EXACT", body: { ok: true } }, ignore: ["$.id"] },
      ],
    })
    expect(tests.cases).toHaveLength(2)
    expect(tests.cases[0]).toMatchObject({
      id: "list",
      request: { method: "GET", path: "/api/products", query: { limit: "5" } },
      expect: { status: 201, match: "subset" },
    })
    expect(tests.cases[1]).toMatchObject({ id: "post", expect: { match: "exact", body: { ok: true } }, ignore: ["$.id"] })
  })

  test("parsePort and parseReconcile", () => {
    const port = parsePort({ files: [{ path: "v2/main.go" }, { purpose: "no path" }], routes: [{ method: "get", path: "/x" }] })
    expect(port.files).toHaveLength(1)
    expect(port.routes[0].method).toBe("GET")
    const reconcile = parseReconcile({ fixes: [{ case: "c1", files: ["v2/a.go"] }], notes: "not a list" })
    expect(reconcile.fixes[0]).toMatchObject({ case: "c1", files: ["v2/a.go"] })
    expect(reconcile.notes).toEqual([])
  })
})

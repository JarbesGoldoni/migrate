import { afterAll, describe, expect, test } from "bun:test"
import { readdir, readFile } from "node:fs/promises"
import { join } from "node:path"
import { parseTests } from "../src/shared/contracts"
import type { HttpResult } from "../src/shared/types"
import { compareExpectation, compareResponses, diffValues, ignoreMatcher } from "../src/server/testing/compare"
import { curlCommand, curlScript, shellQuote, writeCurlScripts } from "../src/server/testing/curl"
import { buildUrl, encodeBody, sendRequest } from "../src/server/testing/http"
import { tempDir } from "./helpers"

const result = (status: number, body: unknown, error?: string): HttpResult => ({
  status,
  body,
  headers: {},
  text: JSON.stringify(body),
  durationMs: 1,
  error,
})

describe("compare", () => {
  test("ignore patterns match paths and subtrees", () => {
    const ignore = ignoreMatcher(["$.id", "items[].createdAt", "meta.*", "  "])
    expect(ignore("$.id")).toBe(true)
    expect(ignore("$.identity")).toBe(false)
    expect(ignore("$.items[3].createdAt")).toBe(true)
    expect(ignore("$.items[3].name")).toBe(false)
    expect(ignore("$.meta.anything")).toBe(true)
    expect(ignore("$.meta.a.b")).toBe(true)
  })

  test("subset ignores extra fields while exact reports them", () => {
    const expected = { a: 1, list: [{ x: 1 }], nested: { b: "y" } }
    const actual = { a: 1, list: [{ x: 1, extra: true }, { x: 2 }], nested: { b: "z" }, more: 1 }
    const none = () => false
    expect(diffValues(expected, actual, "subset", none)).toEqual([
      { path: "$.nested.b", kind: "changed", expected: "y", actual: "z" },
    ])
    const exact = diffValues(expected, actual, "exact", none).map((d) => `${d.kind} ${d.path}`)
    expect(exact).toEqual(["extra $.list[0].extra", "extra $.list[1]", "changed $.nested.b", "extra $.more"])
    expect(diffValues({ a: [1, 2] }, { a: [1] }, "subset", none)).toEqual([{ path: "$.a[1]", kind: "missing", expected: 2 }])
    expect(diffValues({ gone: 1 }, {}, "subset", none)).toEqual([{ path: "$.gone", kind: "missing", expected: 1 }])
    expect(diffValues(0.1 + 0.2, 0.3, "exact", none)).toEqual([])
  })

  test("expectations compare status, body and errors", () => {
    expect(compareExpectation({ status: 200, body: { ok: true }, match: "subset" }, result(200, { ok: true, n: 1 })).match).toBe(true)
    const wrong = compareExpectation({ status: 201, body: { ok: true }, match: "exact" }, result(200, { ok: false }))
    expect(wrong.diffs.map((d) => d.kind)).toEqual(["status", "changed"])
    expect(compareExpectation({ status: 404, body: { x: 1 }, match: "status" }, result(404, { y: 2 })).match).toBe(true)
    expect(compareExpectation({ status: 200, body: null, match: "exact" }, result(200, "anything")).match).toBe(true)
    expect(compareExpectation({ status: 200, body: {}, match: "exact" }, result(0, undefined, "refused")).diffs[0].kind).toBe("error")
  })

  test("parity treats legacy as the truth", () => {
    expect(compareResponses(result(200, { a: 1, id: 5 }), result(200, { a: 1, id: 9 }), ["$.id"]).match).toBe(true)
    const diff = compareResponses(result(404, { error: "x" }), result(200, { error: "x" }))
    expect(diff.diffs).toEqual([{ path: "status", kind: "status", expected: 404, actual: 200 }])
    expect(compareResponses(result(0, undefined, "down"), result(200, {})).diffs[0].kind).toBe("error")
  })
})

describe("curl", () => {
  const tests = parseTests({
    cases: [
      { id: "list", title: "List", request: { method: "GET", path: "/api/products", query: { limit: "5" }, headers: { Accept: "application/json" } }, expect: { status: 200 } },
      { id: "quote", title: "Quote", branch: "r1.1", rules: ["r1"], request: { method: "POST", path: "/api/cart/quote", body: { note: "it's" } }, expect: { status: 422 } },
      { id: "raw", title: "Raw", request: { method: "PUT", path: "/raw", headers: { "content-type": "text/plain" }, body: "hello" } },
    ],
  })

  test("quotes shell arguments", () => {
    expect(shellQuote("it's")).toBe(`'it'\\''s'`)
  })

  test("builds commands with query, headers and bodies", () => {
    expect(curlCommand(tests.cases[0])).toBe(
      `curl -sS -i -X GET \\\n  "\${BASE_URL}/api/products?limit=5" \\\n  -H 'Accept: application/json'`,
    )
    const post = curlCommand(tests.cases[1], "http://h")
    expect(post).toContain(`"http://h/api/cart/quote"`)
    expect(post).toContain(`-H 'Content-Type: application/json'`)
    expect(post).toContain(`--data-raw '{"note":"it'\\''s"}'`)
    expect(curlCommand(tests.cases[2])).not.toContain("Content-Type: application/json")
    const script = curlScript(tests.cases[1])
    expect(script).toContain("# Branch: r1.1")
    expect(script).toContain("# Rules: r1")
    expect(script).toContain("# Expect: HTTP 422")
  })

  test("writes one script per case and a runner", async () => {
    const dir = join(await tempDir(), "curl")
    await writeCurlScripts(dir, tests)
    expect((await readdir(dir)).sort()).toEqual(["list.sh", "quote.sh", "raw.sh", "run-all.sh"])
    expect(await readFile(join(dir, "run-all.sh"), "utf8")).toContain("sh ./quote.sh")
  })
})

describe("http", () => {
  const server = Bun.serve({
    port: 0,
    async fetch(request) {
      const url = new URL(request.url)
      if (url.pathname === "/text") return new Response("plain")
      if (url.pathname === "/empty") return new Response(null, { status: 204 })
      if (url.pathname === "/slow") {
        await Bun.sleep(500)
        return new Response("late")
      }
      return Response.json(
        {
          method: request.method,
          query: Object.fromEntries(url.searchParams),
          contentType: request.headers.get("content-type"),
          body: request.method === "GET" ? null : await request.text(),
        },
        { status: 201, headers: { "X-Trace": "abc" } },
      )
    },
  })
  const base = `http://127.0.0.1:${server.port}`
  afterAll(() => server.stop(true))

  test("buildUrl and encodeBody", () => {
    expect(buildUrl("http://h", { path: "x", query: { a: "1" } }).toString()).toBe("http://h/x?a=1")
    expect(encodeBody({ method: "GET", path: "/", headers: {}, query: {}, body: { a: 1 } }).body).toBeUndefined()
    expect(encodeBody({ method: "POST", path: "/", headers: {}, query: {}, body: "raw" })).toEqual({ body: "raw", contentType: undefined })
  })

  test("sends JSON and parses responses", async () => {
    const response = await sendRequest(base, { method: "POST", path: "/echo", headers: {}, query: { q: "1" }, body: { a: 1 } })
    expect(response.status).toBe(201)
    expect(response.headers["x-trace"]).toBe("abc")
    expect(response.body).toEqual({ method: "POST", query: { q: "1" }, contentType: "application/json", body: '{"a":1}' })
    const kept = await sendRequest(base, { method: "POST", path: "/echo", headers: { "Content-Type": "application/vnd+json" }, query: {}, body: { a: 1 } })
    expect((kept.body as { contentType: string }).contentType).toBe("application/vnd+json")
    expect((await sendRequest(base, { method: "GET", path: "/text", headers: {}, query: {} })).body).toBe("plain")
    expect((await sendRequest(base, { method: "GET", path: "/empty", headers: {}, query: {} })).body).toBeUndefined()
  })

  test("reports timeouts and unreachable hosts", async () => {
    const slow = await sendRequest(base, { method: "GET", path: "/slow", headers: {}, query: {} }, { timeoutMs: 50 })
    expect(slow.status).toBe(0)
    expect(slow.error).toBeDefined()
    const down = await sendRequest("http://127.0.0.1:1", { method: "GET", path: "/", headers: {}, query: {} })
    expect(down.status).toBe(0)
  })
})

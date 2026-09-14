import { describe, expect, test } from "bun:test"
import { hasCaptures, readPath, resolveRequest } from "../src/server/testing/captures"
import type { HttpResult } from "../src/shared/types"

const response = (body: unknown): HttpResult => ({ status: 200, headers: {}, body, text: "", durationMs: 1 })

describe("captures", () => {
  test("readPath walks objects and arrays", () => {
    expect(readPath({ data: { items: [{ id: 7 }] } }, "$.data.items[0].id")).toBe(7)
    expect(readPath({ a: 1 }, "$.a.b")).toBeUndefined()
    expect(readPath("x", "$")).toBe("x")
  })

  test("resolves placeholders from earlier responses", () => {
    const captures = new Map([["login-ok", response({ data: { token: "abc", id: 9 } })]])
    const request = {
      method: "PUT",
      path: "/users/{{login-ok.$.data.id}}",
      query: { t: "{{ login-ok.$.data.token }}" },
      headers: { Authorization: "Bearer {{login-ok.$.data.token}}", "X-Id": "{{login-ok.$.data.id}}", "X-Data": "d={{login-ok.$.data}}" },
      body: { id: "{{login-ok.$.data.id}}", note: "id {{login-ok.$.data.id}}", list: ["{{missing.$.x}}", "left {{missing.$.x}}"], n: 1 },
    }
    expect(hasCaptures(request)).toBe(true)
    expect(resolveRequest(request, captures)).toEqual({
      method: "PUT",
      path: "/users/9",
      query: { t: "abc" },
      headers: { Authorization: "Bearer abc", "X-Id": "9", "X-Data": 'd={"token":"abc","id":9}' },
      body: { id: 9, note: "id 9", list: ["{{missing.$.x}}", "left {{missing.$.x}}"], n: 1 },
    })
  })

  test("leaves requests without placeholders untouched", () => {
    const request = { method: "GET", path: "/x", query: {}, headers: {} }
    expect(hasCaptures(request)).toBe(false)
    expect(resolveRequest(request, new Map())).toBe(request)
    expect(resolveRequest(request, new Map([["a", response({})]]))).toBe(request)
  })
})

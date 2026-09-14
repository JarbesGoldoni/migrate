import type { HttpRequestSpec, HttpResult } from "../../shared/types"

/**
 * Characterization cases can reuse what an earlier case returned — a token, a created id — with
 * `{{<case id>.$.<path in its response body>}}` in the path, a query or header value, or the body.
 */
const CAPTURE = /\{\{\s*([\w.-]+?)\.(\$[^}]*?)\s*\}\}/g
const WHOLE = /^\{\{\s*([\w.-]+?)\.(\$[^}]*?)\s*\}\}$/

export type Captures = Map<string, HttpResult>

export function readPath(value: unknown, path: string): unknown {
  let current = value
  for (const token of path.replace(/^\$/, "").match(/[^.[\]]+/g) ?? []) {
    if (current === null || typeof current !== "object") return undefined
    current = (current as Record<string, unknown>)[token]
  }
  return current
}

export function hasCaptures(request: HttpRequestSpec) {
  return JSON.stringify(request).match(CAPTURE) !== null
}

const lookup = (captures: Captures, id: string, path: string) => {
  const response = captures.get(id)
  return response ? readPath(response.body, path) : undefined
}

/** A string that is exactly one placeholder keeps the captured type (a number stays a number). */
function resolveString(value: string, captures: Captures): unknown {
  const whole = value.match(WHOLE)
  if (whole) {
    const found = lookup(captures, whole[1], whole[2])
    return found === undefined ? value : found
  }
  return value.replace(CAPTURE, (placeholder, id: string, path: string) => {
    const found = lookup(captures, id, path)
    if (found === undefined) return placeholder
    return typeof found === "string" ? found : JSON.stringify(found)
  })
}

const asText = (value: unknown) => (typeof value === "string" ? value : JSON.stringify(value))

function resolveValue(value: unknown, captures: Captures): unknown {
  if (typeof value === "string") return resolveString(value, captures)
  if (Array.isArray(value)) return value.map((item) => resolveValue(item, captures))
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, resolveValue(item, captures)]))
  }
  return value
}

const resolveRecord = (record: Record<string, string> | undefined, captures: Captures) =>
  record && Object.fromEntries(Object.entries(record).map(([key, value]) => [key, asText(resolveString(value, captures))]))

export function resolveRequest(request: HttpRequestSpec, captures: Captures): HttpRequestSpec {
  if (captures.size === 0 || !hasCaptures(request)) return request
  return {
    ...request,
    path: asText(resolveString(request.path, captures)),
    query: resolveRecord(request.query, captures) ?? request.query,
    headers: resolveRecord(request.headers, captures) ?? request.headers,
    body: resolveValue(request.body, captures),
  }
}

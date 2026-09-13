import type { Comparison, Diff, HttpResult } from "../../shared/types"

type Mode = "exact" | "subset" | "status"

/** Turn an ignore pattern like `$.items[].id`, `items.*.createdAt` or `token` into a path matcher. */
export function ignoreMatcher(patterns: string[]) {
  const regexes = patterns
    .map((p) => p.trim())
    .filter(Boolean)
    .map((pattern) => {
      const body = pattern
        .replace(/^\$\.?/, "")
        .split(/(\[\*?\]|\.\*|\.)/)
        .filter((token) => token && token !== ".")
        .map((token) => {
          if (token === "[]" || token === "[*]") return "\\[\\d+\\]"
          if (token === ".*") return "(?:\\.[^.\\[]+|\\[\\d+\\])"
          return `\\.${token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`
        })
        .join("")
      return new RegExp(`^\\$${body}(?:$|[.\\[])`)
    })
  return (path: string) => regexes.some((r) => r.test(path))
}

export function diffValues(expected: unknown, actual: unknown, mode: "exact" | "subset", ignore: (p: string) => boolean) {
  const diffs: Diff[] = []
  walk(expected, actual, "$", mode, ignore, diffs)
  return diffs
}

function walk(
  expected: unknown,
  actual: unknown,
  path: string,
  mode: "exact" | "subset",
  ignore: (p: string) => boolean,
  diffs: Diff[],
) {
  if (path !== "$" && ignore(path)) return
  if (isObject(expected) && isObject(actual)) {
    for (const key of Object.keys(expected)) {
      const child = `${path}.${key}`
      if (!(key in actual)) {
        if (!ignore(child)) diffs.push({ path: child, kind: "missing", expected: expected[key] })
        continue
      }
      walk(expected[key], actual[key], child, mode, ignore, diffs)
    }
    if (mode === "exact") {
      for (const key of Object.keys(actual)) {
        const child = `${path}.${key}`
        if (!(key in expected) && !ignore(child)) diffs.push({ path: child, kind: "extra", actual: actual[key] })
      }
    }
    return
  }
  if (Array.isArray(expected) && Array.isArray(actual)) {
    const length = mode === "exact" ? Math.max(expected.length, actual.length) : expected.length
    for (let i = 0; i < length; i++) {
      const child = `${path}[${i}]`
      if (i >= actual.length) diffs.push({ path: child, kind: "missing", expected: expected[i] })
      else if (i >= expected.length) {
        if (!ignore(child)) diffs.push({ path: child, kind: "extra", actual: actual[i] })
      } else walk(expected[i], actual[i], child, mode, ignore, diffs)
    }
    return
  }
  if (!Object.is(expected, actual) && !looseNumberEqual(expected, actual)) {
    diffs.push({ path, kind: "changed", expected, actual })
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function looseNumberEqual(a: unknown, b: unknown) {
  return typeof a === "number" && typeof b === "number" && Math.abs(a - b) < 1e-9
}

/** Characterization: does the legacy response agree with what the model predicted from the code? */
export function compareExpectation(
  expect: { status: number; body: unknown; match: Mode },
  actual: HttpResult,
  ignore: string[] = [],
): Comparison {
  if (actual.error) return { match: false, diffs: [{ path: "$", kind: "error", actual: actual.error }] }
  const diffs: Diff[] = []
  if (expect.status !== actual.status) diffs.push({ path: "status", kind: "status", expected: expect.status, actual: actual.status })
  if (expect.match !== "status" && expect.body !== undefined && expect.body !== null) {
    diffs.push(...diffValues(expect.body, actual.body, expect.match, ignoreMatcher(ignore)))
  }
  return { match: diffs.length === 0, diffs }
}

/** Parity: legacy is the source of truth and v2 must answer identically. */
export function compareResponses(legacy: HttpResult, v2: HttpResult, ignore: string[] = []): Comparison {
  if (legacy.error || v2.error) {
    return {
      match: false,
      diffs: [{ path: "$", kind: "error", expected: legacy.error ?? legacy.status, actual: v2.error ?? v2.status }],
    }
  }
  const diffs: Diff[] = []
  if (legacy.status !== v2.status) diffs.push({ path: "status", kind: "status", expected: legacy.status, actual: v2.status })
  diffs.push(...diffValues(legacy.body, v2.body, "exact", ignoreMatcher(ignore)))
  return { match: diffs.length === 0, diffs }
}

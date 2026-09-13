import type { TestCase } from "../../../src/shared/contracts"

const quote = (value: string) => `'${value.replace(/'/g, `'\\''`)}'`

export function curlFor(testCase: Pick<TestCase, "request">, base: string) {
  const request = testCase.request
  const query = new URLSearchParams(request.query).toString()
  const parts = [`curl -sS -i -X ${request.method}`, `"${base}${request.path}${query ? `?${query}` : ""}"`]
  const headers = { ...request.headers }
  const hasBody = request.body !== undefined && request.body !== null && request.method !== "GET" && request.method !== "HEAD"
  const body = hasBody ? (typeof request.body === "string" ? request.body : JSON.stringify(request.body)) : undefined
  if (hasBody && typeof request.body !== "string" && !Object.keys(headers).some((h) => h.toLowerCase() === "content-type")) {
    headers["Content-Type"] = "application/json"
  }
  for (const [key, value] of Object.entries(headers)) parts.push(`-H ${quote(`${key}: ${value}`)}`)
  if (body !== undefined) parts.push(`--data-raw ${quote(body)}`)
  return parts.join(" \\\n  ")
}

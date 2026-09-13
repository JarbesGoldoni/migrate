import type { HttpRequestSpec, HttpResult } from "../../shared/types"

export function buildUrl(baseUrl: string, request: Pick<HttpRequestSpec, "path" | "query">) {
  const url = new URL(request.path.startsWith("/") ? request.path : `/${request.path}`, baseUrl)
  for (const [key, value] of Object.entries(request.query ?? {})) url.searchParams.set(key, value)
  return url
}

export function encodeBody(request: HttpRequestSpec) {
  if (request.body === undefined || request.body === null || request.method === "GET" || request.method === "HEAD") {
    return { body: undefined, contentType: undefined }
  }
  if (typeof request.body === "string") return { body: request.body, contentType: undefined }
  return { body: JSON.stringify(request.body), contentType: "application/json" }
}

export async function sendRequest(
  baseUrl: string,
  request: HttpRequestSpec,
  options: { timeoutMs?: number; fetchImpl?: typeof fetch } = {},
): Promise<HttpResult> {
  const started = performance.now()
  const encoded = encodeBody(request)
  const headers = { ...request.headers }
  const hasContentType = Object.keys(headers).some((h) => h.toLowerCase() === "content-type")
  if (encoded.contentType && !hasContentType) headers["content-type"] = encoded.contentType
  try {
    const response = await (options.fetchImpl ?? fetch)(buildUrl(baseUrl, request), {
      method: request.method,
      headers,
      body: encoded.body,
      redirect: "manual",
      signal: AbortSignal.timeout(options.timeoutMs ?? 20_000),
    })
    const text = await response.text()
    return {
      status: response.status,
      headers: Object.fromEntries([...response.headers.entries()].map(([k, v]) => [k.toLowerCase(), v])),
      body: parseBody(text),
      text,
      durationMs: Math.round(performance.now() - started),
    }
  } catch (error) {
    return {
      status: 0,
      headers: {},
      body: undefined,
      text: "",
      durationMs: Math.round(performance.now() - started),
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

function parseBody(text: string): unknown {
  if (!text) return undefined
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

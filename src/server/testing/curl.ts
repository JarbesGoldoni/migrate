import { mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"
import type { TestCase, Tests } from "../../shared/contracts"
import { encodeBody } from "./http"

export function shellQuote(value: string) {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

export function curlCommand(testCase: TestCase, base = "${BASE_URL}") {
  const request = testCase.request
  const query = new URLSearchParams(request.query).toString()
  const url = `${base}${request.path}${query ? `?${query}` : ""}`
  const encoded = encodeBody(request)
  const headers = { ...request.headers }
  if (encoded.contentType && !Object.keys(headers).some((h) => h.toLowerCase() === "content-type")) {
    headers["Content-Type"] = encoded.contentType
  }
  const parts = [`curl -sS -i -X ${request.method}`, `"${url}"`]
  for (const [key, value] of Object.entries(headers)) parts.push(`-H ${shellQuote(`${key}: ${value}`)}`)
  if (encoded.body !== undefined) parts.push(`--data-raw ${shellQuote(encoded.body)}`)
  return parts.join(" \\\n  ")
}

export function curlScript(testCase: TestCase) {
  return [
    "#!/usr/bin/env sh",
    `# ${testCase.title}`,
    ...(testCase.branch ? [`# Branch: ${testCase.branch}`] : []),
    ...(testCase.rules.length ? [`# Rules: ${testCase.rules.join(", ")}`] : []),
    `# Expect: HTTP ${testCase.expect.status}`,
    'BASE_URL="${BASE_URL:-http://localhost:8080}"',
    curlCommand(testCase),
    "",
  ].join("\n")
}

export async function writeCurlScripts(dir: string, tests: Tests) {
  await mkdir(dir, { recursive: true })
  await Promise.all(tests.cases.map((c) => writeFile(join(dir, `${c.id}.sh`), curlScript(c), { mode: 0o755 })))
  const runAll = [
    "#!/usr/bin/env sh",
    "# Run every characterization test in this batch against BASE_URL.",
    'BASE_URL="${BASE_URL:-http://localhost:8080}"',
    "export BASE_URL",
    'cd "$(dirname "$0")"',
    ...tests.cases.map((c) => `echo "\\n━━ ${c.id}" && sh ./${c.id}.sh`),
    "",
  ].join("\n")
  await writeFile(join(dir, "run-all.sh"), runAll, { mode: 0o755 })
}

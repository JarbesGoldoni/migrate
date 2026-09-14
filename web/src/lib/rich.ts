// Agent explanations use `code` and **bold**. In plain prose only literals worth a second look are lit up:
// quoted values, HTTP methods with their path, status codes, JSON paths, calls and file paths.

export type RichKind = "text" | "bold" | "code" | "status" | "method" | "path" | "json" | "string" | "call"

export type RichToken = { kind: RichKind; text: string }

const MARKUP = /(\*\*[^*\n]+\*\*|`[^`\n]+`)/g

const METHODS = "GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS"

const AUTO = new RegExp(
  [
    '"[^"\\n]{1,60}"',
    // Single quotes only around a value, never an apostrophe ("Go's").
    "(?<![\\w])'[^'\\s][^'\\n]{0,58}'(?![\\w])",
    `\\b(?:${METHODS})\\b(?:[ ]+\\/[\\w\\-./{}:]*)?`,
    "\\$\\.[\\w.[\\]*-]+",
    "\\{\\{[^}\\n]+\\}\\}",
    "@?[A-Za-z_][\\w.]*\\([^()\\n]{0,40}\\)",
    "\\b[\\w-]+(?:\\/[\\w.-]+)+\\.\\w{1,6}\\b",
    "\\b[1-5]\\d{2}\\b(?![-./:\\d%])",
  ].join("|"),
  "g",
)

/** What kind of literal a snippet is, so it can take the matching color. */
export function classify(snippet: string): Exclude<RichKind, "text" | "bold"> {
  if (/^[1-5]\d{2}(\s|$)/.test(snippet)) return "status"
  if (new RegExp(`^(${METHODS})(\\s|$)`).test(snippet)) return "method"
  if (/^(\$\.|\{\{)/.test(snippet)) return "json"
  if (/^(".*"|'.*')$/.test(snippet)) return "string"
  if (/^[\w-]+(\/[\w.-]+)+\.\w{1,6}$/.test(snippet)) return "path"
  if (/\(.*\)$/.test(snippet)) return "call"
  return "code"
}

export function richTokens(text: string): RichToken[] {
  const tokens: RichToken[] = []
  for (const piece of text.split(MARKUP)) {
    if (!piece) continue
    if (piece.startsWith("**") && piece.endsWith("**") && piece.length > 4) {
      tokens.push({ kind: "bold", text: piece.slice(2, -2) })
    } else if (piece.startsWith("`") && piece.endsWith("`") && piece.length > 2) {
      tokens.push({ kind: "code", text: piece.slice(1, -1) })
    } else {
      let last = 0
      for (const match of piece.matchAll(AUTO)) {
        const index = match.index ?? 0
        if (index > last) tokens.push({ kind: "text", text: piece.slice(last, index) })
        const kind = classify(match[0])
        tokens.push({ kind: kind === "code" ? "call" : kind, text: match[0] })
        last = index + match[0].length
      }
      if (last < piece.length) tokens.push({ kind: "text", text: piece.slice(last) })
    }
  }
  return tokens
}

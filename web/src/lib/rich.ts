// Agent explanations use `code` and **bold**; plain text still gets its values, paths and status codes lit up.

export type RichKind = "text" | "bold" | "code" | "status" | "method" | "path" | "json" | "string" | "identifier"

export type RichToken = { kind: RichKind; text: string }

const MARKUP = /(\*\*[^*\n]+\*\*|`[^`\n]+`)/g

const AUTO =
  /("[^"\n]{1,60}"|\$\.[\w.[\]*-]+|\{\{[^}\n]+\}\}|\b(?:GET|POST|PUT|PATCH|DELETE)\b|\b[1-5]\d{2}\b(?![-./:\d])|\b[\w-]+(?:\/[\w.-]+)+\.\w{1,6}\b|\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b|\b[a-z]+[A-Z][A-Za-z0-9]*\b|\b[\w.]+\(\))/g

/** What kind of literal a snippet is, so it can take the matching color. */
export function classify(snippet: string): Exclude<RichKind, "text" | "bold" | "code"> | "code" {
  if (/^[1-5]\d{2}(\s|$)/.test(snippet)) return "status"
  if (/^(GET|POST|PUT|PATCH|DELETE)$/.test(snippet)) return "method"
  if (/^(\$\.|\{\{)/.test(snippet)) return "json"
  if (/^".*"$/.test(snippet)) return "string"
  if (/^[\w-]+(\/[\w.-]+)+\.\w{1,6}$/.test(snippet)) return "path"
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
        tokens.push({ kind: kind === "code" ? "identifier" : kind, text: match[0] })
        last = index + match[0].length
      }
      if (last < piece.length) tokens.push({ kind: "text", text: piece.slice(last) })
    }
  }
  return tokens
}

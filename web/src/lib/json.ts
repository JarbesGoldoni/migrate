export type JsonLine = { path: string; indent: number; text: string; tone: "key" | "punct" | "string" | "number" | "literal" }

export type JsonToken = { text: string; tone: "key" | "punct" | "string" | "number" | "literal" }

export type RenderedLine = { path: string; indent: number; tokens: JsonToken[] }

/**
 * Render a JSON value as lines that remember the JSONPath they belong to,
 * so a diff at `$.items[1].price` can light up exactly the lines it touches.
 */
export function jsonLines(value: unknown): RenderedLine[] {
  const lines: RenderedLine[] = []
  const walk = (current: unknown, path: string, indent: number, prefix: JsonToken[], trailing: string) => {
    const tail = trailing ? [{ text: trailing, tone: "punct" as const }] : []
    if (Array.isArray(current)) {
      if (current.length === 0) {
        lines.push({ path, indent, tokens: [...prefix, { text: "[]", tone: "punct" }, ...tail] })
        return
      }
      lines.push({ path, indent, tokens: [...prefix, { text: "[", tone: "punct" }] })
      current.forEach((item, i) => walk(item, `${path}[${i}]`, indent + 1, [], i < current.length - 1 ? "," : ""))
      lines.push({ path, indent, tokens: [{ text: "]", tone: "punct" }, ...tail] })
      return
    }
    if (current && typeof current === "object") {
      const entries = Object.entries(current)
      if (entries.length === 0) {
        lines.push({ path, indent, tokens: [...prefix, { text: "{}", tone: "punct" }, ...tail] })
        return
      }
      lines.push({ path, indent, tokens: [...prefix, { text: "{", tone: "punct" }] })
      entries.forEach(([key, item], i) =>
        walk(
          item,
          `${path}.${key}`,
          indent + 1,
          [
            { text: JSON.stringify(key), tone: "key" },
            { text: ": ", tone: "punct" },
          ],
          i < entries.length - 1 ? "," : "",
        ),
      )
      lines.push({ path, indent, tokens: [{ text: "}", tone: "punct" }, ...tail] })
      return
    }
    lines.push({ path, indent, tokens: [...prefix, scalar(current), ...tail] })
  }
  walk(value, "$", 0, [], "")
  return lines
}

function scalar(value: unknown): JsonToken {
  if (typeof value === "string") return { text: JSON.stringify(value), tone: "string" }
  if (typeof value === "number") return { text: String(value), tone: "number" }
  if (value === undefined) return { text: "undefined", tone: "literal" }
  return { text: JSON.stringify(value), tone: "literal" }
}

export function touches(linePath: string, diffPaths: string[]) {
  return diffPaths.some((p) => p !== "$" && (linePath === p || linePath.startsWith(`${p}.`) || linePath.startsWith(`${p}[`)))
}

export function pretty(value: unknown) {
  if (value === undefined) return ""
  if (typeof value === "string") return value
  return JSON.stringify(value, null, 2)
}

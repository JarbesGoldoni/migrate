// Pull a JSON value out of text a model produced: the whole string, a fenced
// block, or the first balanced object/array found in the prose.
export function extractJson(text: string): unknown {
  const direct = tryParse(text.trim())
  if (direct !== undefined) return direct

  for (const match of text.matchAll(/```(?:json)?\s*([\s\S]*?)```/g)) {
    const parsed = tryParse(match[1].trim())
    if (parsed !== undefined) return parsed
  }

  for (let start = 0; start < text.length; start++) {
    const ch = text[start]
    if (ch !== "{" && ch !== "[") continue
    const end = balancedEnd(text, start)
    if (end < 0) continue
    const parsed = tryParse(text.slice(start, end + 1))
    if (parsed !== undefined) return parsed
  }
  return undefined
}

function tryParse(s: string): unknown {
  if (!s) return undefined
  try {
    return JSON.parse(s)
  } catch {
    return undefined
  }
}

function balancedEnd(text: string, start: number) {
  const stack: string[] = []
  let inString = false
  for (let i = start; i < text.length; i++) {
    const ch = text[i]
    if (inString) {
      if (ch === "\\") i++
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') inString = true
    else if (ch === "{" || ch === "[") stack.push(ch === "{" ? "}" : "]")
    else if (ch === "}" || ch === "]") {
      if (stack.pop() !== ch) return -1
      if (stack.length === 0) return i
    }
  }
  return -1
}

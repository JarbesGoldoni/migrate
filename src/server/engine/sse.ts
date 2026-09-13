export type SseEvent = { type?: string; properties?: Record<string, unknown> & { [key: string]: any } }

/** Split a server-sent-events buffer into parsed JSON events plus the unfinished tail. */
export function parseSse(buffer: string): { events: SseEvent[]; rest: string } {
  const events: SseEvent[] = []
  const normalized = buffer.replace(/\r\n/g, "\n")
  const chunks = normalized.split("\n\n")
  const rest = chunks.pop() ?? ""
  for (const chunk of chunks) {
    const data = chunk
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart())
      .join("\n")
    if (!data) continue
    try {
      events.push(JSON.parse(data))
    } catch {
      // Heartbeats and non-JSON payloads are not interesting.
    }
  }
  return { events, rest }
}

export async function* readSse(body: ReadableStream<Uint8Array>) {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  while (true) {
    const { value, done } = await reader.read()
    if (done) return
    buffer += decoder.decode(value, { stream: true })
    const parsed = parseSse(buffer)
    buffer = parsed.rest
    for (const event of parsed.events) yield event
  }
}

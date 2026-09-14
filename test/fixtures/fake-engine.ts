// Minimal stand-in for the engine's HTTP server, used by the engine bridge tests.
const port = Number(process.argv[process.argv.indexOf("--port") + 1])
const password = process.env.OPENCODE_SERVER_PASSWORD ?? ""
const encoder = new TextEncoder()
const streams = new Set<ReadableStreamDefaultController<Uint8Array>>()

const send = (event: unknown) => {
  const chunk = encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
  for (const controller of streams) {
    try {
      controller.enqueue(chunk)
    } catch {
      streams.delete(controller)
    }
  }
}

const part = (part: Record<string, unknown>) => ({
  type: "message.part.updated",
  properties: { part: { sessionID: "ses_fake", ...part } },
})

async function scenario(prompt: string, directory: string) {
  send({ type: "message.updated", properties: { info: { id: "msg_other", sessionID: "ses_other", role: "assistant" } } })
  send(part({ id: "p_user", messageID: "msg_user", type: "text", text: prompt }))
  send({ type: "message.updated", properties: { info: { id: "msg_user", sessionID: "ses_fake", role: "user" } } })
  send(part({ id: "p_think", messageID: "msg_a", type: "reasoning", text: "Looking at the code", time: { end: 1 } }))
  send({ type: "permission.asked", properties: { id: "per_1", sessionID: "ses_fake" } })
  send({ type: "question.asked", properties: { id: "que_1", sessionID: "ses_fake" } })
  if (prompt.includes("fail")) {
    send({ type: "session.error", properties: { sessionID: "ses_fake", error: { name: "ApiError", data: { message: "Quota exceeded" } } } })
    send({ type: "session.idle", properties: { sessionID: "ses_fake" } })
    return
  }
  const file = `${directory}/out.json`
  await Bun.write(file, '{"ok":true}')
  send(part({ id: "p_write", messageID: "msg_a", type: "tool", tool: "write", state: { status: "completed", input: { filePath: file } } }))
  send({ type: "session.status", properties: { sessionID: "ses_fake", status: { type: "retry", attempt: 1, message: "busy" } } })
  send(part({ id: "p_text", messageID: "msg_a", type: "text", text: "All done." }))
  send({ type: "session.idle", properties: { sessionID: "ses_other" } })
  send({ type: "session.idle", properties: { sessionID: "ses_fake" } })
}

Bun.serve({
  port,
  hostname: "127.0.0.1",
  idleTimeout: 0,
  async fetch(request) {
    const url = new URL(request.url)
    if (request.headers.get("authorization") !== `Basic ${btoa(`opencode:${password}`)}`) {
      return new Response("unauthorized", { status: 401 })
    }
    const path = url.pathname
    if (path === "/global/health") return Response.json({ healthy: true })
    if (path === "/config/providers") {
      return Response.json({
        providers: [
          {
            id: "fake",
            name: "Fake AI",
            models: { smart: { id: "smart", name: "Smart", variants: { low: {}, high: {}, off: { disabled: true } } } },
          },
        ],
        default: { fake: "smart" },
      })
    }
    if (path === "/provider") {
      return Response.json({
        all: [
          { id: "fake", name: "Fake AI" },
          { id: "opencode", name: "OpenCode Zen" },
          { id: "other", name: "Other" },
        ],
        connected: ["fake", "opencode", "unnamed"],
      })
    }
    if (path === "/session" && request.method === "POST") return Response.json({ id: "ses_fake" })
    if (path === "/session/ses_fake") return Response.json({ id: "ses_fake" })
    if (path.startsWith("/session/") && request.method === "GET") return new Response("not found", { status: 404 })
    if (path === "/event") {
      let self: ReadableStreamDefaultController<Uint8Array>
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          self = controller
          streams.add(controller)
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "server.connected", properties: {} })}\n\n`))
        },
        cancel() {
          streams.delete(self)
        },
      })
      return new Response(stream, { headers: { "content-type": "text/event-stream" } })
    }
    if (path.endsWith("/prompt_async")) {
      const body = (await request.json()) as { parts: Array<{ text: string }> }
      await Bun.write(`${url.searchParams.get("directory") ?? "."}/last-prompt.json`, JSON.stringify(body))
      setTimeout(() => void scenario(body.parts[0].text, url.searchParams.get("directory") ?? "."), 30)
      return new Response(null, { status: 204 })
    }
    if (path.startsWith("/permission/") || path.startsWith("/question/") || path.endsWith("/abort")) {
      return Response.json(true)
    }
    return new Response("not found", { status: 404 })
  },
})

import { type Message, type MessageKey, type MessageParams, msg } from "../../shared/messages"
import type { Activity, ActivityKind } from "../../shared/types"

type Part = {
  id?: string
  messageID?: string
  type?: string
  text?: string
  tool?: string
  time?: { end?: number }
  state?: { status?: string; input?: Record<string, unknown>; error?: string; title?: string }
}

const TOOL_KINDS: Record<string, ActivityKind> = {
  read: "read",
  glob: "list",
  list: "list",
  grep: "search",
  codesearch: "search",
  edit: "edit",
  multiedit: "edit",
  patch: "edit",
  apply_patch: "edit",
  write: "write",
  bash: "bash",
  webfetch: "web",
  websearch: "web",
  todowrite: "todo",
  todoread: "todo",
  task: "agent",
}

export function toolKind(tool: string): ActivityKind {
  return TOOL_KINDS[tool] ?? "agent"
}

export function relativePath(value: unknown, root: string) {
  const s = typeof value === "string" ? value : ""
  if (!root || !s.startsWith(root)) return s
  return s.slice(root.length).replace(/^\/+/, "") || "."
}

function firstLine(s: string, max = 110) {
  const line = s.trim().split("\n").find((l) => l.trim()) ?? ""
  const clean = line.replace(/^[#*\s-]+/, "").trim()
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean
}

function describe(title: string, key: MessageKey, params: MessageParams) {
  return { title, message: msg(key, params) }
}

function toolText(tool: string, input: Record<string, unknown>, root: string): { title: string; message?: Message } {
  const path = relativePath(input.filePath ?? input.path, root)
  switch (tool) {
    case "read":
      return describe(`Read ${path}`, "tool.read", { path })
    case "glob": {
      const pattern = String(input.pattern ?? "")
      if (!input.path) return describe(`Scan ${pattern}`, "tool.scan", { pattern })
      const dir = relativePath(input.path, root)
      return describe(`Scan ${pattern} in ${dir}`, "tool.scanIn", { pattern, path: dir })
    }
    case "list":
      return describe(`List ${path || "."}`, "tool.list", { path: path || "." })
    case "grep":
    case "codesearch": {
      const pattern = String(input.pattern ?? input.query ?? "")
      return describe(`Search “${pattern}”`, "tool.search", { pattern })
    }
    case "edit":
    case "multiedit":
    case "patch":
    case "apply_patch":
      return describe(`Edit ${path || "files"}`, "tool.edit", { path: path || "files" })
    case "write":
      return describe(`Write ${path}`, "tool.write", { path })
    case "bash": {
      const command = firstLine(String(input.description ?? input.command ?? ""), 90)
      return describe(`Run ${command}`, "tool.run", { command })
    }
    case "webfetch": {
      const url = String(input.url ?? "")
      return describe(`Fetch ${url}`, "tool.fetch", { url })
    }
    case "websearch": {
      const query = String(input.query ?? "")
      return describe(`Search the web for “${query}”`, "tool.webSearch", { query })
    }
    case "todowrite": {
      const count = Array.isArray(input.todos) ? input.todos.length : 0
      return describe(`Plan ${count} step${count === 1 ? "" : "s"}`, "tool.plan", { count })
    }
    case "task": {
      const task = firstLine(String(input.description ?? "subtask"), 90)
      return describe(`Delegate ${task}`, "tool.delegate", { task })
    }
    default:
      return { title: tool }
  }
}

function toolDetail(tool: string, input: Record<string, unknown>) {
  if (tool === "bash") return String(input.command ?? "")
  if (tool === "todowrite" && Array.isArray(input.todos)) {
    return input.todos
      .map((t) => (t && typeof t === "object" ? String((t as { content?: unknown }).content ?? "") : ""))
      .filter(Boolean)
      .join("\n")
  }
  return undefined
}

/**
 * Translate one engine event into a feed item. Parts are upserted by id in the
 * UI, so a tool shows once as running and is then replaced by its final state.
 */
export function toActivity(
  event: { type?: string; properties?: { part?: Part } },
  ctx: { phase: string; root: string; isUserMessage: (messageID: string) => boolean; now?: number },
): Activity | undefined {
  if (event.type !== "message.part.updated") return undefined
  const part = event.properties?.part
  if (!part?.id || !part.type) return undefined
  if (part.messageID && ctx.isUserMessage(part.messageID)) return undefined
  const base = { id: part.id, at: ctx.now ?? Date.now(), phase: ctx.phase }

  if (part.type === "reasoning" || part.type === "text") {
    const text = part.text ?? ""
    if (!text.trim()) return undefined
    return {
      ...base,
      kind: part.type === "reasoning" ? "think" : "text",
      title: firstLine(text),
      detail: text.length > 110 ? text : undefined,
      status: part.time?.end ? "done" : "running",
    }
  }

  if (part.type === "tool" && part.tool) {
    const status = part.state?.status
    if (!status || status === "pending") return undefined
    const input = part.state?.input ?? {}
    return {
      ...base,
      kind: status === "error" ? "error" : toolKind(part.tool),
      ...toolText(part.tool, input, ctx.root),
      detail: status === "error" ? String(part.state?.error ?? "") : toolDetail(part.tool, input),
      status: status === "completed" ? "done" : status === "error" ? "error" : "running",
    }
  }
  return undefined
}

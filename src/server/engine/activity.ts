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

function toolTitle(tool: string, input: Record<string, unknown>, root: string) {
  const path = relativePath(input.filePath ?? input.path, root)
  switch (tool) {
    case "read":
      return `Read ${path}`
    case "glob":
      return `Scan ${String(input.pattern ?? "")}${input.path ? ` in ${relativePath(input.path, root)}` : ""}`
    case "list":
      return `List ${path || "."}`
    case "grep":
    case "codesearch":
      return `Search “${String(input.pattern ?? input.query ?? "")}”`
    case "edit":
    case "multiedit":
    case "patch":
    case "apply_patch":
      return `Edit ${path || "files"}`
    case "write":
      return `Write ${path}`
    case "bash":
      return `Run ${firstLine(String(input.description ?? input.command ?? ""), 90)}`
    case "webfetch":
      return `Fetch ${String(input.url ?? "")}`
    case "websearch":
      return `Search the web for “${String(input.query ?? "")}”`
    case "todowrite": {
      const todos = Array.isArray(input.todos) ? input.todos.length : 0
      return `Plan ${todos} step${todos === 1 ? "" : "s"}`
    }
    case "task":
      return `Delegate ${firstLine(String(input.description ?? "subtask"), 90)}`
    default:
      return tool
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
      title: toolTitle(part.tool, input, ctx.root),
      detail: status === "error" ? String(part.state?.error ?? "") : toolDetail(part.tool, input),
      status: status === "completed" ? "done" : status === "error" ? "error" : "running",
    }
  }
  return undefined
}

import { FileCode2 } from "lucide-react"
import { motion } from "motion/react"
import { useEffect, useMemo, useState } from "react"
import { highlight } from "sugar-high"
import { api, type FileWindow } from "../lib/api"
import { cn } from "../lib/format"
import { jsonLines, touches } from "../lib/json"
import { CopyButton, Spinner } from "./ui"

export function CodeView({
  projectId,
  path,
  start,
  end,
  className,
  tone = "amber",
}: {
  projectId: string
  path: string
  start?: number
  end?: number
  className?: string
  tone?: "amber" | "cyan"
}) {
  const [data, setData] = useState<FileWindow>()
  const [error, setError] = useState<string>()

  useEffect(() => {
    setData(undefined)
    setError(undefined)
    api
      .file(projectId, path, start, end)
      .then(setData)
      .catch((e: Error) => setError(e.message))
  }, [projectId, path, start, end])

  const highlighted = useMemo(() => data?.lines.map((line) => highlight(line)) ?? [], [data])

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn("overflow-hidden rounded-xl bg-black/40 ring-1 ring-white/[0.06]", className)}
    >
      <div className="flex items-center gap-2 border-b border-white/5 px-3 py-2 text-xs">
        <FileCode2 className={cn("size-3.5", tone === "amber" ? "text-amber-300" : "text-cyan-300")} />
        <span className="truncate font-mono text-slate-300">{data?.path ?? path}</span>
        {start ? (
          <span className="shrink-0 text-slate-500">
            L{start}
            {end && end !== start ? `–${end}` : ""}
          </span>
        ) : null}
        <span className="flex-1" />
        {data && <CopyButton text={data.lines.join("\n")} />}
      </div>
      <div className="max-h-96 overflow-auto py-2 font-mono text-[12px] leading-[1.6]">
        {!data && !error && (
          <div className="flex items-center gap-2 px-3 py-2 text-slate-500">
            <Spinner /> Loading
          </div>
        )}
        {error && <div className="px-3 py-2 text-slate-500">Source not available: {error}</div>}
        {data &&
          highlighted.map((html, i) => {
            const line = data.from + i
            const hot = start !== undefined && line >= start && line <= (end ?? start)
            return (
              <div
                key={line}
                className={cn(
                  "flex border-l-2 pr-4",
                  hot ? (tone === "amber" ? "border-amber-400 bg-amber-400/[0.08]" : "border-cyan-400 bg-cyan-400/[0.08]") : "border-transparent",
                )}
              >
                <span className="w-12 shrink-0 pr-3 text-right text-slate-600 select-none">{line}</span>
                {/* sugar-high escapes the source before wrapping tokens in spans */}
                <code className="whitespace-pre" dangerouslySetInnerHTML={{ __html: html || " " }} />
              </div>
            )
          })}
      </div>
    </motion.div>
  )
}

const TOKEN_TONE = {
  key: "text-sky-300",
  string: "text-amber-200",
  number: "text-cyan-200",
  literal: "text-violet-300",
  punct: "text-slate-500",
}

export function JsonView({
  value,
  diffPaths = [],
  className,
  empty = "(empty body)",
}: {
  value: unknown
  diffPaths?: string[]
  className?: string
  empty?: string
}) {
  const lines = useMemo(() => (typeof value === "string" || value === undefined ? [] : jsonLines(value)), [value])
  if (value === undefined || value === "") {
    return <div className={cn("px-3 py-2 font-mono text-[12px] text-slate-600 italic", className)}>{empty}</div>
  }
  if (typeof value === "string") {
    return (
      <pre className={cn("overflow-auto px-3 py-2 font-mono text-[12px] whitespace-pre-wrap text-slate-300", className)}>{value}</pre>
    )
  }
  return (
    <div className={cn("overflow-auto py-2 font-mono text-[12px] leading-[1.65]", className)}>
      {lines.map((line, i) => {
        const hot = touches(line.path, diffPaths)
        return (
          <div
            key={`${line.path}-${i}`}
            className={cn("border-l-2 pr-3 whitespace-pre", hot ? "border-rose-400 bg-rose-500/[0.1]" : "border-transparent")}
            style={{ paddingLeft: 12 + line.indent * 14 }}
          >
            {line.tokens.map((token, j) => (
              <span key={j} className={TOKEN_TONE[token.tone]}>
                {token.text}
              </span>
            ))}
          </div>
        )
      })}
    </div>
  )
}

export function CommandBlock({ command, className }: { command: string; className?: string }) {
  return (
    <div className={cn("group relative overflow-hidden rounded-xl bg-black/50 ring-1 ring-white/[0.06]", className)}>
      <CopyButton text={command} className="absolute top-1.5 right-1.5 opacity-0 transition group-hover:opacity-100" />
      <pre className="overflow-auto px-3 py-2.5 font-mono text-[12px] leading-relaxed whitespace-pre text-slate-300">
        <span className="text-emerald-400 select-none">$ </span>
        {command}
      </pre>
    </div>
  )
}

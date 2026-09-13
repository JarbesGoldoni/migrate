import {
  Bot,
  Brain,
  CircleCheck,
  FilePen,
  FilePlus2,
  FileText,
  FolderSearch,
  Globe,
  Info,
  ListChecks,
  type LucideIcon,
  MessageSquareText,
  Search,
  Sparkles,
  SquareTerminal,
  TriangleAlert,
} from "lucide-react"
import { AnimatePresence, motion } from "motion/react"
import { useEffect, useMemo, useRef, useState } from "react"
import type { Activity, ActivityKind } from "../../../src/shared/types"
import { cn } from "../lib/format"
import { ACTIVITY_TONE } from "../lib/tech"

const ICONS: Record<ActivityKind, LucideIcon> = {
  think: Brain,
  read: FileText,
  search: Search,
  list: FolderSearch,
  edit: FilePen,
  write: FilePlus2,
  bash: SquareTerminal,
  web: Globe,
  todo: ListChecks,
  agent: Bot,
  text: MessageSquareText,
  system: Info,
  success: CircleCheck,
  error: TriangleAlert,
}

const PHASE_LABEL: Record<string, string> = {
  discover: "architecture",
  entrypoints: "entry points",
  environment: "runtime",
  rules: "rules",
  tests: "tests",
  legacy: "legacy run",
  port: "port",
  parity: "parity",
  reconcile: "reconcile",
}

export function phaseLabel(key: string) {
  const [phase, batch] = key.split(":")
  return `${PHASE_LABEL[phase] ?? phase}${batch ? ` · ${batch}` : ""}`
}

export function ActivityFeed({ items, className }: { items: Activity[]; className?: string }) {
  const scroller = useRef<HTMLDivElement>(null)
  const pinned = useRef(true)
  const [expanded, setExpanded] = useState<string>()
  const visible = useMemo(() => items.slice(-250), [items])
  const running = items.some((a) => a.status === "running")

  useEffect(() => {
    const el = scroller.current
    if (el && pinned.current) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" })
  }, [visible])

  return (
    <div className={cn("flex h-full min-h-0 flex-col", className)}>
      <div className="flex items-center gap-2 border-b border-white/5 px-4 py-3">
        <div className="relative grid size-7 place-items-center rounded-lg bg-violet-400/10">
          {running && <span className="absolute inset-0 animate-ping-slow rounded-lg bg-violet-400/20" />}
          <Sparkles className="relative size-4 text-violet-300" />
        </div>
        <div className="flex-1">
          <div className="text-sm font-semibold text-white">Agent activity</div>
          <div className="text-[11px] text-slate-500">
            {running ? <span className="shimmer-text">working…</span> : `${items.length} events`}
          </div>
        </div>
      </div>
      <div
        ref={scroller}
        onScroll={(e) => {
          const el = e.currentTarget
          pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
        }}
        className="min-h-0 flex-1 overflow-y-auto px-2 py-2"
      >
        {visible.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center text-xs text-slate-500">
            <Bot className="size-6 text-slate-600" />
            Everything the agent reads, searches, writes and runs shows up here, live.
          </div>
        )}
        <ul className="flex flex-col gap-0.5">
          <AnimatePresence initial={false}>
            {visible.map((item) => {
              const Icon = ICONS[item.kind] ?? Info
              const isOpen = expanded === item.id
              return (
                <motion.li
                  key={item.id}
                  layout="position"
                  initial={{ opacity: 0, x: 14, filter: "blur(4px)" }}
                  animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
                  transition={{ duration: 0.28, ease: "easeOut" }}
                  onClick={() => item.detail && setExpanded(isOpen ? undefined : item.id)}
                  className={cn(
                    "group rounded-xl px-2 py-1.5 transition-colors",
                    item.detail && "cursor-pointer hover:bg-white/[0.03]",
                    item.kind === "error" && "bg-rose-500/[0.04]",
                  )}
                >
                  <div className="flex items-start gap-2.5">
                    <span className={cn("mt-0.5 grid size-6 shrink-0 place-items-center rounded-md", ACTIVITY_TONE[item.kind])}>
                      <Icon className="size-3.5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div
                        className={cn(
                          "text-[12.5px] leading-snug break-words",
                          item.status === "running" ? "shimmer-text" : item.kind === "text" ? "text-slate-100" : "text-slate-300",
                          ["read", "write", "edit", "list", "search", "bash"].includes(item.kind) && "font-mono text-[11.5px]",
                        )}
                      >
                        {item.title}
                      </div>
                      <div className="mt-0.5 text-[10px] tracking-wide text-slate-600 uppercase">{phaseLabel(item.phase)}</div>
                      <AnimatePresence>
                        {isOpen && item.detail && (
                          <motion.pre
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="mt-1.5 max-h-72 overflow-auto rounded-lg bg-black/40 p-2 font-mono text-[11px] whitespace-pre-wrap text-slate-400"
                          >
                            {item.detail}
                          </motion.pre>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>
                </motion.li>
              )
            })}
          </AnimatePresence>
        </ul>
      </div>
    </div>
  )
}

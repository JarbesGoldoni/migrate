import { Play, RotateCcw, Sparkles, Square } from "lucide-react"
import { AnimatePresence, motion } from "motion/react"
import { type ReactNode, useEffect, useState } from "react"
import type { Activity, PhaseName } from "../../../src/shared/types"
import { Badge, Button, StatusIcon } from "../components/ui"
import { api, type Snapshot } from "../lib/api"
import { ago, cn, duration } from "../lib/format"
import { hasOutput, phaseState } from "../lib/pipeline"
import type { LucideIcon } from "lucide-react"

export function useNow(active: boolean, interval = 1000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    const timer = setInterval(() => setNow(Date.now()), interval)
    return () => clearInterval(timer)
  }, [active, interval])
  return now
}

export function PhaseAction({
  snapshot,
  phase,
  batch,
  label,
  rerunLabel = "Run again",
  forceVariant,
}: {
  snapshot: Snapshot
  phase: PhaseName
  batch?: string
  label: string
  rerunLabel?: string
  forceVariant?: "primary" | "outline"
}) {
  const [reason, setReason] = useState<string>()
  const [pending, setPending] = useState(false)
  const state = phaseState(snapshot, phase, batch)
  const id = snapshot.project.id

  if (state.status === "running") {
    return (
      <Button variant="danger" size="sm" icon={<Square className="size-3.5" />} onClick={() => api.stop(id, phase, batch)}>
        Stop
      </Button>
    )
  }

  const done = hasOutput(snapshot, phase, batch)
  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        variant={forceVariant ?? (done ? "outline" : "primary")}
        size="sm"
        loading={pending}
        icon={done ? <RotateCcw className="size-3.5" /> : <Play className="size-3.5" />}
        onClick={async () => {
          setPending(true)
          const result = await api.run(id, phase, batch).catch((e: Error) => ({ started: false, reason: e.message }))
          setPending(false)
          if (!result.started) {
            setReason(result.reason)
            setTimeout(() => setReason(undefined), 6000)
          }
        }}
      >
        {done ? rerunLabel : label}
      </Button>
      <AnimatePresence>
        {reason && (
          <motion.span initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="max-w-64 text-right text-xs text-amber-300">
            {reason}
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  )
}

export function PhaseHeader({
  icon: Icon,
  eyebrow,
  title,
  blurb,
  snapshot,
  phase,
  batch,
  action,
}: {
  icon: LucideIcon
  eyebrow?: string
  title: string
  blurb: string
  snapshot: Snapshot
  phase?: PhaseName
  batch?: string
  action?: ReactNode
}) {
  const state = phase ? phaseState(snapshot, phase, batch) : undefined
  const running = state?.status === "running"
  const now = useNow(running)
  return (
    <div className="flex flex-wrap items-start gap-4">
      <div className="relative grid size-12 shrink-0 place-items-center rounded-2xl bg-white/[0.05] ring-1 ring-white/10">
        {running && <span className="absolute inset-0 animate-ping-slow rounded-2xl bg-cyan-400/20" />}
        <Icon className="relative size-6 text-slate-100" />
      </div>
      <div className="min-w-0 flex-1">
        {eyebrow && <div className="text-[11px] font-semibold tracking-[0.18em] text-slate-500 uppercase">{eyebrow}</div>}
        <h1 className="text-2xl font-semibold tracking-tight text-white">{title}</h1>
        <p className="mt-1 max-w-2xl text-sm leading-relaxed text-slate-400">{blurb}</p>
        {state && state.status !== "idle" && (
          <div className="mt-2.5 flex flex-wrap items-center gap-2 text-xs">
            <StatusIcon status={state.status} className="size-4" />
            {state.status === "running" && <span className="shimmer-text">Working · {duration(now - (state.startedAt ?? now))}</span>}
            {state.status === "done" && (
              <span className="text-slate-400">
                Completed {ago(state.finishedAt)} · took {duration((state.finishedAt ?? 0) - (state.startedAt ?? 0))}
              </span>
            )}
            {state.status === "failed" && <span className="text-rose-300">{state.error}</span>}
            {state.note && state.status !== "running" && <Badge tone={state.status === "failed" ? "rose" : "slate"}>{state.note}</Badge>}
          </div>
        )}
      </div>
      {action}
    </div>
  )
}

export function Working({ activity, phaseKey, title }: { activity: Activity[]; phaseKey: string; title: string }) {
  const recent = activity.filter((a) => a.phase === phaseKey && a.kind !== "system").slice(-4)
  return (
    <div className="flex flex-col items-center gap-7 py-14">
      <div className="relative size-48">
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="absolute inset-0 rounded-full ring-1 ring-cyan-400/40"
            initial={{ scale: 0.25, opacity: 0.9 }}
            animate={{ scale: 1, opacity: 0 }}
            transition={{ duration: 2.6, repeat: Number.POSITIVE_INFINITY, delay: i * 0.85, ease: "easeOut" }}
          />
        ))}
        <motion.div
          className="absolute inset-0 rounded-full"
          style={{ background: "conic-gradient(from 0deg, rgba(34,211,238,0.32), rgba(167,139,250,0.12) 18%, transparent 32%)" }}
          animate={{ rotate: 360 }}
          transition={{ duration: 3, repeat: Number.POSITIVE_INFINITY, ease: "linear" }}
        />
        <div className="absolute inset-0 rounded-full ring-1 ring-white/5" />
        <div className="absolute inset-[22%] rounded-full ring-1 ring-white/5" />
        <div className="absolute inset-[38%] grid place-items-center rounded-full bg-ink-900 ring-1 ring-white/10">
          <Sparkles className="size-6 text-violet-300" />
        </div>
      </div>
      <div className="shimmer-text text-lg font-medium">{title}</div>
      <div className="flex h-24 w-full max-w-lg flex-col items-center gap-1.5 overflow-hidden">
        <AnimatePresence mode="popLayout" initial={false}>
          {recent.map((a) => (
            <motion.div
              key={a.id}
              layout
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -14 }}
              className="max-w-full truncate font-mono text-xs text-slate-500"
            >
              {a.title}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  )
}

export function SectionTitle({ icon: Icon, title, count, right, className }: { icon: LucideIcon; title: string; count?: number; right?: ReactNode; className?: string }) {
  return (
    <div className={cn("mb-3 flex items-center gap-2", className)}>
      <Icon className="size-4 text-slate-400" />
      <h2 className="text-sm font-semibold text-white">{title}</h2>
      {count !== undefined && <span className="rounded-full bg-white/[0.06] px-2 text-xs text-slate-400">{count}</span>}
      <span className="flex-1" />
      {right}
    </div>
  )
}

export function Callout({ tone, icon: Icon, title, children, action }: { tone: "amber" | "rose" | "emerald" | "cyan"; icon: LucideIcon; title: string; children?: ReactNode; action?: ReactNode }) {
  const tones = {
    amber: "bg-amber-400/[0.06] ring-amber-400/20 text-amber-300",
    rose: "bg-rose-500/[0.06] ring-rose-400/20 text-rose-300",
    emerald: "bg-emerald-400/[0.06] ring-emerald-400/20 text-emerald-300",
    cyan: "bg-cyan-400/[0.06] ring-cyan-400/20 text-cyan-300",
  }
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className={cn("flex flex-wrap items-center gap-4 rounded-2xl p-4 ring-1", tones[tone])}>
      <Icon className="size-5 shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-white">{title}</div>
        {children && <div className="mt-0.5 text-sm text-slate-400">{children}</div>}
      </div>
      {action}
    </motion.div>
  )
}

export function Label({ children }: { children: ReactNode }) {
  return <div className="mt-3 mb-1.5 text-[10px] font-semibold tracking-[0.16em] text-slate-500 uppercase first:mt-0">{children}</div>
}

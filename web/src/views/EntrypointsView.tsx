import { ArrowRight, BadgeCheck, Container, Globe, Layers, Send, Waypoints, Workflow } from "lucide-react"
import { motion } from "motion/react"
import type { Batch } from "../../../src/shared/contracts"
import type { Activity } from "../../../src/shared/types"
import { Button, EmptyState, MethodBadge, Panel, Stat, StatusIcon } from "../components/ui"
import { api, type Snapshot } from "../lib/api"
import { cn } from "../lib/format"
import { BATCH_STEPS, batchProgress, hasOutput, isRunning, nextBatchPhase, phaseStatus } from "../lib/pipeline"
import { navigate } from "../lib/router"
import { batchIcon } from "../lib/tech"
import { Callout, PhaseAction, PhaseHeader, Working } from "./common"

export function EntrypointsView({ snapshot, activity }: { snapshot: Snapshot; activity: Activity[] }) {
  const entrypoints = snapshot.entrypoints
  const running = phaseStatus(snapshot, "entrypoints") === "running"
  const id = snapshot.project.id
  const http = entrypoints?.entrypoints.filter((e) => e.kind === "http").length ?? 0
  const other = (entrypoints?.entrypoints.length ?? 0) - http

  return (
    <div className="flex flex-col gap-8">
      <PhaseHeader
        icon={Waypoints}
        eyebrow="Step 2 · Discovery"
        title="Entry points"
        blurb="Every way the outside world triggers behavior, grouped into coherent batches. Each batch is dispatched and proven on its own."
        snapshot={snapshot}
        phase="entrypoints"
        action={<PhaseAction snapshot={snapshot} phase="entrypoints" label="Find entry points" />}
      />

      {!entrypoints && running && <Working activity={activity} phaseKey="entrypoints" title="Tracing routes, jobs and consumers" />}
      {!entrypoints && !running && (
        <EmptyState
          icon={Waypoints}
          title="No entry points yet"
          action={<PhaseAction snapshot={snapshot} phase="entrypoints" label="Find entry points" />}
        >
          {snapshot.discovery ? "Ready when you are." : "Map the architecture first — this step builds on it."}
        </EmptyState>
      )}

      {entrypoints && (
        <>
          {!snapshot.environment && (
            <Callout
              tone="amber"
              icon={Container}
              title="Prepare the legacy runtime"
              action={
                phaseStatus(snapshot, "environment") === "running" ? (
                  <Button size="sm" variant="outline" onClick={() => navigate(`/m/${id}/environment`)}>
                    <StatusIcon status="running" className="size-4" /> In progress
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="primary"
                    icon={<Container className="size-4" />}
                    onClick={async () => {
                      await api.run(id, "environment")
                      navigate(`/m/${id}/environment`)
                    }}
                  >
                    Containerize legacy
                  </Button>
                )
              }
            >
              Characterization tests run against the real legacy app. Containerize it once with its dependencies before dispatching batches.
            </Callout>
          )}

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="entry points" value={entrypoints.entrypoints.length} icon={Waypoints} tone="text-cyan-300" />
            <Stat label="HTTP routes" value={http} icon={Globe} tone="text-emerald-300" />
            <Stat label="jobs, consumers & others" value={other} icon={Workflow} tone="text-violet-300" />
            <Stat label="batches" value={entrypoints.batches.length} icon={Layers} tone="text-amber-300" />
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            {entrypoints.batches.map((batch, i) => (
              <BatchCard key={batch.id} snapshot={snapshot} batch={batch} index={i} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function BatchCard({ snapshot, batch, index }: { snapshot: Snapshot; batch: Batch; index: number }) {
  const id = snapshot.project.id
  const Icon = batchIcon(batch.icon)
  const progress = batchProgress(snapshot, batch.id)
  const next = nextBatchPhase(snapshot, batch.id)
  const running = isRunning(snapshot, batch.id)
  const lookup = new Map(snapshot.entrypoints?.entrypoints.map((e) => [e.id, e]))
  const items = batch.entrypoints.flatMap((e) => lookup.get(e) ?? [])
  const started = BATCH_STEPS.some((s) => hasOutput(snapshot, s.phase, batch.id))
  const open = () => navigate(`/m/${id}/batch/${batch.id}`)

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06, duration: 0.45 }}
      className={cn("glass group relative flex flex-col overflow-hidden rounded-2xl", progress.proven && "ring-1 ring-emerald-400/25")}
    >
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-400/40 to-transparent opacity-0 transition group-hover:opacity-100" />
      <div className="flex items-start gap-3 p-5 pb-3">
        <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-amber-400/15 to-cyan-400/15 ring-1 ring-white/10">
          <Icon className="size-5 text-white" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate font-semibold text-white">{batch.title}</h3>
            <span className="rounded-full bg-white/[0.06] px-2 text-xs text-slate-400">{items.length}</span>
          </div>
          <p className="mt-0.5 line-clamp-2 text-sm text-slate-400">{batch.rationale}</p>
        </div>
        {progress.proven && <BadgeCheck className="size-5 shrink-0 text-emerald-400" />}
      </div>

      <div className="px-5">
        <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.05]">
          <motion.div
            className={cn("h-full rounded-full", progress.proven ? "bg-emerald-400" : "bg-gradient-migrate")}
            initial={{ width: 0 }}
            animate={{ width: `${(progress.done / progress.total) * 100}%` }}
            transition={{ duration: 0.9, delay: 0.2 }}
          />
        </div>
      </div>

      <ul className="flex flex-col gap-0.5 px-3 py-3">
        {items.slice(0, 7).map((entry) => (
          <li key={entry.id} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-white/[0.03]">
            <MethodBadge method={entry.method} kind={entry.kind} />
            <span className="min-w-0 flex-1 truncate font-mono text-[12.5px] text-slate-200" title={entry.summary}>
              {entry.path || entry.name}
            </span>
            <span className="hidden truncate text-[10px] text-slate-600 md:block">
              {entry.file.split("/").pop()}
              {entry.line ? `:${entry.line}` : ""}
            </span>
          </li>
        ))}
        {items.length > 7 && <li className="px-2 py-1 text-xs text-slate-500">+{items.length - 7} more</li>}
      </ul>

      <div className="mt-auto flex items-center gap-2 border-t border-white/5 px-5 py-3">
        <span className="text-xs text-slate-500">
          {progress.proven ? "Proven identical to legacy" : running ? "Agent working on this batch" : `${progress.done} of ${progress.total} steps`}
        </span>
        <span className="flex-1" />
        {running ? (
          <Button size="sm" variant="outline" onClick={open}>
            <StatusIcon status="running" className="size-4" /> Watch
          </Button>
        ) : next && !started ? (
          <Button
            size="sm"
            variant="primary"
            icon={<Send className="size-3.5" />}
            onClick={async () => {
              await api.run(id, next, batch.id)
              open()
            }}
          >
            Dispatch batch
          </Button>
        ) : (
          <Button size="sm" variant="outline" icon={<ArrowRight className="size-3.5" />} onClick={open}>
            Open
          </Button>
        )}
      </div>
    </motion.div>
  )
}

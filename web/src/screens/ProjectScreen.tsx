import {
  BadgeCheck,
  Container,
  FlaskConical,
  FolderGit2,
  GitBranch,
  GitCompareArrows,
  type LucideIcon,
  Network,
  PanelRightClose,
  PanelRightOpen,
  Play,
  Rocket,
  ScrollText,
  Square,
  Waypoints,
} from "lucide-react"
import { AnimatePresence, motion } from "motion/react"
import { type ReactNode, useEffect, useState } from "react"
import type { EngineInfo, PhaseStatus, RuntimeStatus } from "../../../src/shared/types"
import { ActivityFeed } from "../components/ActivityFeed"
import { Logo, TechIcon } from "../components/brand"
import { ModelPicker } from "../components/ModelPicker"
import { Badge, Button, CountUp, StatusIcon } from "../components/ui"
import { api, type Snapshot } from "../lib/api"
import { cn } from "../lib/format"
import { batchProgress, hasOutput, isRunning, PROJECT_STEPS, phaseStatus, totals } from "../lib/pipeline"
import { useProject, useProjectStore } from "../lib/project"
import { navigate } from "../lib/router"
import { batchIcon, TARGET_LABEL, TARGET_TECH } from "../lib/tech"
import { BatchView } from "../views/BatchView"
import { DiscoverView } from "../views/DiscoverView"
import { EntrypointsView } from "../views/EntrypointsView"
import { EnvironmentView } from "../views/EnvironmentView"
import { RolloutView } from "../views/RolloutView"

const STEP_ICONS: Record<string, LucideIcon> = { discover: Network, entrypoints: Waypoints, environment: Container }

function defaultView(snapshot: Snapshot) {
  const latest = Object.entries(snapshot.state.phases)
    .filter(([, state]) => state.startedAt)
    .sort((a, b) => (b[1].startedAt ?? 0) - (a[1].startedAt ?? 0))[0]?.[0]
  if (!latest) return "discover"
  const [phase, batch] = latest.split(":")
  return batch ? `batch/${batch}` : phase
}

export function ProjectScreen({ id, view }: { id: string; view: string }) {
  const { snapshot, activity, connected, error } = useProject(id)
  const [engine, setEngine] = useState<EngineInfo>()
  const [feedOpen, setFeedOpen] = useState(true)

  useEffect(() => {
    api.engine().then(setEngine).catch(() => {})
  }, [])

  if (error) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 text-center">
        <Logo />
        <div className="text-lg text-white">This migration could not be opened</div>
        <div className="text-sm text-slate-400">{error}</div>
        <Button onClick={() => navigate("/")}>Back home</Button>
      </div>
    )
  }

  if (!snapshot || snapshot.project.id !== id) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4">
        <motion.div animate={{ scale: [1, 1.08, 1], opacity: [0.7, 1, 0.7] }} transition={{ duration: 1.6, repeat: Number.POSITIVE_INFINITY }}>
          <Logo size={44} word={false} />
        </motion.div>
        <div className="shimmer-text text-sm">Opening migration</div>
      </div>
    )
  }

  const current = view || defaultView(snapshot)

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="relative flex h-screen flex-col overflow-hidden bg-ink-950"
    >
      <div className="grid-backdrop pointer-events-none absolute inset-0 opacity-50 [mask-image:linear-gradient(to_bottom,black,transparent_35%)]" />
      <div className="pointer-events-none absolute -top-40 left-1/3 size-[500px] rounded-full bg-cyan-500/[0.06] blur-[120px]" />
      <TopBar snapshot={snapshot} engine={engine} connected={connected} feedOpen={feedOpen} onToggleFeed={() => setFeedOpen((o) => !o)} />
      <div className="relative flex min-h-0 flex-1">
        <PhaseRail snapshot={snapshot} current={current} />
        <main className="min-w-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-6xl px-8 py-8">
            <AnimatePresence mode="wait">
              <motion.div
                key={current}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.25, ease: "easeOut" }}
              >
                {renderView(current, snapshot, activity)}
              </motion.div>
            </AnimatePresence>
          </div>
        </main>
        <AnimatePresence initial={false}>
          {feedOpen && (
            <motion.aside
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 380, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ type: "spring", stiffness: 320, damping: 36 }}
              className="shrink-0 overflow-hidden border-l border-white/5 bg-ink-900/50 backdrop-blur"
            >
              <div className="h-full w-[380px]">
                <ActivityFeed items={activity} />
              </div>
            </motion.aside>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  )
}

function renderView(view: string, snapshot: Snapshot, activity: Snapshot["activity"]): ReactNode {
  if (view.startsWith("batch/")) {
    const batchId = view.slice("batch/".length)
    return <BatchView key={batchId} snapshot={snapshot} activity={activity} batchId={batchId} />
  }
  if (view === "entrypoints") return <EntrypointsView snapshot={snapshot} activity={activity} />
  if (view === "environment") return <EnvironmentView snapshot={snapshot} activity={activity} />
  if (view === "rollout") return <RolloutView snapshot={snapshot} />
  return <DiscoverView snapshot={snapshot} activity={activity} />
}

function TopBar({
  snapshot,
  engine,
  connected,
  feedOpen,
  onToggleFeed,
}: {
  snapshot: Snapshot
  engine?: EngineInfo
  connected: boolean
  feedOpen: boolean
  onToggleFeed: () => void
}) {
  const project = snapshot.project
  return (
    <header className="relative z-30 flex h-14 shrink-0 items-center gap-3 border-b border-white/5 bg-ink-950/70 px-4 backdrop-blur-xl">
      <button type="button" onClick={() => navigate("/")} className="cursor-pointer" title="Home">
        <Logo size={24} word={false} />
      </button>
      <div className="h-5 w-px bg-white/10" />
      <FolderGit2 className="size-4 text-amber-300" />
      <span className="font-semibold text-white">{project.name}</span>
      <Badge icon={GitBranch} className="hidden md:inline-flex">
        {project.branch}
      </Badge>
      <span className="hidden items-center gap-1.5 text-xs text-slate-500 lg:flex">
        to <TechIcon tech={TARGET_TECH[project.target] ?? project.target} size={14} />
        {TARGET_LABEL[project.target] ?? project.target}
      </span>
      <div className="flex-1" />
      <RuntimeControls snapshot={snapshot} />
      {engine?.ready && (
        <ModelPicker
          compact
          className="hidden w-64 xl:block"
          models={engine.models}
          value={project.model ?? engine.defaultModel}
          onChange={async (model) => {
            await api.update(project.id, { model })
            void useProjectStore.getState().refresh()
          }}
        />
      )}
      <span className="flex items-center gap-1.5 text-xs text-slate-500" title={connected ? "Receiving live updates" : "Reconnecting"}>
        <span className={cn("size-2 rounded-full", connected ? "bg-emerald-400 shadow-[0_0_8px_2px_rgba(52,211,153,0.45)]" : "bg-slate-600")} />
        {connected ? "Live" : "Offline"}
      </span>
      <Button
        variant="ghost"
        size="sm"
        onClick={onToggleFeed}
        title="Agent activity"
        icon={feedOpen ? <PanelRightClose className="size-4" /> : <PanelRightOpen className="size-4" />}
      />
    </header>
  )
}

const RUNTIME_DOT: Record<RuntimeStatus, string> = {
  up: "bg-emerald-400 shadow-[0_0_8px_2px_rgba(52,211,153,0.5)]",
  starting: "bg-cyan-300 animate-pulse",
  failed: "bg-rose-400",
  down: "bg-slate-600",
}

function RuntimeControls({ snapshot }: { snapshot: Snapshot }) {
  const [busy, setBusy] = useState(false)
  if (!snapshot.environment) return null
  const { runtime } = snapshot.state
  const project = snapshot.project
  const anyUp = runtime.legacy === "up" || runtime.v2 === "up"
  const chip = (label: string, status: RuntimeStatus, port: number, tone: string) => (
    <a
      href={status === "up" ? `http://127.0.0.1:${port}` : undefined}
      target="_blank"
      rel="noreferrer"
      title={`${label}: ${status} · port ${port}`}
      className={cn("flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs", status === "up" && "hover:bg-white/5")}
    >
      <span className={cn("size-2 rounded-full", RUNTIME_DOT[status])} />
      <span className={tone}>{label}</span>
    </a>
  )
  return (
    <div className="hidden items-center gap-0.5 rounded-xl bg-white/[0.03] p-0.5 ring-1 ring-white/[0.06] md:flex">
      {chip("legacy", runtime.legacy, project.ports.legacy, "text-amber-200")}
      {chip("v2", runtime.v2, project.ports.v2, "text-cyan-200")}
      <Button
        size="xs"
        variant="ghost"
        loading={busy}
        title={anyUp ? "Stop containers" : "Start containers"}
        icon={anyUp ? <Square className="size-3" /> : <Play className="size-3" />}
        onClick={async () => {
          setBusy(true)
          await api.runtime(project.id, anyUp ? "down" : "up").catch(() => {})
          setBusy(false)
        }}
      />
    </div>
  )
}

function railStatus(snapshot: Snapshot, phase: "discover" | "entrypoints" | "environment"): PhaseStatus {
  const status = phaseStatus(snapshot, phase)
  if (status === "running") return "running"
  if (hasOutput(snapshot, phase)) return "done"
  return status
}

function PhaseRail({ snapshot, current }: { snapshot: Snapshot; current: string }) {
  const go = (view: string) => navigate(`/m/${snapshot.project.id}/${view}`)
  const batches = snapshot.entrypoints?.batches ?? []
  const t = totals(snapshot)
  return (
    <nav className="relative z-10 flex w-72 shrink-0 flex-col gap-6 overflow-y-auto border-r border-white/5 bg-ink-950/40 px-3 py-5">
      <RailSection title="Discovery">
        {PROJECT_STEPS.map((step) => (
          <RailItem
            key={step.phase}
            icon={STEP_ICONS[step.phase]}
            label={step.label}
            sub={step.blurb}
            active={current === step.phase}
            status={railStatus(snapshot, step.phase)}
            onClick={() => go(step.phase)}
          />
        ))}
      </RailSection>

      {batches.length > 0 && (
        <RailSection title={`Batches · ${batches.length}`}>
          {batches.map((batch) => {
            const Icon = batchIcon(batch.icon)
            const progress = batchProgress(snapshot, batch.id)
            const running = isRunning(snapshot, batch.id)
            const active = current === `batch/${batch.id}`
            return (
              <button
                type="button"
                key={batch.id}
                onClick={() => go(`batch/${batch.id}`)}
                className="relative flex w-full cursor-pointer items-center gap-3 rounded-xl px-2.5 py-2 text-left"
              >
                {active && <motion.span layoutId="rail-active" className="absolute inset-0 rounded-xl bg-white/[0.06] ring-1 ring-white/10" />}
                <span className="relative grid size-8 shrink-0 place-items-center rounded-lg bg-white/[0.04]">
                  <Icon className="size-4 text-slate-300" />
                </span>
                <span className="relative min-w-0 flex-1">
                  <span className="block truncate text-sm text-slate-200">{batch.title}</span>
                  <span className="mt-1.5 block h-1 overflow-hidden rounded-full bg-white/[0.06]">
                    <motion.span
                      className={cn("block h-full rounded-full", progress.proven ? "bg-emerald-400" : "bg-gradient-migrate")}
                      initial={{ width: 0 }}
                      animate={{ width: `${(progress.done / progress.total) * 100}%` }}
                      transition={{ duration: 0.8 }}
                    />
                  </span>
                </span>
                <span className="relative">
                  {running ? (
                    <StatusIcon status="running" className="size-4" />
                  ) : progress.proven ? (
                    <BadgeCheck className="size-4 text-emerald-400" />
                  ) : (
                    <span className="font-mono text-[10px] text-slate-500">
                      {progress.done}/{progress.total}
                    </span>
                  )}
                </span>
              </button>
            )
          })}
        </RailSection>
      )}

      <RailSection title="Ship">
        <RailItem icon={Rocket} label="Phased rollout" sub="1% → 100%, safely" active={current === "rollout"} status="idle" onClick={() => go("rollout")} />
      </RailSection>

      <div className="mt-auto grid grid-cols-2 gap-2 px-1">
        <MiniStat icon={Waypoints} label="entry points" value={t.entrypoints} />
        <MiniStat icon={ScrollText} label="rules" value={t.rules} />
        <MiniStat icon={FlaskConical} label="tests" value={t.cases} />
        <MiniStat icon={GitCompareArrows} label="identical" value={t.matched} suffix={t.compared ? `/${t.compared}` : ""} />
      </div>
    </nav>
  )
}

function RailSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 px-2.5 text-[10px] font-semibold tracking-[0.18em] text-slate-600 uppercase">{title}</div>
      <div className="flex flex-col gap-0.5">{children}</div>
    </div>
  )
}

function RailItem({
  icon: Icon,
  label,
  sub,
  active,
  status,
  onClick,
}: {
  icon: LucideIcon
  label: string
  sub: string
  active: boolean
  status: PhaseStatus
  onClick: () => void
}) {
  return (
    <button type="button" onClick={onClick} className="relative flex w-full cursor-pointer items-center gap-3 rounded-xl px-2.5 py-2 text-left">
      {active && <motion.span layoutId="rail-active" className="absolute inset-0 rounded-xl bg-white/[0.06] ring-1 ring-white/10" />}
      <span className={cn("relative grid size-8 shrink-0 place-items-center rounded-lg", active ? "bg-cyan-400/10" : "bg-white/[0.04]")}>
        <Icon className={cn("size-4", active ? "text-cyan-300" : "text-slate-300")} />
      </span>
      <span className="relative min-w-0 flex-1">
        <span className="block text-sm text-slate-200">{label}</span>
        <span className="block truncate text-[11px] text-slate-500">{sub}</span>
      </span>
      {status !== "idle" && <StatusIcon status={status} className="relative size-4" />}
    </button>
  )
}

function MiniStat({ icon: Icon, label, value, suffix }: { icon: LucideIcon; label: string; value: number; suffix?: string }) {
  return (
    <div className="rounded-xl bg-white/[0.025] px-3 py-2 ring-1 ring-white/[0.05]">
      <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
        <Icon className="size-3" />
        {label}
      </div>
      <div className="font-semibold text-white tabular-nums">
        <CountUp value={value} />
        <span className="text-slate-500">{suffix}</span>
      </div>
    </div>
  )
}


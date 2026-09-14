import {
  BadgeCheck,
  Code2,
  Container,
  Crosshair,
  FlaskConical,
  FolderGit2,
  GitBranch,
  GitCompareArrows,
  History,
  Layers,
  LoaderCircle,
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
import { Fragment, type ReactNode, useEffect, useMemo, useRef, useState } from "react"
import { stackOf } from "../../../src/shared/stacks"
import type { EngineInfo, ModelRef, PhaseStatus, ProjectPhase, RuntimeStatus } from "../../../src/shared/types"
import { ActivityFeed } from "../components/ActivityFeed"
import { Logo } from "../components/brand"
import { CodeExplorer } from "../components/CodeExplorer"
import { EffortPicker } from "../components/EffortPicker"
import { LanguageSwitcher } from "../components/LanguageSwitcher"
import { ModelPicker } from "../components/ModelPicker"
import { ReplayBar, ReplayFinished } from "../components/ReplayBar"
import { StackLabel, stackTitle } from "../components/stack"
import { WorkspaceActions } from "../components/WorkspaceActions"
import { Badge, Button, CountUp, StatusIcon } from "../components/ui"
import { api, type Snapshot } from "../lib/api"
import { cn } from "../lib/format"
import { useI18n } from "../lib/i18n"
import type { Key } from "../lib/i18n-core"
import { batchProgress, canReplay, hasOutput, isRunning, PROJECT_STEPS, phaseStatus, totals } from "../lib/pipeline"
import { ReplayContext, useProject, useProjectStore, useReplayTicker } from "../lib/project"
import { frameAt, viewFor } from "../lib/replay"
import { navigate } from "../lib/router"
import { batchIcon } from "../lib/tech"
import { BatchView } from "../views/BatchView"
import { DiscoverView } from "../views/DiscoverView"
import { EntrypointsView } from "../views/EntrypointsView"
import { EnvironmentView } from "../views/EnvironmentView"
import { RolloutView } from "../views/RolloutView"
import { TargetView } from "../views/TargetView"

const STEP_ICONS: Record<ProjectPhase, LucideIcon> = { discover: Network, entrypoints: Waypoints, environment: Container }

function defaultView(snapshot: Snapshot) {
  const latest = Object.entries(snapshot.state.phases)
    .filter(([, state]) => state.startedAt)
    .sort((a, b) => (b[1].startedAt ?? 0) - (a[1].startedAt ?? 0))[0]?.[0]
  const view = latest ? viewFor(latest) : "discover"
  // Right after the architecture map, the next decision is where to migrate.
  return view === "discover" && snapshot.discovery && !snapshot.project.target ? "target" : view
}

export function ProjectScreen({ id, view }: { id: string; view: string }) {
  const { snapshot, activity, connected, error, replay, replayLoading } = useProject(id)
  useReplayTicker()
  const { t } = useI18n()
  const [engine, setEngine] = useState<EngineInfo>()
  const [feedOpen, setFeedOpen] = useState(true)
  const followed = useRef<string | undefined>(undefined)
  const replayRequested = useRef(false)

  useEffect(() => {
    api.engine().then(setEngine).catch(() => {})
  }, [])

  const frame = useMemo(
    () => (replay && snapshot ? frameAt(snapshot, replay.history, replay.clock, replay.position) : undefined),
    [replay, snapshot],
  )

  const beginReplay = async () => {
    followed.current = undefined
    const started = await useProjectStore.getState().startReplay()
    if (started) navigate(`/m/${id}/discover`)
    return started
  }

  // Opening /m/<id>/replay (from the migrations library) starts a replay straight away.
  useEffect(() => {
    if (view !== "replay" || !snapshot || snapshot.project.id !== id || replayRequested.current) return
    replayRequested.current = true
    void beginReplay().then((started) => {
      if (!started) navigate(`/m/${id}`)
    })
  }, [view, snapshot, id])

  // While a replay plays, the screen follows the phase being replayed.
  useEffect(() => {
    if (!frame?.current || replay?.status !== "playing" || followed.current === frame.current) return
    followed.current = frame.current
    navigate(`/m/${id}/${viewFor(frame.current)}`)
  }, [frame?.current, replay?.status, id])

  if (error) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 text-center">
        <Logo />
        <div className="text-lg text-white">{t("project.openError")}</div>
        <div className="text-sm text-slate-400">{error}</div>
        <Button onClick={() => navigate("/")}>{t("project.backHome")}</Button>
      </div>
    )
  }

  if (!snapshot || snapshot.project.id !== id) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4">
        <motion.div animate={{ scale: [1, 1.08, 1], opacity: [0.7, 1, 0.7] }} transition={{ duration: 1.6, repeat: Number.POSITIVE_INFINITY }}>
          <Logo size={44} word={false} />
        </motion.div>
        <div className="shimmer-text text-sm">{t("project.opening")}</div>
      </div>
    )
  }

  const shown = frame?.snapshot ?? snapshot
  const feed = frame?.snapshot.activity ?? activity
  const current = view && view !== "replay" ? view : defaultView(shown)
  const codeView = current === "code" || current.startsWith("code/")

  return (
    <ReplayContext.Provider value={{ active: Boolean(replay), realTime: frame?.realTime }}>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="relative flex h-screen flex-col overflow-hidden bg-ink-950">
        <div className="grid-backdrop pointer-events-none absolute inset-0 opacity-50 [mask-image:linear-gradient(to_bottom,black,transparent_35%)]" />
        <div className="pointer-events-none absolute -top-40 left-1/3 size-[500px] rounded-full bg-cyan-500/[0.06] blur-[120px]" />
        <TopBar
          snapshot={shown}
          codeView={codeView}
          engine={engine}
          connected={connected}
          replaying={Boolean(replay)}
          replayable={canReplay(snapshot)}
          replayLoading={replayLoading}
          onReplay={beginReplay}
          feedOpen={feedOpen}
          onToggleFeed={() => setFeedOpen((o) => !o)}
        />
        <div className="relative flex min-h-0 flex-1">
          {codeView ? (
            <main className="min-w-0 flex-1 p-3">
              <CodeExplorer
                key={current}
                projectId={id}
                activity={feed}
                initialPath={current.startsWith("code/") ? current.slice("code/".length) : undefined}
                className="h-full"
                onBack={() => navigate(`/m/${id}`)}
              />
            </main>
          ) : (
            <>
              <PhaseRail snapshot={shown} current={current} />
              <main className="min-w-0 flex-1 overflow-y-auto">
                <div className="mx-auto max-w-6xl px-8 py-8">
                  <motion.div key={current} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, ease: "easeOut" }}>
                    {renderView(current, shown, feed)}
                  </motion.div>
                </div>
              </main>
            </>
          )}
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
                  <ActivityFeed key={replay ? "replay" : "live"} items={feed} />
                </div>
              </motion.aside>
            )}
          </AnimatePresence>
        </div>
        <ReplayFinished snapshot={shown} />
      </motion.div>
    </ReplayContext.Provider>
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
  if (view === "target") return <TargetView snapshot={snapshot} />
  return <DiscoverView snapshot={snapshot} activity={activity} />
}

function TopBar({
  snapshot,
  codeView,
  engine,
  connected,
  replaying,
  replayable,
  replayLoading,
  onReplay,
  feedOpen,
  onToggleFeed,
}: {
  snapshot: Snapshot
  codeView: boolean
  engine?: EngineInfo
  connected: boolean
  replaying: boolean
  replayable: boolean
  replayLoading: boolean
  onReplay: () => void
  feedOpen: boolean
  onToggleFeed: () => void
}) {
  const { t } = useI18n()
  const project = snapshot.project
  const model = project.model ?? engine?.defaultModel
  const modelOption = engine?.models.find((m) => m.providerID === model?.providerID && m.modelID === model?.modelID)
  const saveModel = async (next: ModelRef) => {
    await api.update(project.id, { model: next })
    void useProjectStore.getState().refresh()
  }
  return (
    <header className="relative z-30 flex h-14 shrink-0 items-center gap-3 border-b border-white/5 bg-ink-950/70 px-4 backdrop-blur-xl">
      <button type="button" onClick={() => navigate("/")} className="cursor-pointer" title={t("project.backHome")}>
        <Logo size={24} word={false} />
      </button>
      <button
        type="button"
        onClick={() => navigate("/migrations")}
        title={t("project.allMigrations")}
        className="grid size-8 cursor-pointer place-items-center rounded-lg text-slate-400 hover:bg-white/5 hover:text-white"
      >
        <Layers className="size-4" />
      </button>
      <div className="h-5 w-px bg-white/10" />
      <FolderGit2 className="size-4 shrink-0 text-amber-300" />
      <span className="truncate font-semibold text-white">{project.name}</span>
      <Badge icon={GitBranch} className="hidden md:inline-flex">
        {project.branch}
      </Badge>
      <StackLabel project={project} className="hidden xl:flex" />
      <div className="flex-1" />
      {replaying ? (
        <ReplayBar />
      ) : (
        <>
          <Button
            size="sm"
            variant={codeView ? "subtle" : "outline"}
            icon={<Code2 className="size-3.5 text-cyan-300" />}
            onClick={() => navigate(codeView ? `/m/${project.id}` : `/m/${project.id}/code`)}
          >
            {t("code.open")}
          </Button>
          <WorkspaceActions project={project} />
          <Button
            size="sm"
            variant="outline"
            loading={replayLoading}
            disabled={!replayable}
            title={replayable ? t("replay.startHint") : t("replay.unavailable")}
            icon={<History className="size-3.5 text-rose-300" />}
            onClick={onReplay}
          >
            {t("replay.start")}
          </Button>
          <RuntimeControls snapshot={snapshot} />
          {engine?.ready && (
            <>
              <EffortPicker
                compact
                className="hidden w-36 2xl:block"
                variants={modelOption?.variants}
                value={model?.variant}
                onChange={(variant) =>
                  model && saveModel({ providerID: model.providerID, modelID: model.modelID, ...(variant ? { variant } : {}) })
                }
              />
              <ModelPicker
                compact
                className="hidden w-60 2xl:block"
                models={engine.models}
                value={model}
                onChange={(next) => {
                  const option = engine.models.find((m) => m.providerID === next.providerID && m.modelID === next.modelID)
                  // Keep the effort when the new model offers the same level.
                  const variant = model?.variant && option?.variants?.includes(model.variant) ? model.variant : undefined
                  return saveModel({ ...next, ...(variant ? { variant } : {}) })
                }}
              />
            </>
          )}
        </>
      )}
      <LanguageSwitcher className="hidden lg:flex" />
      <span className="hidden items-center gap-1.5 text-xs text-slate-500 md:flex" title={connected ? t("project.liveTitle") : t("project.reconnecting")}>
        <span className={cn("size-2 rounded-full", connected ? "bg-emerald-400 shadow-[0_0_8px_2px_rgba(52,211,153,0.45)]" : "bg-slate-600")} />
        {connected ? t("project.live") : t("project.offline")}
      </span>
      <Button
        variant="ghost"
        size="sm"
        onClick={onToggleFeed}
        title={t("project.activity")}
        icon={feedOpen ? <PanelRightClose className="size-4" /> : <PanelRightOpen className="size-4" />}
      />
      {replayLoading && (
        <div className="absolute top-16 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full bg-ink-850/95 px-4 py-2 text-sm ring-1 ring-white/10">
          <LoaderCircle className="size-4 animate-spin text-rose-300" />
          <span className="shimmer-text">{t("replay.preparing")}</span>
        </div>
      )}
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
  const { t } = useI18n()
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
      title={`${label}: ${t(`runtime.${status}` as Key)} · ${port}`}
      className={cn("flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs", status === "up" && "hover:bg-white/5")}
    >
      <span className={cn("size-2 rounded-full", RUNTIME_DOT[status])} />
      <span className={tone}>{label}</span>
    </a>
  )
  return (
    <div className="hidden items-center gap-0.5 rounded-xl bg-white/[0.03] p-0.5 ring-1 ring-white/[0.06] md:flex">
      {chip(t("common.legacy"), runtime.legacy, project.ports.legacy, "text-amber-200")}
      {chip(t("common.v2"), runtime.v2, project.ports.v2, "text-cyan-200")}
      <Button
        size="xs"
        variant="ghost"
        loading={busy}
        title={anyUp ? t("project.stopContainers") : t("project.startContainers")}
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

function railStatus(snapshot: Snapshot, phase: ProjectPhase): PhaseStatus {
  const status = phaseStatus(snapshot, phase)
  if (status === "running") return "running"
  if (hasOutput(snapshot, phase)) return "done"
  return status
}

function PhaseRail({ snapshot, current }: { snapshot: Snapshot; current: string }) {
  const { t, l } = useI18n()
  const go = (view: string) => navigate(`/m/${snapshot.project.id}/${view}`)
  const batches = snapshot.entrypoints?.batches ?? []
  const numbers = totals(snapshot)
  const target = stackOf(snapshot.project)
  return (
    <nav className="relative z-10 flex w-72 shrink-0 flex-col gap-6 overflow-y-auto border-r border-white/5 bg-ink-950/40 px-3 py-5">
      <RailSection title={t("rail.discovery")}>
        {PROJECT_STEPS.map((phase) => (
          <Fragment key={phase}>
            <RailItem
              icon={STEP_ICONS[phase]}
              label={t(`phase.${phase}`)}
              sub={t(`phase.${phase}.blurb` as Key)}
              active={current === phase}
              status={railStatus(snapshot, phase)}
              onClick={() => go(phase)}
            />
            {phase === "discover" && (
              <RailItem
                icon={Crosshair}
                label={t("phase.target")}
                sub={target ? `${stackTitle(target)} · ${target.name}` : t("phase.target.blurb")}
                active={current === "target"}
                status={target ? "done" : "idle"}
                attention={Boolean(snapshot.discovery && !target)}
                onClick={() => go("target")}
              />
            )}
          </Fragment>
        ))}
      </RailSection>

      <AnimatePresence>
        {batches.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
            <RailSection title={t("rail.batches", { count: batches.length })}>
              {batches.map((batch) => {
                const Icon = batchIcon(batch.icon)
                const progress = batchProgress(snapshot, batch.id)
                const running = isRunning(snapshot, batch.id)
                const active = current === `batch/${batch.id}`
                return (
                  <button type="button" key={batch.id} onClick={() => go(`batch/${batch.id}`)} className="relative flex w-full cursor-pointer items-center gap-3 rounded-xl px-2.5 py-2 text-left">
                    {active && <motion.span layoutId="rail-active" className="absolute inset-0 rounded-xl bg-white/[0.06] ring-1 ring-white/10" />}
                    <span className="relative grid size-8 shrink-0 place-items-center rounded-lg bg-white/[0.04]">
                      <Icon className="size-4 text-slate-300" />
                    </span>
                    <span className="relative min-w-0 flex-1">
                      <span className="block truncate text-sm text-slate-200">{l(batch.title)}</span>
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
          </motion.div>
        )}
      </AnimatePresence>

      <RailSection title={t("rail.ship")}>
        <RailItem icon={Rocket} label={t("rail.rollout")} sub={t("rail.rolloutBlurb")} active={current === "rollout"} status="idle" onClick={() => go("rollout")} />
      </RailSection>

      <div className="mt-auto grid grid-cols-2 gap-2 px-1">
        <MiniStat icon={Waypoints} label={t("stat.entrypoints")} value={numbers.entrypoints} />
        <MiniStat icon={ScrollText} label={t("stat.rules")} value={numbers.rules} />
        <MiniStat icon={FlaskConical} label={t("stat.tests")} value={numbers.cases} />
        <MiniStat icon={GitCompareArrows} label={t("stat.identical")} value={numbers.matched} suffix={numbers.compared ? `/${numbers.compared}` : ""} />
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
  attention,
  onClick,
}: {
  icon: LucideIcon
  label: string
  sub: string
  active: boolean
  status: PhaseStatus
  attention?: boolean
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
      {attention && (
        <span className="relative grid size-4 place-items-center">
          <span className="absolute size-3 animate-ping-slow rounded-full bg-cyan-300/40" />
          <span className="size-2 rounded-full bg-cyan-300" />
        </span>
      )}
    </button>
  )
}

function MiniStat({ icon: Icon, label, value, suffix }: { icon: LucideIcon; label: string; value: number; suffix?: string }) {
  return (
    <div className="rounded-xl bg-white/[0.025] px-3 py-2 ring-1 ring-white/[0.05]">
      <div className="flex items-center gap-1.5 truncate text-[10px] text-slate-500">
        <Icon className="size-3 shrink-0" />
        {label}
      </div>
      <div className="font-semibold text-white tabular-nums">
        <CountUp value={value} />
        <span className="text-slate-500">{suffix}</span>
      </div>
    </div>
  )
}

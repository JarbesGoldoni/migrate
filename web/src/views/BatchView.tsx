import {
  ArrowLeft,
  ArrowRight,
  ArrowRightLeft,
  BadgeCheck,
  ChevronDown,
  CircleCheck,
  CircleDashed,
  CircleX,
  Container,
  FileCode2,
  FlaskConical,
  GitCompareArrows,
  Info,
  Layers,
  type LucideIcon,
  Rocket,
  ScrollText,
  Send,
  Server,
  ShieldCheck,
  Square,
  TriangleAlert,
  Wrench,
} from "lucide-react"
import { AnimatePresence, motion } from "motion/react"
import { Fragment, useEffect, useRef, useState } from "react"
import type { Localized, Rule, TestCase } from "../../../src/shared/contracts"
import type { Activity, BatchPhase, BuildStep, HttpResult, LegacyCaseRun, ParityCase } from "../../../src/shared/types"
import { CodeExplorer } from "../components/CodeExplorer"
import { CodeView, CommandBlock, JsonView } from "../components/Code"
import { Select } from "../components/Select"
import { Badge, Button, EmptyState, MethodBadge, Panel, ProgressRing, Spinner, Stat, Tabs } from "../components/ui"
import { api, type PlaygroundResult, type Snapshot } from "../lib/api"
import { curlFor } from "../lib/curl"
import { cn, statusTone } from "../lib/format"
import { useI18n } from "../lib/i18n"
import type { Key } from "../lib/i18n-core"
import { BATCH_STEPS, batchProgress, hasOutput, nextBatchPhase, phaseStatus } from "../lib/pipeline"
import { useReplayView } from "../lib/project"
import { serverText } from "../lib/server-text"
import { RichText } from "../components/RichText"
import { navigate } from "../lib/router"
import { batchIcon, RULE_KINDS } from "../lib/tech"
import { Callout, Label, PhaseAction, Working } from "./common"
import { FixList } from "./FixList"

type TabId = "rules" | "tests" | "port" | "parity" | "playground"

const TAB_FOR_PHASE: Record<BatchPhase, TabId> = {
  rules: "rules",
  tests: "tests",
  legacy: "tests",
  port: "port",
  parity: "parity",
  reconcile: "parity",
  verify: "tests",
}

const STEP_ICONS: Record<BatchPhase, LucideIcon> = {
  rules: ScrollText,
  tests: FlaskConical,
  verify: ShieldCheck,
  legacy: Server,
  port: ArrowRightLeft,
  parity: GitCompareArrows,
  reconcile: Wrench,
}

const stepLabel = (phase: BatchPhase): Key => `phase.${phase}`
const stepBlurb = (phase: BatchPhase) => `phase.${phase}.blurb` as Key

function initialTab(snapshot: Snapshot, batchId: string): TabId {
  const running = BATCH_STEPS.find((phase) => phaseStatus(snapshot, phase, batchId) === "running")
  if (running) return TAB_FOR_PHASE[running]
  const done = [...BATCH_STEPS].reverse().find((phase) => hasOutput(snapshot, phase, batchId))
  return done ? TAB_FOR_PHASE[done] : "rules"
}

export function BatchView({ snapshot, activity, batchId }: { snapshot: Snapshot; activity: Activity[]; batchId: string }) {
  const { t, l } = useI18n()
  const id = snapshot.project.id
  const batch = snapshot.entrypoints?.batches.find((b) => b.id === batchId)
  const runningStep = BATCH_STEPS.find((phase) => phaseStatus(snapshot, phase, batchId) === "running")
  const [tab, setTab] = useState<TabId>(() => initialTab(snapshot, batchId))
  const lastRunning = useRef(runningStep)

  useEffect(() => {
    if (runningStep && runningStep !== lastRunning.current) setTab(TAB_FOR_PHASE[runningStep])
    lastRunning.current = runningStep
  }, [runningStep])

  if (!batch) return <EmptyState icon={Layers} title={t("batch.label")} />

  const Icon = batchIcon(batch.icon)
  const progress = batchProgress(snapshot, batchId)
  const next = nextBatchPhase(snapshot, batchId)
  const lookup = new Map(snapshot.entrypoints?.entrypoints.map((e) => [e.id, e]))
  const entries = batch.entrypoints.flatMap((e) => lookup.get(e) ?? [])
  const rules = snapshot.rules[batchId]
  const tests = snapshot.tests[batchId]
  const parity = snapshot.parity[batchId]
  const ruleCount = rules?.entrypoints.reduce((n, e) => n + e.rules.length, 0) ?? 0
  const count = (n: number) => <span className="rounded-full bg-white/10 px-1.5 text-[10px] text-slate-300">{n}</span>

  return (
    <div className="flex flex-col gap-6">
      <button
        type="button"
        onClick={() => navigate(`/m/${id}/entrypoints`)}
        className="flex w-fit cursor-pointer items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300"
      >
        <ArrowLeft className="size-3.5" /> {t("batch.all")}
      </button>

      <div className="flex flex-wrap items-start gap-4">
        <div className="grid size-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-amber-400/20 to-cyan-400/20 ring-1 ring-white/10">
          <Icon className="size-7 text-white" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-semibold tracking-[0.18em] text-slate-500 uppercase">{t("batch.label")}</div>
          <h1 className="text-2xl font-semibold tracking-tight text-white">{l(batch.title)}</h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-400">{l(batch.rationale)}</p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {entries.map((entry) => (
              <span key={entry.id} className="flex items-center gap-1.5 rounded-lg bg-white/[0.03] py-1 pr-2 pl-1 ring-1 ring-white/[0.06]">
                <MethodBadge method={entry.method} kind={entry.kind} className="w-auto px-1.5" />
                <span className="font-mono text-xs text-slate-300">{entry.path || l(entry.name)}</span>
              </span>
            ))}
          </div>
        </div>
        {progress.proven && (
          <Badge tone="emerald" icon={BadgeCheck}>
            {t("batch.provenBadge")}
          </Badge>
        )}
      </div>

      <Panel className="px-4 py-5">
        <Stepper snapshot={snapshot} batchId={batchId} next={next} onSelect={setTab} />
      </Panel>

      <NextBar snapshot={snapshot} batchId={batchId} next={next} runningStep={runningStep} />

      <Tabs
        value={tab}
        onChange={setTab}
        className="w-fit"
        tabs={[
          { id: "rules", label: t("tab.rules"), icon: ScrollText, badge: ruleCount ? count(ruleCount) : undefined },
          { id: "tests", label: t("tab.tests"), icon: FlaskConical, badge: tests ? count(tests.cases.length) : undefined },
          { id: "port", label: t("tab.port"), icon: ArrowRightLeft },
          {
            id: "parity",
            label: t("tab.parity"),
            icon: GitCompareArrows,
            badge: parity ? (
              <span
                className={cn(
                  "rounded-full px-1.5 text-[10px]",
                  parity.matched === parity.total ? "bg-emerald-400/15 text-emerald-300" : "bg-rose-400/15 text-rose-300",
                )}
              >
                {parity.matched}/{parity.total}
              </span>
            ) : undefined,
          },
          { id: "playground", label: t("tab.playground"), icon: Send },
        ]}
      />

      <motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
        {tab === "rules" && <RulesTab snapshot={snapshot} batchId={batchId} activity={activity} />}
        {tab === "tests" && <TestsTab snapshot={snapshot} batchId={batchId} activity={activity} />}
        {tab === "port" && <PortTab snapshot={snapshot} batchId={batchId} activity={activity} />}
        {tab === "parity" && <ParityTab snapshot={snapshot} batchId={batchId} activity={activity} />}
        {tab === "playground" && <PlaygroundTab snapshot={snapshot} batchId={batchId} />}
      </motion.div>
    </div>
  )
}

function Stepper({ snapshot, batchId, next, onSelect }: { snapshot: Snapshot; batchId: string; next?: BatchPhase; onSelect: (tab: TabId) => void }) {
  const { t, l } = useI18n()
  const parity = snapshot.parity[batchId]
  return (
    // Horizontal scrolling clips vertically too, so leave room for the running ring and the pulse.
    <div className="-my-2 flex items-start overflow-x-auto px-1 py-2">
      {BATCH_STEPS.map((phase, i) => {
        const status = phaseStatus(snapshot, phase, batchId)
        const done = hasOutput(snapshot, phase, batchId)
        const notNeeded = phase === "reconcile" && !done && parity && parity.total > 0 && parity.matched === parity.total
        const visual =
          status === "running" ? "running" : done || notNeeded ? "done" : status === "failed" ? "failed" : next === phase ? "next" : "idle"
        const Icon = STEP_ICONS[phase]
        return (
          <Fragment key={phase}>
            <button type="button" onClick={() => onSelect(TAB_FOR_PHASE[phase])} className="flex w-28 shrink-0 cursor-pointer flex-col items-center gap-2 text-center">
              <div
                className={cn(
                  "relative grid size-12 place-items-center rounded-full ring-1 transition",
                  {
                    running: "bg-cyan-400/10 ring-cyan-400/50",
                    done: "bg-emerald-400/10 ring-emerald-400/40",
                    failed: "bg-rose-400/10 ring-rose-400/40",
                    next: "bg-white/[0.07] ring-white/30",
                    idle: "bg-white/[0.02] ring-white/10",
                  }[visual],
                )}
              >
                {visual === "running" && (
                  <motion.span
                    className="absolute -inset-1 rounded-full border-2 border-transparent border-t-cyan-300"
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Number.POSITIVE_INFINITY, ease: "linear" }}
                  />
                )}
                {visual === "next" && <span className="absolute inset-0 animate-ping-slow rounded-full ring-1 ring-white/30" />}
                <Icon
                  className={cn(
                    "size-5",
                    { running: "text-cyan-200", done: "text-emerald-300", failed: "text-rose-300", next: "text-white", idle: "text-slate-500" }[visual],
                  )}
                />
                {visual === "done" && <CircleCheck className="absolute -right-0.5 -bottom-0.5 size-4 rounded-full bg-ink-900 text-emerald-400" />}
              </div>
              <div className={cn("text-xs font-medium", visual === "idle" ? "text-slate-500" : "text-slate-200")}>{t(stepLabel(phase))}</div>
              {notNeeded && <div className="-mt-1.5 text-[10px] text-slate-500">{t("step.notNeeded")}</div>}
            </button>
            {i < BATCH_STEPS.length - 1 && (
              <div className="relative mt-6 h-0.5 min-w-6 flex-1 overflow-hidden rounded-full bg-white/[0.08]">
                <motion.div className="absolute inset-y-0 left-0 bg-gradient-migrate" initial={{ width: 0 }} animate={{ width: done ? "100%" : "0%" }} transition={{ duration: 0.8 }} />
              </div>
            )}
          </Fragment>
        )
      })}
    </div>
  )
}

function NextBar({ snapshot, batchId, next, runningStep }: { snapshot: Snapshot; batchId: string; next?: BatchPhase; runningStep?: BatchPhase }) {
  const { t, l } = useI18n()
  const { active: replaying } = useReplayView()
  const id = snapshot.project.id
  const [reason, setReason] = useState<string>()
  const [pending, setPending] = useState(false)

  if (runningStep) {
    return (
      <Panel className="flex items-center gap-3 px-4 py-3 ring-1 ring-cyan-400/20">
        <Spinner className="size-5 text-cyan-300" />
        <div className="flex-1">
          <div className="shimmer-text text-sm font-medium">{t("next.inProgress", { step: t(stepLabel(runningStep)) })}</div>
          <div className="text-xs text-slate-500">{t(stepBlurb(runningStep))}</div>
        </div>
        {!replaying && (
          <Button variant="danger" size="sm" icon={<Square className="size-3.5" />} onClick={() => api.stop(id, runningStep, batchId)}>
            {t("common.stop")}
          </Button>
        )}
      </Panel>
    )
  }

  if (!next) {
    return (
      <Callout
        tone="emerald"
        icon={BadgeCheck}
        title={t("next.doneTitle")}
        action={
          replaying ? undefined : (
            <Button size="sm" variant="outline" icon={<Rocket className="size-3.5" />} onClick={() => navigate(`/m/${id}/rollout`)}>
              {t("next.howShips")}
            </Button>
          )
        }
      >
        {t("next.doneText")}
      </Callout>
    )
  }

  if (replaying) return null

  if (next === "legacy" && !snapshot.environment) {
    return (
      <Callout
        tone="amber"
        icon={Container}
        title={t("next.containerizeTitle")}
        action={
          <Button
            size="sm"
            variant="primary"
            onClick={async () => {
              await api.run(id, "environment")
              navigate(`/m/${id}/environment`)
            }}
          >
            {t("entry.containerize")}
          </Button>
        }
      >
        {t("next.containerizeText")}
      </Callout>
    )
  }

  const StepIcon = STEP_ICONS[next]
  return (
    <Panel className="flex flex-wrap items-center gap-4 bg-gradient-to-r from-amber-400/[0.05] to-cyan-400/[0.06] px-4 py-3">
      <div className="grid size-9 place-items-center rounded-xl bg-white/[0.06]">
        <StepIcon className="size-4 text-white" />
      </div>
      <div className="flex-1">
        <div className="text-sm font-medium text-white">{t("next.label", { step: t(stepLabel(next)) })}</div>
        <div className="text-xs text-slate-400">{t(stepBlurb(next))}</div>
        {reason && <div className="text-xs text-amber-300">{serverText(reason, t)}</div>}
      </div>
      <Button
        variant="primary"
        size="sm"
        loading={pending}
        icon={<Send className="size-3.5" />}
        onClick={async () => {
          setPending(true)
          const result = await api.run(id, next, batchId).catch((e: Error) => ({ started: false, reason: e.message }))
          setPending(false)
          setReason(result.started ? undefined : result.reason)
        }}
      >
        {t("next.run", { step: t(stepLabel(next)) })}
      </Button>
    </Panel>
  )
}

// ── Rules ──────────────────────────────────────────────────────────────────

function RulesTab({ snapshot, batchId, activity }: { snapshot: Snapshot; batchId: string; activity: Activity[] }) {
  const { t, l } = useI18n()
  const rules = snapshot.rules[batchId]
  const id = snapshot.project.id
  const running = phaseStatus(snapshot, "rules", batchId) === "running"
  const lookup = new Map(snapshot.entrypoints?.entrypoints.map((e) => [e.id, e]))

  if (!rules) {
    return running ? (
      <Working activity={activity} phaseKey={`rules:${batchId}`} title={t("rules.working")} />
    ) : (
      <EmptyState icon={ScrollText} title={t("rules.emptyTitle")} action={<PhaseAction snapshot={snapshot} phase="rules" batch={batchId} label={t("rules.run")} />}>
        {t("rules.emptyText")}
      </EmptyState>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex justify-end">
        <PhaseAction snapshot={snapshot} phase="rules" batch={batchId} label={t("rules.run")} rerunLabel={t("rules.again")} />
      </div>
      {rules.entrypoints.map((ep, i) => {
        const entry = lookup.get(ep.entrypoint)
        return (
          <motion.section key={ep.entrypoint} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}>
            <Panel className="p-5">
              <div className="flex flex-wrap items-center gap-2.5">
                <MethodBadge method={entry?.method} kind={entry?.kind} />
                <span className="font-mono text-sm text-white">{entry?.path || (entry && l(entry.name)) || ep.entrypoint}</span>
                <Badge>{t("rules.count", { count: ep.rules.length })}</Badge>
              </div>
              {entry && l(entry.summary) && <p className="mt-1.5 text-sm text-slate-400"><RichText text={l(entry.summary)} /></p>}
              {ep.flow.length > 0 && <Flow flow={ep.flow} projectId={id} />}
              <div className="mt-5 grid gap-3 xl:grid-cols-2">
                {ep.rules.map((rule, j) => (
                  <RuleCard key={rule.id} rule={rule} index={j} projectId={id} />
                ))}
              </div>
            </Panel>
          </motion.section>
        )
      })}
    </div>
  )
}

function Flow({ flow, projectId }: { flow: Array<{ file: string; line: number; description: Localized }>; projectId: string }) {
  const { t, l } = useI18n()
  const [open, setOpen] = useState<number>()
  return (
    <div className="mt-5">
      <Label>{t("rules.callChain")}</Label>
      <ol className="flex flex-col">
        {flow.map((step, i) => (
          <motion.li
            key={`${step.file}-${i}`}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.05 }}
            className="relative flex gap-3 pb-3 last:pb-0"
          >
            {i < flow.length - 1 && <span className="absolute top-6 left-[11px] h-[calc(100%-12px)] w-px bg-gradient-to-b from-amber-400/40 to-cyan-400/20" />}
            <span className="relative z-10 grid size-6 shrink-0 place-items-center rounded-full bg-ink-800 font-mono text-[10px] text-amber-200 ring-1 ring-amber-400/30">
              {i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-sm text-slate-300"><RichText text={l(step.description)} /></div>
              {step.file && (
                <button
                  type="button"
                  onClick={() => setOpen(open === i ? undefined : i)}
                  className="mt-0.5 flex cursor-pointer items-center gap-1 font-mono text-[11px] text-slate-500 hover:text-amber-200"
                >
                  <FileCode2 className="size-3" />
                  {step.file}
                  {step.line ? `:${step.line}` : ""}
                </button>
              )}
              {open === i && step.file && (
                <CodeView projectId={projectId} path={step.file} start={step.line || undefined} end={step.line ? step.line + 5 : undefined} className="mt-2" />
              )}
            </div>
          </motion.li>
        ))}
      </ol>
    </div>
  )
}

function RuleCard({ rule, index, projectId }: { rule: Rule; index: number; projectId: string }) {
  const { t, l } = useI18n()
  const [open, setOpen] = useState(false)
  const meta = RULE_KINDS[rule.kind] ?? RULE_KINDS.other
  const KindIcon = meta.icon
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.05 }} className="flex flex-col rounded-xl bg-white/[0.025] p-4 ring-1 ring-white/[0.06]">
      <div className="flex items-start gap-3">
        <div className="grid size-8 shrink-0 place-items-center rounded-lg" style={{ background: `${meta.color}1f`, color: meta.color }} title={t(`ruleKind.${rule.kind}` as Key)}>
          <KindIcon className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2">
            <span className="font-medium text-white">{l(rule.title)}</span>
            <span className="font-mono text-[10px] text-slate-500">{rule.id}</span>
          </div>
          {l(rule.description) && <p className="mt-1 text-sm leading-relaxed text-slate-400"><RichText text={l(rule.description)} /></p>}
        </div>
      </div>
      {rule.decisions.length > 0 && (
        <div className="mt-3 overflow-hidden rounded-lg ring-1 ring-white/[0.06]">
          <div className="grid grid-cols-[1fr_16px_1fr] gap-2 bg-white/[0.03] px-3 py-1.5 text-[10px] tracking-wider text-slate-500 uppercase">
            <span>{t("rules.when")}</span>
            <span />
            <span>{t("rules.then")}</span>
          </div>
          {rule.decisions.map((decision) => (
            <div key={decision.id} className="grid grid-cols-[1fr_16px_1fr] items-start gap-2 border-t border-white/[0.04] px-3 py-2 text-[12.5px]">
              <span className="text-slate-300"><RichText text={l(decision.when)} /></span>
              <ArrowRight className="mt-0.5 size-3.5 text-slate-600" />
              <span className="font-mono text-[12px] break-words text-cyan-100">{l(decision.then)}</span>
            </div>
          ))}
        </div>
      )}
      {rule.file && (
        <button type="button" onClick={() => setOpen((o) => !o)} className="mt-3 flex w-fit cursor-pointer items-center gap-1.5 text-xs text-amber-300/90 hover:text-amber-200">
          <FileCode2 className="size-3.5" />
          {rule.file}
          {rule.lineStart ? `:${rule.lineStart}${rule.lineEnd > rule.lineStart ? `-${rule.lineEnd}` : ""}` : ""}
          <ChevronDown className={cn("size-3.5 transition", open && "rotate-180")} />
        </button>
      )}
      {open && rule.file && <CodeView projectId={projectId} path={rule.file} start={rule.lineStart || undefined} end={rule.lineEnd || undefined} className="mt-2" />}
    </motion.div>
  )
}

// ── Tests ──────────────────────────────────────────────────────────────────

function TestsTab({ snapshot, batchId, activity }: { snapshot: Snapshot; batchId: string; activity: Activity[] }) {
  const { t, l } = useI18n()
  const tests = snapshot.tests[batchId]
  const run = snapshot.legacyRuns[batchId]
  const running = phaseStatus(snapshot, "tests", batchId) === "running"
  const legacyRunning = phaseStatus(snapshot, "legacy", batchId) === "running"

  if (!tests) {
    return running ? (
      <Working activity={activity} phaseKey={`tests:${batchId}`} title={t("tests.working")} />
    ) : (
      <EmptyState icon={FlaskConical} title={t("tests.emptyTitle")} action={<PhaseAction snapshot={snapshot} phase="tests" batch={batchId} label={t("tests.run")} />}>
        {t("tests.emptyText")}
      </EmptyState>
    )
  }

  const results = new Map(run?.results.map((r) => [r.caseId, r]))
  const covered = new Set(tests.cases.flatMap((c) => c.rules)).size
  const predicted = run?.results.filter((r) => r.expectation.match).length ?? 0
  const mismatched = run && !run.error ? run.results.length - predicted : 0
  const verifying = phaseStatus(snapshot, "verify", batchId) === "running"
  const verify = snapshot.verify?.[batchId]
  const fixLabel = t("tests.fix", { count: mismatched })

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={t("stat.cases")} value={tests.cases.length} icon={FlaskConical} tone="text-cyan-300" />
        <Stat label={t("stat.rulesExercised")} value={covered} icon={ScrollText} tone="text-violet-300" />
        <Stat label={t("stat.recorded")} value={run?.results.length ?? 0} icon={Server} tone="text-amber-300" />
        <Stat label={t("stat.predicted")} value={predicted} icon={CircleCheck} tone="text-emerald-300" />
      </div>

      {run?.error && (
        <Callout tone="rose" icon={TriangleAlert} title={t("tests.noAnswerTitle")}>
          {t("tests.noAnswerText", { error: serverText(run.error, t) })}
        </Callout>
      )}

      <div className="flex flex-wrap items-center gap-3">
        {run && !run.error && (
          <Badge tone={mismatched ? "amber" : "emerald"} icon={mismatched ? Info : CircleCheck}>
            {t("tests.score", { agreed: predicted, total: run.results.length })}
          </Badge>
        )}
        <div className="min-w-0 flex-1 text-sm text-slate-400">{run ? t("tests.truth") : t("tests.notRun")}</div>
        <PhaseAction snapshot={snapshot} phase="legacy" batch={batchId} label={t("tests.runLegacy")} rerunLabel={t("tests.replayLegacy")} />
        {(mismatched > 0 || verifying) && (
          <PhaseAction snapshot={snapshot} phase="verify" batch={batchId} label={fixLabel} rerunLabel={fixLabel} forceVariant="primary" />
        )}
      </div>

      {verifying && (
        <div className="flex items-center gap-2 text-sm">
          <Spinner className="text-violet-300" />
          <span className="shimmer-text">{t("tests.fixing")}</span>
        </div>
      )}

      {legacyRunning && (
        <div className="flex items-center gap-2 text-sm">
          <Spinner className="text-amber-300" />
          <span className="shimmer-text">{t("tests.replaying")}</span>
        </div>
      )}

      {verify && (verify.fixes.length > 0 || verify.notes.length > 0) && (
        <FixList kind="verify" fixes={verify.fixes} notes={verify.notes} tests={tests} projectId={snapshot.project.id} />
      )}

      <div className="flex flex-col gap-2">
        {tests.cases.map((testCase, i) => (
          <CaseRow key={testCase.id} testCase={testCase} result={results.get(testCase.id)} index={i} baseUrl={`http://127.0.0.1:${snapshot.project.ports.legacy}`} />
        ))}
      </div>
    </div>
  )
}

function CaseRow({ testCase, result, index, baseUrl }: { testCase: TestCase; result?: LegacyCaseRun; index: number; baseUrl: string }) {
  const { t, l } = useI18n()
  const [open, setOpen] = useState(false)
  const query = new URLSearchParams(testCase.request.query).toString()
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(index, 14) * 0.03 }} className="overflow-hidden rounded-xl bg-white/[0.025] ring-1 ring-white/[0.06]">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left">
        <MethodBadge method={testCase.request.method} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm text-white">{l(testCase.title)}</div>
          <div className="truncate font-mono text-[11px] text-slate-500">
            {testCase.request.path}
            {query ? `?${query}` : ""}
          </div>
        </div>
        {testCase.branch && <span className="hidden max-w-40 truncate font-mono text-[10px] text-violet-300/80 lg:inline">{testCase.branch}</span>}
        <span className="hidden font-mono text-xs text-slate-500 sm:inline">{t("case.expects", { status: testCase.expect.status })}</span>
        {result ? (
          <span
            className={cn(
              "flex items-center gap-1 rounded-md px-2 py-0.5 font-mono text-xs",
              result.response.error ? "bg-rose-400/10 text-rose-300" : result.expectation.match ? "bg-emerald-400/10 text-emerald-300" : "bg-amber-400/10 text-amber-300",
            )}
            title={result.expectation.match ? t("case.asPredicted") : t("case.differs")}
          >
            {result.expectation.match ? <CircleCheck className="size-3.5" /> : <Info className="size-3.5" />}
            {t("common.legacy")} {result.response.error ? "—" : result.response.status}
          </span>
        ) : (
          <span className="text-xs text-slate-600">{t("case.notRun")}</span>
        )}
        <ChevronDown className={cn("size-4 text-slate-500 transition", open && "rotate-180")} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }} className="overflow-hidden">
            <div className="grid gap-4 border-t border-white/5 p-4 lg:grid-cols-2">
              <div className="min-w-0">
                <Label>{t("case.curl")}</Label>
                <CommandBlock command={curlFor(testCase, baseUrl)} />
                {testCase.rules.length > 0 && (
                  <>
                    <Label>{t("case.exercises")}</Label>
                    <div className="flex flex-wrap gap-1">
                      {testCase.rules.map((r) => (
                        <span key={r} className="rounded-md bg-violet-400/10 px-1.5 py-0.5 font-mono text-[10px] text-violet-200">
                          {r}
                        </span>
                      ))}
                    </div>
                  </>
                )}
              </div>
              <div className="min-w-0">
                <Label>{t("case.predicted", { status: testCase.expect.status, match: testCase.expect.match })}</Label>
                <div className="rounded-xl bg-black/30 ring-1 ring-white/[0.06]">
                  <JsonView value={testCase.expect.body ?? undefined} empty={t("case.statusOnly")} />
                </div>
                {result && (
                  <>
                    <Label>
                      {t("case.legacyAnswered", { status: result.response.error ?? `HTTP ${result.response.status}`, ms: result.response.durationMs })}
                    </Label>
                    <div className="rounded-xl bg-black/30 ring-1 ring-amber-400/15">
                      <JsonView value={result.response.body} diffPaths={result.expectation.diffs.map((d) => d.path)} className="max-h-80" />
                    </div>
                  </>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

// ── Port ───────────────────────────────────────────────────────────────────

function PortTab({ snapshot, batchId, activity }: { snapshot: Snapshot; batchId: string; activity: Activity[] }) {
  const { t, l } = useI18n()
  const port = snapshot.ports[batchId]
  const build = snapshot.builds[batchId]
  const id = snapshot.project.id
  const running = phaseStatus(snapshot, "port", batchId) === "running"
  const [focus, setFocus] = useState<string>()
  const explorer = useRef<HTMLDivElement>(null)

  const show = (file: string) => {
    setFocus(file)
    explorer.current?.scrollIntoView({ behavior: "smooth", block: "start" })
  }

  if (!port) {
    return running ? (
      <Working activity={activity} phaseKey={`port:${batchId}`} title={t("port.working")} />
    ) : (
      <EmptyState icon={ArrowRightLeft} title={t("port.emptyTitle")} action={<PhaseAction snapshot={snapshot} phase="port" batch={batchId} label={t("port.run")} />}>
        {t("port.emptyText")}
      </EmptyState>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
        <Panel className="h-fit p-4">
          <Label>{t("port.build")}</Label>
          {build ? build.steps.map((step) => <BuildStepRow key={step.name} step={step} />) : <div className="text-sm text-slate-500">{t("port.notBuilt")}</div>}
        </Panel>
        <div className="flex min-w-0 flex-col gap-4">
          <Panel className="p-5">
            <Label>{t("port.routes")}</Label>
            {port.routes.length === 0 && <div className="text-sm text-slate-500">{t("port.noRoutes")}</div>}
            {port.routes.map((route) => (
              <div key={`${route.method}-${route.path}`} className="flex items-center gap-2 border-b border-white/[0.04] py-2 last:border-0">
                <MethodBadge method={route.method} />
                <span className="font-mono text-sm text-white">{route.path}</span>
                <span className="ml-auto truncate font-mono text-xs text-cyan-300/80">{route.handler}</span>
              </div>
            ))}
          </Panel>
          <Panel className="p-5">
            <Label>{t("port.mapping")}</Label>
            {port.mapping.length === 0 && <div className="text-sm text-slate-500">{t("port.noMapping")}</div>}
            {port.mapping.map((m) => (
              <button
                type="button"
                key={`${m.rule}-${m.function}`}
                onClick={() => m.file && show(m.file)}
                className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-white/[0.03]"
              >
                <span className="font-mono text-xs text-amber-200">{m.rule}</span>
                <ArrowRight className="size-3.5 shrink-0 text-slate-600" />
                <span className="font-mono text-xs text-cyan-200">{m.function}</span>
                <span className="ml-auto truncate font-mono text-[10px] text-slate-500">{m.file}</span>
              </button>
            ))}
          </Panel>
          {port.notes.length > 0 && (
            <Panel className="p-5">
              <Label>{t("port.notes")}</Label>
              <ul className="flex flex-col gap-1.5">
                {port.notes.map((note) => (
                  <li key={note.en} className="flex gap-2 text-sm text-slate-300">
                    <Info className="mt-0.5 size-4 shrink-0 text-slate-500" />
                    <RichText text={l(note)} />
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </div>
      </div>
      <div ref={explorer} className="scroll-mt-4">
        <Label>{t("port.files")}</Label>
        <CodeExplorer projectId={id} activity={activity} roots={["v2", "legacy"]} focusPath={focus} className="h-[640px]" />
      </div>
    </div>
  )
}

function BuildStepRow({ step }: { step: BuildStep }) {
  const { t } = useI18n()
  const [open, setOpen] = useState(!step.ok && !step.skipped)
  return (
    <div className="border-b border-white/[0.04] py-1.5 last:border-0">
      <button type="button" onClick={() => step.output && setOpen((o) => !o)} className="flex w-full cursor-pointer items-center gap-2 text-left text-sm">
        {step.skipped ? <CircleDashed className="size-4 text-slate-500" /> : step.ok ? <CircleCheck className="size-4 text-emerald-400" /> : <CircleX className="size-4 text-rose-400" />}
        <span className="flex-1 text-slate-200">{serverText(step.name, t)}</span>
        {step.skipped && <span className="text-[10px] text-slate-500">{t("common.skipped")}</span>}
        {step.output && <ChevronDown className={cn("size-3.5 text-slate-500 transition", open && "rotate-180")} />}
      </button>
      {open && step.output && <pre className="mt-1.5 max-h-60 overflow-auto rounded-lg bg-black/40 p-2 font-mono text-[10.5px] whitespace-pre-wrap text-slate-400">{serverText(step.output, t)}</pre>}
    </div>
  )
}

// ── Parity ─────────────────────────────────────────────────────────────────

function ParityTab({ snapshot, batchId, activity }: { snapshot: Snapshot; batchId: string; activity: Activity[] }) {
  const { t, ago, l } = useI18n()
  const { active: replaying } = useReplayView()
  const parity = snapshot.parity[batchId]
  const tests = snapshot.tests[batchId]
  const reconcile = snapshot.reconcile[batchId]
  const running = phaseStatus(snapshot, "parity", batchId) === "running"
  const reconciling = phaseStatus(snapshot, "reconcile", batchId) === "running"
  const ports = snapshot.project.ports

  if (!parity) {
    return running ? (
      <Working activity={activity} phaseKey={`parity:${batchId}`} title={t("parity.working")} />
    ) : (
      <EmptyState icon={GitCompareArrows} title={t("parity.emptyTitle")} action={<PhaseAction snapshot={snapshot} phase="parity" batch={batchId} label={t("parity.run")} />}>
        {t("parity.emptyText")}
      </EmptyState>
    )
  }

  const cases = new Map(tests?.cases.map((c) => [c.id, c]))
  const ordered = [...parity.results].sort((a, b) => Number(a.comparison.match) - Number(b.comparison.match))
  const all = parity.total > 0 && parity.matched === parity.total
  const differing = parity.total - parity.matched

  return (
    <div className="flex flex-col gap-5">
      <Panel className={cn("relative flex flex-wrap items-center gap-6 overflow-hidden p-6", all && "ring-1 ring-emerald-400/30")}>
        {all && (
          <motion.div className="pointer-events-none absolute inset-0 bg-emerald-400/[0.05]" animate={{ opacity: [0.4, 1, 0.4] }} transition={{ duration: 3, repeat: Number.POSITIVE_INFINITY }} />
        )}
        <ProgressRing value={parity.matched} total={parity.total} label={t("parity.identical")} />
        <div className="relative min-w-0 flex-1">
          <div className="text-xl font-semibold text-white">
            {all ? t("parity.allIdentical") : differing === 1 ? t("parity.differOne") : t("parity.differMany", { count: differing })}
          </div>
          {!replaying && <div className="mt-1 text-sm text-slate-400">{t("parity.subtitle", { ago: ago(parity.at) })}</div>}
          <div className="mt-3 flex flex-wrap gap-2">
            <Badge tone="amber">
              {t("common.legacy")} · 127.0.0.1:{ports.legacy}
            </Badge>
            <Badge tone="cyan">
              {t("common.v2")} · 127.0.0.1:{ports.v2}
            </Badge>
          </div>
        </div>
        <div className="relative flex flex-col items-end gap-2">
          {!all && <PhaseAction snapshot={snapshot} phase="reconcile" batch={batchId} label={t("parity.reconcile")} rerunLabel={t("parity.reconcileAgain")} forceVariant="primary" />}
          <PhaseAction snapshot={snapshot} phase="parity" batch={batchId} label={t("parity.run")} rerunLabel={t("parity.again")} forceVariant="outline" />
        </div>
      </Panel>

      {parity.error && (
        <Callout tone="rose" icon={TriangleAlert} title={t("parity.notAnswered")}>
          {serverText(parity.error, t)}
        </Callout>
      )}

      {reconciling && (
        <div className="flex items-center gap-2 text-sm">
          <Spinner className="text-violet-300" />
          <span className="shimmer-text">{t("parity.reconciling")}</span>
        </div>
      )}

      {reconcile && (reconcile.fixes.length > 0 || reconcile.notes.length > 0) && (
        <FixList kind="reconcile" fixes={reconcile.fixes} notes={reconcile.notes} tests={tests} projectId={snapshot.project.id} />
      )}

      <div className="flex flex-col gap-2">
        {ordered.map((result, i) => (
          <ParityRow key={result.caseId} result={result} testCase={cases.get(result.caseId)} index={i} />
        ))}
      </div>
    </div>
  )
}

const short = (value: unknown) => {
  if (value === undefined) return "—"
  const text = JSON.stringify(value) ?? String(value)
  return text.length > 90 ? `${text.slice(0, 89)}…` : text
}

function ParityRow({ result, testCase, index }: { result: ParityCase; testCase?: TestCase; index: number }) {
  const { t, l } = useI18n()
  const match = result.comparison.match
  const [open, setOpen] = useState(!match && index === 0)
  const diffPaths = result.comparison.diffs.map((d) => d.path)
  const method = testCase?.request.method ?? "GET"
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index, 14) * 0.03 }}
      className={cn("overflow-hidden rounded-xl ring-1", match ? "bg-white/[0.02] ring-white/[0.06]" : "bg-rose-500/[0.035] ring-rose-400/20")}
    >
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left">
        {match ? <CircleCheck className="size-5 shrink-0 text-emerald-400" /> : <CircleX className="size-5 shrink-0 text-rose-400" />}
        <MethodBadge method={method} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm text-white">{testCase ? l(testCase.title) : result.caseId}</div>
          <div className="truncate font-mono text-[11px] text-slate-500">{testCase?.request.path}</div>
        </div>
        <StatusChip tone="amber" result={result.legacy} />
        <StatusChip tone="cyan" result={result.v2} />
        <ChevronDown className={cn("size-4 text-slate-500 transition", open && "rotate-180")} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }} className="overflow-hidden">
            <div className="grid gap-3 border-t border-white/5 p-4 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1fr)_minmax(0,1fr)]">
              <div className="min-w-0">
                <Label>{t("parity.request")}</Label>
                <div className="overflow-hidden rounded-xl bg-black/30 ring-1 ring-white/[0.06]">
                  <div className="flex items-center gap-2 border-b border-white/5 px-3 py-2">
                    <MethodBadge method={method} className="w-auto px-1.5" />
                    <span className="truncate font-mono text-xs text-slate-200">{testCase?.request.path}</span>
                  </div>
                  <JsonView value={testCase?.request.body ?? undefined} empty={t("parity.noBody")} />
                </div>
              </div>
              <ResponsePane side="legacy" result={result.legacy} diffPaths={diffPaths} />
              <ResponsePane side="v2" result={result.v2} diffPaths={diffPaths} />
            </div>
            {result.comparison.diffs.length > 0 && (
              <div className="border-t border-white/5 px-4 py-3">
                <div className="grid grid-cols-3 gap-3 pb-1 text-[10px] tracking-wider text-slate-500 uppercase">
                  <span>{t("parity.path")}</span>
                  <span className="text-amber-300/70">{t("common.legacy")}</span>
                  <span className="text-cyan-300/70">{t("common.v2")}</span>
                </div>
                {result.comparison.diffs.slice(0, 20).map((diff, i) => (
                  <div key={`${diff.path}-${i}`} className="grid grid-cols-3 gap-3 py-1 font-mono text-[11.5px]">
                    <span className="truncate text-rose-200">
                      {diff.path} <span className="text-slate-500">{diff.kind}</span>
                    </span>
                    <span className="truncate text-amber-200">{short(diff.expected)}</span>
                    <span className="truncate text-cyan-200">{short(diff.actual)}</span>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

function StatusChip({ tone, result }: { tone: "amber" | "cyan"; result: HttpResult }) {
  return (
    <span className={cn("hidden rounded-md px-1.5 py-0.5 font-mono text-xs sm:inline", tone === "amber" ? "bg-amber-400/10 text-amber-200" : "bg-cyan-400/10 text-cyan-200")}>
      {result.error ? "—" : result.status}
    </span>
  )
}

function ResponsePane({ side, result, diffPaths }: { side: "legacy" | "v2"; result: HttpResult; diffPaths: string[] }) {
  const { t, l } = useI18n()
  const legacy = side === "legacy"
  return (
    <div className="min-w-0">
      <Label>{legacy ? t("common.legacy") : t("common.v2")}</Label>
      <div className={cn("overflow-hidden rounded-xl bg-black/30 ring-1", legacy ? "ring-amber-400/20" : "ring-cyan-400/20")}>
        <div className="flex items-center gap-2 border-b border-white/5 px-3 py-2 text-xs">
          <span className={cn("size-2 rounded-full", legacy ? "bg-amber-400" : "bg-cyan-400")} />
          {result.error ? (
            <span className="truncate text-rose-300">{result.error}</span>
          ) : (
            <>
              <span className={cn("font-mono font-semibold", statusTone(result.status))}>HTTP {result.status}</span>
              <span className="text-slate-500">{result.durationMs}ms</span>
            </>
          )}
        </div>
        <JsonView value={result.body} diffPaths={diffPaths} className="max-h-96" />
      </div>
    </div>
  )
}

// ── Playground ─────────────────────────────────────────────────────────────

function PlaygroundTab({ snapshot, batchId }: { snapshot: Snapshot; batchId: string }) {
  const { t, l } = useI18n()
  const tests = snapshot.tests[batchId]
  const id = snapshot.project.id
  const runtime = snapshot.state.runtime
  const [method, setMethod] = useState(tests?.cases[0]?.request.method ?? "GET")
  const [path, setPath] = useState(tests?.cases[0]?.request.path ?? "/")
  const [headers, setHeaders] = useState("{}")
  const [body, setBody] = useState("")
  const [result, setResult] = useState<PlaygroundResult>()
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string>()
  const [loaded, setLoaded] = useState<string>()

  const load = (caseId: string) => {
    setLoaded(caseId)
    const c = tests?.cases.find((x) => x.id === caseId)
    if (!c) return
    const query = new URLSearchParams(c.request.query).toString()
    setMethod(c.request.method)
    setPath(`${c.request.path}${query ? `?${query}` : ""}`)
    setHeaders(JSON.stringify(c.request.headers, null, 2))
    setBody(c.request.body === undefined || c.request.body === null ? "" : typeof c.request.body === "string" ? c.request.body : JSON.stringify(c.request.body, null, 2))
  }

  const send = async () => {
    let parsedHeaders: Record<string, string>
    try {
      parsedHeaders = headers.trim() ? JSON.parse(headers) : {}
    } catch {
      setError(t("play.headersError"))
      return
    }
    let parsedBody: unknown
    if (body.trim()) {
      try {
        parsedBody = JSON.parse(body)
      } catch {
        parsedBody = body
      }
    }
    setError(undefined)
    setSending(true)
    try {
      setResult(await api.playground(id, "both", { method, path, headers: parsedHeaders, query: {}, body: parsedBody }))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSending(false)
    }
  }

  const inputClass = "rounded-xl bg-black/30 ring-1 ring-white/10 outline-none focus:ring-cyan-400/40"
  const diffCount = result?.comparison?.diffs.length ?? 0
  return (
    <div className="flex flex-col gap-4">
      {(runtime.legacy !== "up" || runtime.v2 !== "up") && (
        <Callout tone="cyan" icon={Info} title={t("play.runtimeTitle")}>
          {t("play.runtimeText")}
        </Callout>
      )}
      <Panel className="p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={method}
            onChange={setMethod}
            className="w-28"
            buttonClassName="h-10 font-mono"
            options={["GET", "POST", "PUT", "PATCH", "DELETE"].map((m) => ({ value: m, label: m }))}
          />
          <input
            value={path}
            onChange={(e) => setPath(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            spellCheck={false}
            className={cn(inputClass, "h-10 min-w-0 flex-1 px-3 font-mono text-sm text-white")}
          />
          <Button variant="primary" loading={sending} icon={<Send className="size-4" />} onClick={send}>
            {t("play.send")}
          </Button>
        </div>
        {tests && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-xs text-slate-500">{t("play.fromTest")}</span>
            <Select
              value={loaded}
              onChange={load}
              placeholder={t("play.choose")}
              className="max-w-full min-w-72"
              buttonClassName="h-8 text-xs"
              options={tests.cases.map((c) => ({
                value: c.id,
                label: l(c.title),
                hint: `${c.request.method} ${c.request.path}`,
                icon: <MethodBadge method={c.request.method} className="w-auto px-1.5" />,
              }))}
            />
          </div>
        )}
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <div>
            <Label>{t("play.headers")}</Label>
            <textarea value={headers} onChange={(e) => setHeaders(e.target.value)} rows={5} spellCheck={false} className={cn(inputClass, "w-full p-3 font-mono text-xs text-slate-200")} />
          </div>
          <div>
            <Label>{t("play.body")}</Label>
            <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={5} spellCheck={false} className={cn(inputClass, "w-full p-3 font-mono text-xs text-slate-200")} />
          </div>
        </div>
        {error && <div className="mt-2 text-sm text-rose-300">{error}</div>}
      </Panel>
      <AnimatePresence>
        {result && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-3">
            {result.comparison && (
              <div>
                {result.comparison.match ? (
                  <Badge tone="emerald" icon={CircleCheck}>
                    {t("play.identical")}
                  </Badge>
                ) : (
                  <Badge tone="rose" icon={CircleX}>
                    {diffCount === 1 ? t("play.diffOne") : t("play.diffMany", { count: diffCount })}
                  </Badge>
                )}
              </div>
            )}
            <div className="grid gap-3 lg:grid-cols-2">
              {result.legacy && <ResponsePane side="legacy" result={result.legacy} diffPaths={result.comparison?.diffs.map((d) => d.path) ?? []} />}
              {result.v2 && <ResponsePane side="v2" result={result.v2} diffPaths={result.comparison?.diffs.map((d) => d.path) ?? []} />}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

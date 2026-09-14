import { Activity, Gauge, Pause, Play, Rocket, ShieldCheck, Undo2 } from "lucide-react"
import { AnimatePresence, motion } from "motion/react"
import { useEffect, useState } from "react"
import { Badge, Button, Panel } from "../components/ui"
import type { Snapshot } from "../lib/api"
import { cn } from "../lib/format"
import { useI18n } from "../lib/i18n"
import { totals } from "../lib/pipeline"

const STAGES = [1, 2, 5, 10, 25, 50, 100]
const DOTS = 18

export function RolloutView({ snapshot }: { snapshot: Snapshot }) {
  const { t } = useI18n()
  const [stage, setStage] = useState(0)
  const [playing, setPlaying] = useState(true)
  const numbers = totals(snapshot)
  const percent = STAGES[stage]

  useEffect(() => {
    if (!playing) return
    const timer = setInterval(() => setStage((s) => (s + 1) % STAGES.length), 2600)
    return () => clearInterval(timer)
  }, [playing])

  const toV2 = Math.round((DOTS * percent) / 100)

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-start gap-4">
        <div className="grid size-12 place-items-center rounded-2xl bg-white/[0.05] ring-1 ring-white/10">
          <Rocket className="size-6 text-slate-100" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-semibold tracking-[0.18em] text-slate-500 uppercase">{t("rollout.eyebrow")}</div>
          <h1 className="flex items-center gap-3 text-2xl font-semibold tracking-tight text-white">
            {t("rollout.title")} <Badge tone="violet">{t("rollout.illustration")}</Badge>
          </h1>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-slate-400">{t("rollout.blurb")}</p>
        </div>
        <Button size="sm" variant="outline" icon={playing ? <Pause className="size-3.5" /> : <Play className="size-3.5" />} onClick={() => setPlaying((p) => !p)}>
          {playing ? t("rollout.pause") : t("rollout.play")}
        </Button>
      </div>

      <Panel className="p-6">
        <div className="flex flex-wrap gap-2">
          {STAGES.map((value, i) => (
            <button
              type="button"
              key={value}
              onClick={() => {
                setStage(i)
                setPlaying(false)
              }}
              className={cn(
                "relative cursor-pointer rounded-xl px-4 py-2 font-mono text-sm transition",
                i === stage ? "text-ink-950" : i < stage ? "text-cyan-200" : "text-slate-500 hover:text-slate-300",
              )}
            >
              {i === stage && <motion.span layoutId="stage" className="absolute inset-0 rounded-xl bg-gradient-migrate" />}
              <span className="relative">{value}%</span>
            </button>
          ))}
        </div>

        <div className="mt-6 flex h-16 overflow-hidden rounded-2xl ring-1 ring-white/10">
          <motion.div
            className="flex items-center justify-start bg-gradient-to-r from-amber-500/30 to-amber-400/10 px-4"
            animate={{ width: `${100 - percent}%` }}
            transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
          >
            {percent < 100 && <span className="font-mono text-sm whitespace-nowrap text-amber-200">{t("rollout.legacyShare", { percent: 100 - percent })}</span>}
          </motion.div>
          <motion.div
            className="flex items-center justify-end bg-gradient-to-r from-cyan-400/10 to-cyan-400/35 px-4"
            animate={{ width: `${percent}%` }}
            transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
          >
            <span className="font-mono text-sm whitespace-nowrap text-cyan-100">{t("rollout.v2Share", { percent })}</span>
          </motion.div>
        </div>

        <div className="relative mt-6 grid grid-cols-[80px_1fr] gap-y-3">
          <Lane label={t("common.legacy")} tone="amber" count={DOTS - toV2} stage={stage} />
          <Lane label={t("common.v2")} tone="cyan" count={toV2} stage={stage} />
        </div>
      </Panel>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric icon={ShieldCheck} label={t("rollout.divergences")} value="0" tone="text-emerald-300" />
        <Metric icon={Activity} label={t("rollout.errorRate")} value="±0.00%" tone="text-cyan-300" />
        <Metric icon={Gauge} label={t("rollout.blast")} value={t("rollout.blastValue", { percent })} tone="text-amber-300" />
        <Metric icon={Undo2} label={t("rollout.rollback")} value={t("rollout.rollbackValue")} tone="text-violet-300" />
      </div>

      <Panel className="bg-gradient-to-r from-amber-400/[0.05] via-transparent to-cyan-400/[0.07] p-6">
        <div className="grid gap-6 md:grid-cols-3">
          <Figure value={numbers.rules} label={t("rollout.rules")} />
          <Figure value={numbers.cases} label={t("rollout.tests")} />
          <Figure value={numbers.matched} suffix={numbers.compared ? `/${numbers.compared}` : ""} label={t("rollout.identical")} />
        </div>
        <p className="mt-6 text-sm leading-relaxed text-slate-400">{t("rollout.story")}</p>
      </Panel>
    </div>
  )
}

function Lane({ label, tone, count, stage }: { label: string; tone: "amber" | "cyan"; count: number; stage: number }) {
  return (
    <>
      <div className={cn("self-center text-xs font-semibold tracking-wider uppercase", tone === "amber" ? "text-amber-300" : "text-cyan-300")}>{label}</div>
      <div className="relative h-6 overflow-hidden rounded-full bg-white/[0.03]">
        <AnimatePresence>
          {Array.from({ length: count }).map((_, i) => (
            <motion.span
              key={`${stage}-${label}-${i}`}
              className={cn(
                "absolute top-1/2 size-2 -translate-y-1/2 rounded-full",
                tone === "amber" ? "bg-amber-300 shadow-[0_0_10px_2px_rgba(245,165,36,0.5)]" : "bg-cyan-300 shadow-[0_0_10px_2px_rgba(34,211,238,0.5)]",
              )}
              initial={{ left: "-2%", opacity: 0 }}
              animate={{ left: "102%", opacity: [0, 1, 1, 0] }}
              transition={{ duration: 2.2, delay: (i / Math.max(count, 1)) * 2.2, repeat: Number.POSITIVE_INFINITY, ease: "linear" }}
            />
          ))}
        </AnimatePresence>
      </div>
    </>
  )
}

function Metric({ icon: Icon, label, value, tone }: { icon: typeof Activity; label: string; value: string; tone: string }) {
  return (
    <Panel className="p-4">
      <Icon className={cn("size-5", tone)} />
      <div className="mt-3 text-lg font-semibold text-white">{value}</div>
      <div className="text-xs text-slate-400">{label}</div>
    </Panel>
  )
}

function Figure({ value, label, suffix }: { value: number; label: string; suffix?: string }) {
  return (
    <div>
      <div className="text-4xl font-semibold tracking-tight text-white tabular-nums">
        {value}
        <span className="text-slate-500">{suffix}</span>
      </div>
      <div className="mt-1 text-sm text-slate-400">{label}</div>
    </div>
  )
}

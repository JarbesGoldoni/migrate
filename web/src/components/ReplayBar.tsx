import { FlaskConical, GitCompareArrows, History, Pause, Play, RotateCcw, ScrollText, Waypoints, X } from "lucide-react"
import { AnimatePresence, motion } from "motion/react"
import type { Snapshot } from "../lib/api"
import { clockTime, cn } from "../lib/format"
import { useI18n } from "../lib/i18n"
import { totals } from "../lib/pipeline"
import { useProjectStore } from "../lib/project"
import { Button, CountUp } from "./ui"

const SPEEDS = [1, 2, 4]

export function ReplayBar() {
  const replay = useProjectStore((s) => s.replay)
  const { t } = useI18n()
  if (!replay) return null
  const { updateReplay, stopReplay } = useProjectStore.getState()
  const ratio = replay.clock.total ? replay.position / replay.clock.total : 0
  const playing = replay.status === "playing"

  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex min-w-0 items-center gap-2 rounded-xl bg-rose-500/[0.06] py-1 pr-1 pl-2.5 ring-1 ring-rose-400/25"
    >
      <span className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wider text-rose-200 uppercase">
        <span className="relative flex size-2">
          <span className="absolute inline-flex size-full animate-ping-slow rounded-full bg-rose-400/70" />
          <span className="relative inline-flex size-2 rounded-full bg-rose-400" />
        </span>
        {t("replay.badge")}
      </span>
      <Button
        size="xs"
        variant="ghost"
        title={t("replay.restart")}
        icon={<RotateCcw className="size-3.5" />}
        onClick={() => updateReplay({ position: 0, status: "playing" })}
      />
      <Button
        size="xs"
        variant="subtle"
        title={playing ? t("replay.pause") : t("replay.play")}
        icon={playing ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
        onClick={() =>
          updateReplay(
            playing
              ? { status: "paused" }
              : { status: "playing", position: replay.status === "finished" ? 0 : replay.position },
          )
        }
      />
      <div
        role="slider"
        aria-valuemin={0}
        aria-valuemax={replay.clock.total}
        aria-valuenow={replay.position}
        tabIndex={0}
        onClick={(e) => {
          const box = e.currentTarget.getBoundingClientRect()
          const next = Math.min(1, Math.max(0, (e.clientX - box.left) / box.width)) * replay.clock.total
          updateReplay({ position: next, status: replay.status === "finished" ? "paused" : replay.status })
        }}
        className="group relative h-6 w-40 cursor-pointer lg:w-56"
      >
        <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 overflow-hidden rounded-full bg-white/10">
          <div className="h-full rounded-full bg-gradient-migrate" style={{ width: `${ratio * 100}%` }} />
        </div>
        <div
          className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow ring-2 ring-cyan-300/60 transition group-hover:scale-125"
          style={{ left: `${ratio * 100}%` }}
        />
      </div>
      <span className="font-mono text-[11px] text-slate-400 tabular-nums">
        {clockTime(replay.position)} / {clockTime(replay.clock.total)}
      </span>
      <div className="flex items-center rounded-lg bg-black/20 p-0.5" title={t("replay.speed")}>
        {SPEEDS.map((speed) => (
          <button
            type="button"
            key={speed}
            onClick={() => updateReplay({ speed })}
            className={cn(
              "cursor-pointer rounded-md px-1.5 py-0.5 font-mono text-[10px]",
              replay.speed === speed ? "bg-white/15 text-white" : "text-slate-500 hover:text-slate-300",
            )}
          >
            {speed}×
          </button>
        ))}
      </div>
      <Button size="xs" variant="ghost" title={t("replay.exit")} icon={<X className="size-3.5" />} onClick={stopReplay} />
    </motion.div>
  )
}

export function ReplayFinished({ snapshot }: { snapshot: Snapshot }) {
  const replay = useProjectStore((s) => s.replay)
  const { t } = useI18n()
  const numbers = totals(snapshot)
  const { updateReplay, stopReplay } = useProjectStore.getState()
  return (
    <AnimatePresence>
      {replay?.status === "finished" && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-40 flex items-end justify-center bg-ink-950/50 p-8 backdrop-blur-[2px]"
        >
          <motion.div
            initial={{ y: 40, opacity: 0, scale: 0.96 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            transition={{ type: "spring", stiffness: 260, damping: 26 }}
            className="glass w-full max-w-2xl rounded-3xl p-7 shadow-2xl shadow-black/60"
          >
            <div className="flex items-start gap-4">
              <div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-amber-400/20 to-cyan-400/25 ring-1 ring-white/10">
                <History className="size-6 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-white">{t("replay.finishedTitle")}</h2>
                <p className="mt-1 text-sm text-slate-400">{t("replay.finishedText")}</p>
              </div>
            </div>
            <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Figure icon={Waypoints} value={numbers.entrypoints} label={t("stat.entrypoints")} />
              <Figure icon={ScrollText} value={numbers.rules} label={t("stat.rules")} />
              <Figure icon={FlaskConical} value={numbers.cases} label={t("stat.tests")} />
              <Figure icon={GitCompareArrows} value={numbers.matched} suffix={numbers.compared ? `/${numbers.compared}` : ""} label={t("stat.identical")} />
            </div>
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <Button variant="outline" onClick={stopReplay}>
                {t("replay.close")}
              </Button>
              <Button variant="primary" icon={<RotateCcw className="size-4" />} onClick={() => updateReplay({ position: 0, status: "playing" })}>
                {t("replay.again")}
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function Figure({ icon: Icon, value, suffix, label }: { icon: typeof History; value: number; suffix?: string; label: string }) {
  return (
    <div className="rounded-2xl bg-white/[0.03] px-4 py-3 ring-1 ring-white/[0.06]">
      <Icon className="size-4 text-slate-400" />
      <div className="mt-2 text-2xl font-semibold text-white tabular-nums">
        <CountUp value={value} />
        <span className="text-slate-500">{suffix}</span>
      </div>
      <div className="text-xs text-slate-400">{label}</div>
    </div>
  )
}

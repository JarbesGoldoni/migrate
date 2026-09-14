import {
  ArrowRight,
  ArrowRightLeft,
  BadgeCheck,
  Bot,
  Braces,
  Check,
  Cloud,
  FlaskConical,
  FolderGit2,
  GitBranch,
  GitCompareArrows,
  History,
  Network,
  Rocket,
  ScrollText,
  Sparkles,
  Waypoints,
} from "lucide-react"
import { motion } from "motion/react"
import { useEffect, useMemo, useState } from "react"
import { highlight } from "sugar-high"
import type { MigrationListItem } from "../../../src/shared/types"
import { Backdrop, Logo, TechIcon } from "../components/brand"
import { LanguageSwitcher } from "../components/LanguageSwitcher"
import { Button } from "../components/ui"
import { api } from "../lib/api"
import { cn } from "../lib/format"
import { useI18n } from "../lib/i18n"
import type { Key } from "../lib/i18n-core"
import { navigate } from "../lib/router"

const STEPS: Array<{ icon: typeof Network; step: 1 | 2 | 3 | 4 | 5 | 6 | 7 }> = [
  { icon: Network, step: 1 },
  { icon: Waypoints, step: 2 },
  { icon: ScrollText, step: 3 },
  { icon: FlaskConical, step: 4 },
  { icon: ArrowRightLeft, step: 5 },
  { icon: GitCompareArrows, step: 6 },
  { icon: Rocket, step: 7 },
]

const ANALOGY: Array<{ before: Key; after: Key; icon: typeof Cloud }> = [
  { before: "opener.analogy.servers", after: "opener.analogy.cloud", icon: Cloud },
  { before: "opener.analogy.code", after: "opener.analogy.agents", icon: Bot },
  { before: "opener.analogy.terraform", after: "opener.analogy.prompts", icon: Braces },
]

const LEGACY_CODE = `router.post("/quote", async (req, res) => {
  const lines = normalizeLines(req.body.items)
  if (qty > MAX_QTY_PER_LINE)
    return res.status(400).json({ error: "invalid_quantity" })
  const discount = qty >= 10 ? gross * 0.05 : 0
  res.json(quote({ lines, coupon, region }))
})`

const MODERN_CODE = `// quote-r3: volume discount
func VolumeDiscount(gross float64, qty int) float64 {
	if qty >= 10 {
		return gross * 0.05
	}
	return 0
}

mux.HandleFunc("POST /api/cart/quote", Make(Quote))`

const CHECKS = [
  { method: "POST", path: "/api/cart/quote", status: 200 },
  { method: "POST", path: "/api/cart/quote", status: 400 },
  { method: "GET", path: "/api/products/KEY-001", status: 200 },
  { method: "POST", path: "/api/orders", status: 402 },
]

const ease = [0.16, 1, 0.3, 1] as const

export function Opener() {
  const { t, ago } = useI18n()
  const [migrations, setMigrations] = useState<MigrationListItem[]>([])
  useEffect(() => {
    api
      .migrations()
      .then((list) => setMigrations(list.sort((a, b) => (b.summary.lastActivity ?? b.project.createdAt) - (a.summary.lastActivity ?? a.project.createdAt))))
      .catch(() => {})
  }, [])
  const headline = t("opener.headline").split(" ")

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }} className="relative min-h-screen overflow-x-hidden">
      <Backdrop />
      <div className="relative mx-auto flex max-w-6xl flex-col px-6 pb-24">
        <header className="flex items-center justify-between gap-4 py-6">
          <Logo />
          <div className="flex items-center gap-4">
            <div className="hidden items-center gap-2 text-xs text-slate-500 sm:flex">
              <span className="size-1.5 rounded-full bg-emerald-400 shadow-[0_0_10px_2px_rgba(52,211,153,0.6)]" />
              {t("opener.runsLocally")}
            </div>
            {migrations.length > 0 && (
              <Button size="sm" variant="ghost" icon={<FolderGit2 className="size-4 text-amber-300" />} onClick={() => navigate("/migrations")}>
                {t("opener.migrations")}
              </Button>
            )}
            <LanguageSwitcher />
          </div>
        </header>

        <section className="flex flex-col items-center pt-10 text-center md:pt-16">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.6, ease }}
            className="mb-7 inline-flex items-center gap-2 rounded-full bg-white/[0.04] px-3.5 py-1.5 text-xs text-slate-300 ring-1 ring-white/10"
          >
            <Sparkles className="size-3.5 text-violet-300" />
            {t("opener.eyebrow")}
          </motion.div>

          <h1 key={headline.join(" ")} className="max-w-4xl text-[2.6rem] leading-[1.05] font-semibold tracking-[-0.035em] text-white md:text-7xl">
            {headline.map((word, i) => (
              <motion.span
                key={`${word}-${i}`}
                initial={{ opacity: 0, y: 24, filter: "blur(10px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                transition={{ delay: 0.2 + i * 0.08, duration: 0.8, ease }}
                className="mr-[0.25em] inline-block"
              >
                {word}
              </motion.span>
            ))}
            <motion.span
              initial={{ opacity: 0, y: 24, filter: "blur(10px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              transition={{ delay: 0.2 + headline.length * 0.08, duration: 0.9, ease }}
              className="text-gradient inline-block"
            >
              {t("opener.headlineAccent")}
            </motion.span>
          </h1>

          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.95, duration: 0.8, ease }}
            className="mt-7 max-w-2xl text-lg leading-relaxed text-slate-400"
          >
            {t("opener.lede")}
          </motion.p>

          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.2, duration: 0.8 }} className="mt-9 flex flex-wrap items-center justify-center gap-3">
            {ANALOGY.map((item, i) => (
              <motion.div
                key={item.after}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 1.25 + i * 0.12, duration: 0.6, ease }}
                className="flex items-center gap-2.5 rounded-2xl bg-white/[0.03] px-4 py-2.5 text-sm ring-1 ring-white/[0.07]"
              >
                <span className="text-amber-200/80 line-through decoration-amber-400/40">{t(item.before)}</span>
                <ArrowRight className="size-3.5 text-slate-500" />
                <item.icon className="size-4 text-cyan-300" />
                <span className="font-medium text-cyan-100">{t(item.after)}</span>
              </motion.div>
            ))}
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.55, duration: 0.8, ease }} className="mt-11 flex flex-col items-center gap-4 sm:flex-row">
            <MigrateButton label={t("opener.migrate")} />
            <Button variant="outline" size="lg" icon={<FolderGit2 className="size-5 text-amber-300" />} onClick={() => navigate("/new/sample")}>
              {t("opener.sample")}
            </Button>
          </motion.div>
        </section>

        <TransformStrip />

        <section className="mt-28">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.7, ease }}
            className="mb-10 text-center"
          >
            <div className="text-xs font-semibold tracking-[0.2em] text-cyan-300/80 uppercase">{t("opener.methodEyebrow")}</div>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white md:text-4xl">{t("opener.methodTitle")}</h2>
            <p className="mx-auto mt-3 max-w-2xl text-slate-400">{t("opener.methodLede")}</p>
          </motion.div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map(({ icon: Icon, step }, i) => (
              <motion.div
                key={step}
                initial={{ opacity: 0, y: 18 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ delay: i * 0.06, duration: 0.6, ease }}
                whileHover={{ y: -4 }}
                className="glass group relative overflow-hidden rounded-2xl p-5"
              >
                <div className="absolute -top-10 -right-10 size-28 rounded-full bg-gradient-to-br from-amber-400/0 to-cyan-400/0 blur-2xl transition duration-500 group-hover:from-amber-400/20 group-hover:to-cyan-400/20" />
                <div className="flex items-center justify-between">
                  <div className="grid size-10 place-items-center rounded-xl bg-white/[0.05] ring-1 ring-white/10">
                    <Icon className="size-5 text-slate-200" />
                  </div>
                  <span className="font-mono text-xs text-slate-600">{String(step).padStart(2, "0")}</span>
                </div>
                <h3 className="mt-4 font-semibold text-white">{t(`opener.step${step}.title`)}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-400">{t(`opener.step${step}.text`)}</p>
              </motion.div>
            ))}
            <motion.div
              initial={{ opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ delay: STEPS.length * 0.06, duration: 0.6, ease }}
              className="relative flex flex-col justify-between overflow-hidden rounded-2xl bg-gradient-to-br from-amber-400/[0.12] via-transparent to-cyan-400/[0.14] p-5 ring-1 ring-white/10"
            >
              <p className="text-sm leading-relaxed text-slate-300">{t("opener.keep")}</p>
              <button type="button" onClick={() => navigate("/new")} className="mt-4 flex cursor-pointer items-center gap-1.5 text-sm font-medium text-cyan-200 hover:text-white">
                {t("opener.watch")} <ArrowRight className="size-4" />
              </button>
            </motion.div>
          </div>
        </section>

        {migrations.length > 0 && (
          <section className="mt-20">
            <div className="mb-4 flex items-center justify-between">
              <div className="text-xs font-semibold tracking-[0.2em] text-slate-500 uppercase">{t("opener.migrations")}</div>
              <button type="button" onClick={() => navigate("/migrations")} className="flex cursor-pointer items-center gap-1 text-xs text-cyan-200 hover:text-white">
                {t("opener.seeAll")} <ArrowRight className="size-3.5" />
              </button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {migrations.slice(0, 6).map(({ project, summary }, i) => (
                <motion.div
                  key={project.id}
                  initial={{ opacity: 0, y: 10 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.04 }}
                  whileHover={{ y: -3 }}
                  className="glass flex items-center gap-3 rounded-2xl p-4"
                >
                  <button type="button" onClick={() => navigate(`/m/${project.id}`)} className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 text-left">
                    <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-amber-400/10 ring-1 ring-amber-400/20">
                      <FolderGit2 className="size-5 text-amber-300" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 truncate font-medium text-white">
                        {project.name}
                        {summary.batchesProven > 0 && <BadgeCheck className="size-3.5 shrink-0 text-emerald-400" />}
                      </div>
                      <div className="flex items-center gap-1.5 truncate text-xs text-slate-500">
                        <GitBranch className="size-3" />
                        {project.branch} · {ago(summary.lastActivity ?? project.createdAt)}
                      </div>
                    </div>
                    <TechIcon tech={project.target} size={18} />
                  </button>
                  {summary.steps > 0 && !summary.running && !summary.missing && (
                    <button
                      type="button"
                      title={t("replay.startHint")}
                      onClick={() => navigate(`/m/${project.id}/replay`)}
                      className="grid size-8 shrink-0 cursor-pointer place-items-center rounded-lg text-rose-300 ring-1 ring-rose-400/20 transition hover:bg-rose-500/10"
                    >
                      <History className="size-4" />
                    </button>
                  )}
                </motion.div>
              ))}
            </div>
          </section>
        )}

        <footer className="mt-24 text-center text-xs text-slate-600">{t("opener.footer")}</footer>
      </div>
    </motion.div>
  )
}

function MigrateButton({ label }: { label: string }) {
  return (
    <motion.button type="button" onClick={() => navigate("/new")} whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} className="group relative cursor-pointer rounded-2xl p-[1.5px]">
      <span className="absolute inset-0 rounded-2xl bg-gradient-migrate opacity-70 blur-xl transition group-hover:opacity-100" />
      <span className="absolute inset-0 rounded-2xl bg-gradient-migrate" />
      <span className="relative flex h-14 items-center gap-3 rounded-[15px] bg-ink-950/85 px-9 text-lg font-semibold text-white transition group-hover:bg-ink-950/60">
        {label}
        <motion.span animate={{ x: [0, 4, 0] }} transition={{ duration: 1.6, repeat: Number.POSITIVE_INFINITY }}>
          <ArrowRight className="size-5 text-cyan-300" />
        </motion.span>
      </span>
    </motion.button>
  )
}

function TransformStrip() {
  const { t } = useI18n()
  const [cycle, setCycle] = useState(0)
  useEffect(() => {
    const timer = setInterval(() => setCycle((c) => c + 1), 9000)
    return () => clearInterval(timer)
  }, [])
  const legacy = useMemo(() => LEGACY_CODE.split("\n").map((l) => highlight(l)), [])
  const modern = useMemo(() => MODERN_CODE.split("\n").map((l) => highlight(l)), [])
  const check = CHECKS[cycle % CHECKS.length]

  return (
    <motion.section initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.8, duration: 1, ease }} className="mt-20 grid items-center gap-6 lg:grid-cols-[1fr_auto_1fr]">
      <CodeCard tone="legacy" title="legacy/src/routes/cart.js" tech="express" lines={legacy} cycle={cycle} badge={t("common.legacy")} />
      <AgentOrb cycle={cycle} label={t("opener.agent")} />
      <CodeCard tone="modern" title="v2/internal/domain/pricing.go" tech="go" lines={modern} cycle={cycle} typing badge={t("common.v2")} />
      <div className="flex justify-center lg:col-span-3">
        <motion.div
          key={cycle}
          initial={{ opacity: 0, y: 8, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ delay: 4.2, duration: 0.5, ease }}
          className="flex flex-wrap items-center justify-center gap-3 rounded-full bg-emerald-400/[0.07] px-4 py-2 text-sm ring-1 ring-emerald-400/25"
        >
          <span className="font-mono text-xs text-slate-400">{check.method}</span>
          <span className="font-mono text-slate-200">{check.path}</span>
          <span className="rounded-md bg-amber-400/10 px-1.5 font-mono text-xs text-amber-200">
            {t("common.legacy")} {check.status}
          </span>
          <span className="rounded-md bg-cyan-400/10 px-1.5 font-mono text-xs text-cyan-200">
            {t("common.v2")} {check.status}
          </span>
          <span className="flex items-center gap-1 font-medium text-emerald-300">
            <Check className="size-4" /> {t("opener.identical")}
          </span>
        </motion.div>
      </div>
    </motion.section>
  )
}

function CodeCard({ tone, title, tech, lines, cycle, typing, badge }: { tone: "legacy" | "modern"; title: string; tech: string; lines: string[]; cycle: number; typing?: boolean; badge: string }) {
  const legacy = tone === "legacy"
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl bg-ink-900/80 ring-1 backdrop-blur",
        legacy ? "shadow-[0_30px_80px_-40px_rgba(245,165,36,0.45)] ring-amber-400/20" : "shadow-[0_30px_80px_-40px_rgba(34,211,238,0.5)] ring-cyan-400/25",
      )}
    >
      <div className="flex items-center gap-2 border-b border-white/5 px-4 py-2.5">
        <TechIcon tech={tech} size={15} />
        <span className="truncate font-mono text-xs text-slate-400">{title}</span>
        <span className={cn("ml-auto rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wider uppercase", legacy ? "bg-amber-400/10 text-amber-300" : "bg-cyan-400/10 text-cyan-300")}>
          {badge}
        </span>
      </div>
      <div className="relative min-h-[196px] px-1 py-3 font-mono text-[12px] leading-[1.7]">
        {legacy && (
          <motion.div
            key={cycle}
            className="pointer-events-none absolute inset-x-0 h-6 bg-gradient-to-r from-amber-400/0 via-amber-400/15 to-amber-400/0"
            initial={{ top: 8, opacity: 0 }}
            animate={{ top: [8, 180, 180], opacity: [0, 1, 0] }}
            transition={{ duration: 3.2, ease: "easeInOut" }}
          />
        )}
        {lines.map((html, i) => (
          <motion.div
            key={`${cycle}-${i}`}
            initial={typing ? { opacity: 0, x: -8 } : false}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: typing ? 2.4 + i * 0.16 : 0, duration: 0.3 }}
            className="flex"
          >
            <span className="w-8 shrink-0 pr-3 text-right text-slate-700 select-none">{i + 1}</span>
            <code className="whitespace-pre" dangerouslySetInnerHTML={{ __html: html || " " }} />
          </motion.div>
        ))}
      </div>
    </div>
  )
}

function AgentOrb({ cycle, label }: { cycle: number; label: string }) {
  return (
    <div className="relative flex h-40 items-center justify-center lg:w-44">
      <div className="absolute inset-x-0 top-1/2 hidden h-px -translate-y-1/2 bg-gradient-to-r from-amber-400/40 via-violet-400/40 to-cyan-400/40 lg:block" />
      {[0, 1, 2, 3, 4].map((i) => (
        <motion.span
          key={`${cycle}-${i}`}
          className="absolute top-1/2 left-0 hidden size-1.5 -translate-y-1/2 rounded-full bg-amber-300 shadow-[0_0_12px_3px_rgba(245,165,36,0.6)] lg:block"
          initial={{ x: 0, opacity: 0, backgroundColor: "#fcd34d" }}
          animate={{ x: 170, opacity: [0, 1, 1, 0], backgroundColor: ["#fcd34d", "#c4b5fd", "#67e8f9"] }}
          transition={{ delay: 0.6 + i * 0.35, duration: 1.8, ease: "easeInOut" }}
        />
      ))}
      <div className="relative grid size-24 place-items-center">
        <motion.div
          className="absolute inset-0 rounded-full"
          style={{ background: "conic-gradient(from 0deg, #f5a524, #a78bfa, #22d3ee, #f5a524)" }}
          animate={{ rotate: 360 }}
          transition={{ duration: 6, repeat: Number.POSITIVE_INFINITY, ease: "linear" }}
        />
        <div className="absolute inset-[3px] rounded-full bg-ink-950" />
        <motion.div
          className="absolute inset-0 rounded-full bg-violet-500/20 blur-xl"
          animate={{ scale: [1, 1.25, 1], opacity: [0.5, 0.9, 0.5] }}
          transition={{ duration: 3, repeat: Number.POSITIVE_INFINITY }}
        />
        <Sparkles className="relative size-8 text-violet-200" />
        {[0, 120, 240].map((deg) => (
          <motion.span
            key={deg}
            className="absolute size-2 rounded-full bg-cyan-300"
            style={{ top: "50%", left: "50%", marginTop: -4, marginLeft: -4 }}
            animate={{ rotate: [deg, deg + 360] }}
            transition={{ duration: 4, repeat: Number.POSITIVE_INFINITY, ease: "linear" }}
          >
            <span className="absolute size-2 rounded-full bg-cyan-300" style={{ transform: "translateX(56px)" }} />
          </motion.span>
        ))}
      </div>
      <div className="absolute -bottom-3 text-[11px] tracking-wider text-slate-500 uppercase">{label}</div>
    </div>
  )
}

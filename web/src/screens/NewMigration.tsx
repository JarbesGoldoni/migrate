import {
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  CircleCheck,
  CircleX,
  Container,
  CornerDownRight,
  Crosshair,
  Folder,
  FolderGit2,
  GitBranch,
  GitCompareArrows,
  House,
  Layers,
  LoaderCircle,
  type LucideIcon,
  Network,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
  Wand2,
  Waypoints,
} from "lucide-react"
import { AnimatePresence, motion } from "motion/react"
import { type ReactNode, useEffect, useState } from "react"
import { LANGUAGES } from "../../../src/shared/stacks"
import type { EngineInfo, FsListing, ModelRef, Preflight, PreflightCheck } from "../../../src/shared/types"
import { Backdrop, Logo, TechIcon } from "../components/brand"
import { EffortPicker } from "../components/EffortPicker"
import { LanguageSwitcher } from "../components/LanguageSwitcher"
import { ModelPicker } from "../components/ModelPicker"
import { Button, Panel } from "../components/ui"
import { api } from "../lib/api"
import { cn } from "../lib/format"
import { useI18n } from "../lib/i18n"
import { isKey, type Key } from "../lib/i18n-core"
import { navigate } from "../lib/router"
import { MARKER_TECH } from "../lib/tech"

const CHECK_ICONS: Record<string, LucideIcon> = {
  project: FolderGit2,
  engine: Sparkles,
  git: GitBranch,
  container: Container,
  compose: Layers,
}

const CHECK_IDS = ["project", "engine", "git", "container", "compose", "go"]

const NEXT_STEPS: Array<{ icon: LucideIcon; key: Key; tone: string }> = [
  { icon: Network, key: "new.step.map", tone: "text-cyan-300" },
  { icon: Crosshair, key: "new.step.target", tone: "text-emerald-300" },
  { icon: Waypoints, key: "new.step.batches", tone: "text-amber-300" },
  { icon: GitCompareArrows, key: "new.step.prove", tone: "text-violet-300" },
]

export function NewMigration({ sample }: { sample: boolean }) {
  const { t, locale } = useI18n()
  const [listing, setListing] = useState<FsListing>()
  const [pathInput, setPathInput] = useState("")
  const [selected, setSelected] = useState<string>()
  const [preflight, setPreflight] = useState<Preflight>()
  const [checking, setChecking] = useState(false)
  const [engine, setEngine] = useState<EngineInfo>()
  const [model, setModel] = useState<ModelRef>()
  const [starting, setStarting] = useState(false)
  const [creatingSample, setCreatingSample] = useState(false)
  const [error, setError] = useState<string>()

  const open = async (path?: string) => {
    try {
      const next = await api.fs(path)
      setListing(next)
      setPathInput(next.path)
      setError(undefined)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const useSample = async () => {
    setCreatingSample(true)
    try {
      const { path } = await api.sample()
      await open(path)
      setSelected(path)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setCreatingSample(false)
    }
  }

  useEffect(() => {
    if (sample) void useSample()
    else void open()
    api
      .engine()
      .then((info) => {
        setEngine(info)
        setModel((current) => current ?? info.defaultModel)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!selected) return
    setChecking(true)
    setPreflight(undefined)
    api
      .preflight(selected)
      .then(setPreflight)
      .catch((e: Error) => setError(e.message))
      .finally(() => setChecking(false))
  }, [selected])

  const start = async () => {
    if (!selected) return
    setStarting(true)
    try {
      const project = await api.create(selected, model, locale)
      await api.run(project.id, "discover")
      navigate(`/m/${project.id}/discover`)
    } catch (e) {
      setError((e as Error).message)
      setStarting(false)
    }
  }

  const modelOption = engine?.models.find((m) => m.providerID === model?.providerID && m.modelID === model?.modelID)

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }} className="relative min-h-screen">
      <Backdrop />
      <div className="relative mx-auto max-w-7xl px-6 pb-16">
        <header className="flex items-center gap-4 py-6">
          <Button variant="ghost" size="sm" icon={<ArrowLeft className="size-4" />} onClick={() => navigate("/")}>
            {t("common.back")}
          </Button>
          <Logo size={24} />
          <span className="flex-1" />
          <LanguageSwitcher />
        </header>

        <div className="mb-8">
          <h1 className="text-3xl font-semibold tracking-tight text-white">{t("new.title")}</h1>
          <p className="mt-2 max-w-2xl text-slate-400">{t("new.lede")}</p>
        </div>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_440px]">
          <Panel className="flex min-h-[560px] flex-col overflow-hidden">
            <div className="flex items-center gap-2 border-b border-white/5 p-3">
              <Button size="sm" variant="ghost" icon={<House className="size-4" />} onClick={() => open(listing?.home)} title={t("new.home")} />
              <Button size="sm" variant="ghost" icon={<ArrowUp className="size-4" />} disabled={!listing?.parent} onClick={() => open(listing?.parent)} title={t("new.up")} />
              <form
                className="flex-1"
                onSubmit={(e) => {
                  e.preventDefault()
                  void open(pathInput)
                }}
              >
                <input
                  value={pathInput}
                  onChange={(e) => setPathInput(e.target.value)}
                  spellCheck={false}
                  className="h-9 w-full rounded-lg bg-black/30 px-3 font-mono text-sm text-slate-200 ring-1 ring-white/10 outline-none focus:ring-cyan-400/40"
                />
              </form>
              <Button size="sm" variant="subtle" loading={creatingSample} icon={<Wand2 className="size-4 text-amber-300" />} onClick={useSample}>
                {t("new.sampleApp")}
              </Button>
            </div>

            {listing && (
              <div className="flex items-center gap-3 border-b border-white/5 bg-white/[0.02] px-4 py-3">
                <FolderIcon markers={listing.markers} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-white">{listing.path.split("/").pop() || "/"}</div>
                  <Markers markers={listing.markers} />
                </div>
                <Button
                  size="sm"
                  variant={selected === listing.path ? "subtle" : "primary"}
                  icon={selected === listing.path ? <CircleCheck className="size-4 text-emerald-300" /> : <CornerDownRight className="size-4" />}
                  onClick={() => setSelected(listing.path)}
                >
                  {selected === listing.path ? t("new.selected") : t("new.useFolder")}
                </Button>
              </div>
            )}

            <div className="min-h-0 flex-1 overflow-y-auto p-2">
              {error && <div className="m-2 rounded-xl bg-rose-500/10 px-3 py-2 text-sm text-rose-200 ring-1 ring-rose-400/20">{error}</div>}
              {listing?.entries.length === 0 && <div className="p-8 text-center text-sm text-slate-500">{t("new.noFolders")}</div>}
              <motion.ul key={listing?.path} initial="hidden" animate="show" variants={{ show: { transition: { staggerChildren: 0.012 } } }}>
                {listing?.entries.map((entry) => (
                  <motion.li
                    key={entry.path}
                    variants={{ hidden: { opacity: 0, x: -6 }, show: { opacity: 1, x: 0 } }}
                    className={cn("group flex items-center gap-3 rounded-xl px-3 py-2 transition-colors", selected === entry.path ? "bg-cyan-400/[0.07] ring-1 ring-cyan-400/20" : "hover:bg-white/[0.04]")}
                  >
                    <button type="button" onClick={() => open(entry.path)} className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 text-left">
                      <FolderIcon markers={entry.markers} />
                      <span className="truncate text-sm text-slate-200">{entry.name}</span>
                      <Markers markers={entry.markers} />
                    </button>
                    {entry.markers.length > 0 && (
                      <Button size="xs" variant="ghost" className="opacity-0 group-hover:opacity-100" icon={<ArrowRight className="size-3.5" />} onClick={() => setSelected(entry.path)}>
                        {t("new.select")}
                      </Button>
                    )}
                  </motion.li>
                ))}
              </motion.ul>
            </div>
          </Panel>

          <div className="flex flex-col gap-4">
            <AnimatePresence mode="popLayout">
              {!selected ? (
                <motion.div key="none" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <Panel className="flex flex-col items-center gap-4 px-8 py-14 text-center">
                    <motion.div animate={{ y: [0, -6, 0] }} transition={{ duration: 3, repeat: Number.POSITIVE_INFINITY }} className="grid size-16 place-items-center rounded-2xl bg-amber-400/10 ring-1 ring-amber-400/20">
                      <FolderGit2 className="size-8 text-amber-300" />
                    </motion.div>
                    <div className="text-lg font-semibold text-white">{t("new.chooseTitle")}</div>
                    <p className="text-sm text-slate-400">{t("new.chooseText")}</p>
                    <Button variant="outline" loading={creatingSample} icon={<Wand2 className="size-4 text-amber-300" />} onClick={useSample}>
                      {t("new.useSample")}
                    </Button>
                  </Panel>
                </motion.div>
              ) : (
                <motion.div key={selected} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex flex-col gap-4">
                  <Panel className="p-5">
                    <div className="text-[11px] font-semibold tracking-[0.18em] text-slate-500 uppercase">{t("new.readiness")}</div>
                    <div className="mt-1 truncate font-mono text-xs text-slate-400" title={selected}>
                      {selected}
                    </div>
                    <ul className="mt-4 flex flex-col gap-2">
                      {checking && !preflight
                        ? CHECK_IDS.map((id) => (
                            <li key={id} className="flex items-center gap-3 text-sm text-slate-400">
                              <LoaderCircle className="size-4 animate-spin text-cyan-300" />
                              <span className="shimmer-text">{t(`check.${id}` as Key)}</span>
                            </li>
                          ))
                        : preflight?.checks.map((check, i) => <CheckRow key={check.id} check={check} index={i} preflight={preflight} engine={engine} />)}
                    </ul>
                  </Panel>

                  <Panel className="p-5">
                    <div className="text-[11px] font-semibold tracking-[0.18em] text-slate-500 uppercase">{t("new.model")}</div>
                    <div className="mt-3">
                      {engine?.ready ? (
                        <div className="flex gap-2">
                          <EffortPicker
                            className="w-40 shrink-0"
                            variants={modelOption?.variants}
                            value={model?.variant}
                            onChange={(variant) => model && setModel({ providerID: model.providerID, modelID: model.modelID, ...(variant ? { variant } : {}) })}
                          />
                          <ModelPicker
                            className="min-w-0 flex-1"
                            models={engine.models}
                            value={model}
                            onChange={(next) => {
                              const option = engine.models.find((m) => m.providerID === next.providerID && m.modelID === next.modelID)
                              const variant = model?.variant && option?.variants?.includes(model.variant) ? model.variant : undefined
                              setModel({ ...next, ...(variant ? { variant } : {}) })
                            }}
                          />
                        </div>
                      ) : (
                        <div className="flex h-11 items-center gap-2 rounded-xl bg-white/[0.03] px-3 text-sm ring-1 ring-white/10">
                          {engine ? (
                            <>
                              <TriangleAlert className="size-4 text-amber-300" />
                              <span className="text-amber-200">{engine.error ?? t("new.noProvider")}</span>
                            </>
                          ) : (
                            <>
                              <LoaderCircle className="size-4 animate-spin text-violet-300" />
                              <span className="shimmer-text">{t("new.startingEngine")}</span>
                            </>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="mt-6 text-[11px] font-semibold tracking-[0.18em] text-slate-500 uppercase">{t("new.next")}</div>
                    <ol className="mt-3 flex flex-col">
                      {NEXT_STEPS.map((step, i) => (
                        <motion.li
                          key={step.key}
                          initial={{ opacity: 0, x: 8 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: 0.1 + i * 0.07 }}
                          className="relative flex gap-3 pb-3 last:pb-0"
                        >
                          {i < NEXT_STEPS.length - 1 && <span className="absolute top-8 left-[15px] h-[calc(100%-26px)] w-px bg-white/10" />}
                          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-white/[0.04] ring-1 ring-white/[0.08]">
                            <step.icon className={cn("size-4", step.tone)} />
                          </span>
                          <span className="pt-1.5 text-sm text-slate-300">{t(step.key)}</span>
                        </motion.li>
                      ))}
                    </ol>
                    <div className="mt-4 flex items-center gap-3 rounded-xl bg-emerald-400/[0.04] px-3 py-2.5 ring-1 ring-emerald-400/15">
                      <span className="flex shrink-0 -space-x-1.5">
                        {["go", "elixir", "erlang"].map((id) => (
                          <span key={id} className="grid size-7 place-items-center rounded-full bg-ink-900 ring-1 ring-white/10">
                            <TechIcon tech={LANGUAGES.find((l) => l.id === id)?.icon} size={14} />
                          </span>
                        ))}
                      </span>
                      <p className="text-xs leading-relaxed text-slate-400">{t("new.targetLater")}</p>
                    </div>
                  </Panel>

                  <Button variant="primary" size="lg" className="w-full" loading={starting} disabled={!preflight?.ready || !model} icon={<ArrowRight className="size-5" />} onClick={start}>
                    {t("new.start")}
                  </Button>
                  <p className="flex items-center justify-center gap-1.5 text-xs text-slate-500">
                    <ShieldCheck className="size-3.5" /> {t("new.safety")}
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </motion.div>
  )
}

function FolderIcon({ markers }: { markers: string[] }) {
  const git = markers.includes("git")
  const Icon = git ? FolderGit2 : Folder
  return (
    <span className={cn("grid size-8 shrink-0 place-items-center rounded-lg", git ? "bg-amber-400/10" : "bg-white/[0.04]")}>
      <Icon className={cn("size-4", git ? "text-amber-300" : "text-slate-400")} />
    </span>
  )
}

function Markers({ markers }: { markers: string[] }) {
  const techs = markers.filter((m) => m !== "git" && MARKER_TECH[m])
  if (!techs.length) return null
  return (
    <span className="flex shrink-0 items-center gap-1.5">
      {techs.map((m) => (
        <span key={m} title={m}>
          <TechIcon tech={MARKER_TECH[m]} size={13} />
        </span>
      ))}
    </span>
  )
}

function checkDetail(check: PreflightCheck, preflight: Preflight, engine: EngineInfo | undefined, t: (key: Key, params?: Record<string, string | number>) => string) {
  if (check.id === "project") {
    const project = preflight.project
    if (!project.exists) return t("check.project.missing")
    if (!project.isGit) return t("check.project.copy")
    return project.hasCommits ? t("check.project.worktree") : t("check.project.noCommits")
  }
  const hint = `check.${check.id}.hint`
  if (!check.ok && isKey(hint)) return t(hint)
  if (check.id === "engine") return t("check.engine.models", { count: engine?.models.length ?? 0 })
  return check.detail
}

function CheckRow({ check, index, preflight, engine }: { check: PreflightCheck; index: number; preflight: Preflight; engine?: EngineInfo }) {
  const { t } = useI18n()
  const Icon = CHECK_ICONS[check.id]
  const warn = !check.ok && !check.required
  const tone = check.ok ? "text-emerald-300" : warn ? "text-amber-300" : "text-rose-300"
  let status: ReactNode = <CircleCheck className="size-4 text-emerald-400" />
  if (!check.ok) status = warn ? <TriangleAlert className="size-4 text-amber-300" /> : <CircleX className="size-4 text-rose-400" />
  const label = `check.${check.id}`
  const detail = checkDetail(check, preflight, engine, t)
  return (
    <motion.li initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: index * 0.06 }} className="flex items-start gap-3 rounded-lg py-1">
      <span className="mt-0.5">{status}</span>
      <span className="grid size-5 shrink-0 place-items-center">{Icon ? <Icon className={cn("size-4", tone)} /> : <TechIcon tech="go" size={15} />}</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-sm text-slate-200">
          {isKey(label) ? t(label) : check.label}
          {check.version && <span className="font-mono text-[11px] text-slate-500">{check.version}</span>}
        </div>
        {detail && <div className="truncate text-xs text-slate-500">{detail}</div>}
      </div>
    </motion.li>
  )
}

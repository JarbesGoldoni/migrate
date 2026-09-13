import {
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  CircleCheck,
  CircleX,
  Container,
  CornerDownRight,
  Folder,
  FolderGit2,
  GitBranch,
  House,
  Layers,
  LoaderCircle,
  type LucideIcon,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
  Wand2,
} from "lucide-react"
import { AnimatePresence, motion } from "motion/react"
import { type ReactNode, useEffect, useState } from "react"
import type { EngineInfo, FsListing, ModelRef, Preflight, PreflightCheck } from "../../../src/shared/types"
import { Backdrop, Logo, TechIcon } from "../components/brand"
import { ModelPicker } from "../components/ModelPicker"
import { Badge, Button, Panel } from "../components/ui"
import { api, type Target } from "../lib/api"
import { cn } from "../lib/format"
import { navigate } from "../lib/router"
import { MARKER_TECH } from "../lib/tech"

const TARGET_TECH: Record<string, string> = { go: "go", typescript: "hono", python: "fastapi" }
const TARGET_BLURB: Record<string, string> = {
  go: "Fast, cheap to run, one static binary. Pure domain functions behind net/http.",
  typescript: "Bun + Hono. Familiar for JavaScript teams, tiny runtime.",
  python: "FastAPI with typed models. Great when the team already speaks Python.",
}

const CHECK_ICONS: Record<string, LucideIcon> = {
  project: FolderGit2,
  engine: Sparkles,
  git: GitBranch,
  container: Container,
  compose: Layers,
}

export function NewMigration({ sample }: { sample: boolean }) {
  const [listing, setListing] = useState<FsListing>()
  const [pathInput, setPathInput] = useState("")
  const [selected, setSelected] = useState<string>()
  const [preflight, setPreflight] = useState<Preflight>()
  const [checking, setChecking] = useState(false)
  const [engine, setEngine] = useState<EngineInfo>()
  const [model, setModel] = useState<ModelRef>()
  const [targets, setTargets] = useState<Target[]>([])
  const [target, setTarget] = useState("go")
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
    api.targets().then(setTargets).catch(() => {})
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
      const project = await api.create(selected, model, target)
      await api.run(project.id, "discover")
      navigate(`/m/${project.id}/discover`)
    } catch (e) {
      setError((e as Error).message)
      setStarting(false)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12, filter: "blur(6px)" }}
      transition={{ duration: 0.35 }}
      className="relative min-h-screen"
    >
      <Backdrop />
      <div className="relative mx-auto max-w-7xl px-6 pb-16">
        <header className="flex items-center gap-4 py-6">
          <Button variant="ghost" size="sm" icon={<ArrowLeft className="size-4" />} onClick={() => navigate("/")}>
            Back
          </Button>
          <Logo size={24} />
        </header>

        <div className="mb-8">
          <h1 className="text-3xl font-semibold tracking-tight text-white">What are we migrating?</h1>
          <p className="mt-2 max-w-2xl text-slate-400">
            Pick the application folder. Your checkout is never touched — the work happens on a new branch in a separate git
            worktree, with <code className="text-amber-200">legacy/</code>, <code className="text-cyan-200">v2/</code> and{" "}
            <code className="text-slate-200">migration/</code> side by side.
          </p>
        </div>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_440px]">
          <Panel className="flex min-h-[560px] flex-col overflow-hidden">
            <div className="flex items-center gap-2 border-b border-white/5 p-3">
              <Button size="sm" variant="ghost" icon={<House className="size-4" />} onClick={() => open(listing?.home)} title="Home" />
              <Button
                size="sm"
                variant="ghost"
                icon={<ArrowUp className="size-4" />}
                disabled={!listing?.parent}
                onClick={() => open(listing?.parent)}
                title="Up"
              />
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
                Sample app
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
                  {selected === listing.path ? "Selected" : "Use this folder"}
                </Button>
              </div>
            )}

            <div className="min-h-0 flex-1 overflow-y-auto p-2">
              {error && <div className="m-2 rounded-xl bg-rose-500/10 px-3 py-2 text-sm text-rose-200 ring-1 ring-rose-400/20">{error}</div>}
              {listing?.entries.length === 0 && <div className="p-8 text-center text-sm text-slate-500">No folders here</div>}
              <motion.ul key={listing?.path} initial="hidden" animate="show" variants={{ show: { transition: { staggerChildren: 0.012 } } }}>
                {listing?.entries.map((entry) => (
                  <motion.li
                    key={entry.path}
                    variants={{ hidden: { opacity: 0, x: -6 }, show: { opacity: 1, x: 0 } }}
                    className={cn(
                      "group flex items-center gap-3 rounded-xl px-3 py-2 transition-colors",
                      selected === entry.path ? "bg-cyan-400/[0.07] ring-1 ring-cyan-400/20" : "hover:bg-white/[0.04]",
                    )}
                  >
                    <button type="button" onClick={() => open(entry.path)} className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 text-left">
                      <FolderIcon markers={entry.markers} />
                      <span className="truncate text-sm text-slate-200">{entry.name}</span>
                      <Markers markers={entry.markers} />
                    </button>
                    {entry.markers.length > 0 && (
                      <Button
                        size="xs"
                        variant="ghost"
                        className="opacity-0 group-hover:opacity-100"
                        icon={<ArrowRight className="size-3.5" />}
                        onClick={() => setSelected(entry.path)}
                      >
                        Select
                      </Button>
                    )}
                  </motion.li>
                ))}
              </motion.ul>
            </div>
          </Panel>

          <div className="flex flex-col gap-4">
            <AnimatePresence mode="wait">
              {!selected ? (
                <motion.div key="none" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <Panel className="flex flex-col items-center gap-4 px-8 py-14 text-center">
                    <motion.div
                      animate={{ y: [0, -6, 0] }}
                      transition={{ duration: 3, repeat: Number.POSITIVE_INFINITY }}
                      className="grid size-16 place-items-center rounded-2xl bg-amber-400/10 ring-1 ring-amber-400/20"
                    >
                      <FolderGit2 className="size-8 text-amber-300" />
                    </motion.div>
                    <div className="text-lg font-semibold text-white">Choose the application</div>
                    <p className="text-sm text-slate-400">
                      Browse to a project folder, or spin up the sample legacy shop — an Express API with PostgreSQL, Redis and a
                      payment provider.
                    </p>
                    <Button variant="outline" loading={creatingSample} icon={<Wand2 className="size-4 text-amber-300" />} onClick={useSample}>
                      Use the sample legacy shop
                    </Button>
                  </Panel>
                </motion.div>
              ) : (
                <motion.div key={selected} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex flex-col gap-4">
                  <Panel className="p-5">
                    <div className="text-[11px] font-semibold tracking-[0.18em] text-slate-500 uppercase">Readiness</div>
                    <div className="mt-1 truncate font-mono text-xs text-slate-400" title={selected}>
                      {selected}
                    </div>
                    <ul className="mt-4 flex flex-col gap-2">
                      {checking && !preflight
                        ? ["Project folder", "AI engine", "Git", "Container runtime", "Compose", "Go toolchain"].map((label) => (
                            <li key={label} className="flex items-center gap-3 text-sm text-slate-400">
                              <LoaderCircle className="size-4 animate-spin text-cyan-300" />
                              <span className="shimmer-text">{label}</span>
                            </li>
                          ))
                        : preflight?.checks.map((check, i) => <CheckRow key={check.id} check={check} index={i} />)}
                    </ul>
                  </Panel>

                  <Panel className="p-5">
                    <div className="text-[11px] font-semibold tracking-[0.18em] text-slate-500 uppercase">Model</div>
                    <div className="mt-3">
                      {engine?.ready ? (
                        <ModelPicker models={engine.models} value={model} onChange={setModel} />
                      ) : (
                        <div className="flex h-11 items-center gap-2 rounded-xl bg-white/[0.03] px-3 text-sm ring-1 ring-white/10">
                          {engine ? (
                            <>
                              <TriangleAlert className="size-4 text-amber-300" />
                              <span className="text-amber-200">{engine.error ?? "No AI provider connected"}</span>
                            </>
                          ) : (
                            <>
                              <LoaderCircle className="size-4 animate-spin text-violet-300" />
                              <span className="shimmer-text">Starting the AI engine</span>
                            </>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="mt-5 text-[11px] font-semibold tracking-[0.18em] text-slate-500 uppercase">Migrate to</div>
                    <div className="mt-3 flex flex-col gap-2">
                      {(targets.length ? targets : [{ id: "go", label: "Go" }]).map((t) => (
                        <button
                          type="button"
                          key={t.id}
                          onClick={() => setTarget(t.id)}
                          className={cn(
                            "relative flex cursor-pointer items-center gap-3 rounded-xl p-3 text-left ring-1 transition",
                            target === t.id ? "bg-cyan-400/[0.07] ring-cyan-400/40" : "bg-white/[0.02] ring-white/[0.07] hover:bg-white/[0.05]",
                          )}
                        >
                          <div className="grid size-10 place-items-center rounded-xl bg-black/40">
                            <TechIcon tech={TARGET_TECH[t.id] ?? t.id} size={22} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 text-sm font-medium text-white">
                              {t.label}
                              {t.id === "go" && <Badge tone="cyan">Recommended</Badge>}
                            </div>
                            <div className="text-xs text-slate-400">{TARGET_BLURB[t.id]}</div>
                          </div>
                          {target === t.id && (
                            <motion.span layoutId="target-check">
                              <CircleCheck className="size-5 text-cyan-300" />
                            </motion.span>
                          )}
                        </button>
                      ))}
                    </div>
                  </Panel>

                  <motion.div whileHover={{ scale: preflight?.ready ? 1.01 : 1 }}>
                    <Button
                      variant="primary"
                      size="lg"
                      className="w-full"
                      loading={starting}
                      disabled={!preflight?.ready || !model}
                      icon={<ArrowRight className="size-5" />}
                      onClick={start}
                    >
                      Start migration
                    </Button>
                  </motion.div>
                  <p className="flex items-center justify-center gap-1.5 text-xs text-slate-500">
                    <ShieldCheck className="size-3.5" /> Legacy is copied onto a new branch — nothing is changed in place.
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

function CheckRow({ check, index }: { check: PreflightCheck; index: number }) {
  const Icon = CHECK_ICONS[check.id]
  const warn = !check.ok && !check.required
  const tone = check.ok ? "text-emerald-300" : warn ? "text-amber-300" : "text-rose-300"
  let status: ReactNode = <CircleCheck className="size-4 text-emerald-400" />
  if (!check.ok) status = warn ? <TriangleAlert className="size-4 text-amber-300" /> : <CircleX className="size-4 text-rose-400" />
  return (
    <motion.li
      initial={{ opacity: 0, x: 8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.06 }}
      className="flex items-start gap-3 rounded-lg py-1"
    >
      <span className="mt-0.5">{status}</span>
      <span className="grid size-5 shrink-0 place-items-center">
        {Icon ? <Icon className={cn("size-4", tone)} /> : <TechIcon tech="go" size={15} />}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-sm text-slate-200">
          {check.label}
          {check.version && <span className="font-mono text-[11px] text-slate-500">{check.version}</span>}
        </div>
        {(check.detail || (!check.ok && check.hint)) && (
          <div className="truncate text-xs text-slate-500">{check.ok ? check.detail : (check.hint ?? check.detail)}</div>
        )}
      </div>
    </motion.li>
  )
}

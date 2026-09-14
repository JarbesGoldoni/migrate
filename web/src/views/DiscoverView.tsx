import { ArrowRight, Boxes, KeyRound, Network, Terminal, Waypoints } from "lucide-react"
import { motion } from "motion/react"
import type { Dependency } from "../../../src/shared/contracts"
import type { Activity } from "../../../src/shared/types"
import { ArchitectureGraph } from "../components/ArchitectureGraph"
import { TechIcon } from "../components/brand"
import { CommandBlock } from "../components/Code"
import { Badge, Button, EmptyState, Panel } from "../components/ui"
import { api, type Snapshot } from "../lib/api"
import { useI18n } from "../lib/i18n"
import type { Key } from "../lib/i18n-core"
import { phaseStatus } from "../lib/pipeline"
import { useReplayView } from "../lib/project"
import { navigate } from "../lib/router"
import { DEPENDENCY_KINDS, STRATEGIES } from "../lib/tech"
import { PhaseAction, PhaseHeader, SectionTitle, Working } from "./common"

const DEP_NODE_KIND: Record<string, string> = {
  database: "datastore",
  cache: "cache",
  queue: "queue",
  "external-api": "external",
  storage: "storage",
  search: "datastore",
  other: "module",
}

export function DiscoverView({ snapshot, activity }: { snapshot: Snapshot; activity: Activity[] }) {
  const { t, l } = useI18n()
  const { active: replaying } = useReplayView()
  const discovery = snapshot.discovery
  const running = phaseStatus(snapshot, "discover") === "running"
  const id = snapshot.project.id
  const stack = discovery
    ? [...new Set([...discovery.stack.languages, ...discovery.stack.frameworks, discovery.stack.runtime, discovery.stack.packageManager].filter(Boolean))]
    : []

  return (
    <div className="flex flex-col gap-8">
      <PhaseHeader
        icon={Network}
        eyebrow={t("discover.eyebrow")}
        title={t("discover.title")}
        blurb={t("discover.blurb")}
        snapshot={snapshot}
        phase="discover"
        action={<PhaseAction snapshot={snapshot} phase="discover" label={t("discover.run")} />}
      />

      {!discovery && running && <Working activity={activity} phaseKey="discover" title={t("discover.working")} />}
      {!discovery && !running && (
        <EmptyState icon={Network} title={t("discover.emptyTitle")} action={<PhaseAction snapshot={snapshot} phase="discover" label={t("discover.run")} />}>
          {t("discover.emptyText")}
        </EmptyState>
      )}

      {discovery && (
        <>
          <Panel className="p-5">
            <p className="text-[15px] leading-relaxed text-slate-200">{l(discovery.summary)}</p>
            {stack.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {stack.map((tech, i) => (
                  <motion.span
                    key={tech}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: i * 0.05 }}
                    className="flex items-center gap-2 rounded-xl bg-white/[0.04] px-3 py-1.5 text-sm text-slate-200 ring-1 ring-white/[0.08]"
                  >
                    <TechIcon tech={tech} size={15} />
                    {tech}
                  </motion.span>
                ))}
              </div>
            )}
          </Panel>

          <section>
            <SectionTitle icon={Network} title={t("discover.architecture")} count={discovery.nodes.length} />
            <ArchitectureGraph discovery={discovery} />
          </section>

          <section>
            <SectionTitle icon={Boxes} title={t("discover.dependencies")} count={discovery.dependencies.length} />
            {discovery.dependencies.length === 0 ? (
              <Panel className="p-5 text-sm text-slate-400">{t("discover.noDependencies")}</Panel>
            ) : (
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {discovery.dependencies.map((dep, i) => (
                  <DependencyCard key={dep.id} dependency={dep} index={i} />
                ))}
              </div>
            )}
          </section>

          <section>
            <SectionTitle icon={Terminal} title={t("discover.howRuns")} />
            <Panel className="grid gap-5 p-5 lg:grid-cols-2">
              <div className="flex flex-col gap-3">
                {discovery.run.install && <CommandBlock command={discovery.run.install} />}
                {discovery.run.start && <CommandBlock command={discovery.run.start} />}
                <div className="flex flex-wrap gap-2 text-xs">
                  {discovery.run.port > 0 && <Badge tone="amber">{t("discover.port", { port: discovery.run.port })}</Badge>}
                  <Badge>{t("discover.health", { path: discovery.run.healthPath })}</Badge>
                </div>
              </div>
              <div>
                <div className="mb-2 flex items-center gap-1.5 text-xs text-slate-500">
                  <KeyRound className="size-3.5" /> {t("discover.environment")}
                </div>
                {discovery.run.env.length === 0 ? (
                  <div className="text-sm text-slate-500">{t("discover.noEnv")}</div>
                ) : (
                  <div className="overflow-hidden rounded-xl ring-1 ring-white/[0.06]">
                    {discovery.run.env.map((env) => (
                      <div key={env.name} className="flex items-center gap-3 border-b border-white/[0.04] px-3 py-2 last:border-0">
                        <span className="font-mono text-xs text-cyan-200">{env.name}</span>
                        {env.required && <Badge tone="rose">{t("common.required")}</Badge>}
                        <span className="ml-auto truncate font-mono text-[11px] text-slate-500">{env.example}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </Panel>
          </section>

          {!replaying && !snapshot.entrypoints && phaseStatus(snapshot, "entrypoints") !== "running" && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
              <Panel className="flex flex-wrap items-center gap-4 bg-gradient-to-r from-amber-400/[0.06] to-cyan-400/[0.06] p-5">
                <Waypoints className="size-6 text-cyan-300" />
                <div className="flex-1">
                  <div className="font-medium text-white">{t("discover.nextTitle")}</div>
                  <div className="text-sm text-slate-400">{t("discover.nextText")}</div>
                </div>
                <Button
                  variant="primary"
                  icon={<ArrowRight className="size-4" />}
                  onClick={async () => {
                    await api.run(id, "entrypoints")
                    navigate(`/m/${id}/entrypoints`)
                  }}
                >
                  {t("discover.nextAction")}
                </Button>
              </Panel>
            </motion.div>
          )}
        </>
      )}
    </div>
  )
}

function DependencyCard({ dependency, index }: { dependency: Dependency; index: number }) {
  const { t, l } = useI18n()
  const strategy = STRATEGIES[dependency.strategy] ?? STRATEGIES.mock
  const KindIcon = DEPENDENCY_KINDS[dependency.kind] ?? Boxes
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      whileHover={{ y: -3 }}
      className="glass rounded-2xl p-4"
    >
      <div className="flex items-center gap-3">
        <div className="grid size-11 place-items-center rounded-xl bg-black/40 ring-1 ring-white/10">
          <TechIcon tech={dependency.tech || dependency.name} kind={DEP_NODE_KIND[dependency.kind]} size={22} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium text-white">{dependency.name}</div>
          <div className="flex items-center gap-1 text-xs text-slate-500">
            <KindIcon className="size-3" />
            {t(`dependency.${dependency.kind}` as Key)}
            {dependency.version && ` · ${dependency.version}`}
          </div>
        </div>
        <Badge tone={strategy.tone} icon={strategy.icon}>
          {t(`strategy.${dependency.strategy}` as Key)}
        </Badge>
      </div>
      {l(dependency.notes) && <p className="mt-3 text-xs leading-relaxed text-slate-400">{l(dependency.notes)}</p>}
      {dependency.env.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1">
          {dependency.env.map((env) => (
            <span key={env} className="rounded-md bg-white/[0.04] px-1.5 py-0.5 font-mono text-[10px] text-slate-400">
              {env}
            </span>
          ))}
        </div>
      )}
      {dependency.image && <div className="mt-2 truncate font-mono text-[10px] text-slate-600">{dependency.image}</div>}
    </motion.div>
  )
}

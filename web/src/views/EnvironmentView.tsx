import { Container, Drama, ExternalLink, FileCode2, Play, Square, TriangleAlert } from "lucide-react"
import { RichText } from "../components/RichText"
import { motion } from "motion/react"
import { useState } from "react"
import type { Activity, RuntimeStatus } from "../../../src/shared/types"
import { TechIcon } from "../components/brand"
import { CommandBlock } from "../components/Code"
import { Badge, Button, EmptyState, Panel } from "../components/ui"
import { api, type Snapshot } from "../lib/api"
import { cn } from "../lib/format"
import { useI18n } from "../lib/i18n"
import type { Key } from "../lib/i18n-core"
import { phaseStatus } from "../lib/pipeline"
import { useReplayView } from "../lib/project"
import { languageById, stackOf } from "../../../src/shared/stacks"
import { PhaseAction, PhaseHeader, SectionTitle, Working } from "./common"

type Service = NonNullable<Snapshot["environment"]>["services"][number]

export function EnvironmentView({ snapshot, activity }: { snapshot: Snapshot; activity: Activity[] }) {
  const { t, l } = useI18n()
  const { active: replaying } = useReplayView()
  const environment = snapshot.environment
  const running = phaseStatus(snapshot, "environment") === "running"
  const project = snapshot.project
  const [busy, setBusy] = useState(false)

  const legacyServices = environment?.services.filter((s) => s.role === "legacy" || s.name.startsWith("legacy")) ?? []
  const v2Services = environment?.services.filter((s) => s.role === "v2" || s.name.startsWith("v2")) ?? []

  return (
    <div className="flex flex-col gap-8">
      <PhaseHeader
        icon={Container}
        eyebrow={t("env.eyebrow")}
        title={t("env.title")}
        blurb={t("env.blurb")}
        snapshot={snapshot}
        phase="environment"
        action={<PhaseAction snapshot={snapshot} phase="environment" label={t("env.run")} />}
      />

      {!environment && running && <Working activity={activity} phaseKey="environment" title={t("env.working")} />}
      {!environment && !running && (
        <EmptyState icon={Container} title={t("env.emptyTitle")} action={<PhaseAction snapshot={snapshot} phase="environment" label={t("env.run")} />}>
          {t("env.emptyText")}
        </EmptyState>
      )}

      {environment && (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <Lane side="legacy" services={legacyServices} status={snapshot.state.runtime.legacy} port={project.ports.legacy} snapshot={snapshot} />
            <Lane side="v2" services={v2Services} status={snapshot.state.runtime.v2} port={project.ports.v2} snapshot={snapshot} />
          </div>

          {!replaying && (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                loading={busy}
                icon={<Play className="size-3.5" />}
                onClick={async () => {
                  setBusy(true)
                  await api.runtime(project.id, "up").catch(() => {})
                  setBusy(false)
                }}
              >
                {t("env.start")}
              </Button>
              <Button size="sm" variant="ghost" icon={<Square className="size-3.5" />} onClick={() => api.runtime(project.id, "down").catch(() => {})}>
                {t("env.stopReset")}
              </Button>
            </div>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            <section>
              <SectionTitle icon={Drama} title={t("env.mocks")} count={environment.mocks.length} />
              <Panel className="flex flex-col gap-3 p-4">
                {environment.mocks.length === 0 && <div className="text-sm text-slate-500">{t("env.noMocks")}</div>}
                {environment.mocks.map((mock) => (
                  <div key={mock.dependency} className="flex gap-3">
                    <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-violet-400/10">
                      <Drama className="size-4 text-violet-300" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-white">{mock.dependency}</div>
                      <div className="text-xs text-slate-400"><RichText text={l(mock.approach)} /></div>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {mock.files.map((file) => (
                          <span key={file} className="flex items-center gap-1 rounded bg-white/[0.04] px-1.5 font-mono text-[10px] text-slate-500">
                            <FileCode2 className="size-3" />
                            {file}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </Panel>
            </section>
            <section>
              <SectionTitle icon={TriangleAlert} title={t("env.limitations")} count={environment.limitations.length} />
              <Panel className="flex flex-col gap-2 p-4">
                {environment.limitations.length === 0 && <div className="text-sm text-slate-500">{t("env.noLimitations")}</div>}
                {environment.limitations.map((item) => (
                  <div key={item.en} className="flex gap-2 text-sm text-slate-300">
                    <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-300" />
                    <RichText text={l(item)} />
                  </div>
                ))}
              </Panel>
            </section>
          </div>

          <section>
            <SectionTitle icon={FileCode2} title={t("env.runYourself")} />
            <CommandBlock
              command={`cd ${project.workspace} && docker compose -f ${environment.composeFile} -p migrate-${project.id} build && docker compose -f ${environment.composeFile} -p migrate-${project.id} up -d`}
            />
          </section>
        </>
      )}
    </div>
  )
}

function Lane({ side, services, status, port, snapshot }: { side: "legacy" | "v2"; services: Service[]; status: RuntimeStatus; port: number; snapshot: Snapshot }) {
  const { t } = useI18n()
  const legacy = side === "legacy"
  const dependencies = snapshot.discovery?.dependencies ?? []
  const runtimeTech = legacy
    ? (snapshot.discovery?.stack.frameworks[0] ?? snapshot.discovery?.stack.runtime)
    : (languageById(stackOf(snapshot.project)?.language)?.icon ?? "go")

  const techOf = (service: Service) => {
    if (service.role === "legacy" || service.role === "v2") return runtimeTech
    return dependencies.find((d) => service.name.includes(d.id) || (d.tech && service.name.includes(d.tech)))?.tech ?? service.image
  }

  return (
    <Panel className={cn("relative overflow-hidden p-5 ring-1", legacy ? "ring-amber-400/20" : "ring-cyan-400/20")}>
      <div className={cn("absolute -top-20 -right-20 size-48 rounded-full blur-3xl", legacy ? "bg-amber-400/10" : "bg-cyan-400/10")} />
      <div className="relative flex items-center gap-3">
        <div className={cn("grid size-11 place-items-center rounded-xl ring-1", legacy ? "bg-amber-400/10 ring-amber-400/25" : "bg-cyan-400/10 ring-cyan-400/25")}>
          <TechIcon tech={runtimeTech} kind="service" size={22} />
        </div>
        <div className="flex-1">
          <div className={cn("text-xs font-semibold tracking-[0.18em] uppercase", legacy ? "text-amber-300" : "text-cyan-300")}>
            {legacy ? t("common.legacy") : t("common.v2")}
          </div>
          <div className="flex items-center gap-2 text-sm text-slate-300">
            <RuntimeDot status={status} />
            {t(`runtime.${status}` as Key)}
          </div>
        </div>
        <a
          href={`http://127.0.0.1:${port}`}
          target="_blank"
          rel="noreferrer"
          className={cn("flex items-center gap-1 font-mono text-xs", status === "up" ? "text-slate-300 hover:text-white" : "pointer-events-none text-slate-600")}
        >
          127.0.0.1:{port}
          <ExternalLink className="size-3" />
        </a>
      </div>
      <div className="relative mt-4 grid gap-2 sm:grid-cols-2">
        {services.length === 0 && (
          <div className="rounded-xl border border-dashed border-white/10 p-4 text-center text-xs text-slate-500 sm:col-span-2">
            {legacy ? t("env.noServices") : t("env.v2Later")}
          </div>
        )}
        {services.map((service, i) => (
          <motion.div
            key={service.name}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.05 }}
            className="flex items-center gap-2.5 rounded-xl bg-black/30 px-3 py-2.5 ring-1 ring-white/[0.06]"
          >
            {service.role === "mock" ? <Drama className="size-4 text-violet-300" /> : <TechIcon tech={techOf(service)} kind="datastore" size={16} />}
            <div className="min-w-0 flex-1">
              <div className="truncate font-mono text-xs text-slate-200">{service.name}</div>
              {service.image && <div className="truncate font-mono text-[10px] text-slate-600">{service.image}</div>}
            </div>
            <Badge tone={service.role === "mock" ? "violet" : service.role === "dependency" ? "slate" : legacy ? "amber" : "cyan"}>
              {t(`role.${service.role}` as Key)}
            </Badge>
          </motion.div>
        ))}
      </div>
    </Panel>
  )
}

function RuntimeDot({ status }: { status: RuntimeStatus }) {
  return (
    <span className="relative flex size-2.5">
      {(status === "up" || status === "starting") && (
        <span className={cn("absolute inline-flex size-full animate-ping-slow rounded-full", status === "up" ? "bg-emerald-400/60" : "bg-cyan-400/60")} />
      )}
      <span
        className={cn(
          "relative inline-flex size-2.5 rounded-full",
          status === "up" ? "bg-emerald-400" : status === "starting" ? "bg-cyan-300" : status === "failed" ? "bg-rose-400" : "bg-slate-600",
        )}
      />
    </span>
  )
}

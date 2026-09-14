import { CircleArrowUp, Leaf, type LucideIcon, Puzzle, Zap } from "lucide-react"
import type { RecommendationKind, StackChoice } from "../../../src/shared/stacks"
import { languageById, stackOf } from "../../../src/shared/stacks"
import type { ProjectRecord } from "../../../src/shared/types"
import { cn } from "../lib/format"
import { useI18n } from "../lib/i18n"
import type { Key } from "../lib/i18n-core"
import { navigate } from "../lib/router"
import { brandIcon } from "../lib/tech"
import { TechIcon } from "./brand"
import { Badge, type Tone } from "./ui"

export function CostMeter({ cost, compact }: { cost: 1 | 2 | 3; compact?: boolean }) {
  const { t } = useI18n()
  const tone = cost === 1 ? "bg-emerald-400" : cost === 2 ? "bg-amber-400" : "bg-rose-400"
  const label = t(`new.cost.${cost}` as Key)
  return (
    <span className="flex shrink-0 items-center gap-1.5" title={`${t("new.cloudCost")}: ${label}`}>
      <span className="flex items-end gap-0.5">
        {[1, 2, 3].map((bar) => (
          <span key={bar} className={cn("w-1.5 rounded-sm", bar <= cost ? tone : "bg-white/10")} style={{ height: 3 + bar * 3 }} />
        ))}
      </span>
      {!compact && <span className="text-[11px] text-slate-400">{label}</span>}
    </span>
  )
}

export const KINDS: Record<RecommendationKind, { icon: LucideIcon; tone: Tone; glow: string }> = {
  finops: { icon: Leaf, tone: "emerald", glow: "from-emerald-400/[0.12]" },
  scale: { icon: Zap, tone: "violet", glow: "from-violet-400/[0.12]" },
  upgrade: { icon: CircleArrowUp, tone: "amber", glow: "from-amber-400/[0.12]" },
  fit: { icon: Puzzle, tone: "cyan", glow: "from-cyan-400/[0.12]" },
}

export function KindBadge({ kind }: { kind: RecommendationKind }) {
  const { t } = useI18n()
  const meta = KINDS[kind]
  return (
    <Badge tone={meta.tone} icon={meta.icon}>
      {t(`kind.${kind}` as Key)}
    </Badge>
  )
}

/** Framework and library names, with a logo where one exists. */
export function ComponentChips({ components, fallback, className }: { components: string[]; fallback?: string; className?: string }) {
  return (
    <span className={cn("flex flex-wrap gap-1.5", className)}>
      {components.map((component) => (
        <span key={component} className="flex items-center gap-1.5 rounded-lg bg-white/[0.04] px-2 py-0.5 font-mono text-[11px] text-slate-300 ring-1 ring-white/[0.07]">
          {brandIcon(component) ? (
            <TechIcon tech={component} size={12} />
          ) : fallback ? (
            <span className="opacity-60">
              <TechIcon tech={fallback} size={12} />
            </span>
          ) : null}
          {component}
        </span>
      ))}
    </span>
  )
}

export function stackTitle(choice: StackChoice) {
  const language = languageById(choice.language)
  return `${language?.label ?? choice.language} ${choice.version}`
}

/** "to Go 1.23 · net/http" in the top bar, or a nudge to choose. */
export function StackLabel({ project, className }: { project: ProjectRecord; className?: string }) {
  const { t } = useI18n()
  const choice = stackOf(project)
  if (!choice) {
    return (
      <button
        type="button"
        onClick={() => navigate(`/m/${project.id}/target`)}
        className={cn("flex cursor-pointer items-center gap-1.5 text-xs text-slate-500 hover:text-cyan-200", className)}
      >
        {t("project.to")} <span className="rounded-md border border-dashed border-white/15 px-1.5 py-0.5">{t("target.none")}</span>
      </button>
    )
  }
  const language = languageById(choice.language)
  return (
    <button
      type="button"
      onClick={() => navigate(`/m/${project.id}/target`)}
      className={cn("flex cursor-pointer items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300", className)}
    >
      {t("project.to")} <TechIcon tech={language?.icon} size={14} />
      <span className="text-slate-300">{stackTitle(choice)}</span>
      <span className="text-slate-600">·</span>
      <span>{choice.name}</span>
    </button>
  )
}

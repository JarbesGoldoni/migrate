import { ArrowRight, ChevronDown, CircleCheck, Crosshair, Info, Layers, LayoutGrid, Lock, Network, Sparkles } from "lucide-react"
import { AnimatePresence, motion } from "motion/react"
import { useMemo, useState } from "react"
import { LANGUAGES, type LanguageOption, languageById, type StackChoice, stackCost, stackOf } from "../../../src/shared/stacks"
import { TechIcon } from "../components/brand"
import { RichText } from "../components/RichText"
import { ComponentChips, CostMeter, KINDS, KindBadge, stackTitle } from "../components/stack"
import { Badge, Button, EmptyState, Panel } from "../components/ui"
import { api, type Snapshot } from "../lib/api"
import { cn } from "../lib/format"
import { useI18n } from "../lib/i18n"
import type { Key } from "../lib/i18n-core"
import { phaseStatus } from "../lib/pipeline"
import { useProjectStore, useReplayView } from "../lib/project"
import { navigate } from "../lib/router"
import { choiceFor, sameChoice, type SuggestedStack, type TargetOption, targetOptions } from "../lib/target"
import { Callout, PhaseHeader, SectionTitle } from "./common"

export function TargetView({ snapshot }: { snapshot: Snapshot }) {
  const { t } = useI18n()
  const { active: replaying } = useReplayView()
  const project = snapshot.project
  const discovery = snapshot.discovery
  const saved = stackOf(project)
  const locked = Object.keys(snapshot.ports).length > 0
  const options = useMemo(() => targetOptions(discovery), [discovery])
  const [choice, setChoice] = useState<StackChoice | undefined>(
    () => saved ?? (options[0] ? choiceFor(options[0].language, options[0].version, options[0].stacks[0]) : undefined),
  )
  const [showAll, setShowAll] = useState(() => Boolean(saved && !options.some((o) => o.language === saved.language)))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string>()

  const header = <PhaseHeader icon={Crosshair} eyebrow={t("target.eyebrow")} title={t("target.title")} blurb={t("target.blurb")} snapshot={snapshot} />

  if (!discovery) {
    return (
      <div className="flex flex-col gap-8">
        {header}
        <EmptyState
          icon={Network}
          title={t("target.needsDiscovery")}
          action={
            <Button variant="primary" icon={<ArrowRight className="size-4" />} onClick={() => navigate(`/m/${project.id}/discover`)}>
              {t("target.goDiscover")}
            </Button>
          }
        >
          {t("target.needsDiscoveryText")}
        </EmptyState>
      </div>
    )
  }

  const language = languageById(choice?.language)
  const suggested = options.find((o) => o.language === choice?.language)?.stacks ?? []
  const dirty = !sameChoice(saved, choice)
  const findsEntrypoints = !snapshot.entrypoints && phaseStatus(snapshot, "entrypoints") !== "running"
  const selectLanguage = (id: string, version?: string, stack?: SuggestedStack) => {
    if (locked) return
    const option = options.find((o) => o.language === id)
    setChoice(choiceFor(id, version ?? option?.version ?? "", stack ?? option?.stacks[0]))
  }

  const confirm = async () => {
    if (!choice) return
    setSaving(true)
    setError(undefined)
    try {
      if (dirty) await api.update(project.id, { stack: choice })
      await useProjectStore.getState().refresh()
      if (findsEntrypoints) {
        await api.run(project.id, "entrypoints")
        navigate(`/m/${project.id}/entrypoints`)
      }
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-8">
      {header}

      {locked && saved && (
        <Callout tone="amber" icon={Lock} title={t("target.lockedTitle")}>
          {t("target.locked", { stack: `${stackTitle(saved)} · ${saved.name}` })}
        </Callout>
      )}

      <section>
        <SectionTitle
          icon={Sparkles}
          title={t("target.language")}
          right={options[0]?.ai ? <Badge tone="violet" icon={Sparkles}>{t("target.aiPick")}</Badge> : undefined}
        />
        {!options[0]?.ai && (
          <p className="mb-3 flex items-center gap-2 text-xs text-slate-500">
            <Info className="size-3.5 shrink-0" /> {t("target.noRecommendations")}
          </p>
        )}
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {options.map((option, i) => (
            <LanguageCard
              key={`${option.language}-${option.version}`}
              option={option}
              index={i}
              selected={choice?.language === option.language}
              disabled={locked}
              onSelect={() => selectLanguage(option.language, option.version, option.stacks[0])}
            />
          ))}
          <motion.button
            type="button"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: options.length * 0.07 }}
            whileHover={{ y: -3 }}
            onClick={() => setShowAll((s) => !s)}
            className={cn(
              "flex cursor-pointer flex-col gap-3 rounded-2xl border border-dashed p-5 text-left transition",
              showAll ? "border-cyan-400/40 bg-cyan-400/[0.04]" : "border-white/15 bg-white/[0.015] hover:border-white/25 hover:bg-white/[0.03]",
            )}
          >
            <div className="flex items-center justify-between">
              <Badge icon={LayoutGrid}>{t("target.languagesCount", { count: LANGUAGES.length })}</Badge>
              <ChevronDown className={cn("size-4 text-slate-500 transition", showAll && "rotate-180")} />
            </div>
            <div className="grid w-fit grid-cols-4 gap-2 rounded-2xl bg-black/30 p-2.5 ring-1 ring-white/[0.06]">
              {LANGUAGES.slice(0, 8).map((l) => (
                <TechIcon key={l.id} tech={l.icon} size={16} />
              ))}
            </div>
            <div>
              <div className="text-xl font-semibold text-white">{t("target.allLanguages")}</div>
              <p className="mt-1 text-sm text-slate-400">{t("target.allLanguagesText")}</p>
            </div>
          </motion.button>
        </div>

        <AnimatePresence initial={false}>
          {showAll && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
              <div className="grid gap-2 pt-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {LANGUAGES.map((option, i) => (
                  <LanguageTile
                    key={option.id}
                    language={option}
                    index={i}
                    suggested={options.some((o) => o.ai && o.language === option.id)}
                    selected={choice?.language === option.id}
                    disabled={locked}
                    onSelect={() => selectLanguage(option.id)}
                  />
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </section>

      <AnimatePresence mode="wait">
        {choice && language && (
          <motion.section key={choice.language} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <SectionTitle icon={Layers} title={t("target.stackFor", { language: stackTitle(choice) })} />
            {suggested.length > 0 && (
              <div className="grid gap-3 md:grid-cols-2">
                {suggested.map((stack, i) => (
                  <StackCard
                    key={`${stack.id}-${i}`}
                    stack={stack}
                    language={language}
                    index={i}
                    selected={choice.stack === stack.id && choice.name === stack.name}
                    disabled={locked}
                    onSelect={() => setChoice(choiceFor(choice.language, choice.version, stack))}
                  />
                ))}
              </div>
            )}
            <div className={cn(suggested.length > 0 && "mt-5")}>
              <div className="mb-2 text-[11px] font-semibold tracking-[0.16em] text-slate-500 uppercase">
                {suggested.length ? t("target.chooseYourself") : t("target.catalogStacks")}
              </div>
              <div className="flex flex-wrap gap-2">
                {language.stacks.map((stack) => {
                  const selected = choice.stack === stack.id && choice.name === stack.name
                  return (
                    <button
                      type="button"
                      key={stack.id}
                      disabled={locked}
                      onClick={() => setChoice(choiceFor(choice.language, choice.version, stack))}
                      className={cn(
                        "flex cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2 text-left ring-1 transition disabled:cursor-default",
                        selected ? "bg-cyan-400/[0.08] ring-cyan-400/40" : "bg-white/[0.025] ring-white/[0.07] hover:bg-white/[0.05]",
                      )}
                    >
                      <TechIcon tech={stack.icon} size={16} />
                      <span>
                        <span className="block text-sm text-white">{stack.name}</span>
                        <span className="block font-mono text-[10px] text-slate-500">{stack.components.join(" · ")}</span>
                      </span>
                      {selected && <CircleCheck className="size-4 text-cyan-300" />}
                    </button>
                  )
                })}
              </div>
            </div>
          </motion.section>
        )}
      </AnimatePresence>

      {choice && language && !replaying && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="sticky bottom-4 z-20">
          <Panel className="flex flex-wrap items-center gap-4 bg-ink-900/85 p-4 shadow-2xl ring-1 shadow-black/50 ring-cyan-400/20 backdrop-blur-xl">
            <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-cyan-400/10 ring-1 ring-cyan-400/25">
              <TechIcon tech={language.icon} size={24} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[11px] text-slate-500">{t("target.summary")}</div>
              <div className="flex flex-wrap items-center gap-2 text-sm font-medium text-white">
                {stackTitle(choice)} <span className="text-slate-600">·</span> {choice.name}
              </div>
              <ComponentChips components={choice.components} fallback={language.icon} className="mt-1.5" />
            </div>
            <CostMeter cost={stackCost(choice)} />
            {error && <span className="max-w-60 text-xs text-rose-300">{error}</span>}
            {saved && !dirty && !findsEntrypoints && (
              <Badge tone="emerald" icon={CircleCheck}>
                {t("target.saved")}
              </Badge>
            )}
            {!locked && (dirty || findsEntrypoints) && (
              <Button variant="primary" loading={saving} icon={<ArrowRight className="size-4" />} onClick={confirm}>
                {findsEntrypoints ? t("target.confirm") : t("target.save")}
              </Button>
            )}
          </Panel>
        </motion.div>
      )}
    </div>
  )
}

function Traits({ language }: { language: LanguageOption }) {
  const { t } = useI18n()
  return (
    <span className="flex flex-wrap justify-end gap-1">
      {language.traits.slice(0, 2).map((trait) => (
        <span key={trait} className="rounded-md bg-white/[0.05] px-1.5 py-0.5 text-[10px] text-slate-400">
          {t(`trait.${trait}` as Key)}
        </span>
      ))}
    </span>
  )
}

function LanguageCard({ option, index, selected, disabled, onSelect }: { option: TargetOption; index: number; selected: boolean; disabled: boolean; onSelect: () => void }) {
  const { t, l } = useI18n()
  const language = languageById(option.language)
  if (!language) return null
  return (
    <motion.button
      type="button"
      disabled={disabled}
      onClick={onSelect}
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.07 }}
      whileHover={disabled ? undefined : { y: -3 }}
      className={cn(
        "glass relative flex cursor-pointer flex-col gap-3 overflow-hidden rounded-2xl p-5 text-left transition disabled:cursor-default",
        selected ? "ring-1 ring-cyan-400/50" : "hover:ring-1 hover:ring-white/15",
      )}
    >
      <div className={cn("pointer-events-none absolute inset-0 bg-gradient-to-br to-transparent to-60%", KINDS[option.kind].glow)} />
      <div className="relative flex items-center justify-between gap-2">
        <KindBadge kind={option.kind} />
        {selected && (
          <motion.span layoutId="target-language-check">
            <CircleCheck className="size-5 text-cyan-300" />
          </motion.span>
        )}
      </div>
      <div className="relative flex items-center gap-3">
        <div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-black/40 ring-1 ring-white/10">
          <TechIcon tech={language.icon} size={28} />
        </div>
        <div>
          <div className="text-xl font-semibold text-white">{language.label}</div>
          <div className="font-mono text-xs text-slate-400">{option.version}</div>
        </div>
      </div>
      <p className="relative text-sm text-slate-400">
        {option.reason ? <RichText text={l(option.reason)} /> : option.fallbackReason ? t(option.fallbackReason) : null}
      </p>
      <div className="relative mt-auto flex items-center justify-between gap-2 pt-1">
        <CostMeter cost={language.cost} />
        <Traits language={language} />
      </div>
    </motion.button>
  )
}

function LanguageTile({
  language,
  index,
  suggested,
  selected,
  disabled,
  onSelect,
}: {
  language: LanguageOption
  index: number
  suggested: boolean
  selected: boolean
  disabled: boolean
  onSelect: () => void
}) {
  const { t } = useI18n()
  return (
    <motion.button
      type="button"
      disabled={disabled}
      onClick={onSelect}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.025 }}
      className={cn(
        "flex cursor-pointer items-center gap-3 rounded-xl p-3 text-left ring-1 transition disabled:cursor-default",
        selected ? "bg-cyan-400/[0.07] ring-cyan-400/40" : "bg-white/[0.02] ring-white/[0.07] hover:bg-white/[0.05]",
      )}
    >
      <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-black/40">
        <TechIcon tech={language.icon} size={22} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-sm font-medium text-white">
          {language.label}
          <span className="font-mono text-[10px] font-normal text-slate-500">{language.version}</span>
          {suggested && <Sparkles className="size-3 text-violet-300" aria-label={t("target.aiPick")} />}
        </div>
        <div className="mt-1 flex items-center gap-2">
          <CostMeter cost={language.cost} compact />
          <span className="truncate text-[10px] text-slate-500">{language.traits.map((trait) => t(`trait.${trait}` as Key)).join(" · ")}</span>
        </div>
      </div>
      {selected && <CircleCheck className="size-4 shrink-0 text-cyan-300" />}
    </motion.button>
  )
}

function StackCard({
  stack,
  language,
  index,
  selected,
  disabled,
  onSelect,
}: {
  stack: SuggestedStack
  language: LanguageOption
  index: number
  selected: boolean
  disabled: boolean
  onSelect: () => void
}) {
  const { l } = useI18n()
  const known = language.stacks.find((s) => s.id === stack.id)
  return (
    <motion.button
      type="button"
      disabled={disabled}
      onClick={onSelect}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.08 }}
      whileHover={disabled ? undefined : { y: -2 }}
      className={cn(
        "glass flex cursor-pointer flex-col gap-3 rounded-2xl p-4 text-left transition disabled:cursor-default",
        selected ? "ring-1 ring-cyan-400/50" : "hover:ring-1 hover:ring-white/15",
      )}
    >
      <div className="flex items-center gap-3">
        <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-black/40 ring-1 ring-white/10">
          <TechIcon tech={known?.icon ?? language.icon} size={22} />
        </div>
        <div className="min-w-0 flex-1 text-base font-semibold text-white">{stack.name}</div>
        {selected && (
          <motion.span layoutId="target-stack-check">
            <CircleCheck className="size-5 text-cyan-300" />
          </motion.span>
        )}
      </div>
      {stack.reason && l(stack.reason) && (
        <p className="text-sm text-slate-400">
          <RichText text={l(stack.reason)} />
        </p>
      )}
      <ComponentChips components={stack.components} fallback={language.icon} />
    </motion.button>
  )
}

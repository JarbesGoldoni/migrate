import type { Discovery, Localized } from "../../../src/shared/contracts"
import { defaultStack, languageById, normalizeLanguage, type RecommendationKind, type StackChoice } from "../../../src/shared/stacks"
import type { Key } from "./i18n-core"

export type SuggestedStack = { id: string; name: string; components: string[]; reason?: Localized }

export type TargetOption = {
  kind: RecommendationKind
  language: string
  version: string
  reason?: Localized
  fallbackReason?: Key
  stacks: SuggestedStack[]
  ai: boolean
}

/** The agent's three suggestions, or sensible defaults for architecture maps made before suggestions existed. */
export function targetOptions(discovery: Discovery | undefined): TargetOption[] {
  const recommendations = discovery?.recommendations ?? []
  if (recommendations.length) return recommendations.map((r) => ({ ...r, ai: true }))
  const pick = (kind: RecommendationKind, id: string, reason: Key): TargetOption => ({
    kind,
    language: id,
    version: languageById(id)?.version ?? "",
    fallbackReason: reason,
    stacks: [],
    ai: false,
  })
  // The first language is the main one; a frontend language listed after it is not what gets migrated.
  const current = normalizeLanguage(discovery?.stack.languages[0])
  const upgrade = current && current !== "go" && current !== "elixir" && current !== "erlang" ? current : undefined
  return [
    pick("finops", "go", "target.fallback.finops"),
    pick("scale", "elixir", "target.fallback.scale"),
    upgrade ? pick("upgrade", upgrade, "target.fallback.upgrade") : pick("scale", "erlang", "target.fallback.erlang"),
  ]
}

/** A stack choice for a language, from a suggested or catalog stack, or the language's default. */
export function choiceFor(language: string, version: string, stack?: { id: string; name: string; components: string[] }): StackChoice | undefined {
  const base = defaultStack(language)
  if (!base) return undefined
  if (!stack) return { ...base, version: version || base.version }
  return { language, version: version || base.version, stack: stack.id, name: stack.name, components: stack.components }
}

export function sameChoice(a: StackChoice | undefined, b: StackChoice | undefined) {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null)
}

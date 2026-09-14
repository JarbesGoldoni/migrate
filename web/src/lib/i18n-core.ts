import type { Localized } from "../../../src/shared/contracts"
import type { Message } from "../../../src/shared/messages"
import type { Locale } from "../../../src/shared/types"
import { en, type Key } from "./locales/en"
import { es } from "./locales/es"
import { ptBR } from "./locales/pt-BR"

export type { Key }
export type Params = Record<string, string | number | Localized>

/** Text the agent wrote, in the viewer's language (English when a translation is missing). */
export function localize(locale: Locale, value: Localized | string | undefined) {
  if (value === undefined) return ""
  if (typeof value === "string") return value
  return value[locale] || value.en
}

export const DICTIONARIES: Record<Locale, Record<Key, string>> = { en, "pt-BR": ptBR, es }

export const LOCALE_OPTIONS: Array<{ locale: Locale; short: string; name: string }> = [
  { locale: "en", short: "EN", name: "English" },
  { locale: "pt-BR", short: "PT", name: "Português (Brasil)" },
  { locale: "es", short: "ES", name: "Español" },
]

export function isKey(key: string): key is Key {
  return Object.hasOwn(en, key)
}

export function translate(locale: Locale, key: Key, params?: Params) {
  const template = DICTIONARIES[locale]?.[key] ?? en[key]
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = params?.[name]
    if (value === undefined) return match
    return typeof value === "object" ? localize(locale, value) : String(value)
  })
}

/** Render a server message in the viewer's language, falling back to the server's English text. */
export function describeMessage(locale: Locale, message: Message | undefined, fallback: string) {
  if (!message || !isKey(message.key)) return fallback
  const params: Params = { ...message.params }
  const phase = params.phase
  const phaseKey = `phase.${phase}`
  if (typeof phase === "string" && isKey(phaseKey)) params.phase = translate(locale, phaseKey)
  return translate(locale, message.key, params)
}

export function detectLocale(stored: string | null | undefined, preferred: readonly string[]): Locale {
  if (stored === "en" || stored === "pt-BR" || stored === "es") return stored
  for (const language of preferred) {
    const tag = language.toLowerCase()
    if (tag.startsWith("pt")) return "pt-BR"
    if (tag.startsWith("es")) return "es"
    if (tag.startsWith("en")) return "en"
  }
  return "en"
}

const UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ["year", 31_536_000],
  ["month", 2_592_000],
  ["day", 86_400],
  ["hour", 3_600],
  ["minute", 60],
]

export function relativeTime(locale: Locale, at: number | undefined, now = Date.now()) {
  if (!at) return ""
  const seconds = Math.round((at - now) / 1000)
  const format = new Intl.RelativeTimeFormat(locale, { numeric: "auto" })
  if (Math.abs(seconds) < 10) return format.format(0, "second")
  const unit = UNITS.find(([, size]) => Math.abs(seconds) >= size)
  return unit ? format.format(Math.round(seconds / unit[1]), unit[0]) : format.format(seconds, "second")
}

export function formatDate(locale: Locale, at: number) {
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(at)
}

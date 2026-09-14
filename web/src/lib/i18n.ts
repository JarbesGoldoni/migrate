import { useMemo } from "react"
import { create } from "zustand"
import type { Localized } from "../../../src/shared/contracts"
import type { Message } from "../../../src/shared/messages"
import type { Locale } from "../../../src/shared/types"
import { describeMessage, detectLocale, formatDate, type Key, localize, type Params, relativeTime, translate } from "./i18n-core"

const STORAGE_KEY = "migrate.locale"

function initialLocale(): Locale {
  let stored: string | null = null
  try {
    stored = localStorage.getItem(STORAGE_KEY)
  } catch {
    // Storage can be unavailable in private windows.
  }
  return detectLocale(stored, navigator.languages?.length ? navigator.languages : [navigator.language])
}

export const useLocale = create<{ locale: Locale; setLocale(locale: Locale): void }>((set) => ({
  locale: initialLocale(),
  setLocale(locale) {
    try {
      localStorage.setItem(STORAGE_KEY, locale)
    } catch {
      // Keep the choice for this session only.
    }
    document.documentElement.lang = locale
    set({ locale })
  },
}))

export function useI18n() {
  const locale = useLocale((s) => s.locale)
  const setLocale = useLocale((s) => s.setLocale)
  return useMemo(
    () => ({
      locale,
      setLocale,
      t: (key: Key, params?: Params) => translate(locale, key, params),
      m: (message: Message | undefined, fallback: string) => describeMessage(locale, message, fallback),
      l: (value: Localized | string | undefined) => localize(locale, value),
      ago: (at?: number) => relativeTime(locale, at),
      date: (at: number) => formatDate(locale, at),
    }),
    [locale, setLocale],
  )
}

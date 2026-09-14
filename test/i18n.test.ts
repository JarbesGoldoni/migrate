import { describe, expect, test } from "bun:test"
import { MESSAGE_KEYS } from "../src/shared/messages"
import {
  DICTIONARIES,
  describeMessage,
  detectLocale,
  formatDate,
  isKey,
  LOCALE_OPTIONS,
  localize,
  relativeTime,
  translate,
} from "../web/src/lib/i18n-core"
import { en } from "../web/src/lib/locales/en"

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()

describe("dictionaries", () => {
  test("every language has every key, with the same placeholders and no blanks", () => {
    const keys = Object.keys(en).sort()
    expect(LOCALE_OPTIONS.map((o): string => o.locale).sort()).toEqual(Object.keys(DICTIONARIES).sort())
    for (const [locale, dictionary] of Object.entries(DICTIONARIES)) {
      expect({ locale, keys: Object.keys(dictionary).sort() }).toEqual({ locale, keys })
      for (const key of keys) {
        const value = (dictionary as Record<string, string>)[key]
        expect({ locale, key, blank: value.trim() === "" }).toEqual({ locale, key, blank: false })
        expect({ locale, key, placeholders: placeholders(value) }).toEqual({
          locale,
          key,
          placeholders: placeholders((en as Record<string, string>)[key]),
        })
      }
    }
  })

  test("every message the server can send has a translation", () => {
    expect(MESSAGE_KEYS.filter((key) => !isKey(key))).toEqual([])
  })
})

describe("translate", () => {
  test("interpolates and keeps unknown placeholders", () => {
    expect(translate("en", "rules.count", { count: 3 })).toBe("3 rules")
    expect(translate("pt-BR", "rules.count", { count: 3 })).toBe("3 regras")
    expect(translate("es", "batch.steps", { done: 1, total: 5 })).toBe("1 de 5 pasos")
    expect(translate("en", "rules.count")).toBe("{count} rules")
  })

  test("shows agent text in the viewer's language", () => {
    const title = { en: "Login", "pt-BR": "Entrar", es: "" }
    expect(localize("pt-BR", title)).toBe("Entrar")
    expect(localize("es", title)).toBe("Login")
    expect(localize("en", "plain")).toBe("plain")
    expect(localize("en", undefined)).toBe("")
    expect(describeMessage("pt-BR", { key: "activity.parityIdentical", params: { title } }, "x")).toContain("Entrar")
  })

  test("renders server messages, translating phase names", () => {
    expect(describeMessage("pt-BR", { key: "activity.phaseStarted", params: { phase: "discover" } }, "fallback")).toBe("Início · Arquitetura")
    expect(describeMessage("es", { key: "note.parity", params: { matched: 2, total: 3 } }, "x")).toBe("2/3 respuestas idénticas")
    expect(describeMessage("en", { key: "activity.phaseFailed", params: { phase: "mystery" } }, "x")).toBe("mystery failed")
    expect(describeMessage("en", undefined, "plain")).toBe("plain")
    expect(describeMessage("en", { key: "unknown.key" as never }, "plain")).toBe("plain")
  })

  test("detects the language from storage, then the browser", () => {
    expect(detectLocale("es", ["pt-BR"])).toBe("es")
    expect(detectLocale("fr", ["pt-PT", "en"])).toBe("pt-BR")
    expect(detectLocale(null, ["es-AR"])).toBe("es")
    expect(detectLocale(undefined, ["de", "en-GB"])).toBe("en")
    expect(detectLocale(null, ["ja"])).toBe("en")
  })

  test("formats relative times and dates per language", () => {
    const now = 1_700_000_000_000
    expect(relativeTime("en", undefined, now)).toBe("")
    expect(relativeTime("en", now - 3_000, now)).toBe("now")
    expect(relativeTime("en", now - 30_000, now)).toBe("30 seconds ago")
    expect(relativeTime("en", now - 600_000, now)).toBe("10 minutes ago")
    expect(relativeTime("pt-BR", now - 7_200_000, now)).toContain("2")
    expect(relativeTime("es", now - 3 * 86_400_000, now)).toContain("3")
    expect(formatDate("en", now)).toContain("2023")
  })
})

import { describe, expect, test } from "bun:test"
import { BUILDS } from "../src/server/prompts"
import {
  defaultStack,
  LANGUAGES,
  languageById,
  normalizeLanguage,
  RECOMMENDATION_KINDS,
  sanitizeStack,
  stackById,
  stackCost,
  stackOf,
} from "../src/shared/stacks"

describe("stack catalog", () => {
  test("every language has stacks, a build and a known cost", () => {
    expect(LANGUAGES.map((l) => l.id)).toEqual(expect.arrayContaining(["go", "elixir", "erlang", "java", "python"]))
    for (const language of LANGUAGES) {
      expect(language.stacks.length).toBeGreaterThanOrEqual(2)
      expect(BUILDS[language.id]).toBeDefined()
      expect([1, 2, 3]).toContain(language.cost)
    }
    expect(LANGUAGES.filter((l) => l.cost === 1).map((l) => l.id)).toEqual(["go", "elixir", "erlang", "rust"])
    expect(RECOMMENDATION_KINDS).toEqual(["finops", "scale", "upgrade", "fit"])
  })

  test("recognizes languages by id, label and alias", () => {
    expect(normalizeLanguage("Golang")).toBe("go")
    expect(normalizeLanguage("C#")).toBe("csharp")
    expect(normalizeLanguage(" Node.js ")).toBe("typescript")
    expect(normalizeLanguage("Erlang")).toBe("erlang")
    expect(normalizeLanguage("cobol")).toBeUndefined()
    expect(normalizeLanguage(undefined)).toBeUndefined()
    expect(languageById("elixir")?.label).toBe("Elixir")
    expect(stackById("go", "gin")?.name).toBe("Gin")
    expect(stackById("go", "nope")).toBeUndefined()
  })

  test("defaults, costs and the stack a project runs with", () => {
    expect(defaultStack("go")).toEqual({ language: "go", version: "1.23", stack: "stdlib", name: "net/http", components: ["net/http", "pgx", "sqlc"] })
    expect(defaultStack("cobol")).toBeUndefined()
    const phoenix = { language: "elixir", version: "1.18", stack: "phoenix", name: "Phoenix", components: ["phoenix"] }
    expect(stackOf({ target: "elixir", stack: phoenix })).toBe(phoenix)
    expect(stackOf({ target: "python" })?.stack).toBe("fastapi")
    expect(stackOf({ target: "go", stack: { ...phoenix, language: "cobol" } })?.stack).toBe("stdlib")
    expect(stackOf({})).toBeUndefined()
    expect(stackCost(defaultStack("java"))).toBe(3)
    expect(stackCost({ ...defaultStack("java")!, stack: "quarkus" })).toBe(2)
    expect(stackCost(undefined)).toBe(2)
  })

  test("sanitizes stack choices from the API or a model", () => {
    expect(sanitizeStack(null)).toBeUndefined()
    expect(sanitizeStack({ language: "cobol" })).toBeUndefined()
    expect(sanitizeStack({ language: "golang", stack: "chi" })).toEqual({ language: "go", version: "1.23", stack: "chi", name: "chi", components: ["chi", "pgx", "sqlc"] })
    expect(sanitizeStack({ language: "Elixir", name: "phoenix" })).toMatchObject({ stack: "phoenix", name: "phoenix", components: ["phoenix", "ecto", "bandit"] })
    expect(sanitizeStack({ language: "go", name: "  Echo v4 ", components: ["echo", 3, " "], version: "1.22" })).toEqual({
      language: "go",
      version: "1.22",
      stack: "echo-v4",
      name: "Echo v4",
      components: ["echo"],
    })
    expect(sanitizeStack({ language: "rust" })).toMatchObject({ stack: "axum", name: "Axum" })
  })
})

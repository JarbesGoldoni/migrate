// Languages and stacks v2 can be written in. Shared by the prompts, the API and the UI.

export const RECOMMENDATION_KINDS = ["finops", "scale", "upgrade", "fit"] as const
export type RecommendationKind = (typeof RECOMMENDATION_KINDS)[number]

export type Trait = "finops" | "concurrency" | "safety" | "ecosystem" | "productivity"

/** Relative cloud bill for the same traffic: 1 is the lowest (small binaries, low memory, fast cold starts). */
export type Cost = 1 | 2 | 3

export type StackOption = { id: string; name: string; components: string[]; icon: string; cost?: Cost }

export type LanguageOption = {
  id: string
  label: string
  icon: string
  version: string
  cost: Cost
  traits: Trait[]
  aliases: string[]
  stacks: StackOption[]
}

/** What the user picked: a language, its version and the framework with its main libraries. */
export type StackChoice = { language: string; version: string; stack: string; name: string; components: string[] }

export const LANGUAGES: LanguageOption[] = [
  {
    id: "go",
    label: "Go",
    icon: "go",
    version: "1.23",
    cost: 1,
    traits: ["finops", "concurrency"],
    aliases: ["golang"],
    stacks: [
      { id: "stdlib", name: "net/http", components: ["net/http", "pgx", "sqlc"], icon: "go" },
      { id: "chi", name: "chi", components: ["chi", "pgx", "sqlc"], icon: "go" },
      { id: "gin", name: "Gin", components: ["gin", "gorm"], icon: "gin" },
      { id: "fiber", name: "Fiber", components: ["fiber", "pgx"], icon: "go" },
    ],
  },
  {
    id: "elixir",
    label: "Elixir",
    icon: "elixir",
    version: "1.17",
    cost: 1,
    traits: ["concurrency", "finops"],
    aliases: ["ex", "beam"],
    stacks: [
      { id: "phoenix", name: "Phoenix", components: ["phoenix", "ecto", "bandit"], icon: "phoenix" },
      { id: "plug", name: "Plug + Bandit", components: ["plug", "bandit", "ecto"], icon: "elixir" },
    ],
  },
  {
    id: "erlang",
    label: "Erlang",
    icon: "erlang",
    version: "OTP 27",
    cost: 1,
    traits: ["concurrency", "finops"],
    aliases: ["otp"],
    stacks: [
      { id: "cowboy", name: "Cowboy", components: ["cowboy", "epgsql"], icon: "erlang" },
      { id: "elli", name: "Elli", components: ["elli", "epgsql"], icon: "erlang" },
    ],
  },
  {
    id: "rust",
    label: "Rust",
    icon: "rust",
    version: "1.83",
    cost: 1,
    traits: ["finops", "safety"],
    aliases: ["rs"],
    stacks: [
      { id: "axum", name: "Axum", components: ["axum", "tokio", "sqlx"], icon: "tokio" },
      { id: "actix", name: "Actix Web", components: ["actix-web", "sqlx"], icon: "actix" },
    ],
  },
  {
    id: "csharp",
    label: "C#",
    icon: "dotnet",
    version: ".NET 8",
    cost: 2,
    traits: ["ecosystem"],
    aliases: ["c#", "dotnet", ".net", "aspnet", "asp.net", "cs"],
    stacks: [
      { id: "minimal", name: "ASP.NET Core minimal APIs", components: ["asp.net core", "dapper"], icon: "dotnet" },
      { id: "aot", name: "ASP.NET Core Native AOT", components: ["asp.net core", "native aot", "dapper"], icon: "dotnet", cost: 1 },
    ],
  },
  {
    id: "typescript",
    label: "TypeScript",
    icon: "typescript",
    version: "5",
    cost: 2,
    traits: ["productivity"],
    aliases: ["ts", "javascript", "js", "node", "nodejs", "node.js", "bun", "deno"],
    stacks: [
      { id: "hono", name: "Bun + Hono", components: ["bun", "hono", "drizzle"], icon: "hono" },
      { id: "fastify", name: "Node.js + Fastify", components: ["node", "fastify", "prisma"], icon: "fastify" },
      { id: "nestjs", name: "NestJS", components: ["nestjs", "prisma"], icon: "nestjs", cost: 3 },
    ],
  },
  {
    id: "kotlin",
    label: "Kotlin",
    icon: "kotlin",
    version: "2.0",
    cost: 2,
    traits: ["productivity"],
    aliases: ["kt"],
    stacks: [
      { id: "ktor", name: "Ktor", components: ["ktor", "exposed"], icon: "ktor" },
      { id: "spring", name: "Spring Boot", components: ["spring boot", "kotlin"], icon: "springboot", cost: 3 },
    ],
  },
  {
    id: "java",
    label: "Java",
    icon: "java",
    version: "21",
    cost: 3,
    traits: ["ecosystem"],
    aliases: ["jvm", "openjdk"],
    stacks: [
      { id: "spring", name: "Spring Boot 3", components: ["spring boot", "virtual threads", "hibernate"], icon: "springboot" },
      { id: "quarkus", name: "Quarkus native", components: ["quarkus", "graalvm"], icon: "quarkus", cost: 2 },
    ],
  },
  {
    id: "scala",
    label: "Scala",
    icon: "scala",
    version: "3",
    cost: 2,
    traits: ["concurrency"],
    aliases: [],
    stacks: [
      { id: "http4s", name: "http4s", components: ["http4s", "cats effect", "doobie"], icon: "scala" },
      { id: "zio", name: "ZIO HTTP", components: ["zio-http", "zio"], icon: "scala" },
    ],
  },
  {
    id: "python",
    label: "Python",
    icon: "python",
    version: "3.12",
    cost: 3,
    traits: ["productivity"],
    aliases: ["py"],
    stacks: [
      { id: "fastapi", name: "FastAPI", components: ["fastapi", "pydantic", "sqlalchemy"], icon: "fastapi" },
      { id: "django", name: "Django REST framework", components: ["django", "djangorestframework"], icon: "django" },
      { id: "flask", name: "Flask", components: ["flask", "sqlalchemy"], icon: "flask" },
    ],
  },
  {
    id: "php",
    label: "PHP",
    icon: "php",
    version: "8.3",
    cost: 3,
    traits: ["ecosystem"],
    aliases: [],
    stacks: [
      { id: "laravel", name: "Laravel", components: ["laravel", "eloquent"], icon: "laravel" },
      { id: "symfony", name: "Symfony", components: ["symfony", "doctrine"], icon: "symfony" },
    ],
  },
  {
    id: "ruby",
    label: "Ruby",
    icon: "ruby",
    version: "3.3",
    cost: 3,
    traits: ["productivity"],
    aliases: ["rb"],
    stacks: [
      { id: "rails", name: "Rails API", components: ["rails", "activerecord", "puma"], icon: "rails" },
      { id: "sinatra", name: "Sinatra", components: ["sinatra", "sequel", "puma"], icon: "ruby" },
    ],
  },
]

export function languageById(id: string | undefined) {
  return LANGUAGES.find((language) => language.id === id)
}

/** "golang", "C#" or "Node.js" become catalog ids; anything else is undefined. */
export function normalizeLanguage(value: string | undefined) {
  const key = (value ?? "").trim().toLowerCase()
  if (!key) return undefined
  return LANGUAGES.find((language) => language.id === key || language.label.toLowerCase() === key || language.aliases.includes(key))?.id
}

export function stackById(languageId: string | undefined, stackId: string | undefined) {
  return languageById(languageId)?.stacks.find((stack) => stack.id === stackId)
}

export function defaultStack(languageId: string): StackChoice | undefined {
  const language = languageById(languageId)
  const stack = language?.stacks[0]
  if (!language || !stack) return undefined
  return { language: language.id, version: language.version, stack: stack.id, name: stack.name, components: stack.components }
}

/** The choice a project runs with: its own, or the language's first stack for migrations made before stacks existed. */
export function stackOf(project: { target?: string; stack?: StackChoice }): StackChoice | undefined {
  if (project.stack && languageById(project.stack.language)) return project.stack
  return project.target ? defaultStack(project.target) : undefined
}

export function stackCost(choice: StackChoice | undefined): Cost {
  const language = languageById(choice?.language)
  return stackById(choice?.language, choice?.stack)?.cost ?? language?.cost ?? 2
}

/** Keep a stack choice from the API or a model within sane bounds. */
export function sanitizeStack(value: unknown): StackChoice | undefined {
  if (!value || typeof value !== "object") return undefined
  const input = value as Record<string, unknown>
  const language = languageById(normalizeLanguage(typeof input.language === "string" ? input.language : undefined))
  if (!language) return undefined
  const given = typeof input.name === "string" ? input.name.trim().slice(0, 80) : ""
  const known = language.stacks.find((stack) => stack.id === input.stack || (given && stack.name.toLowerCase() === given.toLowerCase()))
  const name = given || (known?.name ?? language.stacks[0].name)
  const components = Array.isArray(input.components)
    ? input.components.filter((c): c is string => typeof c === "string" && c.trim() !== "").map((c) => c.trim().slice(0, 40)).slice(0, 8)
    : (known?.components ?? [])
  const version = typeof input.version === "string" && input.version.trim() ? input.version.trim().slice(0, 24) : language.version
  const stack = known?.id ?? (slugify(name) || language.stacks[0].id)
  return { language: language.id, version, stack, name, components }
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
}

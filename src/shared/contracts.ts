import { z } from "zod"
import { languageById, normalizeLanguage, RECOMMENDATION_KINDS } from "./stacks"

// Phase outputs are written by a model, so every field is tolerant: bad or
// missing values fall back to a default instead of failing the whole phase.

export const text = (fallback = "") =>
  z.unknown().transform((v): string => {
    if (typeof v === "string") return v.trim()
    if (typeof v === "number" || typeof v === "boolean") return String(v)
    return fallback
  })

export const int = (fallback: number) =>
  z.unknown().transform((v): number => {
    const n = typeof v === "number" ? v : typeof v === "string" ? Number.parseInt(v, 10) : Number.NaN
    return Number.isFinite(n) ? Math.trunc(n) : fallback
  })

export const bool = (fallback: boolean) =>
  z.unknown().transform((v): boolean => {
    if (typeof v === "boolean") return v
    if (v === "true") return true
    if (v === "false") return false
    return fallback
  })

export const oneOf = <const T extends readonly string[]>(values: T, fallback: T[number]) =>
  z.unknown().transform((v): T[number] => {
    const s = typeof v === "string" ? v.trim().toLowerCase() : ""
    return values.includes(s) ? (s as T[number]) : fallback
  })

export const list = <T extends z.ZodType>(item: T) =>
  z.unknown().transform((v): z.output<T>[] => {
    if (!Array.isArray(v)) return []
    return v.flatMap((x) => {
      const r = item.safeParse(x)
      return r.success ? [r.data] : []
    })
  })

export const strings = () => list(text()).transform((a) => a.filter(Boolean))

export const dict = () =>
  z.unknown().transform((v): Record<string, string> => {
    if (!v || typeof v !== "object" || Array.isArray(v)) return {}
    return Object.fromEntries(
      Object.entries(v).flatMap(([k, val]) =>
        val === null || val === undefined ? [] : [[k, typeof val === "string" ? val : JSON.stringify(val)]],
      ),
    )
  })

// ── Text shown to people, in every language the app speaks ─────────────────

export type Localized = { en: string; "pt-BR": string; es: string }

const LANGUAGE_ALIASES: Record<keyof Localized, string[]> = {
  en: ["en", "en-US", "english"],
  "pt-BR": ["pt-BR", "pt", "pt_BR", "pt-br", "portuguese"],
  es: ["es", "es-ES", "spanish"],
}

/** Accepts a translations object or a plain string (older migrations, or a model that ignored the format). */
export function localized(value: unknown, fallback = ""): Localized {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    const s = String(value).trim() || fallback
    return { en: s, "pt-BR": s, es: s }
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const source = value as Record<string, unknown>
    const pick = (aliases: string[]) =>
      aliases.map((key) => source[key]).find((v): v is string => typeof v === "string" && v.trim() !== "")?.trim()
    const en = pick(LANGUAGE_ALIASES.en) ?? pick(LANGUAGE_ALIASES["pt-BR"]) ?? pick(LANGUAGE_ALIASES.es) ?? fallback
    return { en, "pt-BR": pick(LANGUAGE_ALIASES["pt-BR"]) ?? en, es: pick(LANGUAGE_ALIASES.es) ?? en }
  }
  return { en: fallback, "pt-BR": fallback, es: fallback }
}

export const mapLocalized = (value: Localized, fn: (text: string) => string): Localized => ({
  en: fn(value.en),
  "pt-BR": fn(value["pt-BR"]),
  es: fn(value.es),
})

export const prose = () => z.unknown().transform((v) => localized(v))

export const proseList = () => list(prose()).transform((a) => a.filter((item) => item.en))

// zod rejects absent keys even when their schema accepts undefined, so every
// declared key is materialized before validation.
export const obj = <S extends z.ZodRawShape>(shape: S) =>
  z.preprocess((v) => {
    const source = v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
    return Object.fromEntries(Object.keys(shape).map((key) => [key, source[key]]))
  }, z.object(shape))

export function slug(value: string, fallback = "item") {
  const s = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
  return s || fallback
}

function uniqueIds<T extends { id: string }>(items: T[], seed: (item: T, index: number) => string) {
  const seen = new Set<string>()
  return items.map((item, index) => {
    const base = slug(item.id || seed(item, index), `item-${index + 1}`)
    let id = base
    for (let n = 2; seen.has(id); n++) id = `${base}-${n}`
    seen.add(id)
    return { ...item, id }
  })
}

// ── Discovery: architecture + dependencies + how to run ──────────────────────

export const NODE_KINDS = [
  "client",
  "gateway",
  "service",
  "module",
  "worker",
  "datastore",
  "cache",
  "queue",
  "external",
  "storage",
] as const

export const DEPENDENCY_KINDS = ["database", "cache", "queue", "external-api", "storage", "search", "other"] as const

export const DEPENDENCY_STRATEGIES = ["container", "mock", "skip"] as const

const DiscoverySchema = obj({
  summary: prose(),
  stack: obj({
    languages: strings(),
    frameworks: strings(),
    runtime: text(),
    packageManager: text(),
  }),
  run: obj({
    install: text(),
    start: text(),
    port: int(0),
    healthPath: text("/"),
    env: list(obj({ name: text(), required: bool(false), example: text() })),
  }),
  nodes: list(
    obj({
      id: text(),
      label: prose(),
      kind: oneOf(NODE_KINDS, "module"),
      tech: text(),
      description: prose(),
      paths: strings(),
    }),
  ),
  edges: list(
    obj({
      from: text(),
      to: text(),
      label: prose(),
      kind: oneOf(["sync", "async", "data"] as const, "sync"),
    }),
  ),
  dependencies: list(
    obj({
      id: text(),
      name: text(),
      kind: oneOf(DEPENDENCY_KINDS, "other"),
      tech: text(),
      version: text(),
      usedBy: strings(),
      env: strings(),
      strategy: oneOf(DEPENDENCY_STRATEGIES, "mock"),
      image: text(),
      notes: prose(),
    }),
  ),
  recommendations: list(
    obj({
      kind: oneOf(RECOMMENDATION_KINDS, "fit"),
      language: text(),
      version: text(),
      reason: prose(),
      stacks: list(obj({ id: text(), name: text(), components: strings(), reason: prose() })),
    }),
  ),
})

export type Discovery = ReturnType<typeof parseDiscovery>
export type ArchitectureNode = Discovery["nodes"][number]
export type ArchitectureEdge = Discovery["edges"][number]
export type Dependency = Discovery["dependencies"][number]
export type Recommendation = Discovery["recommendations"][number]
export type RecommendedStack = Recommendation["stacks"][number]

/** Up to three target languages from the catalog, each with up to two stacks; unknown languages are dropped. */
function recommendationsOf(raw: z.output<typeof DiscoverySchema>["recommendations"]) {
  const seen = new Set<string>()
  return raw
    .flatMap((r) => {
      const language = languageById(normalizeLanguage(r.language))
      if (!language) return []
      const version = r.version || language.version
      if (seen.has(`${language.id}@${version}`)) return []
      seen.add(`${language.id}@${version}`)
      const stacks = r.stacks.flatMap((s) => {
        const known = language.stacks.find((k) => k.id === s.id.toLowerCase() || k.name.toLowerCase() === s.name.toLowerCase())
        const name = s.name || known?.name
        if (!name) return []
        return [{ id: known?.id ?? slug(name), name, components: s.components.length ? s.components : (known?.components ?? []), reason: s.reason }]
      })
      return [{ ...r, language: language.id, version, stacks: stacks.slice(0, 2) }]
    })
    .slice(0, 3)
}

export function parseDiscovery(input: unknown) {
  const raw = DiscoverySchema.parse(input)
  const kept = raw.nodes.filter((n) => n.id || n.label.en)
  const nodes = uniqueIds(kept, (n) => n.label.en).map((n) => ({ ...n, label: n.label.en ? n.label : localized(n.id) }))
  // Models refer to nodes by id or by label; accept both, first mention wins.
  const lookup = new Map<string, string>()
  const remember = (key: string, id: string) => {
    if (key && !lookup.has(key)) lookup.set(key, id)
  }
  for (const n of nodes) remember(n.id, n.id)
  kept.forEach((n, i) => {
    remember(n.id.toLowerCase(), nodes[i].id)
    for (const label of Object.values(n.label)) remember(label.toLowerCase(), nodes[i].id)
  })
  const resolve = (ref: string) => lookup.get(ref.toLowerCase()) ?? lookup.get(slug(ref))
  const edges = raw.edges.flatMap((e, index) => {
    const from = resolve(e.from)
    const to = resolve(e.to)
    if (!from || !to || from === to) return []
    return [{ ...e, id: `e${index + 1}-${from}-${to}`, from, to }]
  })
  const dependencies = uniqueIds(
    raw.dependencies.filter((d) => d.id || d.name),
    (d) => d.name,
  ).map((d) => ({ ...d, name: d.name || d.id }))
  return { ...raw, nodes, edges, dependencies, recommendations: recommendationsOf(raw.recommendations) }
}

// ── Entry points and batches ────────────────────────────────────────────────

export const ENTRYPOINT_KINDS = ["http", "graphql", "grpc", "websocket", "cli", "job", "queue", "other"] as const

const EntryPointsSchema = obj({
  entrypoints: list(
    obj({
      id: text(),
      kind: oneOf(ENTRYPOINT_KINDS, "http"),
      method: text(),
      path: text(),
      name: prose(),
      file: text(),
      line: int(0),
      handler: text(),
      summary: prose(),
      dependencies: strings(),
      complexity: oneOf(["low", "medium", "high"] as const, "medium"),
    }),
  ),
  batches: list(
    obj({
      id: text(),
      title: prose(),
      rationale: prose(),
      icon: text(),
      entrypoints: strings(),
    }),
  ),
})

export type EntryPoints = ReturnType<typeof parseEntryPoints>
export type EntryPoint = EntryPoints["entrypoints"][number]
export type Batch = EntryPoints["batches"][number]

const OTHER_BATCH = {
  title: { en: "Other entry points", "pt-BR": "Outros pontos de entrada", es: "Otros puntos de entrada" },
  rationale: {
    en: "Entry points that were not grouped into a batch.",
    "pt-BR": "Pontos de entrada que não foram agrupados em um lote.",
    es: "Puntos de entrada que no se agruparon en un lote.",
  },
}

export function parseEntryPoints(input: unknown) {
  const raw = EntryPointsSchema.parse(input)
  const kept = raw.entrypoints.filter((e) => e.id || e.path || e.name.en)
  const entrypoints = uniqueIds(kept, (e) => `${e.method} ${e.path || e.name.en}`).map((e) => {
    const method = e.kind === "http" ? (e.method || "GET").toUpperCase() : e.method.toUpperCase()
    return { ...e, method, name: e.name.en ? e.name : localized(`${method} ${e.path}`.trim()) }
  })
  const lookup = new Map<string, string>()
  for (const e of entrypoints) lookup.set(e.id, e.id)
  kept.forEach((e, i) => {
    const key = e.id.toLowerCase()
    if (key && !lookup.has(key)) lookup.set(key, entrypoints[i].id)
  })
  const claimed = new Set<string>()
  const batches = uniqueIds(
    raw.batches.filter((b) => b.id || b.title.en),
    (b) => b.title.en,
  )
    .map((b) => {
      const ids = b.entrypoints.flatMap((ref) => {
        const id = lookup.get(ref.toLowerCase()) ?? lookup.get(slug(ref))
        if (!id || claimed.has(id)) return []
        claimed.add(id)
        return [id]
      })
      return { ...b, title: b.title.en ? b.title : localized(b.id), entrypoints: ids }
    })
    .filter((b) => b.entrypoints.length > 0)
  const orphans = entrypoints.filter((e) => !claimed.has(e.id)).map((e) => e.id)
  if (orphans.length) {
    batches.push({
      id: batches.some((b) => b.id === "other") ? "other-entrypoints" : "other",
      ...OTHER_BATCH,
      icon: "layers",
      entrypoints: orphans,
    })
  }
  return { entrypoints, batches }
}

// ── Legacy environment ──────────────────────────────────────────────────────

const EnvironmentSchema = obj({
  composeFile: text("migration/env/compose.yml"),
  services: list(
    obj({
      name: text(),
      role: oneOf(["legacy", "v2", "dependency", "mock"] as const, "dependency"),
      image: text(),
      notes: prose(),
    }),
  ),
  mocks: list(obj({ dependency: text(), approach: prose(), files: strings() })),
  limitations: proseList(),
})

export type Environment = ReturnType<typeof parseEnvironment>

export function parseEnvironment(input: unknown) {
  const raw = EnvironmentSchema.parse(input)
  return { ...raw, services: raw.services.filter((s) => s.name) }
}

// ── Business rules ──────────────────────────────────────────────────────────

export const RULE_KINDS = [
  "validation",
  "calculation",
  "authorization",
  "state",
  "persistence",
  "integration",
  "error",
  "other",
] as const

const RulesSchema = obj({
  batch: text(),
  entrypoints: list(
    obj({
      entrypoint: text(),
      flow: list(obj({ file: text(), line: int(0), description: prose() })),
      rules: list(
        obj({
          id: text(),
          title: prose(),
          kind: oneOf(RULE_KINDS, "other"),
          description: prose(),
          file: text(),
          lineStart: int(0),
          lineEnd: int(0),
          decisions: list(obj({ id: text(), when: prose(), then: prose() })),
        }),
      ),
    }),
  ),
})

export type Rules = ReturnType<typeof parseRules>
export type Rule = Rules["entrypoints"][number]["rules"][number]

export function parseRules(input: unknown) {
  const raw = RulesSchema.parse(input)
  const seen = new Set<string>()
  return {
    ...raw,
    entrypoints: raw.entrypoints
      .filter((e) => e.entrypoint)
      .map((e) => ({
        ...e,
        rules: e.rules.map((r, i) => {
          let id = r.id || `${slug(e.entrypoint)}-r${i + 1}`
          for (let n = 2; seen.has(id); n++) id = `${r.id || slug(e.entrypoint)}-${n}`
          seen.add(id)
          const title = r.title.en ? r.title : r.description.en ? mapLocalized(r.description, (s) => s.slice(0, 80)) : localized(id)
          return {
            ...r,
            id,
            title,
            lineEnd: Math.max(r.lineEnd, r.lineStart),
            decisions: r.decisions
              .filter((d) => d.when.en || d.then.en)
              .map((d, j) => ({ ...d, id: d.id || `${id}.${j + 1}` })),
          }
        }),
      })),
  }
}

// ── Characterization tests ──────────────────────────────────────────────────

export const MATCH_MODES = ["exact", "subset", "status"] as const

const TestsSchema = obj({
  batch: text(),
  cases: list(
    obj({
      id: text(),
      entrypoint: text(),
      rules: strings(),
      title: prose(),
      branch: text(),
      request: obj({
        method: text("GET"),
        path: text("/"),
        headers: dict(),
        query: dict(),
        body: z.unknown(),
      }),
      expect: obj({
        status: int(200),
        body: z.unknown(),
        match: oneOf(MATCH_MODES, "subset"),
      }),
      ignore: strings(),
    }),
  ),
})

export type Tests = ReturnType<typeof parseTests>
export type TestCase = Tests["cases"][number]

export function parseTests(input: unknown) {
  const raw = TestsSchema.parse(input)
  const cases = uniqueIds(
    raw.cases.filter((c) => c.request.path),
    (c) => c.title.en || `${c.request.method} ${c.request.path}`,
  ).map((c) => ({
    ...c,
    title: c.title.en ? c.title : localized(`${c.request.method} ${c.request.path}`),
    request: {
      ...c.request,
      method: (c.request.method || "GET").toUpperCase(),
      path: c.request.path.startsWith("/") ? c.request.path : `/${c.request.path}`,
      body: c.request.body ?? undefined,
    },
  }))
  return { ...raw, cases }
}

// ── Port and reconcile reports ──────────────────────────────────────────────

const PortSchema = obj({
  batch: text(),
  files: list(obj({ path: text(), purpose: prose() })),
  routes: list(obj({ entrypoint: text(), method: text(), path: text(), handler: text() })),
  mapping: list(obj({ rule: text(), function: text(), file: text() })),
  notes: proseList(),
})

export type Port = ReturnType<typeof parsePort>

export function parsePort(input: unknown) {
  const raw = PortSchema.parse(input)
  return {
    ...raw,
    files: raw.files.filter((f) => f.path),
    routes: raw.routes.map((r) => ({ ...r, method: r.method.toUpperCase() })),
  }
}

const ReconcileSchema = obj({
  batch: text(),
  fixes: list(obj({ case: text(), headline: prose(), cause: prose(), change: prose(), files: strings() })),
  notes: proseList(),
})

export type Reconcile = ReturnType<typeof parseReconcile>

export function parseReconcile(input: unknown) {
  return ReconcileSchema.parse(input)
}

// ── Fixing characterization tests against legacy ────────────────────────────

export const VERIFY_ACTIONS = ["request", "setup", "expectation", "removed"] as const

const VerifySchema = obj({
  batch: text(),
  fixes: list(obj({ case: text(), headline: prose(), cause: prose(), action: oneOf(VERIFY_ACTIONS, "expectation"), change: prose() })),
  notes: proseList(),
})

export type Verify = ReturnType<typeof parseVerify>

export function parseVerify(input: unknown) {
  const raw = VerifySchema.parse(input)
  return { ...raw, fixes: raw.fixes.filter((f) => f.case) }
}

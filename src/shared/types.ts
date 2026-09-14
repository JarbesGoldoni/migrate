import type { Message } from "./messages"
import type { StackChoice } from "./stacks"
import type {
  Discovery,
  Environment,
  EntryPoints,
  Port,
  Reconcile,
  Rules,
  Tests,
  Verify,
} from "./contracts"

export type PhaseStatus = "idle" | "running" | "done" | "failed"

export const PROJECT_PHASES = ["discover", "entrypoints", "environment"] as const
export const BATCH_PHASES = ["rules", "tests", "legacy", "verify", "port", "parity", "reconcile"] as const

export type ProjectPhase = (typeof PROJECT_PHASES)[number]
export type BatchPhase = (typeof BATCH_PHASES)[number]
export type PhaseName = ProjectPhase | BatchPhase

export function phaseKey(phase: PhaseName, batch?: string) {
  return batch ? `${phase}:${batch}` : phase
}

export function isBatchPhase(phase: string): phase is BatchPhase {
  return (BATCH_PHASES as readonly string[]).includes(phase)
}

export function isProjectPhase(phase: string): phase is ProjectPhase {
  return (PROJECT_PHASES as readonly string[]).includes(phase)
}

export type PhaseState = {
  status: PhaseStatus
  startedAt?: number
  finishedAt?: number
  error?: string
  note?: string
  noteMessage?: Message
}

export type ActivityKind =
  | "think"
  | "read"
  | "search"
  | "list"
  | "edit"
  | "write"
  | "bash"
  | "web"
  | "todo"
  | "agent"
  | "text"
  | "system"
  | "success"
  | "error"

export type Activity = {
  id: string
  at: number
  phase: string
  kind: ActivityKind
  title: string
  message?: Message
  detail?: string
  status?: "running" | "done" | "error"
}

/** A model and, when the model offers them, the reasoning effort ("variant") to run it with. */
export type ModelRef = { providerID: string; modelID: string; variant?: string }

export type ModelOption = { providerID: string; modelID: string; providerName: string; name: string; variants?: string[] }

export type EngineInfo = {
  ready: boolean
  version?: string
  models: ModelOption[]
  defaultModel?: ModelRef
  error?: string
}

export type HttpRequestSpec = {
  method: string
  path: string
  headers: Record<string, string>
  query: Record<string, string>
  body?: unknown
}

export type HttpResult = {
  status: number
  headers: Record<string, string>
  body: unknown
  text: string
  durationMs: number
  error?: string
}

export type Diff = {
  path: string
  kind: "status" | "changed" | "missing" | "extra" | "error"
  expected?: unknown
  actual?: unknown
}

export type Comparison = { match: boolean; diffs: Diff[] }

export type LegacyCaseRun = { caseId: string; response: HttpResult; expectation: Comparison }

export type LegacyRun = {
  batch: string
  at: number
  baseUrl: string
  results: LegacyCaseRun[]
  error?: string
}

export type ParityCase = {
  caseId: string
  legacy: HttpResult
  v2: HttpResult
  comparison: Comparison
}

export type ParityRun = {
  batch: string
  at: number
  matched: number
  total: number
  results: ParityCase[]
  error?: string
}

export type BuildStep = { name: string; ok: boolean; output: string; skipped?: boolean }

export type BuildReport = { batch: string; at: number; ok: boolean; steps: BuildStep[] }

export type RuntimeStatus = "down" | "starting" | "up" | "failed"

export type Runtime = {
  legacy: RuntimeStatus
  v2: RuntimeStatus
  message?: string
}

export type ProjectRecord = {
  id: string
  name: string
  source: string
  workspace: string
  branch: string
  createdAt: number
  model?: ModelRef
  /** Language id from the stack catalog; chosen after the architecture is mapped. */
  target?: string
  stack?: StackChoice
  language?: Locale
  ports: { legacy: number; v2: number }
}

export const LOCALES = ["en", "pt-BR", "es"] as const

export type Locale = (typeof LOCALES)[number]

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value)
}

export type MigrationSummary = {
  linked: boolean
  missing: boolean
  running: boolean
  steps: number
  batches: number
  batchesProven: number
  entrypoints: number
  rules: number
  cases: number
  matched: number
  compared: number
  lastActivity?: number
}

export type MigrationListItem = { project: ProjectRecord; summary: MigrationSummary }

export type ProjectState = {
  phases: Record<string, PhaseState>
  sessions: Record<string, string>
  runtime: Runtime
}

export type ProjectSnapshot = {
  project: ProjectRecord
  state: ProjectState
  discovery?: Discovery
  entrypoints?: EntryPoints
  environment?: Environment
  rules: Record<string, Rules>
  tests: Record<string, Tests>
  legacyRuns: Record<string, LegacyRun>
  ports: Record<string, Port>
  builds: Record<string, BuildReport>
  parity: Record<string, ParityRun>
  reconcile: Record<string, Reconcile>
  verify: Record<string, Verify>
}

export type PreflightCheck = {
  id: string
  label: string
  ok: boolean
  required: boolean
  version?: string
  detail?: string
  hint?: string
}

export type ProjectProbe = {
  path: string
  name: string
  exists: boolean
  isGit: boolean
  hasCommits: boolean
  markers: string[]
}

export type Preflight = { checks: PreflightCheck[]; project: ProjectProbe; ready: boolean }

export type FsEntry = { name: string; path: string; markers: string[] }

export type FsListing = { path: string; parent?: string; home: string; entries: FsEntry[]; markers: string[] }

export type ServerEvent =
  | { type: "activity"; activity: Activity }
  | { type: "phase"; key: string; state: PhaseState }
  | { type: "runtime"; runtime: Runtime }
  | { type: "changed"; artifact: string }

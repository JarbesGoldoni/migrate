import {
  type Batch,
  parseDiscovery,
  parseEntryPoints,
  parseEnvironment,
  parsePort,
  parseReconcile,
  parseRules,
  parseTests,
  parseVerify,
} from "../shared/contracts"
import type { PhaseName, ProjectSnapshot } from "../shared/types"
import {
  discoverPrompt,
  entrypointsPrompt,
  environmentPrompt,
  portPrompt,
  type PromptContext,
  reconcilePrompt,
  rulesPrompt,
  testsPrompt,
  verifyPrompt,
} from "./prompts"
import { artifacts } from "./store"

export type PhaseOps = {
  verifyLegacy(): Promise<void>
  writeCurls(batch: string): Promise<void>
  runLegacyTests(batch: string): Promise<void>
  buildV2(batch: string): Promise<boolean>
  runParity(batch: string): Promise<void>
  runInline(phase: PhaseName, batch?: string): Promise<void>
}

export type PhaseContext = { snapshot: ProjectSnapshot; batch?: Batch; ops: PhaseOps }

export type PhaseDefinition = {
  name: PhaseName
  title: string
  /** Which conversation the agent continues: discovery work shares one, each batch has its own. */
  session?: "project" | "batch"
  requires(snapshot: ProjectSnapshot, batch?: Batch): string | undefined
  output?(batch?: Batch): string
  prompt?(ctx: PromptContext): string
  parse?(raw: unknown): unknown
  after?(ctx: PhaseContext): Promise<void>
  commit(batch?: Batch): string
}

export function makePhase(definition: PhaseDefinition) {
  return definition
}

const needsBatch = (batch?: Batch) => (batch ? undefined : "Pick a batch first")

export const PHASES: Record<PhaseName, PhaseDefinition> = {
  discover: makePhase({
    name: "discover",
    title: "Map architecture and dependencies",
    session: "project",
    requires: () => undefined,
    output: () => artifacts.discovery,
    prompt: discoverPrompt,
    parse: parseDiscovery,
    commit: () => "migrate: map architecture and dependencies",
  }),

  entrypoints: makePhase({
    name: "entrypoints",
    title: "Find entry points",
    session: "project",
    requires: (s) => (s.discovery ? undefined : "Map the architecture first"),
    output: () => artifacts.entrypoints,
    prompt: entrypointsPrompt,
    parse: parseEntryPoints,
    commit: () => "migrate: find entry points and group them into batches",
  }),

  environment: makePhase({
    name: "environment",
    title: "Containerize legacy",
    session: "project",
    requires: (s) => (s.discovery ? undefined : "Map the architecture and dependencies first"),
    output: () => artifacts.environment,
    prompt: environmentPrompt,
    parse: parseEnvironment,
    after: (ctx) => ctx.ops.verifyLegacy(),
    commit: () => "migrate: containerize legacy with its dependencies",
  }),

  rules: makePhase({
    name: "rules",
    title: "Extract business rules",
    session: "batch",
    requires: (s, b) => needsBatch(b) ?? (s.entrypoints ? undefined : "Find entry points first"),
    output: (b) => artifacts.batch(b!.id, "rules"),
    prompt: rulesPrompt,
    parse: parseRules,
    commit: (b) => `migrate(${b!.id}): extract business rules`,
  }),

  tests: makePhase({
    name: "tests",
    title: "Write characterization tests",
    session: "batch",
    requires: (s, b) => needsBatch(b) ?? (s.rules[b!.id] ? undefined : "Extract the business rules first"),
    output: (b) => artifacts.batch(b!.id, "tests"),
    prompt: testsPrompt,
    parse: parseTests,
    after: async (ctx) => {
      await ctx.ops.writeCurls(ctx.batch!.id)
      if (ctx.snapshot.environment) await ctx.ops.runInline("legacy", ctx.batch!.id)
    },
    commit: (b) => `migrate(${b!.id}): characterization tests`,
  }),

  legacy: makePhase({
    name: "legacy",
    title: "Run tests against legacy",
    requires: (s, b) =>
      needsBatch(b) ??
      (!s.tests[b!.id] ? "Write the characterization tests first" : !s.environment ? "Containerize legacy first" : undefined),
    after: (ctx) => ctx.ops.runLegacyTests(ctx.batch!.id),
    commit: (b) => `migrate(${b!.id}): record legacy responses`,
  }),

  verify: makePhase({
    name: "verify",
    title: "Fix characterization tests",
    session: "batch",
    requires: (s, b) => {
      const blocked = needsBatch(b)
      if (blocked) return blocked
      if (!s.tests[b!.id]) return "Write the characterization tests first"
      const run = s.legacyRuns[b!.id]
      if (!run || run.error) return "Run the tests against legacy first"
      return run.results.some((r) => !r.expectation.match) ? undefined : "Every legacy response already matches the prediction"
    },
    output: (b) => artifacts.batch(b!.id, "verify"),
    prompt: verifyPrompt,
    parse: parseVerify,
    // One pass, then the adapted suite is replayed once — no loop.
    after: async (ctx) => {
      await ctx.ops.writeCurls(ctx.batch!.id)
      await ctx.ops.runInline("legacy", ctx.batch!.id)
    },
    commit: (b) => `migrate(${b!.id}): fix characterization tests`,
  }),

  port: makePhase({
    name: "port",
    title: "Port to the new stack",
    session: "batch",
    requires: (s, b) =>
      needsBatch(b) ?? (s.legacyRuns[b!.id] ? undefined : "Run the tests against legacy before building v2"),
    output: (b) => artifacts.batch(b!.id, "port"),
    prompt: portPrompt,
    parse: parsePort,
    after: async (ctx) => {
      const built = await ctx.ops.buildV2(ctx.batch!.id)
      if (built) await ctx.ops.runInline("parity", ctx.batch!.id)
    },
    commit: (b) => `migrate(${b!.id}): port to v2`,
  }),

  parity: makePhase({
    name: "parity",
    title: "Compare legacy and v2",
    requires: (s, b) => needsBatch(b) ?? (s.ports[b!.id] ? undefined : "Port the batch first"),
    after: (ctx) => ctx.ops.runParity(ctx.batch!.id),
    commit: (b) => `migrate(${b!.id}): parity run`,
  }),

  reconcile: makePhase({
    name: "reconcile",
    title: "Reconcile divergences",
    session: "batch",
    requires: (s, b) => {
      const blocked = needsBatch(b)
      if (blocked) return blocked
      const parity = s.parity[b!.id]
      if (!parity) return "Run parity first"
      return parity.matched < parity.total ? undefined : "Everything already matches"
    },
    output: (b) => artifacts.batch(b!.id, "reconcile"),
    prompt: reconcilePrompt,
    parse: parseReconcile,
    after: async (ctx) => {
      const built = await ctx.ops.buildV2(ctx.batch!.id)
      if (built) await ctx.ops.runInline("parity", ctx.batch!.id)
    },
    commit: (b) => `migrate(${b!.id}): reconcile divergences`,
  }),
}

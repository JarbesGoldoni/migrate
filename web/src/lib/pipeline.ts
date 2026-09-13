import type { BatchPhase, PhaseName, PhaseState, PhaseStatus, ProjectPhase } from "../../../src/shared/types"
import type { Snapshot } from "./api"

export const PROJECT_STEPS: { phase: ProjectPhase; label: string; blurb: string }[] = [
  { phase: "discover", label: "Architecture", blurb: "Map components, dependencies and how it runs" },
  { phase: "entrypoints", label: "Entry points", blurb: "Every way the world triggers behavior, in batches" },
  { phase: "environment", label: "Legacy runtime", blurb: "Containerize legacy with its dependencies and mocks" },
]

export const BATCH_STEPS: { phase: BatchPhase; label: string; blurb: string }[] = [
  { phase: "rules", label: "Business rules", blurb: "Trace each entry point end to end" },
  { phase: "tests", label: "Characterization", blurb: "Real requests in, expected responses out" },
  { phase: "legacy", label: "Run on legacy", blurb: "Record how legacy really answers" },
  { phase: "port", label: "Port to v2", blurb: "Rewrite the batch on the new stack" },
  { phase: "parity", label: "Parity", blurb: "Same request to both, compared" },
  { phase: "reconcile", label: "Reconcile", blurb: "Fix every divergence against legacy" },
]

export function phaseState(snapshot: Snapshot | undefined, phase: PhaseName, batch?: string): PhaseState {
  return snapshot?.state.phases[batch ? `${phase}:${batch}` : phase] ?? { status: "idle" }
}

export function phaseStatus(snapshot: Snapshot | undefined, phase: PhaseName, batch?: string): PhaseStatus {
  return phaseState(snapshot, phase, batch).status
}

export function hasOutput(snapshot: Snapshot, phase: PhaseName, batch?: string) {
  switch (phase) {
    case "discover":
      return Boolean(snapshot.discovery)
    case "entrypoints":
      return Boolean(snapshot.entrypoints)
    case "environment":
      return Boolean(snapshot.environment)
    case "rules":
      return Boolean(batch && snapshot.rules[batch])
    case "tests":
      return Boolean(batch && snapshot.tests[batch])
    case "legacy":
      return Boolean(batch && snapshot.legacyRuns[batch])
    case "port":
      return Boolean(batch && snapshot.ports[batch])
    case "parity":
      return Boolean(batch && snapshot.parity[batch])
    case "reconcile":
      return Boolean(batch && snapshot.reconcile[batch])
  }
}

/** The step a batch should run next, or undefined when it is fully proven. */
export function nextBatchPhase(snapshot: Snapshot, batch: string): BatchPhase | undefined {
  for (const step of BATCH_STEPS) {
    if (step.phase === "reconcile") {
      const parity = snapshot.parity[batch]
      return parity && parity.matched < parity.total ? "reconcile" : undefined
    }
    if (!hasOutput(snapshot, step.phase, batch)) return step.phase
  }
  return undefined
}

export function batchProgress(snapshot: Snapshot, batch: string) {
  const steps = BATCH_STEPS.filter((s) => s.phase !== "reconcile")
  const done = steps.filter((s) => hasOutput(snapshot, s.phase, batch)).length
  const parity = snapshot.parity[batch]
  return { done, total: steps.length, proven: Boolean(parity && parity.total > 0 && parity.matched === parity.total) }
}

export function isRunning(snapshot: Snapshot | undefined, batch?: string) {
  if (!snapshot) return false
  return Object.entries(snapshot.state.phases).some(
    ([key, state]) => state.status === "running" && (batch === undefined || key.endsWith(`:${batch}`)),
  )
}

export function totals(snapshot: Snapshot) {
  const rules = Object.values(snapshot.rules).reduce(
    (sum, r) => sum + r.entrypoints.reduce((n, e) => n + e.rules.length, 0),
    0,
  )
  const cases = Object.values(snapshot.tests).reduce((sum, t) => sum + t.cases.length, 0)
  const parity = Object.values(snapshot.parity)
  return {
    entrypoints: snapshot.entrypoints?.entrypoints.length ?? 0,
    batches: snapshot.entrypoints?.batches.length ?? 0,
    rules,
    cases,
    matched: parity.reduce((sum, p) => sum + p.matched, 0),
    compared: parity.reduce((sum, p) => sum + p.total, 0),
  }
}

import type { BatchPhase, PhaseName, PhaseState, PhaseStatus, ProjectPhase } from "../../../src/shared/types"
import type { Snapshot } from "./api"

export const PROJECT_STEPS: ProjectPhase[] = ["discover", "entrypoints", "environment"]

export const BATCH_STEPS: BatchPhase[] = ["rules", "tests", "legacy", "port", "parity", "reconcile"]

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
    case "verify":
      return Boolean(batch && snapshot.verify?.[batch])
  }
}

/** The step a batch should run next, or undefined when it is fully proven. */
export function nextBatchPhase(snapshot: Snapshot, batch: string): BatchPhase | undefined {
  for (const phase of BATCH_STEPS) {
    if (phase === "reconcile") {
      const parity = snapshot.parity[batch]
      return parity && parity.matched < parity.total ? "reconcile" : undefined
    }
    if (!hasOutput(snapshot, phase, batch)) return phase
  }
  return undefined
}

export function batchProgress(snapshot: Snapshot, batch: string) {
  const steps = BATCH_STEPS.filter((phase) => phase !== "reconcile")
  const done = steps.filter((phase) => hasOutput(snapshot, phase, batch)).length
  const parity = snapshot.parity[batch]
  return { done, total: steps.length, proven: Boolean(parity && parity.total > 0 && parity.matched === parity.total) }
}

export function isRunning(snapshot: Snapshot | undefined, batch?: string) {
  if (!snapshot) return false
  return Object.entries(snapshot.state.phases).some(
    ([key, state]) => state.status === "running" && (batch === undefined || key.endsWith(`:${batch}`)),
  )
}

export function canReplay(snapshot: Snapshot | undefined) {
  if (!snapshot || isRunning(snapshot)) return false
  return Object.values(snapshot.state.phases).some((state) => state.startedAt && state.status !== "running")
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

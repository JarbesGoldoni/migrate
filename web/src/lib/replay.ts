import type { Activity, PhaseName, PhaseState } from "../../../src/shared/types"
import type { Snapshot } from "./api"

/**
 * Replay rebuilds what the migration looked like at any past moment from what
 * was recorded: phase start/finish times, the activity history and the final
 * artifacts. Real time is compressed so short bursts keep their rhythm while
 * long silences (a model thinking for a minute) shrink to a beat.
 */

export type Clock = {
  start: number
  total: number
  toReal(position: number): number
  toPosition(real: number): number
}

const TAIL_MS = 1_500

export function compress(gap: number) {
  if (gap <= 0) return 0
  if (gap <= 1_000) return gap / 2
  return 500 + Math.min((gap - 1_000) / 10, 2_000)
}

export function buildClock(times: number[]): Clock {
  const moments = [...new Set(times.filter((t) => Number.isFinite(t) && t > 0))].sort((a, b) => a - b)
  if (moments.length === 0) return { start: 0, total: 0, toReal: () => 0, toPosition: () => 0 }
  const positions = [0]
  for (let i = 1; i < moments.length; i++) positions.push(positions[i - 1] + compress(moments[i] - moments[i - 1]))
  const last = moments.length - 1
  const interpolate = (value: number, from: number[], to: number[]) => {
    if (value <= from[0]) return to[0]
    if (value >= from[last]) return to[last] + (value - from[last])
    let i = 0
    while (from[i + 1] < value) i++
    const span = from[i + 1] - from[i]
    return span === 0 ? to[i + 1] : to[i] + ((value - from[i]) / span) * (to[i + 1] - to[i])
  }
  return {
    start: moments[0],
    total: positions[last] + TAIL_MS,
    toReal: (position) => interpolate(position, positions, moments),
    toPosition: (real) => interpolate(real, moments, positions),
  }
}

/** Phases that start another phase from inside themselves: the parent's output exists once the child starts. */
const INLINE_CHILD: Partial<Record<PhaseName, PhaseName>> = { tests: "legacy", port: "parity" }

type Window = { start: number; end: number; state: PhaseState }

function splitKey(key: string) {
  const [phase, batch] = key.split(":") as [PhaseName, string | undefined]
  return { phase, batch }
}

export function phaseWindows(source: Snapshot, history: Activity[]) {
  const windows = new Map<string, Window>()
  for (const [key, state] of Object.entries(source.state.phases)) {
    if (!state.startedAt) continue
    const lastActivity = history.reduce((max, a) => (a.phase === key && a.at >= state.startedAt! ? Math.max(max, a.at) : max), 0)
    // Interrupted runs have no finish time; they end with their last recorded activity.
    const end = state.finishedAt ?? Math.max(lastActivity, state.startedAt + 1_000)
    windows.set(key, { start: state.startedAt, end, state })
  }
  for (const [key, window] of windows) {
    const { phase, batch } = splitKey(key)
    const child = INLINE_CHILD[phase]
    const inner = child && windows.get(batch ? `${child}:${batch}` : child)
    if (inner && inner.start > window.start && inner.start < window.end) window.end = inner.start
  }
  return windows
}

/** Activity worth replaying: earlier failed attempts of a phase are left out. */
export function replayableHistory(source: Snapshot, history: Activity[]) {
  return history.filter((a) => {
    const startedAt = source.state.phases[a.phase]?.startedAt
    return !startedAt || a.at >= startedAt - 1_000
  })
}

export function clockFor(source: Snapshot, history: Activity[]) {
  const windows = phaseWindows(source, history)
  const artifactTimes = [
    ...Object.values(source.legacyRuns).map((r) => r.at),
    ...Object.values(source.builds).map((r) => r.at),
    ...Object.values(source.parity).map((r) => r.at),
  ]
  return buildClock([
    ...[...windows.values()].flatMap((w) => [w.start, w.end]),
    ...replayableHistory(source, history).map((a) => a.at),
    ...artifactTimes,
  ])
}

export type ReplayFrame = {
  snapshot: Snapshot
  realTime: number
  current?: string
}

function pick<T>(record: Record<string, T>, keep: (batch: string, value: T) => boolean) {
  return Object.fromEntries(Object.entries(record).filter(([batch, value]) => keep(batch, value)))
}

export function frameAt(source: Snapshot, history: Activity[], clock: Clock, position: number): ReplayFrame {
  const real = clock.toReal(position)
  const windows = phaseWindows(source, history)

  const phases: Record<string, PhaseState> = {}
  for (const [key, window] of windows) {
    if (window.start > real) continue
    if (window.end > real) {
      phases[key] = { status: "running", startedAt: window.start }
      continue
    }
    const hasOutput = revealed(source, key)
    const status = window.state.status === "running" || (window.state.status === "failed" && hasOutput) ? "done" : window.state.status
    phases[key] = { ...window.state, status, finishedAt: window.end, ...(status === "done" ? { error: undefined } : {}) }
  }

  const shown = (key: string, fallbackAt?: number) => {
    const window = windows.get(key)
    const at = window ? window.end : (fallbackAt ?? clock.start)
    return at <= real
  }

  const visible = replayableHistory(source, history).filter((a) => a.at <= real)
  const lastPerPhase = new Map<string, string>()
  for (const a of visible) lastPerPhase.set(a.phase, a.id)
  const activity = visible.map((a) => {
    const live = phases[a.phase]?.status === "running" && lastPerPhase.get(a.phase) === a.id
    return live ? { ...a, status: "running" as const } : a.status === "running" ? { ...a, status: "done" as const } : a
  })

  const current = [...windows.entries()]
    .filter(([, w]) => w.start <= real)
    .sort((a, b) => b[1].start - a[1].start)[0]?.[0]

  const ports = pick(source.ports, (batch) => shown(`port:${batch}`))
  return {
    realTime: real,
    current,
    snapshot: {
      ...source,
      activity,
      state: {
        ...source.state,
        phases,
        runtime: {
          legacy: shown("environment") && source.environment ? "up" : "down",
          v2: Object.keys(ports).length ? "up" : "down",
        },
      },
      discovery: shown("discover") ? source.discovery : undefined,
      entrypoints: shown("entrypoints") ? source.entrypoints : undefined,
      environment: shown("environment") ? source.environment : undefined,
      rules: pick(source.rules, (batch) => shown(`rules:${batch}`)),
      tests: pick(source.tests, (batch) => shown(`tests:${batch}`)),
      legacyRuns: pick(source.legacyRuns, (batch, run) => shown(`legacy:${batch}`, run.at)),
      ports,
      builds: pick(source.builds, (batch, build) => shown(`port:${batch}`, build.at)),
      parity: pick(source.parity, (batch, run) => shown(`parity:${batch}`, run.at)),
      reconcile: pick(source.reconcile, (batch) => shown(`reconcile:${batch}`)),
    },
  }
}

function revealed(source: Snapshot, key: string) {
  const { phase, batch = "" } = splitKey(key)
  const outputs: Record<PhaseName, unknown> = {
    discover: source.discovery,
    entrypoints: source.entrypoints,
    environment: source.environment,
    rules: source.rules[batch],
    tests: source.tests[batch],
    legacy: source.legacyRuns[batch],
    port: source.ports[batch],
    parity: source.parity[batch],
    reconcile: source.reconcile[batch],
  }
  return outputs[phase] !== undefined
}

/** The screen that best shows a phase. */
export function viewFor(key: string) {
  const { phase, batch } = splitKey(key)
  return batch ? `batch/${batch}` : phase
}

import type { Activity, EngineInfo, ModelRef } from "../../shared/types"

export type RunOptions = {
  directory: string
  phase: string
  title: string
  prompt: string
  model?: ModelRef
  sessionId?: string
  onActivity: (activity: Activity) => void
  signal?: AbortSignal
}

export type RunResult = {
  sessionId: string
  text: string
  writes: string[]
  error?: string
}

/** The AI harness the pipeline delegates to. Kept small so it can be swapped or faked. */
export interface Engine {
  info(): Promise<EngineInfo>
  run(options: RunOptions): Promise<RunResult>
  stop(): void
}

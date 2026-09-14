import { createContext, useContext, useEffect } from "react"
import { create } from "zustand"
import type { Activity, ServerEvent } from "../../../src/shared/types"
import { api, type Snapshot } from "./api"
import { type Clock, clockFor } from "./replay"

export type ReplayState = {
  status: "playing" | "paused" | "finished"
  position: number
  speed: number
  history: Activity[]
  clock: Clock
}

type ProjectStore = {
  id?: string
  snapshot?: Snapshot
  activity: Activity[]
  connected: boolean
  error?: string
  replay?: ReplayState
  replayLoading: boolean
  load(id: string): Promise<void>
  refresh(): Promise<void>
  apply(event: ServerEvent): void
  startReplay(): Promise<boolean>
  updateReplay(patch: Partial<ReplayState>): void
  stopReplay(): void
}

export function upsertActivity(list: Activity[], item: Activity, cap = 2000) {
  const index = list.findIndex((a) => a.id === item.id)
  const next = index >= 0 ? list.map((a, i) => (i === index ? item : a)) : [...list, item]
  return next.length > cap ? next.slice(next.length - cap) : next
}

export const useProjectStore = create<ProjectStore>((set, get) => ({
  activity: [],
  connected: false,
  replayLoading: false,

  async load(id) {
    if (get().id !== id) set({ id, snapshot: undefined, activity: [], error: undefined, replay: undefined })
    try {
      const snapshot = await api.project(id)
      if (get().id !== id) return
      set({ snapshot, activity: snapshot.activity, error: undefined })
    } catch (error) {
      set({ error: (error as Error).message })
    }
  },

  async refresh() {
    const id = get().id
    if (!id) return
    const snapshot = await api.project(id).catch(() => undefined)
    if (snapshot && get().id === id) set({ snapshot })
  },

  apply(event) {
    if (event.type === "activity") {
      set((state) => ({ activity: upsertActivity(state.activity, event.activity) }))
      return
    }
    const snapshot = get().snapshot
    if (!snapshot) return
    if (event.type === "phase") {
      set({
        snapshot: {
          ...snapshot,
          state: { ...snapshot.state, phases: { ...snapshot.state.phases, [event.key]: event.state } },
        },
      })
    }
    if (event.type === "runtime") {
      set({ snapshot: { ...snapshot, state: { ...snapshot.state, runtime: event.runtime } } })
    }
  },

  async startReplay() {
    const { id } = get()
    if (!id) return false
    set({ replayLoading: true })
    try {
      const [snapshot, history] = await Promise.all([api.project(id), api.history(id)])
      const clock = clockFor(snapshot, history)
      if (clock.total === 0) return false
      set({ snapshot, replay: { status: "playing", position: 0, speed: 1, history, clock } })
      return true
    } finally {
      set({ replayLoading: false })
    }
  },

  updateReplay(patch) {
    const replay = get().replay
    if (replay) set({ replay: { ...replay, ...patch } })
  },

  stopReplay() {
    set({ replay: undefined })
    void get().refresh()
  },
}))

/** Load a migration and keep it live over server-sent events. */
export function useProject(id: string) {
  useEffect(() => {
    const store = useProjectStore.getState()
    void store.load(id)
    let timer: ReturnType<typeof setTimeout> | undefined
    const source = new EventSource(`/api/projects/${id}/events`)
    source.onopen = () => useProjectStore.setState({ connected: true })
    source.onerror = () => useProjectStore.setState({ connected: false })
    source.onmessage = (message) => {
      const event = JSON.parse(message.data) as ServerEvent
      useProjectStore.getState().apply(event)
      if ((event.type === "phase" || event.type === "changed") && !useProjectStore.getState().replay) {
        clearTimeout(timer)
        timer = setTimeout(() => void useProjectStore.getState().refresh(), 250)
      }
    }
    return () => {
      source.close()
      clearTimeout(timer)
    }
  }, [id])
  return useProjectStore()
}

const TICK_MS = 100

/** Advances the replay while it plays. Uses a timer rather than animation frames so background tabs keep time. */
export function useReplayTicker() {
  const status = useProjectStore((s) => s.replay?.status)
  useEffect(() => {
    if (status !== "playing") return
    const timer = setInterval(() => {
      const replay = useProjectStore.getState().replay
      if (!replay || replay.status !== "playing") return
      const position = replay.position + TICK_MS * replay.speed
      useProjectStore.getState().updateReplay(
        position >= replay.clock.total ? { position: replay.clock.total, status: "finished" } : { position },
      )
    }, TICK_MS)
    return () => clearInterval(timer)
  }, [status])
}

export type ReplayView = { active: boolean; realTime?: number }

export const ReplayContext = createContext<ReplayView>({ active: false })

export function useReplayView() {
  return useContext(ReplayContext)
}

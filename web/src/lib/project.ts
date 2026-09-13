import { useEffect } from "react"
import { create } from "zustand"
import type { Activity, ServerEvent } from "../../../src/shared/types"
import { api, type Snapshot } from "./api"

type ProjectStore = {
  id?: string
  snapshot?: Snapshot
  activity: Activity[]
  connected: boolean
  error?: string
  load(id: string): Promise<void>
  refresh(): Promise<void>
  apply(event: ServerEvent): void
}

export function upsertActivity(list: Activity[], item: Activity, cap = 800) {
  const index = list.findIndex((a) => a.id === item.id)
  const next = index >= 0 ? list.map((a, i) => (i === index ? item : a)) : [...list, item]
  return next.length > cap ? next.slice(next.length - cap) : next
}

export const useProjectStore = create<ProjectStore>((set, get) => ({
  activity: [],
  connected: false,

  async load(id) {
    if (get().id !== id) set({ id, snapshot: undefined, activity: [], error: undefined })
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
      if (event.type === "phase" || event.type === "changed") {
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

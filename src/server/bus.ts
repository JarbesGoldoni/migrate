import type { Activity, ServerEvent } from "../shared/types"

type Listener = (event: ServerEvent) => void

const KEEP = 600

export class EventBus {
  private listeners = new Map<string, Set<Listener>>()
  private feeds = new Map<string, Activity[]>()

  subscribe(projectId: string, listener: Listener) {
    const set = this.listeners.get(projectId) ?? new Set()
    set.add(listener)
    this.listeners.set(projectId, set)
    return () => set.delete(listener)
  }

  emit(projectId: string, event: ServerEvent) {
    if (event.type === "activity") this.remember(projectId, event.activity)
    for (const listener of this.listeners.get(projectId) ?? []) listener(event)
  }

  activity(projectId: string) {
    return this.feeds.get(projectId) ?? []
  }

  seed(projectId: string, items: Activity[]) {
    if (!this.feeds.has(projectId)) this.feeds.set(projectId, items.slice(-KEEP))
  }

  private remember(projectId: string, activity: Activity) {
    const feed = this.feeds.get(projectId) ?? []
    const index = feed.findIndex((a) => a.id === activity.id)
    if (index >= 0) feed[index] = activity
    else feed.push(activity)
    if (feed.length > KEEP) feed.splice(0, feed.length - KEEP)
    this.feeds.set(projectId, feed)
  }
}

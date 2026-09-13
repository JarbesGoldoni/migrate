import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function duration(ms?: number) {
  if (ms === undefined || ms < 0) return ""
  if (ms < 1000) return `${ms}ms`
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  return `${m}m ${String(s % 60).padStart(2, "0")}s`
}

export function ago(at?: number, now = Date.now()) {
  if (!at) return ""
  const s = Math.max(0, Math.round((now - at) / 1000))
  if (s < 10) return "just now"
  if (s < 60) return `${s}s ago`
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 48) return `${h}h ago`
  return `${Math.round(h / 24)}d ago`
}

export const METHOD_STYLE: Record<string, string> = {
  GET: "text-emerald-300 bg-emerald-400/10 ring-emerald-400/25",
  POST: "text-cyan-300 bg-cyan-400/10 ring-cyan-400/25",
  PUT: "text-amber-300 bg-amber-400/10 ring-amber-400/25",
  PATCH: "text-violet-300 bg-violet-400/10 ring-violet-400/25",
  DELETE: "text-rose-300 bg-rose-400/10 ring-rose-400/25",
}

export function methodStyle(method: string) {
  return METHOD_STYLE[method.toUpperCase()] ?? "text-slate-300 bg-white/5 ring-white/10"
}

export function statusTone(status: number) {
  if (status === 0) return "text-rose-300"
  if (status < 300) return "text-emerald-300"
  if (status < 400) return "text-sky-300"
  if (status < 500) return "text-amber-300"
  return "text-rose-300"
}

export function shortPath(path: string, keep = 3) {
  const parts = path.split("/").filter(Boolean)
  return parts.length > keep ? `…/${parts.slice(-keep).join("/")}` : path
}

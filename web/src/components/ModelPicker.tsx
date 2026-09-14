import { Check, ChevronDown, Search, Sparkles } from "lucide-react"
import { AnimatePresence, motion } from "motion/react"
import { useEffect, useMemo, useRef, useState } from "react"
import type { ModelOption, ModelRef } from "../../../src/shared/types"
import { cn } from "../lib/format"
import { useI18n } from "../lib/i18n"

export function ModelPicker({
  models,
  value,
  onChange,
  className,
  compact,
}: {
  models: ModelOption[]
  value?: ModelRef
  onChange: (model: ModelRef) => void
  className?: string
  compact?: boolean
}) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const root = useRef<HTMLDivElement>(null)
  const selected = models.find((m) => m.providerID === value?.providerID && m.modelID === value?.modelID)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as globalThis.Node)) setOpen(false)
    }
    window.addEventListener("mousedown", onDown)
    return () => window.removeEventListener("mousedown", onDown)
  }, [open])

  const groups = useMemo(() => {
    const q = query.toLowerCase()
    const filtered = models.filter((m) => `${m.providerName} ${m.name} ${m.modelID}`.toLowerCase().includes(q))
    const byProvider = new Map<string, ModelOption[]>()
    for (const m of filtered) byProvider.set(m.providerName, [...(byProvider.get(m.providerName) ?? []), m])
    return [...byProvider.entries()]
  }, [models, query])

  return (
    <div ref={root} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex w-full cursor-pointer items-center gap-2 rounded-xl bg-white/[0.04] px-3 text-left ring-1 ring-white/10 transition hover:bg-white/[0.07]",
          compact ? "h-9 text-xs" : "h-11 text-sm",
        )}
      >
        <Sparkles className="size-4 shrink-0 text-violet-300" />
        <span className="min-w-0 flex-1 truncate">
          {selected ? (
            <>
              <span className="text-white">{selected.name}</span>
              <span className="text-slate-500"> · {selected.providerName}</span>
            </>
          ) : (
            <span className="text-slate-400">{t("model.choose")}</span>
          )}
        </span>
        <ChevronDown className={cn("size-4 text-slate-500 transition", open && "rotate-180")} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 z-50 mt-2 w-[340px] overflow-hidden rounded-2xl bg-ink-850/95 shadow-2xl ring-1 shadow-black/60 ring-white/10 backdrop-blur-xl"
          >
            <div className="flex items-center gap-2 border-b border-white/5 px-3">
              <Search className="size-4 text-slate-500" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("model.search")}
                className="h-10 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-slate-500"
              />
            </div>
            <div className="max-h-80 overflow-y-auto p-1.5">
              {groups.length === 0 && <div className="px-3 py-6 text-center text-xs text-slate-500">{t("model.none")}</div>}
              {groups.map(([provider, items]) => (
                <div key={provider} className="mb-1">
                  <div className="px-2.5 pt-2 pb-1 text-[10px] font-semibold tracking-wider text-slate-500 uppercase">{provider}</div>
                  {items.map((m) => {
                    const active = m.providerID === value?.providerID && m.modelID === value?.modelID
                    return (
                      <button
                        type="button"
                        key={`${m.providerID}/${m.modelID}`}
                        onClick={() => {
                          onChange({ providerID: m.providerID, modelID: m.modelID })
                          setOpen(false)
                        }}
                        className={cn(
                          "flex w-full cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm transition",
                          active ? "bg-cyan-400/10 text-white" : "text-slate-300 hover:bg-white/[0.05]",
                        )}
                      >
                        <span className="min-w-0 flex-1 truncate">{m.name}</span>
                        {active && <Check className="size-4 text-cyan-300" />}
                      </button>
                    )
                  })}
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

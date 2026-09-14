import { X } from "lucide-react"
import { AnimatePresence, motion } from "motion/react"
import { type ReactNode, useEffect } from "react"
import { cn } from "../lib/format"

export function Dialog({
  open,
  onClose,
  title,
  icon,
  children,
  className,
}: {
  open: boolean
  onClose: () => void
  title: string
  icon?: ReactNode
  children: ReactNode
  className?: string
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, onClose])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={(event) => event.target === event.currentTarget && onClose()}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97 }}
            transition={{ type: "spring", stiffness: 380, damping: 32 }}
            className={cn("w-full max-w-lg rounded-2xl bg-ink-900/95 p-6 shadow-2xl ring-1 ring-white/10", className)}
          >
            <div className="mb-4 flex items-center gap-3">
              {icon}
              <h2 className="min-w-0 flex-1 text-lg font-semibold text-white">{title}</h2>
              <button
                type="button"
                onClick={onClose}
                className="grid size-8 cursor-pointer place-items-center rounded-lg text-slate-400 hover:bg-white/5 hover:text-white"
              >
                <X className="size-4" />
              </button>
            </div>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

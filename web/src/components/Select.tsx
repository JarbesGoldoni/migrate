import { Check, ChevronDown } from "lucide-react"
import { AnimatePresence, motion } from "motion/react"
import { type ReactNode, useEffect, useRef, useState } from "react"
import { cn } from "../lib/format"

export type SelectOption<T extends string> = { value: T; label: ReactNode; hint?: ReactNode; icon?: ReactNode }

/** A dropdown in the app's own style: native selects open with the operating system's light menu. */
export function Select<T extends string>({
  value,
  options,
  onChange,
  placeholder,
  className,
  buttonClassName,
  menuClassName,
  align = "left",
  disabled,
  title,
}: {
  value?: T
  options: SelectOption<T>[]
  onChange: (value: T) => void
  placeholder?: ReactNode
  className?: string
  buttonClassName?: string
  menuClassName?: string
  align?: "left" | "right"
  disabled?: boolean
  title?: string
}) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const root = useRef<HTMLDivElement>(null)
  const selected = options.find((option) => option.value === value)

  useEffect(() => {
    if (!open) return
    setActive(Math.max(0, options.findIndex((option) => option.value === value)))
    const close = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    window.addEventListener("mousedown", close)
    return () => window.removeEventListener("mousedown", close)
  }, [open])

  const choose = (option: SelectOption<T> | undefined) => {
    if (!option) return
    onChange(option.value)
    setOpen(false)
  }

  return (
    <div
      ref={root}
      className={cn("relative", className)}
      onKeyDown={(event) => {
        if (!open) return
        if (event.key === "Escape") setOpen(false)
        else if (event.key === "ArrowDown") setActive((i) => (i + 1) % options.length)
        else if (event.key === "ArrowUp") setActive((i) => (i - 1 + options.length) % options.length)
        else if (event.key === "Enter") choose(options[active])
        else return
        event.preventDefault()
      }}
    >
      <button
        type="button"
        disabled={disabled}
        title={title}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex w-full cursor-pointer items-center gap-2 rounded-xl bg-black/30 px-3 text-left text-sm text-slate-100 ring-1 ring-white/10 transition outline-none hover:bg-white/[0.05] focus-visible:ring-cyan-400/40 disabled:cursor-default disabled:opacity-50",
          open && "ring-cyan-400/40",
          buttonClassName,
        )}
      >
        {selected?.icon}
        <span className="min-w-0 flex-1 truncate">{selected ? selected.label : <span className="text-slate-500">{placeholder}</span>}</span>
        <ChevronDown className={cn("size-3.5 shrink-0 text-slate-500 transition", open && "rotate-180")} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            role="listbox"
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.12 }}
            className={cn(
              "absolute z-50 mt-1.5 max-h-80 w-max max-w-[min(560px,90vw)] min-w-full overflow-y-auto rounded-xl bg-ink-850/95 p-1 shadow-2xl ring-1 shadow-black/60 ring-white/10 backdrop-blur-xl",
              align === "right" ? "right-0" : "left-0",
              menuClassName,
            )}
          >
            {options.map((option, i) => {
              const isSelected = option.value === value
              return (
                <button
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  key={option.value}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => choose(option)}
                  className={cn(
                    "flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors",
                    i === active ? "bg-white/[0.07] text-white" : "text-slate-300",
                    isSelected && "text-cyan-100",
                  )}
                >
                  {option.icon}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{option.label}</span>
                    {option.hint && <span className="block truncate text-[11px] text-slate-500">{option.hint}</span>}
                  </span>
                  {isSelected && <Check className="size-3.5 shrink-0 text-cyan-300" />}
                </button>
              )
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

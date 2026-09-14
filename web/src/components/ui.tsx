import {
  Braces,
  Cable,
  Check,
  CircleCheck,
  CircleDashed,
  CircleX,
  Clock,
  Copy,
  Dot,
  ListOrdered,
  type LucideIcon,
  Radio,
  Terminal,
} from "lucide-react"
import { animate, motion, useMotionValue, useTransform } from "motion/react"
import { type ButtonHTMLAttributes, type HTMLAttributes, type ReactNode, useEffect, useId, useState } from "react"
import type { PhaseStatus } from "../../../src/shared/types"
import { cn, methodStyle } from "../lib/format"
import { useI18n } from "../lib/i18n"

const BUTTON_VARIANTS = {
  primary:
    "bg-gradient-migrate text-ink-950 font-semibold shadow-[0_0_32px_-10px_rgba(34,211,238,0.7)] hover:brightness-110 hover:shadow-[0_0_40px_-8px_rgba(34,211,238,0.8)]",
  outline: "ring-1 ring-white/10 bg-white/[0.03] text-slate-200 hover:ring-white/20 hover:bg-white/[0.07]",
  ghost: "text-slate-300 hover:bg-white/[0.06] hover:text-white",
  subtle: "bg-white/[0.06] text-slate-200 hover:bg-white/[0.1]",
  danger: "ring-1 ring-rose-400/30 bg-rose-500/[0.06] text-rose-200 hover:bg-rose-500/15",
}

const BUTTON_SIZES = {
  xs: "h-7 gap-1.5 rounded-lg px-2.5 text-xs",
  sm: "h-8 gap-1.5 rounded-lg px-3 text-xs",
  md: "h-10 gap-2 rounded-xl px-4 text-sm",
  lg: "h-13 gap-2.5 rounded-2xl px-7 text-base",
}

export function Button({
  variant = "outline",
  size = "md",
  loading,
  icon,
  children,
  className,
  disabled,
  ...props
}: {
  variant?: keyof typeof BUTTON_VARIANTS
  size?: keyof typeof BUTTON_SIZES
  loading?: boolean
  icon?: ReactNode
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      className={cn(
        "inline-flex shrink-0 cursor-pointer items-center justify-center font-medium whitespace-nowrap transition-all duration-200 select-none active:scale-[0.97] disabled:pointer-events-none disabled:opacity-45",
        BUTTON_VARIANTS[variant],
        BUTTON_SIZES[size],
        className,
      )}
      {...props}
    >
      {loading ? <Spinner /> : icon}
      {children}
    </button>
  )
}

export function Panel({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("glass rounded-2xl", className)} {...props}>
      {children}
    </div>
  )
}

const TONES = {
  slate: "bg-white/[0.05] text-slate-300 ring-white/10",
  amber: "bg-amber-400/10 text-amber-200 ring-amber-400/25",
  cyan: "bg-cyan-400/10 text-cyan-200 ring-cyan-400/25",
  emerald: "bg-emerald-400/10 text-emerald-200 ring-emerald-400/25",
  rose: "bg-rose-400/10 text-rose-200 ring-rose-400/25",
  violet: "bg-violet-400/10 text-violet-200 ring-violet-400/25",
}

export type Tone = keyof typeof TONES

export function Badge({
  tone = "slate",
  icon: Icon,
  children,
  className,
}: {
  tone?: Tone
  icon?: LucideIcon
  children: ReactNode
  className?: string
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap ring-1 ring-inset",
        TONES[tone],
        className,
      )}
    >
      {Icon && <Icon className="size-3" />}
      {children}
    </span>
  )
}

export function StatusIcon({ status, className }: { status: PhaseStatus; className?: string }) {
  if (status === "running") {
    return (
      <span className={cn("relative grid size-5 place-items-center", className)}>
        <span className="absolute inset-0 animate-ping-slow rounded-full bg-cyan-400/30" />
        <Spinner className="size-full text-cyan-300" />
      </span>
    )
  }
  if (status === "done") return <CircleCheck className={cn("size-5 text-emerald-400", className)} />
  if (status === "failed") return <CircleX className={cn("size-5 text-rose-400", className)} />
  return <CircleDashed className={cn("size-5 text-slate-600", className)} />
}

const KIND_ICONS: Record<string, LucideIcon> = {
  job: Clock,
  queue: ListOrdered,
  cli: Terminal,
  graphql: Braces,
  grpc: Cable,
  websocket: Radio,
}

export function MethodBadge({ method, kind = "http", className }: { method?: string; kind?: string; className?: string }) {
  if (kind === "http" && method) {
    return (
      <span
        className={cn(
          "inline-flex w-14 shrink-0 justify-center rounded-md py-0.5 font-mono text-[10px] font-semibold ring-1 ring-inset",
          methodStyle(method),
          className,
        )}
      >
        {method}
      </span>
    )
  }
  const Icon = KIND_ICONS[kind] ?? Dot
  return (
    <span
      className={cn(
        "inline-flex w-14 shrink-0 items-center justify-center gap-1 rounded-md bg-violet-400/10 py-0.5 text-[10px] font-semibold text-violet-200 uppercase ring-1 ring-violet-400/25 ring-inset",
        className,
      )}
    >
      <Icon className="size-3" />
      {kind}
    </span>
  )
}

export function CopyButton({ text, className }: { text: string; className?: string }) {
  const [copied, setCopied] = useState(false)
  const { t } = useI18n()
  return (
    <button
      type="button"
      title={t("common.copy")}
      onClick={(e) => {
        e.stopPropagation()
        void navigator.clipboard?.writeText(text)
        setCopied(true)
        setTimeout(() => setCopied(false), 1400)
      }}
      className={cn(
        "grid size-7 cursor-pointer place-items-center rounded-lg text-slate-400 transition hover:bg-white/10 hover:text-white",
        className,
      )}
    >
      {copied ? <Check className="size-3.5 text-emerald-300" /> : <Copy className="size-3.5" />}
    </button>
  )
}

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  className,
}: {
  tabs: { id: T; label: string; icon?: LucideIcon; badge?: ReactNode; disabled?: boolean }[]
  value: T
  onChange: (id: T) => void
  className?: string
}) {
  const id = useId()
  return (
    <div className={cn("flex items-center gap-1 rounded-xl bg-white/[0.03] p-1 ring-1 ring-white/[0.06]", className)}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          disabled={tab.disabled}
          onClick={() => onChange(tab.id)}
          className={cn(
            "relative flex cursor-pointer items-center gap-2 rounded-lg px-3 py-1.5 text-sm transition-colors disabled:cursor-default disabled:opacity-40",
            value === tab.id ? "text-white" : "text-slate-400 hover:text-slate-200",
          )}
        >
          {value === tab.id && (
            <motion.span
              layoutId={`tab-${id}`}
              className="absolute inset-0 rounded-lg bg-white/[0.08] ring-1 ring-white/10"
              transition={{ type: "spring", stiffness: 420, damping: 34 }}
            />
          )}
          {tab.icon && <tab.icon className="relative size-4" />}
          <span className="relative">{tab.label}</span>
          {tab.badge !== undefined && <span className="relative">{tab.badge}</span>}
        </button>
      ))}
    </div>
  )
}

export function EmptyState({
  icon: Icon,
  title,
  children,
  action,
  className,
}: {
  icon: LucideIcon
  title: string
  children?: ReactNode
  action?: ReactNode
  className?: string
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn("flex flex-col items-center justify-center gap-3 px-6 py-16 text-center", className)}
    >
      <div className="relative grid size-16 place-items-center rounded-2xl bg-white/[0.04] ring-1 ring-white/10">
        <div className="absolute inset-0 animate-pulse rounded-2xl bg-gradient-to-br from-amber-400/10 to-cyan-400/10" />
        <Icon className="relative size-7 text-slate-300" />
      </div>
      <h3 className="text-base font-semibold text-white">{title}</h3>
      {children && <div className="max-w-md text-sm text-slate-400">{children}</div>}
      {action}
    </motion.div>
  )
}

export function CountUp({ value, className }: { value: number; className?: string }) {
  const motionValue = useMotionValue(0)
  const rounded = useTransform(motionValue, (v) => Math.round(v).toLocaleString())
  useEffect(() => {
    const controls = animate(motionValue, value, { duration: 0.9, ease: "easeOut" })
    return () => controls.stop()
  }, [motionValue, value])
  return <motion.span className={className}>{rounded}</motion.span>
}

export function Stat({
  label,
  value,
  icon: Icon,
  tone = "text-slate-300",
  suffix,
}: {
  label: string
  value: number
  icon: LucideIcon
  tone?: string
  suffix?: string
}) {
  return (
    <Panel className="flex items-center gap-3 px-4 py-3">
      <div className={cn("grid size-10 place-items-center rounded-xl bg-white/[0.05]", tone)}>
        <Icon className="size-5" />
      </div>
      <div>
        <div className="text-xl font-semibold text-white tabular-nums">
          <CountUp value={value} />
          {suffix}
        </div>
        <div className="text-xs text-slate-400">{label}</div>
      </div>
    </Panel>
  )
}

export function ProgressRing({
  value,
  total,
  size = 132,
  stroke = 11,
  label,
}: {
  value: number
  total: number
  size?: number
  stroke?: number
  label?: string
}) {
  const id = useId()
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const ratio = total ? value / total : 0
  const complete = total > 0 && value === total
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <defs>
          <linearGradient id={`ring-${id}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={complete ? "#34d399" : "#f5a524"} />
            <stop offset="1" stopColor={complete ? "#22d3ee" : "#22d3ee"} />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={stroke} />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={`url(#ring-${id})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: circumference * (1 - ratio) }}
          transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="text-2xl font-semibold text-white tabular-nums">
          <CountUp value={value} />
          <span className="text-slate-500">/{total}</span>
        </div>
        {label && <div className="text-[11px] text-slate-400">{label}</div>}
      </div>
    </div>
  )
}

/** A faint ring with an arc turning around it: symmetric, and on its own layer, so it spins in place. */
export function Spinner({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={cn("size-4 shrink-0 animate-spin will-change-transform", className)}>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.2" strokeWidth="2.5" />
      <path d="M12 3a9 9 0 0 1 9 9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  )
}

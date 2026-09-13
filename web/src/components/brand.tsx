import { Box } from "lucide-react"
import { motion } from "motion/react"
import { useId } from "react"
import { cn } from "../lib/format"
import { brandIcon, NODE_KINDS, readableHex } from "../lib/tech"

export function Logo({ size = 28, word = true, className }: { size?: number; word?: boolean; className?: string }) {
  const id = useId()
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
        <defs>
          <linearGradient id={`logo-${id}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#f5a524" />
            <stop offset="1" stopColor="#22d3ee" />
          </linearGradient>
        </defs>
        <rect x="6" y="16" width="18" height="32" rx="6" fill="#f5a524" opacity="0.92" />
        <path d="M29 32h11" stroke={`url(#logo-${id})`} strokeWidth="5.5" strokeLinecap="round" />
        <path d="M35 24.5l8.5 7.5-8.5 7.5" fill="none" stroke="#22d3ee" strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round" />
        <rect x="46" y="10" width="12" height="44" rx="5" fill="#22d3ee" />
      </svg>
      {word && <span className="text-[17px] font-semibold tracking-tight text-white">migrate</span>}
    </div>
  )
}

export function TechIcon({ tech, kind, size = 16, className }: { tech?: string; kind?: string; size?: number; className?: string }) {
  const brand = brandIcon(tech)
  if (brand) {
    return (
      <svg viewBox="0 0 24 24" width={size} height={size} className={className} role="img" aria-label={brand.title}>
        <path d={brand.path} fill={readableHex(brand.hex)} />
      </svg>
    )
  }
  const Fallback = (kind && NODE_KINDS[kind]?.icon) || Box
  return <Fallback style={{ width: size, height: size }} className={cn("text-slate-300", className)} />
}

export function Backdrop({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn("pointer-events-none fixed inset-0 overflow-hidden", className)}>
      <div className="grid-backdrop absolute inset-0 animate-grid [mask-image:radial-gradient(ellipse_at_center,black_20%,transparent_72%)]" />
      <motion.div
        className="absolute top-[-18%] -left-48 size-[620px] rounded-full bg-legacy/[0.14] blur-[150px]"
        animate={{ x: [0, 70, 0], y: [0, 50, 0] }}
        transition={{ duration: 20, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute -right-48 bottom-[-22%] size-[680px] rounded-full bg-modern/[0.14] blur-[160px]"
        animate={{ x: [0, -60, 0], y: [0, -40, 0] }}
        transition={{ duration: 24, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute top-1/3 left-1/2 size-[380px] -translate-x-1/2 rounded-full bg-agent/[0.07] blur-[130px]"
        animate={{ scale: [1, 1.2, 1], opacity: [0.6, 1, 0.6] }}
        transition={{ duration: 12, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
      />
    </div>
  )
}

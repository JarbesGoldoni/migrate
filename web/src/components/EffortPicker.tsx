import { Gauge } from "lucide-react"
import { sortVariants } from "../lib/effort"
import { cn } from "../lib/format"
import { useI18n } from "../lib/i18n"
import { isKey } from "../lib/i18n-core"
import { Select } from "./Select"

const DEFAULT = "__default"

function Meter({ level, of }: { level: number; of: number }) {
  return (
    <span className="flex shrink-0 items-end gap-[2px]" aria-hidden>
      {Array.from({ length: Math.max(of, 1) }, (_, i) => (
        <span
          key={i}
          className={cn("w-[3px] rounded-sm", i < level ? "bg-violet-300" : "bg-white/15")}
          style={{ height: 4 + Math.round((i / Math.max(of - 1, 1)) * 8) }}
        />
      ))}
    </span>
  )
}

/** Reasoning effort for the chosen model, when its provider offers levels. */
export function EffortPicker({
  variants = [],
  value,
  onChange,
  compact,
  className,
}: {
  variants?: string[]
  value?: string
  onChange: (variant: string | undefined) => void
  compact?: boolean
  className?: string
}) {
  const { t } = useI18n()
  const levels = sortVariants(variants)
  const label = (variant: string) => {
    const key = `effort.${variant}`
    return isKey(key) ? t(key) : variant
  }
  const current = value && levels.includes(value) ? value : DEFAULT
  return (
    <Select
      className={className}
      disabled={levels.length === 0}
      title={levels.length ? t("effort.label") : t("effort.unsupported")}
      value={current}
      onChange={(next) => onChange(next === DEFAULT ? undefined : next)}
      buttonClassName={cn("bg-white/[0.04]", compact ? "h-9 text-xs" : "h-11")}
      options={[
        {
          value: DEFAULT,
          label: t("effort.default"),
          hint: t("effort.defaultHint"),
          icon: <Gauge className="size-4 shrink-0 text-violet-300" />,
        },
        ...levels.map((variant, i) => ({
          value: variant,
          label: label(variant),
          icon: <Meter level={i + 1} of={levels.length} />,
        })),
      ]}
    />
  )
}

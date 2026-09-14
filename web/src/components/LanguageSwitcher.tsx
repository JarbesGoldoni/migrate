import { Globe } from "lucide-react"
import { motion } from "motion/react"
import { cn } from "../lib/format"
import { useI18n } from "../lib/i18n"
import { LOCALE_OPTIONS } from "../lib/i18n-core"

export function LanguageSwitcher({ className }: { className?: string }) {
  const { locale, setLocale, t } = useI18n()
  return (
    <div
      title={t("lang.label")}
      className={cn("flex items-center gap-0.5 rounded-xl bg-white/[0.04] p-0.5 ring-1 ring-white/10", className)}
    >
      <Globe className="mx-1.5 size-3.5 text-slate-400" />
      {LOCALE_OPTIONS.map((option) => {
        const active = option.locale === locale
        return (
          <button
            type="button"
            key={option.locale}
            title={option.name}
            onClick={() => setLocale(option.locale)}
            className="relative cursor-pointer rounded-lg px-2 py-1 text-[11px] font-semibold"
          >
            {active && (
              <motion.span
                layoutId="locale-pill"
                className="absolute inset-0 rounded-lg bg-white/10 ring-1 ring-white/15"
                transition={{ type: "spring", stiffness: 420, damping: 34 }}
              />
            )}
            <span className={cn("relative", active ? "text-white" : "text-slate-400 hover:text-slate-200")}>{option.short}</span>
          </button>
        )
      })}
    </div>
  )
}

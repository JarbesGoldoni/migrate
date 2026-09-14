import { ChevronDown, FileCode2, Info, ShieldCheck, Wrench } from "lucide-react"
import { AnimatePresence, motion } from "motion/react"
import { useState } from "react"
import type { Localized, Tests } from "../../../src/shared/contracts"
import { RichText } from "../components/RichText"
import { Badge, MethodBadge, Panel } from "../components/ui"
import { cn } from "../lib/format"
import { useI18n } from "../lib/i18n"
import type { Key } from "../lib/i18n-core"
import { navigate } from "../lib/router"
import { Label } from "./common"

type Fix = {
  case: string
  headline: Localized
  cause: Localized
  change: Localized
  files?: string[]
  action?: string
}

/** What the agent changed and why: one plain sentence per fix, with the technical detail one click away. */
export function FixList({
  kind,
  fixes,
  notes,
  tests,
  projectId,
}: {
  kind: "reconcile" | "verify"
  fixes: Fix[]
  notes: Localized[]
  tests?: Tests
  projectId: string
}) {
  const { t, l } = useI18n()
  const cases = new Map(tests?.cases.map((c) => [c.id, c]))
  const Icon = kind === "reconcile" ? Wrench : ShieldCheck
  return (
    <Panel className="p-5">
      <div className="mb-4 flex items-center gap-3">
        <div className="grid size-9 place-items-center rounded-xl bg-violet-400/10 ring-1 ring-violet-400/20">
          <Icon className="size-4 text-violet-300" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-white">{t(kind === "reconcile" ? "fix.reconcileTitle" : "fix.verifyTitle")}</div>
          <div className="text-xs text-slate-500">{t("fix.count", { count: fixes.length })}</div>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        {fixes.map((fix, i) => {
          const testCase = cases.get(fix.case)
          return (
            <FixCard
              key={`${fix.case}-${i}`}
              fix={fix}
              index={i}
              title={testCase ? l(testCase.title) : fix.case}
              method={testCase?.request.method}
              projectId={projectId}
            />
          )
        })}
      </div>
      {notes.length > 0 && (
        <ul className="mt-4 flex flex-col gap-1.5 border-t border-white/5 pt-4">
          {notes.map((note) => (
            <li key={note.en} className="flex gap-2 text-sm text-slate-400">
              <Info className="mt-0.5 size-4 shrink-0 text-slate-500" />
              <RichText text={l(note)} />
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

function FixCard({ fix, index, title, method, projectId }: { fix: Fix; index: number; title: string; method?: string; projectId: string }) {
  const { t, l } = useI18n()
  const [open, setOpen] = useState(false)
  const headline = l(fix.headline) || l(fix.cause) || l(fix.change)
  const removed = fix.action === "removed"
  const hasDetail = Boolean((l(fix.headline) && l(fix.cause)) || l(fix.change) || fix.files?.length)
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index, 10) * 0.04 }}
      className={cn("rounded-xl p-4 ring-1", removed ? "bg-rose-500/[0.03] ring-rose-400/15" : "bg-white/[0.02] ring-white/[0.06]")}
    >
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {method && <MethodBadge method={method} className="w-auto px-1.5" />}
        <span className="truncate text-slate-400">{title}</span>
        <span className="font-mono text-[10px] text-slate-600">{fix.case}</span>
        {fix.action && <Badge tone={removed ? "rose" : "violet"}>{t(`verify.action.${fix.action}` as Key)}</Badge>}
      </div>
      <p className="mt-2 text-[15px] text-slate-200">
        <RichText text={headline} />
      </p>
      {hasDetail && (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="mt-2 flex cursor-pointer items-center gap-1 text-xs text-cyan-300/80 hover:text-cyan-200"
        >
          {open ? t("fix.less") : t("fix.more")}
          <ChevronDown className={cn("size-3.5 transition", open && "rotate-180")} />
        </button>
      )}
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="mt-3 grid gap-4 rounded-xl bg-black/30 p-4 ring-1 ring-white/[0.05] md:grid-cols-2">
              {l(fix.cause) && (
                <div>
                  <Label>{t("fix.why")}</Label>
                  <div className="text-sm text-slate-300">
                    <RichText text={l(fix.cause)} />
                  </div>
                </div>
              )}
              {l(fix.change) && (
                <div>
                  <Label>{t("fix.change")}</Label>
                  <div className="text-sm text-slate-300">
                    <RichText text={l(fix.change)} />
                  </div>
                </div>
              )}
              {fix.files && fix.files.length > 0 && (
                <div className="md:col-span-2">
                  <Label>{t("fix.files")}</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {fix.files.map((file) => (
                      <button
                        type="button"
                        key={file}
                        onClick={() => navigate(`/m/${projectId}/code/${file}`)}
                        className="flex cursor-pointer items-center gap-1.5 rounded-lg bg-sky-400/[0.06] px-2 py-1 font-mono text-[11px] text-sky-200 ring-1 ring-sky-400/15 hover:bg-sky-400/10"
                      >
                        <FileCode2 className="size-3" />
                        {file}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

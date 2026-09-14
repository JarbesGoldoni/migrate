import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Calendar,
  Clock,
  FlaskConical,
  FolderGit2,
  GitBranch,
  GitCompareArrows,
  History,
  LoaderCircle,
  Plus,
  ScrollText,
  Search,
  Trash2,
  TriangleAlert,
  Waypoints,
} from "lucide-react"
import { motion } from "motion/react"
import { useEffect, useMemo, useState } from "react"
import type { MigrationListItem } from "../../../src/shared/types"
import { Backdrop, Logo, TechIcon } from "../components/brand"
import { Dialog } from "../components/Dialog"
import { LanguageSwitcher } from "../components/LanguageSwitcher"
import { Badge, Button, EmptyState, type Tone } from "../components/ui"
import { api } from "../lib/api"
import { cn } from "../lib/format"
import { useI18n } from "../lib/i18n"
import type { Key } from "../lib/i18n-core"
import { navigate } from "../lib/router"
import { languageById, stackOf } from "../../../src/shared/stacks"
import { stackTitle } from "../components/stack"

export function Migrations() {
  const { t } = useI18n()
  const [items, setItems] = useState<MigrationListItem[]>()
  const [query, setQuery] = useState("")

  useEffect(() => {
    api
      .migrations()
      .then((list) => setItems(list.sort((a, b) => recency(b) - recency(a))))
      .catch(() => setItems([]))
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (items ?? []).filter((item) => !q || `${item.project.name} ${item.project.source}`.toLowerCase().includes(q))
  }, [items, query])

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }} className="relative min-h-screen">
      <Backdrop />
      <div className="relative mx-auto max-w-6xl px-6 pb-20">
        <header className="flex items-center gap-4 py-6">
          <Button variant="ghost" size="sm" icon={<ArrowLeft className="size-4" />} onClick={() => navigate("/")}>
            {t("common.back")}
          </Button>
          <Logo size={24} />
          <span className="flex-1" />
          <LanguageSwitcher />
        </header>

        <div className="flex flex-wrap items-end gap-4">
          <div className="min-w-0 flex-1">
            <h1 className="text-3xl font-semibold tracking-tight text-white">{t("migrations.title")}</h1>
            <p className="mt-2 max-w-2xl text-slate-400">{t("migrations.lede")}</p>
          </div>
          <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => navigate("/new")}>
            {t("migrations.new")}
          </Button>
        </div>

        <div className="mt-8 flex items-center gap-2 rounded-2xl bg-white/[0.03] px-4 ring-1 ring-white/10 focus-within:ring-cyan-400/40">
          <Search className="size-4 text-slate-500" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("migrations.search")}
            className="h-12 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-slate-500"
          />
        </div>

        {!items && (
          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="glass h-56 animate-pulse rounded-2xl" />
            ))}
          </div>
        )}

        {items && items.length === 0 && (
          <EmptyState
            icon={FolderGit2}
            title={t("migrations.emptyTitle")}
            action={
              <Button variant="primary" icon={<ArrowRight className="size-4" />} onClick={() => navigate("/new")}>
                {t("opener.migrate")}
              </Button>
            }
          >
            {t("migrations.emptyText")}
          </EmptyState>
        )}

        {items && items.length > 0 && filtered.length === 0 && (
          <div className="py-16 text-center text-sm text-slate-500">{t("migrations.noMatch", { query })}</div>
        )}

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          {filtered.map((item, i) => (
            <MigrationCard
              key={item.project.id}
              item={item}
              index={i}
              onDeleted={() => setItems((all) => all?.filter((other) => other.project.id !== item.project.id))}
            />
          ))}
        </div>
      </div>
    </motion.div>
  )
}

function recency(item: MigrationListItem) {
  return item.summary.lastActivity ?? item.project.createdAt
}

function statusOf(item: MigrationListItem): { key: Key; tone: Tone } {
  const s = item.summary
  if (s.missing) return { key: "migrations.status.missing", tone: "rose" }
  if (s.running) return { key: "migrations.status.running", tone: "cyan" }
  if (s.batches > 0 && s.batchesProven === s.batches) return { key: "migrations.status.proven", tone: "emerald" }
  if (s.steps > 0) return { key: "migrations.status.progress", tone: "amber" }
  return { key: "migrations.status.new", tone: "slate" }
}

function MigrationCard({ item, index, onDeleted }: { item: MigrationListItem; index: number; onDeleted: () => void }) {
  const { t, ago, date } = useI18n()
  const [opening, setOpening] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const { project, summary } = item
  const status = statusOf(item)
  const replayable = summary.steps > 0 && !summary.running && !summary.missing
  const proven = summary.batches ? summary.batchesProven / summary.batches : 0

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index, 10) * 0.05 }}
      whileHover={{ y: -3 }}
      className={cn("glass group relative flex flex-col overflow-hidden rounded-2xl", summary.batchesProven > 0 && "ring-1 ring-emerald-400/15")}
    >
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-300/40 to-cyan-300/40 opacity-0 transition group-hover:opacity-100" />
      <div className="flex items-start gap-3 p-5 pb-4">
        <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-amber-400/10 ring-1 ring-amber-400/20">
          <FolderGit2 className="size-5 text-amber-300" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-lg font-semibold text-white">{project.name}</h3>
            {summary.batchesProven > 0 && <BadgeCheck className="size-4 shrink-0 text-emerald-400" />}
          </div>
          <div className="truncate font-mono text-[11px] text-slate-500" title={project.source}>
            {project.source}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge tone={status.tone} icon={summary.missing ? TriangleAlert : summary.running ? LoaderCircle : undefined}>
              {t(status.key)}
            </Badge>
            <Badge icon={GitBranch}>{project.branch}</Badge>
            <StackSummary project={project} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2 px-5">
        <Figure icon={Waypoints} value={summary.entrypoints} label={t("stat.entrypoints")} />
        <Figure icon={ScrollText} value={summary.rules} label={t("stat.rules")} />
        <Figure icon={FlaskConical} value={summary.cases} label={t("stat.tests")} />
        <Figure icon={GitCompareArrows} value={summary.matched} suffix={summary.compared ? `/${summary.compared}` : ""} label={t("stat.identical")} />
      </div>

      {summary.batches > 0 && (
        <div className="px-5 pt-4">
          <div className="mb-1.5 text-[11px] text-slate-400">{t("migrations.batchesProven", { proven: summary.batchesProven, total: summary.batches })}</div>
          <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
            <motion.div
              className={cn("h-full rounded-full", proven === 1 ? "bg-emerald-400" : "bg-gradient-migrate")}
              initial={{ width: 0 }}
              animate={{ width: `${Math.max(proven, 0.02) * 100}%` }}
              transition={{ duration: 0.9, delay: 0.2 }}
            />
          </div>
        </div>
      )}

      {summary.missing && <div className="mx-5 mt-4 rounded-lg bg-rose-500/10 px-3 py-2 text-xs text-rose-200">{t("migrations.missing")}</div>}

      <div className="mt-auto flex flex-wrap items-center gap-3 border-t border-white/5 px-5 py-3 pt-3">
        <span className="flex items-center gap-1 text-[11px] text-slate-500" title={date(project.createdAt)}>
          <Calendar className="size-3" />
          {t("migrations.created", { date: date(project.createdAt) })}
        </span>
        {summary.lastActivity && (
          <span className="flex items-center gap-1 text-[11px] text-slate-500">
            <Clock className="size-3" />
            {t("migrations.lastActivity", { ago: ago(summary.lastActivity) })}
          </span>
        )}
        <span className="flex-1" />
        <Button
          size="sm"
          variant="primary"
          disabled={!replayable}
          title={replayable ? t("replay.startHint") : t("migrations.replayHint")}
          icon={<History className="size-3.5" />}
          onClick={() => navigate(`/m/${project.id}/replay`)}
        >
          {t("replay.start")}
        </Button>
        <Button
          size="sm"
          variant="outline"
          loading={opening}
          disabled={summary.missing}
          icon={<ArrowRight className="size-3.5" />}
          onClick={() => {
            setOpening(true)
            navigate(`/m/${project.id}`)
          }}
        >
          {t("common.open")}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          title={t("delete.button")}
          disabled={summary.running}
          icon={<Trash2 className="size-3.5 text-rose-300" />}
          onClick={() => setDeleting(true)}
        />
      </div>
      <DeleteDialog item={item} open={deleting} onClose={() => setDeleting(false)} onDeleted={onDeleted} />
    </motion.div>
  )
}

function DeleteDialog({ item, open, onClose, onDeleted }: { item: MigrationListItem; open: boolean; onClose: () => void; onDeleted: () => void }) {
  const { t } = useI18n()
  const [branch, setBranch] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const { project, summary } = item

  const remove = async () => {
    setBusy(true)
    setError(undefined)
    try {
      await api.remove(project.id, branch)
      onClose()
      onDeleted()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t("delete.title", { name: project.name })}
      icon={
        <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-rose-500/10">
          <Trash2 className="size-4 text-rose-300" />
        </div>
      }
    >
      <p className="text-sm leading-relaxed text-slate-400">{t("delete.text")}</p>
      <div className="mt-3 truncate rounded-lg bg-black/30 px-3 py-2 font-mono text-[11px] text-slate-500" title={project.workspace}>
        {project.workspace}
      </div>
      {summary.linked && (
        <label className="mt-4 flex cursor-pointer items-center gap-2.5 text-sm text-slate-300">
          <input type="checkbox" checked={branch} onChange={(e) => setBranch(e.target.checked)} className="size-4 accent-rose-400" />
          {t("delete.branch", { branch: project.branch })}
        </label>
      )}
      {error && <div className="mt-3 text-sm text-rose-300">{error}</div>}
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          {t("common.cancel")}
        </Button>
        <Button variant="danger" loading={busy} icon={<Trash2 className="size-4" />} onClick={remove}>
          {t("delete.confirm")}
        </Button>
      </div>
    </Dialog>
  )
}

function Figure({ icon: Icon, value, suffix, label }: { icon: typeof Waypoints; value: number; suffix?: string; label: string }) {
  return (
    <div className="min-w-0 rounded-xl bg-white/[0.03] px-2.5 py-2 ring-1 ring-white/[0.05]">
      <div className="flex items-center gap-1 truncate text-[10px] text-slate-500">
        <Icon className="size-3 shrink-0" />
        <span className="truncate">{label}</span>
      </div>
      <div className="font-semibold text-white tabular-nums">
        {value}
        <span className="text-slate-500">{suffix}</span>
      </div>
    </div>
  )
}

function StackSummary({ project }: { project: MigrationListItem["project"] }) {
  const { t } = useI18n()
  const choice = stackOf(project)
  return (
    <span className="flex items-center gap-1 text-xs text-slate-500">
      {choice ? (
        <>
          <TechIcon tech={languageById(choice.language)?.icon} size={13} />
          {stackTitle(choice)} · {choice.name}
        </>
      ) : (
        t("target.none")
      )}
    </span>
  )
}

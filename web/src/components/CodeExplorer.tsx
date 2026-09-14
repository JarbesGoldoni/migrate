import {
  ArrowLeft,
  Braces,
  ChevronRight,
  Database,
  FileCode2,
  FileText,
  Folder,
  FolderGit2,
  FolderOpen,
  FolderTree,
  Lock,
  type LucideIcon,
  Radar,
  ScrollText,
  Search,
  Settings2,
  Sparkles,
  Terminal,
  X,
} from "lucide-react"
import { AnimatePresence, motion } from "motion/react"
import { Fragment, useEffect, useMemo, useRef, useState } from "react"
import type { Activity } from "../../../src/shared/types"
import { api, type FileWindow } from "../lib/api"
import { ancestors, buildTree, fileName, filterFiles, formatBytes, languageOf, type TreeNode } from "../lib/files"
import { cn } from "../lib/format"
import { useTokens } from "../lib/highlight"
import { useI18n } from "../lib/i18n"
import type { Key } from "../lib/i18n-core"
import { brandIcon } from "../lib/tech"
import { TechIcon } from "./brand"
import { CopyButton, Spinner } from "./ui"

export type Root = "legacy" | "v2" | "migration"

const ROOTS: Record<Root, { icon: LucideIcon; tone: string; label: Key }> = {
  v2: { icon: Sparkles, tone: "text-cyan-300", label: "common.v2" },
  legacy: { icon: FolderGit2, tone: "text-amber-300", label: "common.legacy" },
  migration: { icon: ScrollText, tone: "text-violet-300", label: "code.contracts" },
}

export function rootOf(path: string): Root {
  const head = path.split("/")[0]
  return head === "legacy" || head === "migration" ? head : "v2"
}

const GENERIC: Record<string, { icon: LucideIcon; tone: string }> = {
  json: { icon: Braces, tone: "text-amber-300" },
  jsonc: { icon: Braces, tone: "text-amber-300" },
  yaml: { icon: Settings2, tone: "text-violet-300" },
  toml: { icon: Settings2, tone: "text-violet-300" },
  ini: { icon: Settings2, tone: "text-violet-300" },
  dotenv: { icon: Settings2, tone: "text-violet-300" },
  markdown: { icon: FileText, tone: "text-sky-300" },
  sql: { icon: Database, tone: "text-amber-200" },
  shellscript: { icon: Terminal, tone: "text-emerald-300" },
  make: { icon: Terminal, tone: "text-emerald-300" },
}

export function FileIcon({ path, size = 14 }: { path: string; size?: number }) {
  const language = languageOf(path)
  if (language.tech && brandIcon(language.tech)) return <TechIcon tech={language.tech} size={size} />
  const generic = (language.id && GENERIC[language.id]) || { icon: FileCode2, tone: "text-slate-400" }
  const Icon = generic.icon
  return <Icon className={cn("shrink-0", generic.tone)} style={{ width: size, height: size }} />
}

const FOLLOW_KEY = "migrate.code.follow"

/** A read-only editor: folders on the left, open files in tabs, and live updates as the agent writes. */
export function CodeExplorer({
  projectId,
  activity,
  initialPath,
  focusPath,
  roots = ["v2", "legacy", "migration"],
  className,
  onBack,
}: {
  projectId: string
  activity: Activity[]
  initialPath?: string
  focusPath?: string
  roots?: Root[]
  className?: string
  onBack?: () => void
}) {
  const { t, ago } = useI18n()
  const [root, setRoot] = useState<Root>(initialPath ? rootOf(initialPath) : roots[0])
  const [listing, setListing] = useState<{ files: string[]; truncated: boolean }>()
  const [treeVersion, setTreeVersion] = useState(0)
  const [query, setQuery] = useState("")
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(initialPath ? ancestors(initialPath) : []))
  const [tabs, setTabs] = useState<string[]>(initialPath ? [initialPath] : [])
  const [active, setActive] = useState<string | undefined>(initialPath)
  const [versions, setVersions] = useState<Record<string, number>>({})
  const [changed, setChanged] = useState<Record<string, number>>({})
  const [follow, setFollow] = useState(() => {
    try {
      return localStorage.getItem(FOLLOW_KEY) === "1"
    } catch {
      return false
    }
  })
  const seen = useRef<Set<string>>(undefined)

  useEffect(() => {
    let live = true
    api
      .tree(projectId, root)
      .then((result) => live && setListing(result))
      .catch(() => live && setListing({ files: [], truncated: false }))
    return () => {
      live = false
    }
  }, [projectId, root, treeVersion])

  const open = (path: string) => {
    setTabs((list) => (list.includes(path) ? list : [...list, path]))
    setActive(path)
    setRoot(rootOf(path))
    setExpanded((set) => new Set([...set, ...ancestors(path)]))
  }

  const close = (path: string) => {
    const next = tabs.filter((p) => p !== path)
    setTabs(next)
    if (active === path) setActive(next.at(-1))
  }

  useEffect(() => {
    if (focusPath) open(focusPath)
  }, [focusPath])

  // Files the agent writes light up, the tree refreshes and open files reload.
  useEffect(() => {
    const writes = activity.filter(
      (a) => (a.kind === "write" || a.kind === "edit") && a.status !== "running" && typeof a.message?.params?.path === "string",
    )
    const pathOf = (a: Activity) => String(a.message?.params?.path)
    if (!seen.current) {
      seen.current = new Set(writes.map((a) => a.id))
      setChanged(Object.fromEntries(writes.map((a) => [pathOf(a), a.at])))
      return
    }
    const fresh = writes.filter((a) => !seen.current!.has(a.id))
    if (!fresh.length) return
    for (const a of fresh) seen.current.add(a.id)
    const paths = fresh.map(pathOf)
    setChanged((map) => ({ ...map, ...Object.fromEntries(fresh.map((a) => [pathOf(a), a.at])) }))
    setVersions((map) => ({ ...map, ...Object.fromEntries(paths.map((p) => [p, (map[p] ?? 0) + 1])) }))
    setTreeVersion((v) => v + 1)
    if (follow) open(paths.at(-1)!)
  }, [activity])

  const files = useMemo(() => filterFiles(listing?.files ?? [], query), [listing, query])
  const tree = useMemo(() => buildTree(files, root), [files, root])
  const recent = Object.entries(changed)
    .filter(([path]) => rootOf(path) === root)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)

  const toggleFollow = () => {
    setFollow((value) => {
      try {
        localStorage.setItem(FOLLOW_KEY, value ? "0" : "1")
      } catch {
        // Only this session remembers it.
      }
      return !value
    })
  }

  return (
    <div className={cn("flex min-h-0 overflow-hidden rounded-2xl bg-[#090c14] ring-1 ring-white/[0.07]", className)}>
      <aside className="flex w-72 shrink-0 flex-col border-r border-white/5 bg-black/25">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="flex h-10 shrink-0 cursor-pointer items-center gap-2 border-b border-white/5 px-3 text-xs text-slate-400 hover:text-white"
          >
            <ArrowLeft className="size-3.5" /> {t("code.back")}
          </button>
        )}
        <div className="flex shrink-0 gap-1 p-2">
          {roots.map((id) => {
            const meta = ROOTS[id]
            const Icon = meta.icon
            return (
              <button
                type="button"
                key={id}
                onClick={() => setRoot(id)}
                className={cn(
                  "relative flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs transition-colors",
                  root === id ? "text-white" : "text-slate-500 hover:text-slate-300",
                )}
              >
                {root === id && <motion.span layoutId={`root-${projectId}`} className="absolute inset-0 rounded-lg bg-white/[0.07] ring-1 ring-white/10" />}
                <Icon className={cn("relative size-3.5", meta.tone)} />
                <span className="relative">{t(meta.label)}</span>
              </button>
            )
          })}
        </div>
        <div className="mx-2 mb-2 flex h-8 shrink-0 items-center gap-2 rounded-lg bg-white/[0.03] px-2.5 ring-1 ring-white/[0.06] focus-within:ring-cyan-400/30">
          <Search className="size-3.5 text-slate-500" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("code.search")}
            spellCheck={false}
            className="min-w-0 flex-1 bg-transparent text-xs text-slate-200 outline-none placeholder:text-slate-600"
          />
          {query && (
            <button type="button" onClick={() => setQuery("")} className="cursor-pointer text-slate-500 hover:text-white">
              <X className="size-3" />
            </button>
          )}
        </div>
        <div className="min-h-0 flex-1 overflow-auto px-1 pb-3 font-mono text-[12px]">
          {!listing && (
            <div className="flex items-center gap-2 px-3 py-2 text-slate-500">
              <Spinner className="size-3.5" />
            </div>
          )}
          {listing && files.length === 0 && <div className="px-3 py-6 text-center font-sans text-xs text-slate-500">{t("code.noFiles")}</div>}
          {tree.map((node) => (
            <TreeRow
              key={node.path}
              node={node}
              depth={0}
              expanded={expanded}
              forceOpen={query.trim() !== ""}
              active={active}
              changed={changed}
              onToggle={(path) =>
                setExpanded((set) => {
                  const next = new Set(set)
                  if (next.has(path)) next.delete(path)
                  else next.add(path)
                  return next
                })
              }
              onOpen={open}
            />
          ))}
          {listing?.truncated && <div className="px-3 pt-2 font-sans text-[11px] text-slate-600">{t("code.truncatedTree", { count: listing.files.length })}</div>}
        </div>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-9 shrink-0 overflow-x-auto border-b border-white/5 bg-black/30">
          <AnimatePresence initial={false}>
            {tabs.map((path) => (
              <motion.div
                key={path}
                layout
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, width: 0 }}
                onClick={() => open(path)}
                title={path}
                className={cn(
                  "group flex shrink-0 cursor-pointer items-center gap-2 border-r border-white/5 pr-2 pl-3 text-xs",
                  path === active ? "bg-[#090c14] text-white shadow-[inset_0_2px_0_0_#22d3ee]" : "text-slate-500 hover:bg-white/[0.02] hover:text-slate-300",
                )}
              >
                <FileIcon path={path} size={13} />
                <span className="max-w-44 truncate">{fileName(path)}</span>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation()
                    close(path)
                  }}
                  title={t("code.close")}
                  className={cn("grid size-4 cursor-pointer place-items-center rounded hover:bg-white/10", path === active ? "opacity-70" : "opacity-0 group-hover:opacity-70")}
                >
                  <X className="size-3" />
                </button>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
        <div className="flex h-9 shrink-0 items-center gap-1 border-b border-white/5 px-3 text-xs text-slate-500">
          <span className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden">
            {active ? (
              active.split("/").map((segment, i, all) => (
                <Fragment key={`${segment}-${i}`}>
                  {i > 0 && <ChevronRight className="size-3 shrink-0 text-slate-700" />}
                  <span className={cn("truncate", i === all.length - 1 && "text-slate-200")}>{segment}</span>
                </Fragment>
              ))
            ) : (
              <span>{t("code.title")}</span>
            )}
          </span>
          <button
            type="button"
            onClick={toggleFollow}
            title={t("code.followHint")}
            className={cn(
              "flex cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1 transition",
              follow ? "bg-cyan-400/10 text-cyan-200 ring-1 ring-cyan-400/25" : "hover:bg-white/5 hover:text-slate-300",
            )}
          >
            <Radar className={cn("size-3.5", follow && "animate-pulse")} />
            {t("code.follow")}
          </button>
        </div>
        {active ? (
          <FileViewer key={active} projectId={projectId} path={active} version={versions[active] ?? 0} changedAt={changed[active]} />
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
            <div className="grid size-14 place-items-center rounded-2xl bg-white/[0.04] ring-1 ring-white/10">
              <FolderTree className="size-6 text-slate-300" />
            </div>
            <div>
              <div className="text-sm font-medium text-white">{t("code.pick")}</div>
              <div className="mt-1 max-w-sm text-xs leading-relaxed text-slate-500">{t("code.pickText")}</div>
            </div>
            {recent.length > 0 && (
              <div className="w-full max-w-md text-left">
                <div className="mb-1.5 text-[10px] font-semibold tracking-[0.16em] text-slate-600 uppercase">{t("code.recent")}</div>
                {recent.map(([path, at]) => (
                  <button
                    type="button"
                    key={path}
                    onClick={() => open(path)}
                    className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-slate-300 hover:bg-white/[0.04]"
                  >
                    <FileIcon path={path} size={13} />
                    <span className="min-w-0 flex-1 truncate font-mono">{path}</span>
                    <span className="shrink-0 text-slate-600">{ago(at)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  )
}

function TreeRow({
  node,
  depth,
  expanded,
  forceOpen,
  active,
  changed,
  onToggle,
  onOpen,
}: {
  node: TreeNode
  depth: number
  expanded: Set<string>
  forceOpen: boolean
  active?: string
  changed: Record<string, number>
  onToggle: (path: string) => void
  onOpen: (path: string) => void
}) {
  const indent = { paddingLeft: 8 + depth * 12 }
  if (node.children) {
    const open = forceOpen || expanded.has(node.path)
    const touched = Object.keys(changed).some((path) => path.startsWith(`${node.path}/`))
    const Icon = open ? FolderOpen : Folder
    return (
      <>
        <button
          type="button"
          onClick={() => onToggle(node.path)}
          style={indent}
          className="flex w-full cursor-pointer items-center gap-1.5 rounded-md py-[3px] pr-2 text-left text-slate-400 hover:bg-white/[0.04] hover:text-slate-200"
        >
          <ChevronRight className={cn("size-3 shrink-0 text-slate-600 transition", open && "rotate-90")} />
          <Icon className="size-3.5 shrink-0 text-slate-500" />
          <span className="min-w-0 flex-1 truncate">{node.name}</span>
          {touched && !open && <span className="size-1.5 shrink-0 rounded-full bg-cyan-300/70" />}
        </button>
        {open &&
          node.children.map((child) => (
            <TreeRow
              key={child.path}
              node={child}
              depth={depth + 1}
              expanded={expanded}
              forceOpen={forceOpen}
              active={active}
              changed={changed}
              onToggle={onToggle}
              onOpen={onOpen}
            />
          ))}
      </>
    )
  }
  const recently = changed[node.path] !== undefined && Date.now() - changed[node.path] < 60_000
  return (
    <button
      type="button"
      onClick={() => onOpen(node.path)}
      style={{ paddingLeft: 8 + depth * 12 + 16 }}
      className={cn(
        "flex w-full cursor-pointer items-center gap-2 rounded-md py-[3px] pr-2 text-left",
        active === node.path ? "bg-cyan-400/10 text-cyan-50" : "text-slate-300 hover:bg-white/[0.04]",
      )}
    >
      <FileIcon path={node.path} size={13} />
      <span className="min-w-0 flex-1 truncate">{node.name}</span>
      {changed[node.path] !== undefined && (
        <span className="relative grid size-2 shrink-0 place-items-center">
          {recently && <span className="absolute inset-0 animate-ping rounded-full bg-cyan-300/60" />}
          <span className="size-1.5 rounded-full bg-cyan-300" />
        </span>
      )}
    </button>
  )
}

const ITALIC = 1
const BOLD = 2

export function FileViewer({ projectId, path, version = 0, changedAt }: { projectId: string; path: string; version?: number; changedAt?: number }) {
  const { t, ago } = useI18n()
  const [file, setFile] = useState<FileWindow>()
  const [error, setError] = useState<string>()

  useEffect(() => {
    let live = true
    api
      .fullFile(projectId, path)
      .then((next) => {
        if (!live) return
        setFile(next)
        setError(undefined)
      })
      .catch((e: Error) => live && setError(e.message))
    return () => {
      live = false
    }
  }, [projectId, path, version])

  const language = languageOf(path)
  const code = file && !file.binary ? file.lines.join("\n") : undefined
  const tokens = useTokens(code, language.id)
  const lines = code === undefined ? [] : (file?.lines ?? [])
  const gutter = String(Math.max(lines.length, 1)).length + 2

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-auto py-3 font-mono text-[12.5px] leading-[1.7]">
        {!file && !error && (
          <div className="flex items-center gap-2 px-4 font-sans text-sm text-slate-500">
            <Spinner /> {t("code.loading")}
          </div>
        )}
        {error && <div className="px-4 font-sans text-sm text-slate-500">{t("code.unavailable", { error })}</div>}
        {file?.binary && <div className="grid h-full place-items-center font-sans text-sm text-slate-500">{t("code.binary")}</div>}
        {lines.length > 0 && (
          <table className="border-collapse">
            <tbody>
              {lines.map((line, i) => (
                <tr key={i} className="hover:bg-white/[0.025]">
                  <td className="sticky left-0 bg-[#090c14] pr-4 pl-4 text-right align-top text-slate-600 select-none" style={{ minWidth: `${gutter}ch` }}>
                    {i + 1}
                  </td>
                  <td className="pr-8 whitespace-pre text-[#dfe4ee]">
                    {tokens?.[i]
                      ? tokens[i].map((token, j) => (
                          <span
                            key={j}
                            style={{
                              color: token.color,
                              fontStyle: (token.fontStyle ?? 0) & ITALIC ? "italic" : undefined,
                              fontWeight: (token.fontStyle ?? 0) & BOLD ? 600 : undefined,
                            }}
                          >
                            {token.content}
                          </span>
                        ))
                      : line || " "}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {file && !file.binary && file.total > file.to && <div className="px-4 pt-3 font-sans text-xs text-slate-500">{t("code.truncated", { count: file.to })}</div>}
      </div>
      <div className="flex h-7 shrink-0 items-center gap-3 border-t border-white/5 bg-black/30 px-3 text-[11px] text-slate-500">
        <span className="flex items-center gap-1.5">
          <FileIcon path={path} size={12} />
          {language.label}
        </span>
        {file && !file.binary && <span>{t("code.lines", { count: file.total })}</span>}
        {file?.size !== undefined && <span>{formatBytes(file.size)}</span>}
        {changedAt !== undefined && (
          <span className="flex items-center gap-1.5 text-cyan-300/80">
            <span className="size-1.5 rounded-full bg-cyan-300" />
            {t("code.updated", { ago: ago(changedAt) })}
          </span>
        )}
        <span className="flex-1" />
        <span className="flex items-center gap-1">
          <Lock className="size-3" />
          {t("code.readOnly")}
        </span>
        {code !== undefined && <CopyButton text={code} className="size-6" />}
      </div>
    </div>
  )
}

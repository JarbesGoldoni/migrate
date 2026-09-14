import { ChevronDown, CircleCheck, Code, FolderOpen, GitBranchPlus } from "lucide-react"
import { AnimatePresence, motion } from "motion/react"
import { useEffect, useRef, useState } from "react"
import type { ProjectRecord } from "../../../src/shared/types"
import { api, type Editor, type ExportResult } from "../lib/api"
import { useI18n } from "../lib/i18n"
import { CommandBlock } from "./Code"
import { Dialog } from "./Dialog"
import { Button, CopyButton, Spinner } from "./ui"

/** Open the working folder in an IDE or the file manager, and bring the migration branch to the user's repository. */
export function WorkspaceActions({ project }: { project: ProjectRecord }) {
  const { t } = useI18n()
  const [menu, setMenu] = useState(false)
  const [editors, setEditors] = useState<Editor[]>()
  const [failed, setFailed] = useState(false)
  const [exporting, setExporting] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (menu && !editors) api.editors().then(setEditors).catch(() => setEditors([]))
  }, [menu, editors])

  useEffect(() => {
    if (!menu) return
    const close = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setMenu(false)
    }
    window.addEventListener("mousedown", close)
    return () => window.removeEventListener("mousedown", close)
  }, [menu])

  const open = async (editor?: string) => {
    const result = await api.open(project.id, editor).catch(() => ({ opened: false }))
    if (result.opened) {
      setMenu(false)
      setFailed(false)
    } else setFailed(true)
  }

  const item = "flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-slate-200 hover:bg-white/[0.06]"

  return (
    <>
      <div ref={ref} className="relative hidden md:block">
        <Button size="sm" variant="outline" icon={<FolderOpen className="size-3.5 text-amber-300" />} onClick={() => setMenu((m) => !m)}>
          {t("workspace.open")}
          <ChevronDown className="size-3.5 text-slate-500" />
        </Button>
        <AnimatePresence>
          {menu && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              className="absolute top-10 right-0 z-50 w-80 rounded-xl bg-ink-900/95 p-1.5 shadow-2xl ring-1 ring-white/10 backdrop-blur-xl"
            >
              {editors === undefined && (
                <div className="flex items-center px-3 py-2">
                  <Spinner className="size-3.5 text-slate-500" />
                </div>
              )}
              {editors?.map((editor) => (
                <button type="button" key={editor.id} onClick={() => open(editor.id)} className={item}>
                  <Code className="size-4 text-cyan-300" />
                  {t("workspace.openIn", { editor: editor.label })}
                </button>
              ))}
              {editors?.length === 0 && <div className="px-3 py-2 text-xs text-slate-500">{t("workspace.noEditors")}</div>}
              <button type="button" onClick={() => open()} className={item}>
                <FolderOpen className="size-4 text-amber-300" />
                {t("workspace.openFolder")}
              </button>
              <div className="mt-1 border-t border-white/5 px-3 pt-2 pb-1">
                <div className="text-[10px] tracking-wider text-slate-500 uppercase">{t("workspace.path")}</div>
                <div className="mt-1 flex items-center gap-1">
                  <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-slate-400" title={project.workspace}>
                    {project.workspace}
                  </span>
                  <CopyButton text={project.workspace} />
                </div>
                {failed && <div className="mt-1.5 text-xs text-rose-300">{t("workspace.openFailed")}</div>}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <Button
        size="sm"
        variant="outline"
        className="hidden xl:inline-flex"
        icon={<GitBranchPlus className="size-3.5 text-emerald-300" />}
        onClick={() => setExporting(true)}
      >
        {t("export.button")}
      </Button>
      <ExportDialog project={project} open={exporting} onClose={() => setExporting(false)} />
    </>
  )
}

function ExportDialog({ project, open, onClose }: { project: ProjectRecord; open: boolean; onClose: () => void }) {
  const { t } = useI18n()
  const [branch, setBranch] = useState(project.branch.replace(/^migrate\//, "simplify/"))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [result, setResult] = useState<ExportResult>()

  const close = () => {
    onClose()
    setResult(undefined)
    setError(undefined)
  }

  const submit = async () => {
    setBusy(true)
    setError(undefined)
    try {
      setResult(await api.exportBranch(project.id, branch))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      title={t("export.title")}
      icon={
        <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-emerald-400/10">
          <GitBranchPlus className="size-4 text-emerald-300" />
        </div>
      }
    >
      <p className="text-sm leading-relaxed text-slate-400">{t("export.text", { repository: project.source })}</p>
      {result ? (
        <div className="mt-4 flex flex-col gap-3">
          <div className="flex items-center gap-2 text-sm text-emerald-300">
            <CircleCheck className="size-4" />
            {t("export.done", { branch: result.branch })}
          </div>
          <CommandBlock command={`cd ${result.repository} && ${result.command}`} />
          <p className="text-xs text-slate-500">{t("export.again")}</p>
          <div className="flex justify-end">
            <Button variant="primary" onClick={close}>
              {t("replay.close")}
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-4 flex flex-col gap-2">
          <label htmlFor="export-branch" className="text-[11px] font-semibold tracking-[0.16em] text-slate-500 uppercase">
            {t("export.branch")}
          </label>
          <input
            id="export-branch"
            value={branch}
            onChange={(e) => setBranch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            spellCheck={false}
            className="h-10 rounded-xl bg-black/30 px-3 font-mono text-sm text-white ring-1 ring-white/10 outline-none focus:ring-emerald-400/40"
          />
          {error && <div className="text-sm text-rose-300">{error}</div>}
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" onClick={close}>
              {t("common.cancel")}
            </Button>
            <Button variant="primary" loading={busy} disabled={!branch.trim()} icon={<GitBranchPlus className="size-4" />} onClick={submit}>
              {t("export.submit")}
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  )
}

import { cp, mkdir, writeFile } from "node:fs/promises"
import { basename, join } from "node:path"
import { slug } from "../shared/contracts"
import type { ProjectProbe } from "../shared/types"
import { type Exec, output } from "./util/exec"

const SKIP_COPY = new Set([".git", "node_modules", ".venv", "venv", "__pycache__", "dist", "build", "target", ".next"])

export type WorkspaceResult = { workspace: string; branch: string }

/**
 * Create an isolated workspace on a new branch without touching the user's
 * checkout: a git worktree when the source is a repository with history,
 * otherwise a fresh repository seeded with a snapshot of the folder.
 * The legacy code is moved under legacy/ so v2/ can grow next to it.
 */
export async function createWorkspace(input: {
  probe: ProjectProbe
  id: string
  baseDir: string
  exec: Exec
  branchBase?: string
}): Promise<WorkspaceResult> {
  const { probe, exec } = input
  const workspace = join(input.baseDir, `${slug(probe.name, "project")}-${input.id}`)
  await mkdir(input.baseDir, { recursive: true })
  const branchBase = input.branchBase ?? "migrate/v2"

  if (probe.isGit && probe.hasCommits) {
    const branch = await uniqueBranch(probe.path, branchBase, exec)
    await git(exec, probe.path, ["worktree", "add", "-b", branch, workspace, "HEAD"])
    await moveIntoLegacy(workspace, exec)
    return { workspace, branch }
  }

  await mkdir(workspace, { recursive: true })
  await git(exec, workspace, ["init", "-q"])
  await mkdir(join(workspace, "legacy"), { recursive: true })
  await cp(probe.path, join(workspace, "legacy"), {
    recursive: true,
    filter: (src) => !SKIP_COPY.has(basename(src)) || src === probe.path,
  })
  await git(exec, workspace, ["add", "-A"])
  await commit(exec, workspace, "Legacy snapshot")
  await git(exec, workspace, ["checkout", "-q", "-b", branchBase])
  await scaffold(workspace, exec)
  return { workspace, branch: branchBase }
}

async function moveIntoLegacy(workspace: string, exec: Exec) {
  const tree = await git(exec, workspace, ["ls-tree", "--name-only", "HEAD"])
  const entries = tree.stdout
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
  await mkdir(join(workspace, "legacy"), { recursive: true })
  if (entries.length) await git(exec, workspace, ["mv", "-k", ...entries, "legacy/"])
  await scaffold(workspace, exec, "migrate: move the legacy application into legacy/")
}

async function scaffold(workspace: string, exec: Exec, message = "migrate: prepare migration workspace") {
  await mkdir(join(workspace, "migration"), { recursive: true })
  await mkdir(join(workspace, "v2"), { recursive: true })
  await writeFile(join(workspace, "migration", ".gitignore"), "state.json\nactivity.json\nactivity/\n")
  await writeFile(
    join(workspace, "migration", "README.md"),
    [
      "# Migration",
      "",
      "- `legacy/` — the application as it is today (never modified)",
      "- `migration/` — contracts produced at each step: architecture, entry points, rules, tests, parity",
      "- `v2/` — the new implementation, built batch by batch",
      "",
    ].join("\n"),
  )
  await writeFile(join(workspace, "v2", ".gitkeep"), "")
  await git(exec, workspace, ["add", "-A"])
  await commit(exec, workspace, message)
}

export async function uniqueBranch(repo: string, base: string, exec: Exec) {
  for (let n = 1; n < 100; n++) {
    const name = n === 1 ? base : `${base}-${n}`
    const exists = await exec("git", ["rev-parse", "--verify", "--quiet", `refs/heads/${name}`], { cwd: repo })
    if (exists.code !== 0) return name
  }
  return `${base}-${Date.now()}`
}

export async function commitAll(exec: Exec, workspace: string, message: string) {
  await git(exec, workspace, ["add", "-A"])
  const staged = await exec("git", ["diff", "--cached", "--quiet"], { cwd: workspace })
  if (staged.code === 0) return false
  await commit(exec, workspace, message)
  return true
}

async function commit(exec: Exec, cwd: string, message: string) {
  const email = await exec("git", ["config", "user.email"], { cwd })
  const identity = email.code === 0 && email.stdout.trim() ? [] : ["-c", "user.name=Migrate", "-c", "user.email=migrate@localhost"]
  await git(exec, cwd, [...identity, "commit", "-q", "--no-verify", "-m", message])
}

async function git(exec: Exec, cwd: string, args: string[]) {
  const result = await exec("git", args, { cwd, timeoutMs: 10 * 60_000 })
  if (result.code !== 0) throw new Error(`git ${args[0]} failed: ${output(result).slice(0, 500)}`)
  return result
}

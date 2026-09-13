import { existsSync } from "node:fs"
import { resolve } from "node:path"
import type { EngineInfo, Preflight, PreflightCheck, ProjectProbe } from "../shared/types"
import { detectCompose, firstVersion } from "./env/compose"
import { detectMarkers, projectName } from "./fsbrowse"
import { type Exec, output } from "./util/exec"

export async function probeProject(path: string, exec: Exec): Promise<ProjectProbe> {
  const full = resolve(path)
  const exists = existsSync(full)
  const inside = exists ? await exec("git", ["rev-parse", "--show-toplevel"], { cwd: full }) : undefined
  const isGit = inside?.code === 0 && resolve(inside.stdout.trim()) === full
  const head = isGit ? await exec("git", ["rev-parse", "--verify", "HEAD"], { cwd: full }) : undefined
  return {
    path: full,
    name: projectName(full),
    exists,
    isGit,
    hasCommits: head?.code === 0,
    markers: exists ? await detectMarkers(full) : [],
  }
}

export async function runPreflight(path: string, deps: { exec: Exec; engine: () => Promise<EngineInfo> }): Promise<Preflight> {
  const { exec } = deps
  const [project, git, docker, podman, go, compose, engine] = await Promise.all([
    probeProject(path, exec),
    exec("git", ["--version"]),
    exec("docker", ["--version"]),
    exec("podman", ["--version"]),
    exec("go", ["version"]),
    detectCompose(exec),
    deps.engine(),
  ])
  const container = docker.code === 0 ? docker : podman.code === 0 ? podman : undefined

  const checks: PreflightCheck[] = [
    {
      id: "project",
      label: "Project folder",
      ok: project.exists,
      required: true,
      detail: project.exists
        ? project.isGit
          ? project.hasCommits
            ? "Git repository — work happens on a new branch"
            : "Git repository without commits — a snapshot will be taken"
          : "Not a git repository — a versioned copy will be created"
        : "Folder not found",
    },
    {
      id: "engine",
      label: "AI engine",
      ok: engine.ready && engine.models.length > 0,
      required: true,
      detail: engine.ready ? `${engine.models.length} models available` : engine.error,
      hint: engine.ready ? undefined : "Connect at least one AI provider",
    },
    {
      id: "git",
      label: "Git",
      ok: git.code === 0,
      required: true,
      version: firstVersion(output(git)),
      hint: "Install git",
    },
    {
      id: "container",
      label: "Container runtime",
      ok: Boolean(container),
      required: false,
      version: container ? firstVersion(output(container)) : undefined,
      detail: container ? (docker.code === 0 ? output(docker).split("\n")[0] : "podman") : undefined,
      hint: "Install Docker or Podman to run legacy and v2 side by side",
    },
    {
      id: "compose",
      label: "Compose",
      ok: Boolean(compose),
      required: false,
      version: compose?.version,
      detail: compose?.command.join(" "),
      hint: "Install docker compose or podman-compose",
    },
    {
      id: "go",
      label: "Go toolchain",
      ok: go.code === 0,
      required: false,
      version: firstVersion(output(go)),
      hint: "Optional — v2 is also built inside a container",
    },
  ]
  return { checks, project, ready: checks.every((c) => c.ok || !c.required) }
}

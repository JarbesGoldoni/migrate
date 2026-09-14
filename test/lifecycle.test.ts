import { describe, expect, test } from "bun:test"
import { existsSync } from "node:fs"
import { join } from "node:path"
import { EventBus } from "../src/server/bus"
import { exportBranchName, isLinkedWorktree, Pipeline } from "../src/server/pipeline"
import { Store } from "../src/server/store"
import { exec } from "../src/server/util/exec"
import { FakeEngine, gitRepo, isolatedExec, tempDir, waitPhase, writeFiles } from "./helpers"

async function setup() {
  const home = await tempDir()
  const engine = new FakeEngine()
  const pipeline = new Pipeline({
    store: new Store(join(home, "projects.json")),
    engine,
    bus: new EventBus(),
    exec: isolatedExec,
    workspaces: join(home, "workspaces"),
  })
  return { engine, pipeline }
}

const branches = async (repo: string) =>
  (await exec("git", ["branch", "--format=%(refname:short)"], { cwd: repo })).stdout.split("\n").filter(Boolean)

describe("migration lifecycle", () => {
  test("brings the branch into the original repository, then deletes the worktree migration", async () => {
    const { pipeline, engine } = await setup()
    const repo = await gitRepo({ "app.js": "1" })
    const project = await pipeline.createProject({ source: repo })
    expect(isLinkedWorktree(project.workspace)).toBe(true)
    expect(exportBranchName(project)).toBe("simplify/v2")
    expect((await pipeline.migrations())[0].summary.linked).toBe(true)

    await expect(pipeline.exportBranch(project.id, "bad name..")).rejects.toThrow("not a valid branch name")
    await expect(pipeline.exportBranch(project.id, project.branch)).rejects.toThrow("working branch")
    const current = (await exec("git", ["symbolic-ref", "--short", "HEAD"], { cwd: repo })).stdout.trim()
    await expect(pipeline.exportBranch(project.id, current)).rejects.toThrow("checked out")

    await writeFiles(project.workspace, { "v2/main.go": "package main" })
    const exported = await pipeline.exportBranch(project.id)
    expect(exported).toMatchObject({ branch: "simplify/v2", repository: repo, command: "git checkout simplify/v2" })
    const tree = (await exec("git", ["ls-tree", "-r", "--name-only", "simplify/v2"], { cwd: repo })).stdout
    expect(tree).toContain("v2/main.go")
    expect(tree).toContain("legacy/app.js")

    engine.hang = true
    await pipeline.start(project.id, "discover")
    await Bun.sleep(30)
    await expect(pipeline.deleteProject(project.id)).rejects.toThrow("still running")
    pipeline.stop(project.id, "discover")
    await waitPhase(pipeline, project.id, "discover")
    await Bun.sleep(50)

    await pipeline.deleteProject(project.id, { branch: true })
    expect(existsSync(project.workspace)).toBe(false)
    expect(await branches(repo)).not.toContain(project.branch)
    expect(await branches(repo)).toContain("simplify/v2")
    await expect(pipeline.project(project.id)).rejects.toThrow("Unknown migration")
  }, 30_000)

  test("snapshot migrations: export needs a repository, and lands in one without commits", async () => {
    const { pipeline } = await setup()
    const plain = await tempDir()
    await writeFiles(plain, { "index.php": "<?php" })
    const copy = await pipeline.createProject({ source: plain })
    expect(isLinkedWorktree(copy.workspace)).toBe(false)
    await expect(pipeline.exportBranch(copy.id)).rejects.toThrow("not a git repository")
    await pipeline.deleteProject(copy.id)
    expect(existsSync(copy.workspace)).toBe(false)

    const fresh = await tempDir()
    await writeFiles(fresh, { "app.py": "print(1)" })
    await exec("git", ["init", "-q"], { cwd: fresh })
    const project = await pipeline.createProject({ source: fresh })
    const exported = await pipeline.exportBranch(project.id, "review/v2")
    expect(exported.branch).toBe("review/v2")
    expect(await branches(fresh)).toContain("review/v2")
  }, 30_000)
})

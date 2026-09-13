import { describe, expect, test } from "bun:test"
import { existsSync } from "node:fs"
import { writeFile } from "node:fs/promises"
import { join } from "node:path"
import { probeProject } from "../src/server/preflight"
import { createSample, sampleSource } from "../src/server/sample"
import { artifacts, emptyState, readJson, Store, writeJson } from "../src/server/store"
import { exec } from "../src/server/util/exec"
import { commitAll, createWorkspace, uniqueBranch } from "../src/server/workspace"
import type { ProjectRecord } from "../src/shared/types"
import { gitRepo, isolatedExec, tempDir, writeFiles } from "./helpers"

const log = async (cwd: string) => (await exec("git", ["log", "--format=%s"], { cwd })).stdout.trim().split("\n")

describe("createWorkspace", () => {
  test("creates a worktree on a new branch with legacy moved aside", async () => {
    const repo = await gitRepo({ "src/app.js": "console.log(1)", "package.json": "{}", ".env.example": "A=1" })
    const base = await tempDir()
    const probe = await probeProject(repo, isolatedExec)
    const first = await createWorkspace({ probe, id: "a1", baseDir: base, exec: isolatedExec })
    expect(first.branch).toBe("migrate/v2")
    expect(existsSync(join(first.workspace, "legacy", "src", "app.js"))).toBe(true)
    expect(existsSync(join(first.workspace, "legacy", ".env.example"))).toBe(true)
    expect(existsSync(join(first.workspace, "migration", "README.md"))).toBe(true)
    expect(existsSync(join(first.workspace, "src"))).toBe(false)
    expect(existsSync(join(repo, "src", "app.js"))).toBe(true)
    expect((await log(first.workspace))[0]).toBe("migrate: move the legacy application into legacy/")

    const second = await createWorkspace({ probe, id: "a2", baseDir: base, exec: isolatedExec })
    expect(second.branch).toBe("migrate/v2-2")
    expect(await uniqueBranch(repo, "migrate/v2", isolatedExec)).toBe("migrate/v2-3")
  })

  test("snapshots a plain folder into a fresh repository", async () => {
    const folder = await tempDir()
    await writeFiles(folder, { "main.py": "print(1)", "node_modules/pkg/index.js": "x", "lib/util.py": "" })
    const probe = await probeProject(folder, isolatedExec)
    const result = await createWorkspace({ probe, id: "b1", baseDir: await tempDir(), exec: isolatedExec })
    expect(existsSync(join(result.workspace, "legacy", "main.py"))).toBe(true)
    expect(existsSync(join(result.workspace, "legacy", "lib", "util.py"))).toBe(true)
    expect(existsSync(join(result.workspace, "legacy", "node_modules"))).toBe(false)
    expect(await log(result.workspace)).toEqual(["migrate: prepare migration workspace", "Legacy snapshot"])

    expect(await commitAll(isolatedExec, result.workspace, "nothing")).toBe(false)
    await writeFile(join(result.workspace, "v2", "main.go"), "package main")
    expect(await commitAll(isolatedExec, result.workspace, "migrate: add v2")).toBe(true)
    expect((await log(result.workspace))[0]).toBe("migrate: add v2")
  })

  test("surfaces git failures", async () => {
    const folder = await tempDir()
    const probe = { ...(await probeProject(folder, isolatedExec)), isGit: true, hasCommits: true }
    await expect(createWorkspace({ probe, id: "c1", baseDir: await tempDir(), exec: isolatedExec })).rejects.toThrow("git worktree failed")
  })
})

describe("sample", () => {
  test("creates a git repository from the bundled legacy shop", async () => {
    expect(sampleSource()).toBeDefined()
    const dest = await createSample(exec, await tempDir())
    expect(existsSync(join(dest, "src", "routes", "orders.js"))).toBe(true)
    expect(await log(dest)).toEqual(["Legacy shop v1.4"])
  })
})

describe("Store", () => {
  test("persists projects, state and snapshots", async () => {
    const dir = await tempDir()
    const store = new Store(join(dir, "projects.json"))
    expect(await store.list()).toEqual([])
    const workspace = join(dir, "ws")
    const project: ProjectRecord = {
      id: "p1",
      name: "shop",
      source: "/src",
      workspace,
      branch: "migrate/v2",
      createdAt: 1,
      target: "go",
      ports: { legacy: 18080, v2: 18081 },
    }
    await store.put(project)
    await store.put({ ...project, id: "p2" })
    await store.put({ ...project, name: "renamed" })
    expect((await store.list()).map((p) => [p.id, p.name])).toEqual([
      ["p1", "renamed"],
      ["p2", "shop"],
    ])
    expect(await store.get("missing")).toBeUndefined()

    expect(await store.loadState(project)).toEqual(emptyState())
    await store.saveState(project, {
      phases: { discover: { status: "running", startedAt: 1 }, rules: { status: "done" } },
      sessions: { project: "s1" },
      runtime: { legacy: "up", v2: "up" },
    })
    const state = await store.loadState(project)
    expect(state.phases.discover).toMatchObject({ status: "failed", error: "Interrupted" })
    expect(state.phases.rules.status).toBe("done")
    expect(state.sessions).toEqual({ project: "s1" })
    expect(state.runtime).toEqual({ legacy: "down", v2: "down" })

    await writeJson(join(workspace, artifacts.discovery), { summary: "Shop", nodes: [{ id: "api" }] })
    await writeJson(join(workspace, artifacts.entrypoints), {
      entrypoints: [{ id: "list", method: "GET", path: "/p" }],
      batches: [{ id: "catalog", entrypoints: ["list"] }],
    })
    await writeJson(join(workspace, artifacts.environment), { services: [{ name: "legacy" }] })
    for (const name of ["rules", "tests", "legacy-run", "port", "build", "parity", "reconcile"] as const) {
      await writeJson(join(workspace, artifacts.batch("catalog", name)), name === "tests" ? { cases: [{ request: { path: "/p" } }] } : { batch: "catalog" })
    }
    const snapshot = await store.snapshot(project, state)
    expect(snapshot.discovery?.nodes[0].id).toBe("api")
    expect(snapshot.entrypoints?.batches[0].id).toBe("catalog")
    expect(snapshot.environment?.services).toHaveLength(1)
    expect(Object.keys(snapshot.rules)).toEqual(["catalog"])
    expect(snapshot.tests.catalog.cases).toHaveLength(1)
    expect(snapshot.legacyRuns.catalog).toEqual({ batch: "catalog" } as never)
    expect(snapshot.ports.catalog.batch).toBe("catalog")
    expect(snapshot.builds.catalog).toBeDefined()
    expect(snapshot.parity.catalog).toBeDefined()
    expect(snapshot.reconcile.catalog.batch).toBe("catalog")

    await writeFile(join(dir, "broken.json"), "{nope")
    expect(await readJson(join(dir, "broken.json"))).toBeUndefined()
    expect(await readJson(join(dir, "absent.json"))).toBeUndefined()
  })
})

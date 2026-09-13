import { afterAll, describe, expect, test } from "bun:test"
import { mkdir } from "node:fs/promises"
import { homedir } from "node:os"
import { join } from "node:path"
import { compose, detectCompose, firstVersion, waitForHttp } from "../src/server/env/compose"
import { detectMarkers, listDirectory, projectName } from "../src/server/fsbrowse"
import { probeProject, runPreflight } from "../src/server/preflight"
import type { Exec, ExecResult } from "../src/server/util/exec"
import type { EngineInfo } from "../src/shared/types"
import { gitRepo, isolatedExec, tempDir, writeFiles } from "./helpers"

const ok = (stdout = ""): ExecResult => ({ code: 0, stdout, stderr: "" })
const missing: ExecResult = { code: 127, stdout: "", stderr: "not found" }

function scripted(responses: Record<string, ExecResult>, calls: string[] = []): Exec {
  return async (cmd, args) => {
    const line = [cmd, ...args].join(" ")
    calls.push(line)
    const match = Object.entries(responses).find(([prefix]) => line.startsWith(prefix))
    return match ? match[1] : missing
  }
}

describe("fsbrowse", () => {
  test("lists folders with project markers and hides noise", async () => {
    const root = await tempDir()
    await writeFiles(root, {
      "shop/package.json": "{}",
      "shop/Dockerfile": "",
      "svc/go.mod": "module svc",
      "dotnet/App.csproj": "",
      "node_modules/x/index.js": "",
      ".hidden/file": "",
      "file.txt": "",
    })
    await mkdir(join(root, "shop", ".git"))
    const listing = await listDirectory(root)
    expect(listing.path).toBe(root)
    expect(listing.entries.map((e) => e.name)).toEqual(["dotnet", "shop", "svc"])
    expect(listing.entries.find((e) => e.name === "shop")?.markers.sort()).toEqual(["docker", "git", "node"])
    expect(listing.entries.find((e) => e.name === "dotnet")?.markers).toEqual(["dotnet"])
    expect(listing.parent).toBeDefined()
    expect(await detectMarkers(join(root, "nope"))).toEqual([])
    expect(await listDirectory(root, 1).then((l) => l.entries.length)).toBe(1)
    expect((await listDirectory("/")).parent).toBeUndefined()
    await expect(listDirectory(join(root, "file.txt"))).rejects.toThrow("Not a directory")
    expect(projectName("/a/b/legacy-app/")).toBe("legacy-app")
  })

  test("defaults to and expands the home folder", async () => {
    expect((await listDirectory()).path).toBe(homedir())
    expect((await listDirectory("~")).path).toBe(homedir())
  })
})

describe("compose", () => {
  test("detects the first working compose command", async () => {
    const found = await detectCompose(scripted({ "podman compose version": ok("podman-compose version 1.6.0") }))
    expect(found).toEqual({ command: ["podman", "compose"], version: "1.6.0" })
    expect(await detectCompose(scripted({}))).toBeUndefined()
    expect(firstVersion("none")).toBe("")
  })

  test("builds compose invocations", async () => {
    const calls: string[] = []
    const exec = scripted({ docker: ok("done") }, calls)
    const c = compose(exec, ["docker", "compose"], "migration/env/compose.yml", "migrate-abc", "/ws")
    expect(await c.up(["legacy"])).toEqual({ ok: true, output: "done" })
    await c.up(["v2"], { build: false })
    await c.down({ volumes: true })
    await c.down()
    expect(await c.logs("legacy", 10)).toBe("done")
    expect(calls).toEqual([
      "docker compose -f migration/env/compose.yml -p migrate-abc up -d --build legacy",
      "docker compose -f migration/env/compose.yml -p migrate-abc up -d v2",
      "docker compose -f migration/env/compose.yml -p migrate-abc down -v",
      "docker compose -f migration/env/compose.yml -p migrate-abc down",
      "docker compose -f migration/env/compose.yml -p migrate-abc logs --tail 10 legacy",
    ])
  })

  test("waits for any HTTP answer", async () => {
    const server = Bun.serve({ port: 0, fetch: () => new Response("nope", { status: 500 }) })
    afterAll(() => server.stop(true))
    expect(await waitForHttp(`http://127.0.0.1:${server.port}`, "/health", 2_000)).toBe(true)
    expect(await waitForHttp("http://127.0.0.1:1", "", 1_200)).toBe(false)
  })
})

describe("preflight", () => {
  const engine = async (): Promise<EngineInfo> => ({
    ready: true,
    models: [{ providerID: "p", providerName: "P", modelID: "m", name: "M" }],
  })

  test("probes git repositories and plain folders", async () => {
    const repo = await gitRepo({ "package.json": "{}" })
    const probe = await probeProject(repo, isolatedExec)
    expect(probe).toMatchObject({ exists: true, isGit: true, hasCommits: true, markers: ["git", "node"] })
    const plain = await tempDir()
    expect(await probeProject(plain, isolatedExec)).toMatchObject({ exists: true, isGit: false, hasCommits: false })
    expect(await probeProject(join(plain, "missing"), isolatedExec)).toMatchObject({ exists: false, markers: [] })
  })

  test("reports tools and readiness", async () => {
    const repo = await gitRepo({ "go.mod": "module x" })
    const exec = scripted({
      "git --version": ok("git version 2.45.1"),
      "git rev-parse --show-toplevel": ok(repo),
      "git rev-parse --verify HEAD": ok("abc"),
      "podman --version": ok("podman version 5.8.4"),
      "podman-compose version": ok("podman-compose version 1.6.0"),
      "go version": ok("go version go1.23.6 linux/amd64"),
    })
    const result = await runPreflight(repo, { exec, engine })
    expect(result.ready).toBe(true)
    const byId = Object.fromEntries(result.checks.map((c) => [c.id, c]))
    expect(byId.git.version).toBe("2.45.1")
    expect(byId.container).toMatchObject({ ok: true, version: "5.8.4", detail: "podman" })
    expect(byId.compose).toMatchObject({ ok: true, detail: "podman-compose" })
    expect(byId.go.version).toBe("1.23.6")
    expect(byId.project.detail).toContain("new branch")

    const docker = await runPreflight(repo, {
      exec: scripted({ "git --version": ok("git version 2"), "docker --version": ok("Docker version 27.0.1, build x") }),
      engine: async () => ({ ready: false, models: [], error: "no engine" }),
    })
    expect(docker.ready).toBe(false)
    const dockerById = Object.fromEntries(docker.checks.map((c) => [c.id, c]))
    expect(dockerById.container.detail).toContain("Docker version")
    expect(dockerById.engine).toMatchObject({ ok: false, detail: "no engine", hint: expect.any(String) })
    expect(dockerById.project.detail).toContain("versioned copy")

    const empty = await tempDir()
    await isolatedExec("git", ["init", "-q"], { cwd: empty })
    const fresh = await runPreflight(empty, { exec: isolatedExec, engine })
    expect(fresh.checks.find((c) => c.id === "project")?.detail).toContain("without commits")
    const gone = await runPreflight(join(empty, "missing"), { exec: isolatedExec, engine })
    expect(gone.ready).toBe(false)
  })
})

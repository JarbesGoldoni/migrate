import { mkdtemp, mkdir, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import type { Engine, RunOptions, RunResult } from "../src/server/engine/engine"
import type { Pipeline } from "../src/server/pipeline"
import { writeJson } from "../src/server/store"
import { type Exec, exec } from "../src/server/util/exec"
import type { EngineInfo } from "../src/shared/types"

export async function tempDir(prefix = "migrate-test-") {
  return mkdtemp(join(tmpdir(), prefix))
}

export async function writeFiles(root: string, files: Record<string, string>) {
  for (const [path, content] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true })
    await writeFile(join(root, path), content)
  }
}

const IDENTITY = ["-c", "user.name=Test", "-c", "user.email=test@example.com"]

export async function gitRepo(files: Record<string, string>) {
  const dir = await tempDir("migrate-repo-")
  await writeFiles(dir, files)
  await exec("git", ["init", "-q"], { cwd: dir })
  await exec("git", ["add", "-A"], { cwd: dir })
  await exec("git", [...IDENTITY, "commit", "-q", "-m", "initial"], { cwd: dir })
  return dir
}

/** Real exec for git, but no container runtime and no Go toolchain. */
export const isolatedExec: Exec = (cmd, args, opts) => {
  if (["docker", "podman", "docker-compose", "podman-compose", "go"].includes(cmd)) {
    return Promise.resolve({ code: 127, stdout: "", stderr: `${cmd}: not found` })
  }
  return exec(cmd, args, opts)
}

type Output = { path: string; data: unknown } | { text: string } | { error: string }

export class FakeEngine implements Engine {
  calls: RunOptions[] = []
  outputs: Record<string, (options: RunOptions) => Output | Promise<Output>> = {}
  hang = false

  async info(): Promise<EngineInfo> {
    return {
      ready: true,
      models: [{ providerID: "p", providerName: "Provider", modelID: "m", name: "Model" }],
      defaultModel: { providerID: "p", modelID: "m" },
    }
  }

  async run(options: RunOptions): Promise<RunResult> {
    this.calls.push(options)
    options.onActivity({ id: `${options.phase}-read`, at: Date.now(), phase: options.phase, kind: "read", title: "Read legacy/app.js" })
    if (this.hang) {
      await new Promise<void>((resolve) => options.signal?.addEventListener("abort", () => resolve()))
      return { sessionId: "hung", text: "", writes: [], error: "Stopped" }
    }
    const phase = options.phase.split(":")[0]
    const output = await this.outputs[phase]?.(options)
    const sessionId = `ses-${options.phase}`
    if (!output) return { sessionId, text: "", writes: [], error: "no scripted output" }
    if ("error" in output) return { sessionId, text: "", writes: [], error: output.error }
    if ("text" in output) return { sessionId, text: output.text, writes: [] }
    const file = join(options.directory, output.path)
    await writeJson(file, output.data)
    return { sessionId, text: "Done.", writes: [file] }
  }

  stop() {}
}

export async function waitPhase(pipeline: Pipeline, id: string, key: string, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const snapshot = await pipeline.snapshot(id)
    const status = snapshot.state.phases[key]?.status
    if (status === "done" || status === "failed") return snapshot
    await Bun.sleep(20)
  }
  throw new Error(`Timed out waiting for ${key}`)
}

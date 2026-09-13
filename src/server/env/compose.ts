import { type Exec, output } from "../util/exec"

const CANDIDATES = [["docker", "compose"], ["podman", "compose"], ["docker-compose"], ["podman-compose"]]

export async function detectCompose(exec: Exec): Promise<{ command: string[]; version: string } | undefined> {
  for (const candidate of CANDIDATES) {
    const [cmd, ...args] = candidate
    const result = await exec(cmd, [...args, "version"], { timeoutMs: 15_000 })
    if (result.code === 0) return { command: candidate, version: firstVersion(output(result)) }
  }
  return undefined
}

export function firstVersion(text: string) {
  return text.match(/\d+\.\d+(?:\.\d+)?/)?.[0] ?? ""
}

export type Compose = {
  up(services?: string[], options?: { build?: boolean; onOutput?: (s: string) => void }): Promise<{ ok: boolean; output: string }>
  down(options?: { volumes?: boolean }): Promise<{ ok: boolean; output: string }>
  logs(service: string, tail?: number): Promise<string>
}

export function compose(exec: Exec, command: string[], file: string, project: string, cwd: string): Compose {
  const run = (args: string[], onOutput?: (s: string) => void, timeoutMs = 20 * 60_000) => {
    const [cmd, ...base] = command
    return exec(cmd, [...base, "-f", file, "-p", project, ...args], { cwd, timeoutMs, onOutput })
  }
  return {
    // podman-compose can hang forever on "up --build", so images are built as a separate step.
    async up(services = [], options = {}) {
      if (options.build !== false) {
        const built = await run(["build"], options.onOutput)
        if (built.code !== 0) return { ok: false, output: output(built) }
      }
      const r = await run(["up", "-d", ...services], options.onOutput)
      return { ok: r.code === 0, output: output(r) }
    },
    async down(options = {}) {
      const r = await run(["down", ...(options.volumes ? ["-v"] : [])], undefined, 5 * 60_000)
      return { ok: r.code === 0, output: output(r) }
    },
    async logs(service, tail = 80) {
      return output(await run(["logs", "--tail", String(tail), service], undefined, 60_000))
    },
  }
}

/** Wait until something answers HTTP on the base URL — any status counts as alive. */
export async function waitForHttp(baseUrl: string, path = "/", timeoutMs = 120_000, fetchImpl = fetch) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const alive = await fetchImpl(new URL(path || "/", baseUrl), { signal: AbortSignal.timeout(3_000) })
      .then(() => true)
      .catch(() => false)
    if (alive) return true
    await new Promise((r) => setTimeout(r, 1_000))
  }
  return false
}

import { spawn } from "node:child_process"

export type ExecResult = { code: number; stdout: string; stderr: string }

export type ExecOptions = {
  cwd?: string
  timeoutMs?: number
  env?: NodeJS.ProcessEnv
  onOutput?: (chunk: string) => void
}

export type Exec = (cmd: string, args: string[], opts?: ExecOptions) => Promise<ExecResult>

const LIMIT = 200_000

const keepTail = (s: string) => (s.length > LIMIT ? s.slice(s.length - LIMIT) : s)

export const exec: Exec = (cmd, args, opts = {}) =>
  new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd: opts.cwd, env: opts.env ?? process.env })
    let stdout = ""
    let stderr = ""
    child.stdout?.on("data", (d: Buffer) => {
      stdout = keepTail(stdout + d.toString())
      opts.onOutput?.(d.toString())
    })
    child.stderr?.on("data", (d: Buffer) => {
      stderr = keepTail(stderr + d.toString())
      opts.onOutput?.(d.toString())
    })
    const timer = opts.timeoutMs ? setTimeout(() => child.kill("SIGKILL"), opts.timeoutMs) : undefined
    child.on("error", (err) => {
      clearTimeout(timer)
      resolve({ code: 127, stdout, stderr: `${stderr}${err.message}` })
    })
    child.on("close", (code) => {
      clearTimeout(timer)
      resolve({ code: code ?? 1, stdout, stderr })
    })
  })

export const output = (r: ExecResult) => `${r.stdout}${r.stderr}`.trim()

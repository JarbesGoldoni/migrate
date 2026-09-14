import { mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import {
  parseDiscovery,
  parseEntryPoints,
  parseEnvironment,
  parsePort,
  parseReconcile,
  parseRules,
  parseTests,
  parseVerify,
} from "../shared/contracts"
import type { Activity, BuildReport, LegacyRun, ParityRun, ProjectRecord, ProjectSnapshot, ProjectState } from "../shared/types"
import { projectsFile } from "./paths"

export type BatchArtifact = "rules" | "tests" | "legacy-run" | "port" | "build" | "parity" | "reconcile" | "verify"

export const artifacts = {
  state: "migration/state.json",
  activity: "migration/activity.json",
  activityDir: "migration/activity",
  phaseActivity: (key: string) => `migration/activity/${key.replace(/:/g, "__")}.json`,
  discovery: "migration/discovery.json",
  entrypoints: "migration/entrypoints.json",
  environment: "migration/environment.json",
  batch: (batch: string, name: BatchArtifact) => `migration/batches/${batch}/${name}.json`,
  curl: (batch: string) => `migration/batches/${batch}/curl`,
}

export async function readJson(path: string): Promise<unknown> {
  const text = await readFile(path, "utf8").catch(() => undefined)
  if (text === undefined) return undefined
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

export async function writeJson(path: string, data: unknown) {
  await mkdir(dirname(path), { recursive: true })
  const tmp = `${path}.${process.pid}.${Date.now()}.tmp`
  await writeFile(tmp, `${JSON.stringify(data, null, 2)}\n`)
  await rename(tmp, path)
}

export function emptyState(): ProjectState {
  return { phases: {}, sessions: {}, runtime: { legacy: "down", v2: "down" } }
}

export class Store {
  constructor(private readonly file = projectsFile()) {}

  async list(): Promise<ProjectRecord[]> {
    const data = await readJson(this.file)
    return Array.isArray(data) ? (data as ProjectRecord[]) : []
  }

  async get(id: string) {
    return (await this.list()).find((p) => p.id === id)
  }

  async put(record: ProjectRecord) {
    const all = (await this.list()).filter((p) => p.id !== record.id)
    await writeJson(this.file, [record, ...all])
  }

  async remove(id: string) {
    await writeJson(
      this.file,
      (await this.list()).filter((p) => p.id !== id),
    )
  }

  async loadState(project: ProjectRecord): Promise<ProjectState> {
    const data = (await readJson(join(project.workspace, artifacts.state))) as Partial<ProjectState> | undefined
    const base = emptyState()
    if (!data) return base
    // A phase cannot still be running after a restart.
    const phases = Object.fromEntries(
      Object.entries(data.phases ?? {}).map(([key, value]) => [
        key,
        value.status === "running" ? { ...value, status: "failed" as const, error: "Interrupted" } : value,
      ]),
    )
    return { phases, sessions: data.sessions ?? {}, runtime: base.runtime }
  }

  async saveState(project: ProjectRecord, state: ProjectState) {
    await writeJson(join(project.workspace, artifacts.state), state)
  }

  /** Keep the full activity of one phase run, so a migration can be replayed later. */
  async saveActivity(project: ProjectRecord, key: string, items: Activity[]) {
    await writeJson(join(project.workspace, artifacts.phaseActivity(key)), items)
  }

  async loadActivity(project: ProjectRecord): Promise<Activity[]> {
    const dir = join(project.workspace, artifacts.activityDir)
    const files = (await readdir(dir).catch(() => [] as string[])).filter((f) => f.endsWith(".json")).sort()
    // Older migrations kept a single capped activity.json; phase files take precedence over it.
    const lists = [
      await readJson(join(project.workspace, artifacts.activity)),
      ...(await Promise.all(files.map((file) => readJson(join(dir, file))))),
    ]
    const byId = new Map<string, Activity>()
    for (const list of lists) {
      if (!Array.isArray(list)) continue
      for (const item of list as Activity[]) if (item?.id) byId.set(item.id, item)
    }
    return [...byId.values()].sort((a, b) => a.at - b.at)
  }

  async snapshot(project: ProjectRecord, state: ProjectState): Promise<ProjectSnapshot> {
    const root = project.workspace
    const read = (rel: string) => readJson(join(root, rel))
    const [discovery, entrypoints, environment] = await Promise.all([
      read(artifacts.discovery),
      read(artifacts.entrypoints),
      read(artifacts.environment),
    ])
    const parsedEntrypoints = entrypoints === undefined ? undefined : parseEntryPoints(entrypoints)
    const snapshot: ProjectSnapshot = {
      project,
      state,
      discovery: discovery === undefined ? undefined : parseDiscovery(discovery),
      entrypoints: parsedEntrypoints,
      environment: environment === undefined ? undefined : parseEnvironment(environment),
      rules: {},
      tests: {},
      legacyRuns: {},
      ports: {},
      builds: {},
      parity: {},
      reconcile: {},
      verify: {},
    }
    await Promise.all(
      (parsedEntrypoints?.batches ?? []).map(async (batch) => {
        const [rules, tests, legacyRun, port, build, parity, reconcile, verify] = await Promise.all(
          (["rules", "tests", "legacy-run", "port", "build", "parity", "reconcile", "verify"] as const).map((name) =>
            read(artifacts.batch(batch.id, name)),
          ),
        )
        if (rules !== undefined) snapshot.rules[batch.id] = parseRules(rules)
        if (tests !== undefined) snapshot.tests[batch.id] = parseTests(tests)
        if (legacyRun !== undefined) snapshot.legacyRuns[batch.id] = legacyRun as LegacyRun
        if (port !== undefined) snapshot.ports[batch.id] = parsePort(port)
        if (build !== undefined) snapshot.builds[batch.id] = build as BuildReport
        if (parity !== undefined) snapshot.parity[batch.id] = parity as ParityRun
        if (reconcile !== undefined) snapshot.reconcile[batch.id] = parseReconcile(reconcile)
        if (verify !== undefined) snapshot.verify[batch.id] = parseVerify(verify)
      }),
    )
    return snapshot
  }
}

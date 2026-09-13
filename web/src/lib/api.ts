import type {
  EngineInfo,
  FsListing,
  HttpRequestSpec,
  HttpResult,
  Comparison,
  ModelRef,
  PhaseName,
  Preflight,
  ProjectRecord,
  ProjectSnapshot,
  Activity,
} from "../../../src/shared/types"

export type Snapshot = ProjectSnapshot & { activity: Activity[] }
export type Target = { id: string; label: string }
export type FileWindow = { path: string; from: number; to: number; total: number; lines: string[] }
export type PlaygroundResult = { legacy?: HttpResult; v2?: HttpResult; comparison?: Comparison }

async function request<T>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: init?.json === undefined ? init?.headers : { "content-type": "application/json", ...init?.headers },
    body: init?.json === undefined ? init?.body : JSON.stringify(init.json),
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok && response.status !== 409) {
    throw new Error((body as { error?: string }).error ?? `Request failed (${response.status})`)
  }
  return body as T
}

export const api = {
  engine: () => request<EngineInfo>("/api/engine"),
  targets: () => request<Target[]>("/api/targets"),
  fs: (path?: string) => request<FsListing>(`/api/fs${path ? `?path=${encodeURIComponent(path)}` : ""}`),
  preflight: (path: string) => request<Preflight>(`/api/preflight?path=${encodeURIComponent(path)}`),
  sample: () => request<{ path: string }>("/api/sample", { method: "POST" }),
  projects: () => request<ProjectRecord[]>("/api/projects"),
  create: (source: string, model: ModelRef | undefined, target: string) =>
    request<ProjectRecord>("/api/projects", { method: "POST", json: { source, model, target } }),
  project: (id: string) => request<Snapshot>(`/api/projects/${id}`),
  update: (id: string, patch: { model?: ModelRef; target?: string }) =>
    request<ProjectRecord>(`/api/projects/${id}`, { method: "PATCH", json: patch }),
  run: (id: string, phase: PhaseName, batch?: string) =>
    request<{ started: boolean; reason?: string }>(`/api/projects/${id}/run`, { method: "POST", json: { phase, batch } }),
  stop: (id: string, phase: PhaseName, batch?: string) =>
    request<{ stopped: boolean }>(`/api/projects/${id}/stop`, { method: "POST", json: { phase, batch } }),
  runtime: (id: string, action: "up" | "down") =>
    request<{ ok: boolean; output: string }>(`/api/projects/${id}/runtime`, { method: "POST", json: { action } }),
  playground: (id: string, side: "legacy" | "v2" | "both", req: HttpRequestSpec) =>
    request<PlaygroundResult>(`/api/projects/${id}/playground`, { method: "POST", json: { side, request: req } }),
  file: (id: string, path: string, start?: number, end?: number) =>
    request<FileWindow>(
      `/api/projects/${id}/file?path=${encodeURIComponent(path)}${start ? `&start=${start}` : ""}${end ? `&end=${end}` : ""}`,
    ),
  tree: (id: string, dir: string) => request<{ files: string[] }>(`/api/projects/${id}/tree?dir=${encodeURIComponent(dir)}`),
}

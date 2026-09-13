import type { Batch, Discovery, EntryPoints } from "../shared/contracts"
import type { ParityRun, ProjectRecord } from "../shared/types"
import { artifacts } from "./store"

export type PromptContext = {
  project: ProjectRecord
  composeCommand: string
  discovery?: Discovery
  entrypoints?: EntryPoints
  batch?: Batch
  parity?: ParityRun
  tests?: { cases: Array<{ id: string; request: unknown }> }
}

export const TARGETS: Record<string, { label: string; architecture: string; verify: string; image: string }> = {
  go: {
    label: "Go",
    image: "docker.io/library/golang:1.23-alpine",
    verify: "go build ./... && go test ./...",
    architecture: `- v2/ is a single Go module (module name "v2", go 1.23) using the standard library net/http router (Go 1.22+ patterns such as "POST /api/orders/{id}"). No web framework. Add dependencies only when a dependency needs a driver (pgx for PostgreSQL, go-redis for Redis).
- Business rules are pure functions in v2/internal/domain/<area>/ with no HTTP, context or I/O awareness. Each rule id from rules.json maps to a function; put the rule id in a one-line comment above it.
- Transport is one generic handler factory in v2/internal/httpapi/handler.go: decode and validate the request, call the service/domain function, map domain errors to the legacy status codes and write the legacy response shape. Routes are one-liners in v2/internal/httpapi/routes.go.
- Data access and external calls sit behind small interfaces in v2/internal/store/ and v2/internal/clients/.
- v2/cmd/server/main.go reads the same configuration as legacy from environment variables and listens on :8080.
- Table-driven unit tests next to the domain functions.
- v2/Dockerfile: multi-stage (docker.io/library/golang:1.23-alpine builder, docker.io/library/alpine:3.20 runtime), build context v2/.`,
  },
  typescript: {
    label: "TypeScript (Bun + Hono)",
    image: "docker.io/oven/bun:1",
    verify: "bun install && bun test",
    architecture: `- v2/ is a Bun + Hono TypeScript service listening on port 8080.
- Business rules are pure functions in v2/src/domain/<area>/ with no HTTP or I/O awareness; each rule id from rules.json maps to a function (rule id in a one-line comment).
- One handler factory in v2/src/http/handler.ts maps domain errors to the legacy status codes and response shape; routes are one-liners in v2/src/http/routes.ts.
- Data access and external calls behind small interfaces in v2/src/store/ and v2/src/clients/.
- Unit tests with bun test next to the domain functions.
- v2/Dockerfile based on docker.io/oven/bun:1, build context v2/.`,
  },
  python: {
    label: "Python (FastAPI)",
    image: "docker.io/library/python:3.12-slim",
    verify: "python -m compileall -q .",
    architecture: `- v2/ is a FastAPI service served by uvicorn on port 8080.
- Business rules are pure functions in v2/app/domain/<area>.py with no HTTP or I/O awareness; each rule id from rules.json maps to a function (rule id in a one-line comment).
- One exception handler maps domain errors to the legacy status codes and response shape; routers stay thin.
- Data access and external calls behind small classes in v2/app/store/ and v2/app/clients/.
- pytest unit tests for the domain functions.
- v2/Dockerfile based on docker.io/library/python:3.12-slim, build context v2/.`,
  },
}

export function targetOf(project: ProjectRecord) {
  return TARGETS[project.target] ?? TARGETS.go
}

export function composeProject(project: ProjectRecord) {
  return `migrate-${project.id}`.toLowerCase()
}

function preamble(ctx: PromptContext, output: string) {
  const root = ctx.project.workspace
  return `You are an autonomous migration engineer. Work only inside this workspace: ${root}

Workspace layout:
- legacy/     the legacy application — never modify, move or delete anything inside it
- migration/  machine-readable contracts and the environment used to run tests
- v2/         the new ${targetOf(ctx.project).label} implementation

Rules of engagement:
- Be efficient: locate code with glob and grep, read only what you need, do not narrate.
- Never ask questions. Make reasonable assumptions and record them.
- Finish by writing the JSON document to "${output}" (relative to the workspace root; absolute path ${root}/${output}) with the write tool. Valid JSON only: no comments, no trailing commas. Then reply with one short sentence.`
}

const DISCOVERY_EXAMPLE = {
  summary: "Flask REST API for clinic appointments backed by MySQL, with RabbitMQ for reminders and an SMS provider.",
  stack: { languages: ["python"], frameworks: ["flask", "sqlalchemy"], runtime: "python 3.11", packageManager: "pip" },
  run: {
    install: "pip install -r requirements.txt",
    start: "gunicorn app:app -b 0.0.0.0:5000",
    port: 5000,
    healthPath: "/healthz",
    env: [{ name: "DATABASE_URL", required: true, example: "mysql://clinic:clinic@legacy-mysql:3306/clinic" }],
  },
  nodes: [
    { id: "patients", label: "Patient apps", kind: "client", tech: "http", description: "Web and mobile clients", paths: [] },
    { id: "api", label: "Appointments API", kind: "service", tech: "flask", description: "Routes, scheduling rules", paths: ["legacy/app"] },
    { id: "mysql", label: "MySQL", kind: "datastore", tech: "mysql", description: "Patients, doctors, appointments", paths: ["legacy/migrations"] },
    { id: "reminders", label: "Reminder worker", kind: "worker", tech: "celery", description: "Sends reminders", paths: ["legacy/worker.py"] },
    { id: "sms", label: "SMS gateway", kind: "external", tech: "twilio", description: "Outbound SMS", paths: [] },
  ],
  edges: [
    { from: "patients", to: "api", label: "REST/JSON", kind: "sync" },
    { from: "api", to: "mysql", label: "SQL", kind: "data" },
    { from: "api", to: "reminders", label: "enqueue", kind: "async" },
    { from: "reminders", to: "sms", label: "HTTPS", kind: "sync" },
  ],
  dependencies: [
    { id: "mysql", name: "MySQL", kind: "database", tech: "mysql", version: "8", usedBy: ["api"], env: ["DATABASE_URL"], strategy: "container", image: "docker.io/library/mysql:8", notes: "Schema from legacy/migrations" },
    { id: "rabbitmq", name: "RabbitMQ", kind: "queue", tech: "rabbitmq", version: "3", usedBy: ["api", "reminders"], env: ["BROKER_URL"], strategy: "container", image: "docker.io/library/rabbitmq:3-alpine", notes: "" },
    { id: "sms", name: "SMS gateway", kind: "external-api", tech: "twilio", version: "", usedBy: ["reminders"], env: ["SMS_API_URL"], strategy: "mock", image: "", notes: "POST /messages" },
  ],
}

export function discoverPrompt(ctx: PromptContext) {
  return `${preamble(ctx, artifacts.discovery)}

Task: map the legacy application's architecture, its runtime dependencies and how to run it.

Look at manifests, entry files, configuration, Dockerfiles/compose files, environment variable usage and every client for databases, caches, queues, storage and external HTTP APIs.
- Keep the graph readable: 4 to 16 nodes. Node kinds: client, gateway, service, module, worker, datastore, cache, queue, external, storage.
- "tech" is a lowercase technology name (express, spring, django, postgresql, redis, kafka, stripe, s3...).
- Every dependency the running app needs gets a strategy for isolated local runs: "container" (a real throwaway container such as postgres or redis), "mock" (a stub server we write, typical for third-party HTTP APIs) or "skip" (not needed to serve requests).
- "run" describes how the legacy app is installed and started, the port it listens on and a cheap path that answers HTTP.

JSON shape (example from a different project):
${JSON.stringify(DISCOVERY_EXAMPLE, null, 2)}`
}

const ENTRYPOINTS_EXAMPLE = {
  entrypoints: [
    { id: "list-slots", kind: "http", method: "GET", path: "/api/doctors/{id}/slots", name: "List free slots", file: "legacy/app/routes/doctors.py", line: 42, handler: "list_slots", summary: "Free 30-minute slots for a doctor on a date", dependencies: ["mysql"], complexity: "medium" },
    { id: "book-appointment", kind: "http", method: "POST", path: "/api/appointments", name: "Book appointment", file: "legacy/app/routes/appointments.py", line: 18, handler: "book", summary: "Books a slot, enqueues a reminder", dependencies: ["mysql", "rabbitmq"], complexity: "high" },
    { id: "send-reminders", kind: "job", method: "", path: "", name: "Send reminders", file: "legacy/worker.py", line: 10, handler: "send_reminders", summary: "Cron every 10 minutes", dependencies: ["mysql", "sms"], complexity: "medium" },
  ],
  batches: [
    { id: "scheduling", title: "Scheduling", rationale: "Slots and bookings share availability rules and tables", icon: "calendar", entrypoints: ["list-slots", "book-appointment"] },
    { id: "reminders", title: "Reminders", rationale: "Background notification flow", icon: "bell", entrypoints: ["send-reminders"] },
  ],
}

export function entrypointsPrompt(ctx: PromptContext) {
  return `${preamble(ctx, artifacts.entrypoints)}

Context: ${artifacts.discovery} already describes the architecture and dependencies.

Task: find every entry point of the legacy application — every way the outside world triggers behavior: HTTP routes (method and full path including router prefixes), GraphQL operations, gRPC methods, websocket handlers, CLI commands, scheduled jobs and queue consumers.
- Search exhaustively: router registrations, decorators, annotations, handler maps, cron definitions.
- "file" and "line" point to where the entry point is registered or its handler is defined. Paths start with legacy/.
- "dependencies" lists dependency ids from ${artifacts.discovery} that the entry point touches.
- Group entry points into coherent batches that can be migrated together: same resource or domain, shared rules and tables. Aim for 2 to 10 entry points per batch. Order batches from the most self-contained and simplest to the most complex. Every entry point belongs to exactly one batch. "icon" is a lucide icon name.
- Very large apps: include every entry point but keep summaries short.

JSON shape (example from a different project):
${JSON.stringify(ENTRYPOINTS_EXAMPLE, null, 2)}`
}

export function environmentPrompt(ctx: PromptContext) {
  const { project } = ctx
  const run = ctx.discovery?.run
  const name = composeProject(project)
  const deps = (ctx.discovery?.dependencies ?? [])
    .map((d) => `- ${d.id}: ${d.name} (${d.kind}, strategy ${d.strategy}${d.image ? `, image ${d.image}` : ""})`)
    .join("\n")
  const example = {
    composeFile: "migration/env/compose.yml",
    services: [
      { name: "legacy", role: "legacy", image: "", notes: "Built from migration/env/legacy.Dockerfile" },
      { name: "legacy-mysql", role: "dependency", image: "docker.io/library/mysql:8", notes: "Seeded from legacy/migrations" },
      { name: "legacy-mock-sms", role: "mock", image: "", notes: "Canned responses for POST /messages" },
    ],
    mocks: [{ dependency: "sms", approach: "Tiny HTTP server returning a queued message id", files: ["migration/env/mocks/sms/server.js"] }],
    limitations: ["Reminder worker is not started; queue side effects are not observable over HTTP"],
  }
  return `${preamble(ctx, artifacts.environment)}

Context: ${artifacts.discovery} describes the stack${run?.start ? ` (start: ${run.start}, port ${run.port || "unknown"})` : ""} and dependencies:
${deps || "- none recorded"}

Task: make the legacy application run in isolation with containers so characterization tests can call it over HTTP. Characterization tests will run against it before any new code exists, so this matters.

Create:
1. migration/env/legacy.Dockerfile — builds and starts the legacy app. The build context is the workspace root, so copy from legacy/.
2. migration/env/compose.yml — top-level "name: ${name}", no "version" key:
   - service "legacy": build { context: ../.., dockerfile: migration/env/legacy.Dockerfile }, publishes host port ${project.ports.legacy} to the app port, depends on its dependency services.
   - every "container" dependency becomes a service prefixed "legacy-" (e.g. legacy-postgres). Seed databases with the schema, migrations and seed data found in the repo (init scripts or a one-shot init service) so realistic requests work. Later an identical "v2-" copy will be added so each side has isolated state.
   - every "mock" dependency becomes a small stub under migration/env/mocks/<id>/ returning plausible canned responses for the calls the code makes, as service "legacy-mock-<id>".
   - point the legacy app at those services through environment variables. Use fully qualified images (docker.io/library/postgres:16-alpine).
3. A .dockerignore at the workspace root excluding **/node_modules, **/.git and v2/bin.

Then start it once: \`cd ${project.workspace} && ${ctx.composeCommand} -f migration/env/compose.yml -p ${name} up -d --build legacy\` and check that http://127.0.0.1:${project.ports.legacy}${run?.healthPath || "/"} answers. If it does not, read the container logs, fix the files and try again, within reason. Leave the containers running. Record anything that could not be made to work in "limitations".

JSON shape (example from a different project):
${JSON.stringify(example, null, 2)}`
}

function batchList(ctx: PromptContext) {
  const ids = new Set(ctx.batch?.entrypoints ?? [])
  return (ctx.entrypoints?.entrypoints ?? [])
    .filter((e) => ids.has(e.id))
    .map((e) => `- ${e.id}: ${[e.method, e.path].filter(Boolean).join(" ") || e.name} — ${e.file}${e.line ? `:${e.line}` : ""} — ${e.summary}`)
    .join("\n")
}

export function rulesPrompt(ctx: PromptContext) {
  const batch = ctx.batch!
  const output = artifacts.batch(batch.id, "rules")
  const example = {
    batch: "scheduling",
    entrypoints: [
      {
        entrypoint: "book-appointment",
        flow: [
          { file: "legacy/app/routes/appointments.py", line: 18, description: "Parse JSON body and authenticate patient" },
          { file: "legacy/app/services/booking.py", line: 55, description: "Check the slot is free inside a transaction" },
        ],
        rules: [
          {
            id: "book-appointment-r1",
            title: "Bookings need 24h notice",
            kind: "validation",
            description: "A slot can only be booked if it starts at least 24 hours from now.",
            file: "legacy/app/services/booking.py",
            lineStart: 61,
            lineEnd: 66,
            decisions: [
              { id: "book-appointment-r1.1", when: "slot starts in less than 24h", then: "422 {\"error\":\"too_late\"}" },
              { id: "book-appointment-r1.2", when: "slot starts in 24h or more", then: "continue to availability check" },
            ],
          },
        ],
      },
    ],
  }
  return `${preamble(ctx, output)}

Context: ${artifacts.discovery} and ${artifacts.entrypoints}.

Task: batch "${batch.title}". Trace each entry point end to end and extract the business rules it encodes:
${batchList(ctx)}

For each entry point follow the call chain from the handler through services, helpers, queries and integrations to the response, and record it as ordered flow steps with file and line. Then extract every business rule on that path — validations, calculations, authorization checks, state transitions, persistence side effects, integration calls and error handling. For each rule give the file and line range and a decision table with one row per branch: "when" is the condition, "then" the observable outcome (status code, response fields, side effect). Be exact about literal values: limits, status codes, error messages, rounding, defaults. Rule ids are short and stable, prefixed with the entry point id.

JSON shape (example from a different project):
${JSON.stringify(example, null, 2)}`
}

export function testsPrompt(ctx: PromptContext) {
  const batch = ctx.batch!
  const output = artifacts.batch(batch.id, "tests")
  const example = {
    batch: "scheduling",
    cases: [
      {
        id: "book-too-late",
        entrypoint: "book-appointment",
        rules: ["book-appointment-r1"],
        title: "Rejects a booking with less than 24h notice",
        branch: "book-appointment-r1.1",
        request: { method: "POST", path: "/api/appointments", headers: { Authorization: "Bearer patient-1" }, query: {}, body: { slotId: 7 } },
        expect: { status: 422, body: { error: "too_late" }, match: "exact" },
        ignore: [],
      },
      {
        id: "book-ok",
        entrypoint: "book-appointment",
        rules: ["book-appointment-r1", "book-appointment-r2"],
        title: "Books a free slot",
        branch: "book-appointment-r1.2",
        request: { method: "POST", path: "/api/appointments", headers: { Authorization: "Bearer patient-1" }, query: {}, body: { slotId: 12 } },
        expect: { status: 201, body: { status: "booked", slotId: 12 }, match: "subset" },
        ignore: ["$.id", "$.createdAt"],
      },
    ],
  }
  return `${preamble(ctx, output)}

Context: ${artifacts.batch(batch.id, "rules")} (the rules you extracted) and migration/env (how legacy runs, including its seed data).

Task: write characterization tests for batch "${batch.title}" at the entry-point boundary — real HTTP requests in, expected responses out. Not unit tests.
- As many cases as the code has branches: every decision row in rules.json is exercised by at least one case — happy paths, each validation failure, not found, authorization failures, boundary values.
- Requests run against the legacy app started with the seeded dependencies from migration/env, in the listed order, starting from freshly seeded state. Use ids and values that exist in the seeds; when a case needs data, create it in an earlier case.
- Only HTTP entry points can be tested this way; skip the others.
- "expect.body" is what the legacy code returns, predicted from the code. "match": "exact" when the whole body is deterministic, "subset" to assert only stable fields, "status" when only the status matters. List volatile paths such as generated ids and timestamps in "ignore" (JSONPath like "$.id" or "$.items[].createdAt").
- "branch" names the decision row id the case exercises.

JSON shape (example from a different project):
${JSON.stringify(example, null, 2)}`
}

export function portPrompt(ctx: PromptContext) {
  const batch = ctx.batch!
  const target = targetOf(ctx.project)
  const output = artifacts.batch(batch.id, "port")
  const example = {
    batch: "scheduling",
    files: [
      { path: "v2/internal/domain/booking/notice.go", purpose: "24h notice rule" },
      { path: "v2/internal/httpapi/routes.go", purpose: "Route table" },
    ],
    routes: [{ entrypoint: "book-appointment", method: "POST", path: "/api/appointments", handler: "httpapi.BookAppointment" }],
    mapping: [{ rule: "book-appointment-r1", function: "booking.CheckNotice", file: "v2/internal/domain/booking/notice.go" }],
    notes: ["Timestamps are formatted with the legacy layout 2006-01-02T15:04:05Z"],
  }
  return `${preamble(ctx, output)}

Context: ${artifacts.batch(batch.id, "rules")} holds the rules to preserve and ${artifacts.batch(batch.id, "tests")} the exact HTTP behavior to reproduce: status codes, JSON field names and order-independent shapes, error messages, number and date formats. Where they disagree, the legacy code is the source of truth. ${artifacts.batch(batch.id, "legacy-run")} holds the real legacy responses when available — match those byte for byte where possible.

Task: port batch "${batch.title}" to ${target.label} in v2/:
${batchList(ctx)}

Architecture:
${target.architecture}
- If v2/ already contains earlier batches, extend it and keep existing routes working.

Environment: in migration/env/compose.yml add a service "v2" (build context ../../v2, publishes host port ${ctx.project.ports.v2} to 8080) plus a "v2-" copy of every "legacy-" dependency and mock service with identical images, configuration and seeds, and point v2 at those copies. Do not change the legacy services.

Verify once from v2/: \`${target.verify}\` and fix what fails.

JSON shape (example from a different project):
${JSON.stringify(example, null, 2)}`
}

export function reconcilePrompt(ctx: PromptContext) {
  const batch = ctx.batch!
  const parity = ctx.parity!
  const target = targetOf(ctx.project)
  const output = artifacts.batch(batch.id, "reconcile")
  const clip = (value: unknown) => {
    const s = typeof value === "string" ? value : JSON.stringify(value)
    return s && s.length > 1200 ? `${s.slice(0, 1200)}…` : s
  }
  const requests = new Map((ctx.tests?.cases ?? []).map((c) => [c.id, c.request]))
  const mismatches = parity.results
    .filter((r) => !r.comparison.match)
    .slice(0, 25)
    .map(
      (r) => `### ${r.caseId}
request: ${clip(requests.get(r.caseId))}
legacy: ${r.legacy.error ? `error ${r.legacy.error}` : `${r.legacy.status} ${clip(r.legacy.body)}`}
v2: ${r.v2.error ? `error ${r.v2.error}` : `${r.v2.status} ${clip(r.v2.body)}`}
differences: ${clip(r.comparison.diffs.slice(0, 12))}`,
    )
    .join("\n\n")
  const example = {
    batch: "scheduling",
    fixes: [
      { case: "book-too-late", cause: "v2 compared against local time, legacy uses UTC", change: "Use UTC in CheckNotice", files: ["v2/internal/domain/booking/notice.go"] },
    ],
    notes: [],
  }
  return `${preamble(ctx, output)}

Task: the side-by-side run of batch "${batch.title}" found ${parity.total - parity.matched} of ${parity.total} cases where v2 answers differently from legacy. Legacy is the source of truth. For each mismatch, read the legacy code path and the v2 code, find the cause and fix v2 so the response is identical. Do not change legacy, the tests or the legacy services.

${mismatches}

Verify once from v2/: \`${target.verify}\`.

JSON shape (example from a different project):
${JSON.stringify(example, null, 2)}`
}

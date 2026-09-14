import type { Batch, Discovery, EntryPoints, Localized } from "../shared/contracts"
import type { LegacyRun, ParityRun, ProjectRecord } from "../shared/types"
import { artifacts } from "./store"

export type PromptContext = {
  project: ProjectRecord
  composeCommand: string
  discovery?: Discovery
  entrypoints?: EntryPoints
  batch?: Batch
  parity?: ParityRun
  legacyRun?: LegacyRun
  tests?: { cases: Array<{ id: string; request: unknown; expect?: unknown }> }
}

const CAPTURE_HINT =
  "write {{<earlier case id>.$.<path in its response body>}} (for example {{login-admin.$.data.token}}) inside the path, a query or header value, or a body string — the runner substitutes the value that case returned"

const clipJson = (value: unknown, max = 1200) => {
  const s = typeof value === "string" ? value : (JSON.stringify(value) ?? "")
  return s.length > max ? `${s.slice(0, max)}…` : s
}

/** Example text in the three languages the app shows. */
const tr = (en: string, ptBR: string, es: string): Localized => ({ en, "pt-BR": ptBR, es })

/** Literal text (a status line, a product name) reads the same in every language. */
const same = (value: string) => tr(value, value, value)

export type TargetStack = {
  label: string
  /** Relative cloud bill for the same traffic: 1 lowest (small binaries, low memory, fast cold starts). */
  cost: 1 | 2 | 3
  recommended?: boolean
  image: string
  verify: string
  architecture: string
}

const PORTABLE = `- Business rules are pure functions with no HTTP or I/O awareness; each rule id from rules.json maps to one function, with the rule id in a one-line comment above it.
- One transport adapter maps domain errors to the legacy status codes and writes the legacy response shape; routes stay one-liners.
- Data access and external calls sit behind small interfaces.
- The service reads the same configuration as legacy from environment variables and listens on port 8080.`

export const TARGETS: Record<string, TargetStack> = {
  go: {
    label: "Go",
    cost: 1,
    recommended: true,
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
  rust: {
    label: "Rust (Axum)",
    cost: 1,
    image: "docker.io/library/rust:1-slim",
    verify: "cargo build && cargo test",
    architecture: `- v2/ is a Cargo binary crate using axum, tokio and serde; sqlx or deadpool clients only where a dependency needs one.
${PORTABLE}
- Rules live in v2/src/domain/<area>.rs, one error enum implements IntoResponse in v2/src/http/error.rs, routes in v2/src/http/routes.rs, stores and clients in v2/src/store/ and v2/src/clients/.
- Unit tests in #[cfg(test)] modules next to the domain functions.
- v2/Dockerfile: multi-stage (docker.io/library/rust:1-slim builder, docker.io/library/debian:bookworm-slim runtime), build context v2/.`,
  },
  csharp: {
    label: "C# (.NET minimal APIs)",
    cost: 2,
    image: "mcr.microsoft.com/dotnet/sdk:8.0",
    verify: "dotnet build && dotnet test",
    architecture: `- v2/ is an ASP.NET Core 8 minimal API solution: v2/src/Api (host and endpoints), v2/src/Domain (rules), v2/tests/Domain.Tests (xUnit).
${PORTABLE}
- Rules are static functions in v2/src/Domain/<Area>/, one exception-to-result mapping in v2/src/Api/Errors.cs, endpoints grouped per resource.
- v2/Dockerfile: multi-stage (mcr.microsoft.com/dotnet/sdk:8.0 builder publishing ReadyToRun, mcr.microsoft.com/dotnet/aspnet:8.0 runtime), build context v2/.`,
  },
  typescript: {
    label: "TypeScript (Bun + Hono)",
    cost: 2,
    image: "docker.io/oven/bun:1",
    verify: "bun install && bun test",
    architecture: `- v2/ is a Bun + Hono TypeScript service listening on port 8080.
- Business rules are pure functions in v2/src/domain/<area>/ with no HTTP or I/O awareness; each rule id from rules.json maps to a function (rule id in a one-line comment).
- One handler factory in v2/src/http/handler.ts maps domain errors to the legacy status codes and response shape; routes are one-liners in v2/src/http/routes.ts.
- Data access and external calls behind small interfaces in v2/src/store/ and v2/src/clients/.
- Unit tests with bun test next to the domain functions.
- v2/Dockerfile based on docker.io/oven/bun:1, build context v2/.`,
  },
  kotlin: {
    label: "Kotlin (Ktor)",
    cost: 2,
    image: "docker.io/library/gradle:8-jdk21",
    verify: "gradle build --no-daemon",
    architecture: `- v2/ is a Gradle (Kotlin DSL) Ktor 2 application with kotlinx.serialization.
${PORTABLE}
- Rules in v2/src/main/kotlin/domain/<area>/, one StatusPages configuration maps domain errors, routes per resource in v2/src/main/kotlin/http/.
- JUnit 5 unit tests for the domain functions.
- v2/Dockerfile: multi-stage (docker.io/library/gradle:8-jdk21 builder, docker.io/library/eclipse-temurin:21-jre runtime), build context v2/.`,
  },
  java: {
    label: "Java (Spring Boot)",
    cost: 3,
    image: "docker.io/library/maven:3-eclipse-temurin-21",
    verify: "mvn -q -B verify",
    architecture: `- v2/ is a Maven Spring Boot 3 application (Java 21, spring-boot-starter-web).
${PORTABLE}
- Rules are plain classes in v2/src/main/java/v2/domain/<area>/, one @RestControllerAdvice maps domain errors, thin controllers per resource.
- JUnit 5 unit tests for the domain classes.
- v2/Dockerfile: multi-stage (docker.io/library/maven:3-eclipse-temurin-21 builder, docker.io/library/eclipse-temurin:21-jre runtime), build context v2/.`,
  },
  python: {
    label: "Python (FastAPI)",
    cost: 3,
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
- People read the results in English, Brazilian Portuguese or Spanish. Every human-readable text value in the JSON (summaries, names, titles, labels, descriptions, rationales, flow steps, decision rows, purposes, notes, limitations, causes, changes) is an object with the same meaning in all three: {"en": "...", "pt-BR": "...", "es": "..."}. Literal values inside such text (status codes, error codes, field names) stay unchanged in every language. Everything else is a plain string in English: ids, JSON keys, file paths, code, commands, technology names, HTTP methods, paths, headers and request or response bodies.
- Commands that can block (container builds, "compose up", servers, installs) always get a timeout of at most 5 minutes; never start a foreground process that does not exit.
- Finish by writing the JSON document to "${output}" (relative to the workspace root; absolute path ${root}/${output}) with the write tool. Valid JSON only: no comments, no trailing commas. Then reply with one short sentence.`
}

const DISCOVERY_EXAMPLE = {
  summary: tr(
    "Flask REST API for clinic appointments backed by MySQL, with RabbitMQ for reminders and an SMS provider.",
    "API REST em Flask para agendamentos de clínica, com MySQL, RabbitMQ para lembretes e um provedor de SMS.",
    "API REST en Flask para citas de clínica con MySQL, RabbitMQ para recordatorios y un proveedor de SMS.",
  ),
  stack: { languages: ["python"], frameworks: ["flask", "sqlalchemy"], runtime: "python 3.11", packageManager: "pip" },
  run: {
    install: "pip install -r requirements.txt",
    start: "gunicorn app:app -b 0.0.0.0:5000",
    port: 5000,
    healthPath: "/healthz",
    env: [{ name: "DATABASE_URL", required: true, example: "mysql://clinic:clinic@legacy-mysql:3306/clinic" }],
  },
  nodes: [
    { id: "patients", label: tr("Patient apps", "Apps dos pacientes", "Apps de pacientes"), kind: "client", tech: "http", description: tr("Web and mobile clients", "Clientes web e mobile", "Clientes web y móviles"), paths: [] },
    { id: "api", label: tr("Appointments API", "API de agendamentos", "API de citas"), kind: "service", tech: "flask", description: tr("Routes, scheduling rules", "Rotas, regras de agenda", "Rutas, reglas de agenda"), paths: ["legacy/app"] },
    { id: "mysql", label: same("MySQL"), kind: "datastore", tech: "mysql", description: tr("Patients, doctors, appointments", "Pacientes, médicos, consultas", "Pacientes, médicos, citas"), paths: ["legacy/migrations"] },
    { id: "reminders", label: tr("Reminder worker", "Worker de lembretes", "Worker de recordatorios"), kind: "worker", tech: "celery", description: tr("Sends reminders", "Envia lembretes", "Envía recordatorios"), paths: ["legacy/worker.py"] },
    { id: "sms", label: tr("SMS gateway", "Gateway de SMS", "Pasarela de SMS"), kind: "external", tech: "twilio", description: tr("Outbound SMS", "SMS de saída", "SMS salientes"), paths: [] },
  ],
  edges: [
    { from: "patients", to: "api", label: same("REST/JSON"), kind: "sync" },
    { from: "api", to: "mysql", label: same("SQL"), kind: "data" },
    { from: "api", to: "reminders", label: tr("enqueue", "enfileira", "encola"), kind: "async" },
    { from: "reminders", to: "sms", label: same("HTTPS"), kind: "sync" },
  ],
  dependencies: [
    { id: "mysql", name: "MySQL", kind: "database", tech: "mysql", version: "8", usedBy: ["api"], env: ["DATABASE_URL"], strategy: "container", image: "docker.io/library/mysql:8", notes: tr("Schema from legacy/migrations", "Schema em legacy/migrations", "Esquema en legacy/migrations") },
    { id: "rabbitmq", name: "RabbitMQ", kind: "queue", tech: "rabbitmq", version: "3", usedBy: ["api", "reminders"], env: ["BROKER_URL"], strategy: "container", image: "docker.io/library/rabbitmq:3-alpine", notes: same("") },
    { id: "sms", name: "SMS gateway", kind: "external-api", tech: "twilio", version: "", usedBy: ["reminders"], env: ["SMS_API_URL"], strategy: "mock", image: "", notes: same("POST /messages") },
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
    { id: "list-slots", kind: "http", method: "GET", path: "/api/doctors/{id}/slots", name: tr("List free slots", "Listar horários livres", "Listar horarios libres"), file: "legacy/app/routes/doctors.py", line: 42, handler: "list_slots", summary: tr("Free 30-minute slots for a doctor on a date", "Horários livres de 30 minutos de um médico em uma data", "Horarios libres de 30 minutos de un médico en una fecha"), dependencies: ["mysql"], complexity: "medium" },
    { id: "book-appointment", kind: "http", method: "POST", path: "/api/appointments", name: tr("Book appointment", "Agendar consulta", "Reservar cita"), file: "legacy/app/routes/appointments.py", line: 18, handler: "book", summary: tr("Books a slot, enqueues a reminder", "Reserva um horário e enfileira um lembrete", "Reserva un horario y encola un recordatorio"), dependencies: ["mysql", "rabbitmq"], complexity: "high" },
    { id: "send-reminders", kind: "job", method: "", path: "", name: tr("Send reminders", "Enviar lembretes", "Enviar recordatorios"), file: "legacy/worker.py", line: 10, handler: "send_reminders", summary: tr("Cron every 10 minutes", "Cron a cada 10 minutos", "Cron cada 10 minutos"), dependencies: ["mysql", "sms"], complexity: "medium" },
  ],
  batches: [
    { id: "scheduling", title: tr("Scheduling", "Agenda", "Agenda"), rationale: tr("Slots and bookings share availability rules and tables", "Horários e reservas compartilham regras de disponibilidade e tabelas", "Horarios y reservas comparten reglas de disponibilidad y tablas"), icon: "calendar", entrypoints: ["list-slots", "book-appointment"] },
    { id: "reminders", title: tr("Reminders", "Lembretes", "Recordatorios"), rationale: tr("Background notification flow", "Fluxo de notificação em segundo plano", "Flujo de notificaciones en segundo plano"), icon: "bell", entrypoints: ["send-reminders"] },
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
      { name: "legacy", role: "legacy", image: "", notes: tr("Built from migration/env/legacy.Dockerfile", "Construído a partir de migration/env/legacy.Dockerfile", "Construido desde migration/env/legacy.Dockerfile") },
      { name: "legacy-mysql", role: "dependency", image: "docker.io/library/mysql:8", notes: tr("Seeded from legacy/migrations", "Populado a partir de legacy/migrations", "Poblado desde legacy/migrations") },
      { name: "legacy-mock-sms", role: "mock", image: "", notes: tr("Canned responses for POST /messages", "Respostas prontas para POST /messages", "Respuestas fijas para POST /messages") },
    ],
    mocks: [{ dependency: "sms", approach: tr("Tiny HTTP server returning a queued message id", "Servidor HTTP mínimo que devolve o id de uma mensagem enfileirada", "Servidor HTTP mínimo que devuelve el id de un mensaje encolado"), files: ["migration/env/mocks/sms/server.js"] }],
    limitations: [
      tr(
        "Reminder worker is not started; queue side effects are not observable over HTTP",
        "O worker de lembretes não é iniciado; os efeitos na fila não são observáveis via HTTP",
        "El worker de recordatorios no se inicia; los efectos en la cola no son observables por HTTP",
      ),
    ],
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
   - relative paths in compose.yml (build contexts, bind mounts) resolve from migration/env/, so the workspace root is "../.." (e.g. ../../legacy/db/schema.sql). Bake seed files into images with a small Dockerfile and COPY instead of bind mounts: rootless podman and SELinux hosts deny bind-mounted files (if you must bind mount, append :Z).
   - never use depends_on "condition: service_healthy" on a service that could exit — it blocks "up" forever; add a healthcheck and use "condition: service_started" plus retries in the app, or a short wait loop.
3. A .dockerignore at the workspace root excluding **/node_modules, **/.git and v2/bin.

Then start it once, building images as a separate step because some compose implementations hang on "up --build": \`cd ${project.workspace} && ${ctx.composeCommand} -f migration/env/compose.yml -p ${name} build && ${ctx.composeCommand} -f migration/env/compose.yml -p ${name} up -d legacy\` and check that http://127.0.0.1:${project.ports.legacy}${run?.healthPath || "/"} answers. If it does not, read the container logs, fix the files and try again, within reason. Leave the containers running. Record anything that could not be made to work in "limitations".

JSON shape (example from a different project):
${JSON.stringify(example, null, 2)}`
}

function batchList(ctx: PromptContext) {
  const ids = new Set(ctx.batch?.entrypoints ?? [])
  return (ctx.entrypoints?.entrypoints ?? [])
    .filter((e) => ids.has(e.id))
    .map((e) => `- ${e.id}: ${[e.method, e.path].filter(Boolean).join(" ") || e.name.en} — ${e.file}${e.line ? `:${e.line}` : ""} — ${e.summary.en}`)
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
          { file: "legacy/app/routes/appointments.py", line: 18, description: tr("Parse JSON body and authenticate patient", "Lê o corpo JSON e autentica o paciente", "Lee el cuerpo JSON y autentica al paciente") },
          { file: "legacy/app/services/booking.py", line: 55, description: tr("Check the slot is free inside a transaction", "Verifica em transação se o horário está livre", "Comprueba en una transacción que el horario esté libre") },
        ],
        rules: [
          {
            id: "book-appointment-r1",
            title: tr("Bookings need 24h notice", "Agendamentos exigem 24h de antecedência", "Las reservas requieren 24 h de antelación"),
            kind: "validation",
            description: tr(
              "A slot can only be booked if it starts at least 24 hours from now.",
              "Um horário só pode ser reservado se começar em pelo menos 24 horas.",
              "Un horario solo puede reservarse si empieza dentro de al menos 24 horas.",
            ),
            file: "legacy/app/services/booking.py",
            lineStart: 61,
            lineEnd: 66,
            decisions: [
              { id: "book-appointment-r1.1", when: tr("slot starts in less than 24h", "horário começa em menos de 24h", "el horario empieza en menos de 24 h"), then: same('422 {"error":"too_late"}') },
              { id: "book-appointment-r1.2", when: tr("slot starts in 24h or more", "horário começa em 24h ou mais", "el horario empieza en 24 h o más"), then: tr("continue to availability check", "segue para a verificação de disponibilidade", "continúa con la comprobación de disponibilidad") },
            ],
          },
        ],
      },
    ],
  }
  return `${preamble(ctx, output)}

Context: ${artifacts.discovery} and ${artifacts.entrypoints}.

Task: batch "${batch.title.en}". Trace each entry point end to end and extract the business rules it encodes:
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
        title: tr("Rejects a booking with less than 24h notice", "Recusa agendamento com menos de 24h de antecedência", "Rechaza una reserva con menos de 24 h de antelación"),
        branch: "book-appointment-r1.1",
        request: { method: "POST", path: "/api/appointments", headers: { Authorization: "Bearer patient-1" }, query: {}, body: { slotId: 7 } },
        expect: { status: 422, body: { error: "too_late" }, match: "exact" },
        ignore: [],
      },
      {
        id: "book-ok",
        entrypoint: "book-appointment",
        rules: ["book-appointment-r1", "book-appointment-r2"],
        title: tr("Books a free slot", "Reserva um horário livre", "Reserva un horario libre"),
        branch: "book-appointment-r1.2",
        request: { method: "POST", path: "/api/appointments", headers: { Authorization: "Bearer patient-1" }, query: {}, body: { slotId: 12 } },
        expect: { status: 201, body: { status: "booked", slotId: 12 }, match: "subset" },
        ignore: ["$.id", "$.createdAt"],
      },
    ],
  }
  return `${preamble(ctx, output)}

Context: ${artifacts.batch(batch.id, "rules")} (the rules you extracted) and migration/env (how legacy runs, including its seed data).

Task: write characterization tests for batch "${batch.title.en}" at the entry-point boundary — real HTTP requests in, expected responses out. Not unit tests.
- As many cases as the code has branches: every decision row in rules.json is exercised by at least one case — happy paths, each validation failure, not found, authorization failures, boundary values.
- Requests run against the legacy app started with the seeded dependencies from migration/env, in the listed order, starting from freshly seeded state. Use ids and values that exist in the seeds; when a case needs data, create it in an earlier case.
- Only HTTP entry points can be tested this way; skip the others.
- "expect.body" is what the legacy code returns, predicted from the code. "match": "exact" when the whole body is deterministic, "subset" to assert only stable fields, "status" when only the status matters. List volatile paths such as generated ids and timestamps in "ignore" (JSONPath like "$.id" or "$.items[].createdAt").
- "branch" names the decision row id the case exercises.
- When a request needs a value only known at runtime (a token from a login, an id created by an earlier case), ${CAPTURE_HINT}. Never hard-code such values.

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
      { path: "v2/internal/domain/booking/notice.go", purpose: tr("24h notice rule", "Regra de 24h de antecedência", "Regla de 24 h de antelación") },
      { path: "v2/internal/httpapi/routes.go", purpose: tr("Route table", "Tabela de rotas", "Tabla de rutas") },
    ],
    routes: [{ entrypoint: "book-appointment", method: "POST", path: "/api/appointments", handler: "httpapi.BookAppointment" }],
    mapping: [{ rule: "book-appointment-r1", function: "booking.CheckNotice", file: "v2/internal/domain/booking/notice.go" }],
    notes: [
      tr(
        "Timestamps are formatted with the legacy layout 2006-01-02T15:04:05Z",
        "Datas usam o formato do legado 2006-01-02T15:04:05Z",
        "Las fechas usan el formato del legado 2006-01-02T15:04:05Z",
      ),
    ],
  }
  return `${preamble(ctx, output)}

Context: ${artifacts.batch(batch.id, "rules")} holds the rules to preserve and ${artifacts.batch(batch.id, "tests")} the exact HTTP behavior to reproduce: status codes, JSON field names and order-independent shapes, error messages, number and date formats. Where they disagree, the legacy code is the source of truth. ${artifacts.batch(batch.id, "legacy-run")} holds the real legacy responses when available — match those byte for byte where possible.

Task: port batch "${batch.title.en}" to ${target.label} in v2/:
${batchList(ctx)}

Architecture:
${target.architecture}
- If v2/ already contains earlier batches, extend it and keep existing routes working.

Environment: in migration/env/compose.yml add a service "v2" (build context ../../v2, publishes host port ${ctx.project.ports.v2} to 8080) plus a "v2-" copy of every "legacy-" dependency and mock service with identical images, configuration and seeds, and point v2 at those copies. Do not change the legacy services. Do not build or start the containers yourself — the pipeline does that right after you finish.

Verify once from v2/: \`${target.verify}\` and fix what fails.

JSON shape (example from a different project):
${JSON.stringify(example, null, 2)}`
}

export function reconcilePrompt(ctx: PromptContext) {
  const batch = ctx.batch!
  const parity = ctx.parity!
  const target = targetOf(ctx.project)
  const output = artifacts.batch(batch.id, "reconcile")
  const requests = new Map((ctx.tests?.cases ?? []).map((c) => [c.id, c.request]))
  const mismatches = parity.results
    .filter((r) => !r.comparison.match)
    .slice(0, 25)
    .map(
      (r) => `### ${r.caseId}
request: ${clipJson(requests.get(r.caseId))}
legacy: ${r.legacy.error ? `error ${r.legacy.error}` : `${r.legacy.status} ${clipJson(r.legacy.body)}`}
v2: ${r.v2.error ? `error ${r.v2.error}` : `${r.v2.status} ${clipJson(r.v2.body)}`}
differences: ${clipJson(r.comparison.diffs.slice(0, 12))}`,
    )
    .join("\n\n")
  const example = {
    batch: "scheduling",
    fixes: [
      {
        case: "book-too-late",
        cause: tr("v2 compared against local time, legacy uses UTC", "O v2 comparava com a hora local; o legado usa UTC", "v2 comparaba con la hora local; el legado usa UTC"),
        change: tr("Use UTC in CheckNotice", "Usar UTC em CheckNotice", "Usar UTC en CheckNotice"),
        files: ["v2/internal/domain/booking/notice.go"],
      },
    ],
    notes: [],
  }
  return `${preamble(ctx, output)}

Task: the side-by-side run of batch "${batch.title.en}" found ${parity.total - parity.matched} of ${parity.total} cases where v2 answers differently from legacy. Legacy is the source of truth. For each mismatch, read the legacy code path and the v2 code, find the cause and fix v2 so the response is identical. Do not change legacy, the tests or the legacy services.

${mismatches}

Verify once from v2/: \`${target.verify}\`.

JSON shape (example from a different project):
${JSON.stringify(example, null, 2)}`
}

export function verifyPrompt(ctx: PromptContext) {
  const batch = ctx.batch!
  const run = ctx.legacyRun!
  const output = artifacts.batch(batch.id, "verify")
  const testsFile = artifacts.batch(batch.id, "tests")
  const cases = new Map((ctx.tests?.cases ?? []).map((c) => [c.id, c]))
  const mismatched = run.results.filter((r) => !r.expectation.match)
  const listing = mismatched
    .slice(0, 30)
    .map(
      (r) => `### ${r.caseId}
request: ${clipJson(cases.get(r.caseId)?.request)}
predicted: ${clipJson(cases.get(r.caseId)?.expect)}
legacy: ${r.response.error ? `error ${r.response.error}` : `${r.response.status} ${clipJson(r.response.body)}`}
differences: ${clipJson(r.expectation.diffs.slice(0, 12))}`,
    )
    .join("\n\n")
  const example = {
    batch: "scheduling",
    fixes: [
      {
        case: "book-ok",
        cause: tr("The token of the login case was written literally", "O token do caso de login foi escrito literalmente", "El token del caso de login se escribió literalmente"),
        action: "request",
        change: tr("Authorization uses {{login-patient.$.token}}", "Authorization usa {{login-patient.$.token}}", "Authorization usa {{login-patient.$.token}}"),
      },
      {
        case: "book-too-late",
        cause: tr("Legacy checks notice before the slot exists", "O legado verifica a antecedência antes de o horário existir", "El legado comprueba la antelación antes de que exista el horario"),
        action: "expectation",
        change: tr("Expects 404 slot_not_found", "Espera 404 slot_not_found", "Espera 404 slot_not_found"),
      },
    ],
    notes: [],
  }
  return `${preamble(ctx, output)}

Task: ${testsFile} was replayed against the real legacy app, freshly seeded, and ${mismatched.length} of ${run.results.length} cases answered differently from the prediction. Legacy is the source of truth; the goal is a suite that describes what legacy really does while still exercising each rule. For each mismatch read the request, the legacy code path and the seeds in migration/env, find out why, then adapt ${testsFile} in place:
- A broken request (wrong id, missing header or field, a value that must come from an earlier response) → fix the request. To reuse a value, ${CAPTURE_HINT}.
- Missing setup or a wrong order → add or move a setup case before it.
- A wrong prediction → set "expect" to what legacy really answers and list volatile fields in "ignore".
- Only when a case cannot be made deterministic against legacy, remove it — the very last option.
Keep cases that already match unchanged and keep ids stable. Do not change legacy code, its services or seeds, and do not start containers — the pipeline replays the suite against legacy right after you finish.

${listing}

Record every change below; "action" is one of request, setup, expectation, removed.

JSON shape (example from a different project):
${JSON.stringify(example, null, 2)}`
}

# Migrate

**Watch AI migrate a legacy system — and prove it behaves exactly the same.**

[![CI](https://github.com/JarbesGoldoni/migrate/actions/workflows/ci.yml/badge.svg)](https://github.com/JarbesGoldoni/migrate/actions/workflows/ci.yml)

Hand-written code is the new on-premises. Cloud moved servers below the line; AI agents are doing the same to code, and prompts and specs are the new Terraform. The work that matters moves up: understanding the business rules, and proving the system still does what it must.

Migrate is that method, running on its own. Point it at an application and it maps the architecture, finds every entry point, extracts the business rules, writes characterization tests and runs them against the real legacy app, ports the code to Go, and puts both systems side by side until every response matches — with nobody driving.

---

## The method

| # | Step | What you see |
|---|------|--------------|
| 1 | **Map the architecture** | An interactive graph of components and how they connect, the dependencies the app needs and how it runs |
| 2 | **Find every entry point** | Routes, jobs and consumers with file and line, grouped into coherent batches you dispatch one at a time |
| 3 | **Containerize legacy** | Legacy running in containers with throwaway databases and mocks for third-party APIs |
| 4 | **Extract the business rules** | Each entry point traced end to end: the call chain, and every rule as a decision table next to its source |
| 5 | **Characterize** | Executable curls — real requests in, expected responses out — one per branch, replayed against legacy first. **Fix / validate** sends the cases legacy disagreed with back to the agent once, which adapts them (removing one only as a last resort) and replays legacy |
| 6 | **Port** | The batch rewritten in Go: rules as pure functions, one handler factory for HTTP, unit tests, a Dockerfile |
| 7 | **Prove parity** | Both systems reset to the same seeded state, every request sent to each, responses diffed field by field |
| 8 | **Reconcile** | One click sends the divergences back to the agent, which fixes v2 against the legacy code and parity re-runs |
| 9 | **Roll out** | An illustration of the 1% → 100% phased rollout that takes a proven batch to production |

Every step runs **once, straight through** — no review loops, no automatic retries. If a step fails you press *Run again*.

## Show it to someone

- **Three languages.** The whole app speaks English, Brazilian Portuguese and Spanish — switch any time from the header. A migration started in a language also gets its rules, test titles and notes written in it.
- **Replay.** When a migration is done, press **Replay** and it plays back from the first step: the graph appearing, the agent's activity, tests hitting legacy, parity filling up — hours compressed into minutes, with play, pause, seek and 1×/2×/4×.
- **Your migrations.** Every migration you run is kept on your machine under *Your migrations* (`#/migrations`), with its progress and numbers, ready to open or replay.

## Quick start

```sh
npx simplify-migrate auth login   # connect an AI provider once
npx simplify-migrate              # starts the app and opens your browser
```

`bunx simplify-migrate` works too. Pick a folder, or click **Try it on a sample legacy app** to migrate the bundled Express + PostgreSQL + Redis shop.

### Requirements

| | |
|---|---|
| Node.js 20+ or Bun | runs the app |
| Git | every migration happens on its own branch |
| Docker or Podman, with compose | runs legacy and v2 side by side |
| An AI provider | OpenAI, GitHub Copilot, Z.AI, Google, Anthropic and many more — `simplify-migrate auth login` |
| Go 1.23+ *(optional)* | local build and test of v2; otherwise it builds inside a container |

The readiness panel checks all of this before a migration starts.

### WSL

Migrate runs entirely inside WSL. It opens your Windows browser automatically (through `wslview`, falling back to `cmd.exe`), and WSL forwards `localhost`, so `http://127.0.0.1:4800` works from Windows as-is. Use Docker Desktop with WSL integration, or Podman installed inside the distro.

### Options

```
simplify-migrate [--port 4800] [--host 127.0.0.1] [--no-open]
```

| Environment variable | Purpose |
|---|---|
| `MIGRATE_HOME` | Where migrations, workspaces and samples live (default `~/.migrate`) |
| `MIGRATE_ENGINE_BIN` | Use a specific AI engine binary |

## What a migration produces

Your folder is never modified. Each migration gets a git worktree under `~/.migrate/workspaces/` on a new branch (`migrate/v2`), and every step commits its output:

```
legacy/      the application as it was, moved aside with history intact
v2/          the new Go service, built batch by batch
migration/
  discovery.json            architecture, dependencies, how legacy runs
  entrypoints.json          every entry point and the batches
  environment.json          containers, mocks, known limitations
  env/compose.yml           legacy and v2, each with isolated dependencies
  batches/<batch>/
    rules.json              call chains and decision tables
    tests.json              characterization cases
    curl/*.sh               the same cases as runnable curl scripts
    legacy-run.json         what legacy actually answered
    verify.json             how tests legacy disagreed with were adapted
    port.json               routes, files, rule → function mapping
    build.json              build, test and container results
    parity.json             legacy vs v2, request by request
    reconcile.json          what was fixed and why
```

That `migration/` folder is the executable specification of the system's behavior — it stays useful whatever stack comes next.

## How it works

- **Contracts, not conversations.** Each step asks the agent for one JSON document with a fixed shape. Parsing is tolerant: a missing or malformed field falls back to a default instead of failing the step. The documents are also the hand-off between steps, so later steps don't re-explore the code.
- **Deterministic work stays in code.** Curl scripts, container builds, the legacy replay, parity runs and diffs are done by the app, not the model — they cost no tokens and give the same answer every time.
- **Legacy is the source of truth.** Tests are replayed against legacy before any v2 code exists. Where legacy disagrees with what the code seemed to say, legacy wins, and v2 is compared against legacy's real responses.
- **Cases can chain.** A request can reuse what an earlier case returned — `Authorization: Bearer {{login-admin.$.data.token}}`, `/users/{{create-user.$.data.id}}` — and each system resolves it from its own responses.
- **Isolated, identical state.** Legacy and v2 each get their own copy of every dependency, seeded the same way and reset before each run, so both sides see the same world.

## Development

```sh
bun install
bun run dev          # API on :4800 and the UI with hot reload on :5180
bun test --coverage  # fails if any file drops below 80% line or function coverage
bun run typecheck
bun run build        # dist/web (UI) and dist/cli.js (Node-compatible bundle)
bun scripts/e2e.ts   # drive the real engine through a full migration of the sample app, no UI
```

`E2E_PROJECT=<id> bun scripts/e2e.ts` resumes an existing migration, skipping steps that already produced output.

```
src/
  cli.ts                 entry point: server, browser, auth passthrough
  shared/                contracts (tolerant zod schemas) and API types
  server/
    app.ts               HTTP API, server-sent events, static UI
    pipeline.ts          runs phases, owns state, runtime and parity
    phases.ts            one makePhase() definition per step
    prompts.ts           the prompt for each step and target stack
    engine/              the AI engine bridge and activity mapping
    env/compose.ts       docker/podman compose detection and control
    testing/             HTTP runner, response diff, curl generation
    workspace.ts         worktree creation and commits
web/src/                 React UI: screens, phase views, components
sample/legacy-shop/      the bundled legacy application
test/                    bun tests, including a fake engine server
```

CI runs the typecheck, the tests with the coverage gate, the build and a package dry run on every push.

## Releasing

1. Bump `version` in `package.json` and commit.
2. `git tag v0.2.0 && git push origin v0.2.0`
3. The release workflow tests, builds and publishes to npm. It needs an `NPM_TOKEN` repository secret.

## Limitations

- Characterization tests cover HTTP entry points. Jobs, queue consumers and CLIs are mapped and have their rules extracted, but are not replayed.
- Containerizing arbitrary legacy stacks does not always succeed; whatever could not be made to run is listed under *Known limitations* in the legacy runtime view.
- Reconcile runs when you ask for it. Parity re-runs automatically afterwards, at no model cost.
- The rollout screen is an illustration of how a proven batch reaches production, not a deployment tool.

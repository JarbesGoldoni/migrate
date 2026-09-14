# Migrate

**Watch AI migrate a legacy app to a modern stack — and prove it still behaves the same.**

[![CI](https://github.com/JarbesGoldoni/migrate/actions/workflows/ci.yml/badge.svg)](https://github.com/JarbesGoldoni/migrate/actions/workflows/ci.yml)

Point it at an application. It maps the architecture, finds every entry point, extracts the business rules, writes tests against the real legacy app, ports the code and runs both side by side until every response matches.

## How it works

1. **Map** the architecture and dependencies
2. **Find** every entry point and group them into batches
3. **Run legacy** in containers, with mocks for third-party APIs
4. **Extract** the business rules of a batch
5. **Characterize** it with real HTTP tests, run against legacy first
6. **Port** it to the new stack
7. **Prove parity**: both sides get the same requests; differences are reconciled

Every step runs once, straight through. The work happens on its own branch in a separate folder — your code is never touched.

## Run it

```sh
bun install
bun run build          # web app and CLI
bun run build:app      # optional: the app window (needs Rust; on Linux also WebKitGTK)

node dist/cli.js auth login   # connect an AI provider once
node dist/cli.js              # opens the app (add --browser to use your browser)
```

You need Git and Docker or Podman. Everything runs on your machine, including WSL.

## In the app

- **English, Português and Español** — including everything the agent writes
- **Replay** a finished migration to show someone how it went
- **Your migrations** — open, replay or delete them
- **Open in your IDE** or file manager, and **bring the branch** into your own repository

## Target stacks

| Stack | Cloud cost |
|---|---|
| **Go** — recommended | lowest |
| Rust | lowest |
| C# (.NET) | moderate |
| TypeScript (Bun + Hono) | moderate |
| Kotlin (Ktor) | moderate |
| Java (Spring Boot) | higher |
| Python (FastAPI) | higher |

Go is the default: small static binaries, low memory and fast startup mean fewer, smaller instances for the same traffic.

## Development

```sh
bun run dev            # API on :4800, UI with hot reload on :5180
bun test --coverage    # fails below 80% line or function coverage per file
bun run typecheck
```

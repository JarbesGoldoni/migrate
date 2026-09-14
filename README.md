# Migrate

**Watch AI migrate a legacy app to a modern stack — and prove it still behaves the same.**

Point it at an application. It maps the architecture, suggests where to migrate, finds every entry point, extracts the business rules, writes tests against the real legacy app, ports the code and runs both side by side until every response matches.

## How it works

1. **Map** the architecture and dependencies
2. **Choose the target**: the agent suggests three directions for this app, and you pick the language and stack
3. **Find** every entry point and group them into batches
4. **Run legacy** in containers, with mocks for third-party APIs
5. **Extract** the business rules of a batch
6. **Characterize** it with real HTTP tests, run against legacy first
7. **Port** it to the new stack
8. **Prove parity**: both sides get the same requests; differences are reconciled

Every step runs once, straight through. The work happens on its own branch in a separate folder — your code is never touched.

## Run it

```sh
npx simplify-migrate
```

Or install it once with `npm install -g simplify-migrate` and run `simplify-migrate`. Node 20 or newer.

The command checks that [opencode](https://opencode.ai) is installed (and offers to install it), shows the AI providers opencode is signed in to and lets you keep them or sign in to another one, then prints a link to the app on `localhost`. Press `o` to open it in your browser, `q` to quit. Add `--open` to open the browser straight away, or `--yes` to skip the questions.

You need Git and Docker or Podman. Everything runs on your machine, including WSL.

## Where it can migrate to

After the architecture map, the agent suggests three options — usually **Go** for the lowest cloud bill, **Elixir or Erlang** to scale a backend on little hardware, and an **upgrade** of the language you already run (Java 17 → 21, for example) — each with two stacks. You can also pick any language and stack yourself:

| Cloud cost | Languages |
|---|---|
| lowest | Go, Elixir, Erlang, Rust |
| moderate | C#, TypeScript, Kotlin, Scala |
| higher | Java, Python, PHP, Ruby |

## In the app

- **English, Português and Español** — including everything the agent writes
- **Model and effort**: pick any model opencode offers, and its reasoning effort
- **Code**: browse legacy and v2 like an editor, with files lighting up as the agent writes them
- **Plain explanations** of every fix, with the technical detail one click away
- **Replay** a finished migration, **open it in your IDE**, **bring the branch** into your repository, or delete it

## Development

```sh
bun install
bun run build          # dist/cli.js plus the web app in dist/web
bun run dev            # API on :4800, UI with hot reload on :5180
bun test --coverage    # fails below 80% line or function coverage per file
bun run typecheck
```

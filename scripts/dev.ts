export {}

const port = process.env.MIGRATE_API_PORT ?? "4800"
const env = { ...process.env, MIGRATE_API_PORT: port }

const api = Bun.spawn(["bun", "--watch", "src/cli.ts", "--port", port, "--no-open", "--api-only"], {
  stdio: ["inherit", "inherit", "inherit"],
  env,
})
const web = Bun.spawn(["bunx", "vite"], { stdio: ["inherit", "inherit", "inherit"], env })

const stop = () => {
  api.kill()
  web.kill()
  process.exit(0)
}
process.on("SIGINT", stop)
process.on("SIGTERM", stop)
await Promise.race([api.exited, web.exited])
stop()

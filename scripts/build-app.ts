// Builds the native app window (src-tauri) and places it where the CLI looks for it.
import { chmod, copyFile, mkdir } from "node:fs/promises"
import { join } from "node:path"
import { appWindowName } from "../src/server/window"

const build = Bun.spawnSync(["cargo", "build", "--release", "--manifest-path", "src-tauri/Cargo.toml"], {
  stdio: ["inherit", "inherit", "inherit"],
})
if (build.exitCode !== 0) process.exit(build.exitCode ?? 1)

const name = appWindowName()
const target = join("dist", "app", `${process.platform}-${process.arch}`)
await mkdir(target, { recursive: true })
await copyFile(join("src-tauri", "target", "release", name), join(target, name))
await chmod(join(target, name), 0o755)
console.log(`App window ready at ${join(target, name)}`)

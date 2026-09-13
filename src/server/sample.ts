import { existsSync } from "node:fs"
import { cp, mkdir } from "node:fs/promises"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { samplesDir } from "./paths"
import { type Exec, output } from "./util/exec"

export function sampleSource() {
  const candidates = ["../sample/legacy-shop", "../../sample/legacy-shop"].map((rel) =>
    fileURLToPath(new URL(rel, import.meta.url)),
  )
  return candidates.find((c) => existsSync(join(c, "package.json")))
}

/** Copy the bundled legacy shop into a fresh git repository the user can migrate. */
export async function createSample(exec: Exec, baseDir = samplesDir()) {
  const source = sampleSource()
  if (!source) throw new Error("The sample application is not bundled with this build")
  const dest = join(baseDir, `legacy-shop-${Date.now().toString(36)}`)
  await mkdir(baseDir, { recursive: true })
  await cp(source, dest, { recursive: true })
  const identity = ["-c", "user.name=Legacy Shop", "-c", "user.email=legacy-shop@localhost"]
  for (const args of [["init", "-q"], ["add", "-A"], [...identity, "commit", "-q", "--no-verify", "-m", "Legacy shop v1.4"]]) {
    const result = await exec("git", args, { cwd: dest })
    if (result.code !== 0) throw new Error(`git ${args.join(" ")} failed: ${output(result)}`)
  }
  return dest
}

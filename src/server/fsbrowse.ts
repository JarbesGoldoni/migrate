import { readdir, stat } from "node:fs/promises"
import { homedir } from "node:os"
import { basename, dirname, join, resolve } from "node:path"
import type { FsListing } from "../shared/types"

const MARKER_FILES: Record<string, string> = {
  ".git": "git",
  "package.json": "node",
  "bun.lock": "bun",
  "deno.json": "deno",
  "go.mod": "go",
  "pom.xml": "java",
  "build.gradle": "java",
  "build.gradle.kts": "kotlin",
  "requirements.txt": "python",
  "pyproject.toml": "python",
  Pipfile: "python",
  Gemfile: "ruby",
  "composer.json": "php",
  "Cargo.toml": "rust",
  "mix.exs": "elixir",
  Dockerfile: "docker",
  "docker-compose.yml": "docker",
  "compose.yml": "docker",
}

const HIDDEN = new Set(["node_modules", "__pycache__", "vendor", "target", "dist", "build"])

export async function detectMarkers(dir: string) {
  const names = await readdir(dir).catch(() => [] as string[])
  const markers = new Set<string>()
  for (const name of names) {
    const marker = MARKER_FILES[name]
    if (marker) markers.add(marker)
    if (name.endsWith(".csproj") || name.endsWith(".sln")) markers.add("dotnet")
  }
  return [...markers]
}

export async function listDirectory(input?: string, limit = 400): Promise<FsListing> {
  const home = homedir()
  const path = resolve(input?.trim() ? input.replace(/^~(?=$|\/)/, home) : home)
  const info = await stat(path).catch(() => undefined)
  if (!info?.isDirectory()) throw new Error(`Not a directory: ${path}`)
  const dirents = await readdir(path, { withFileTypes: true })
  const folders = dirents
    .filter((d) => d.isDirectory() && !d.name.startsWith(".") && !HIDDEN.has(d.name))
    .map((d) => d.name)
    .sort((a, b) => a.localeCompare(b))
    .slice(0, limit)
  const entries = await Promise.all(
    folders.map(async (name) => {
      const child = join(path, name)
      return { name, path: child, markers: await detectMarkers(child) }
    }),
  )
  const parent = dirname(path)
  return {
    path,
    parent: parent === path ? undefined : parent,
    home,
    entries,
    markers: await detectMarkers(path),
  }
}

export function projectName(path: string) {
  return basename(resolve(path)) || "project"
}

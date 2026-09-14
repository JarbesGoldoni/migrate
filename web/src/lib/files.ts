// Pure helpers for the code explorer: what language a file is, and how a flat file list nests into folders.

export type FileLanguage = { id?: string; label: string; tech?: string }

const BY_EXTENSION: Record<string, FileLanguage> = {
  go: { id: "go", label: "Go", tech: "go" },
  rs: { id: "rust", label: "Rust", tech: "rust" },
  ex: { id: "elixir", label: "Elixir", tech: "elixir" },
  exs: { id: "elixir", label: "Elixir", tech: "elixir" },
  heex: { id: "elixir", label: "Elixir", tech: "elixir" },
  erl: { id: "erlang", label: "Erlang", tech: "erlang" },
  hrl: { id: "erlang", label: "Erlang", tech: "erlang" },
  cs: { id: "csharp", label: "C#", tech: "dotnet" },
  csproj: { id: "xml", label: "MSBuild", tech: "dotnet" },
  sln: { label: "Solution", tech: "dotnet" },
  ts: { id: "typescript", label: "TypeScript", tech: "typescript" },
  mts: { id: "typescript", label: "TypeScript", tech: "typescript" },
  tsx: { id: "tsx", label: "TSX", tech: "typescript" },
  js: { id: "javascript", label: "JavaScript", tech: "javascript" },
  mjs: { id: "javascript", label: "JavaScript", tech: "javascript" },
  cjs: { id: "javascript", label: "JavaScript", tech: "javascript" },
  jsx: { id: "jsx", label: "JSX", tech: "react" },
  kt: { id: "kotlin", label: "Kotlin", tech: "kotlin" },
  kts: { id: "kotlin", label: "Kotlin", tech: "kotlin" },
  java: { id: "java", label: "Java", tech: "java" },
  scala: { id: "scala", label: "Scala", tech: "scala" },
  sbt: { id: "scala", label: "sbt", tech: "scala" },
  py: { id: "python", label: "Python", tech: "python" },
  php: { id: "php", label: "PHP", tech: "php" },
  rb: { id: "ruby", label: "Ruby", tech: "ruby" },
  json: { id: "json", label: "JSON" },
  jsonc: { id: "jsonc", label: "JSON" },
  yml: { id: "yaml", label: "YAML" },
  yaml: { id: "yaml", label: "YAML" },
  toml: { id: "toml", label: "TOML" },
  xml: { id: "xml", label: "XML" },
  sql: { id: "sql", label: "SQL" },
  sh: { id: "shellscript", label: "Shell" },
  bash: { id: "shellscript", label: "Shell" },
  md: { id: "markdown", label: "Markdown" },
  html: { id: "html", label: "HTML" },
  css: { id: "css", label: "CSS" },
  gradle: { id: "groovy", label: "Gradle", tech: "gradle" },
  proto: { id: "proto", label: "Protocol Buffers" },
  graphql: { id: "graphql", label: "GraphQL", tech: "graphql" },
  ini: { id: "ini", label: "INI" },
  properties: { id: "ini", label: "Properties" },
  env: { id: "dotenv", label: "Environment" },
}

const BY_NAME: Record<string, FileLanguage> = {
  dockerfile: { id: "dockerfile", label: "Dockerfile", tech: "docker" },
  makefile: { id: "make", label: "Makefile" },
  "go.mod": { label: "Go module", tech: "go" },
  "go.sum": { label: "Go checksums", tech: "go" },
  "cargo.toml": { id: "toml", label: "Cargo manifest", tech: "rust" },
  "mix.exs": { id: "elixir", label: "Mix project", tech: "elixir" },
  "rebar.config": { id: "erlang", label: "rebar3 config", tech: "erlang" },
  "package.json": { id: "json", label: "npm manifest", tech: "npm" },
  "pom.xml": { id: "xml", label: "Maven POM", tech: "maven" },
  gemfile: { id: "ruby", label: "Gemfile", tech: "ruby" },
  ".env": { id: "dotenv", label: "Environment" },
  ".dockerignore": { label: "Docker ignore", tech: "docker" },
  ".gitignore": { label: "Git ignore", tech: "git" },
}

export function fileName(path: string) {
  return path.split("/").pop() ?? path
}

export function languageOf(path: string): FileLanguage {
  const name = fileName(path).toLowerCase()
  if (BY_NAME[name]) return BY_NAME[name]
  if (name.endsWith(".dockerfile") || name.startsWith("dockerfile.")) return BY_NAME.dockerfile
  if (name.startsWith(".env")) return BY_NAME[".env"]
  const extension = name.includes(".") ? name.slice(name.lastIndexOf(".") + 1) : ""
  return BY_EXTENSION[extension] ?? { label: "Plain text" }
}

export type TreeNode = { name: string; path: string; children?: TreeNode[] }

/** Nest "v2/cmd/main.go"-style paths under a root folder; folders first, then files, both alphabetical. */
export function buildTree(files: string[], root: string): TreeNode[] {
  const top: TreeNode = { name: root, path: root, children: [] }
  const prefix = `${root}/`
  for (const file of files) {
    const rel = file.startsWith(prefix) ? file.slice(prefix.length) : file
    const parts = rel.split("/").filter(Boolean)
    let node = top
    parts.forEach((part, i) => {
      const path = `${node.path}/${part}`
      const leaf = i === parts.length - 1
      let child = node.children!.find((c) => c.name === part && Boolean(c.children) === !leaf)
      if (!child) {
        child = leaf ? { name: part, path } : { name: part, path, children: [] }
        node.children!.push(child)
      }
      node = child
    })
  }
  const sort = (nodes: TreeNode[]): TreeNode[] =>
    nodes
      .sort((a, b) => Number(Boolean(b.children)) - Number(Boolean(a.children)) || a.name.localeCompare(b.name))
      .map((n) => (n.children ? { ...n, children: sort(n.children) } : n))
  return sort(top.children!)
}

/** Folders to open so a file is visible. */
export function ancestors(path: string) {
  const parts = path.split("/")
  return parts.slice(1, -1).map((_, i) => parts.slice(0, i + 2).join("/"))
}

export function filterFiles(files: string[], query: string) {
  const q = query.trim().toLowerCase()
  if (!q) return files
  return files.filter((file) => file.toLowerCase().includes(q))
}

export function formatBytes(size: number) {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}

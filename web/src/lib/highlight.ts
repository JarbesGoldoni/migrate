import { useEffect, useState } from "react"
import type { HighlighterCore, ThemedToken, ThemeRegistration } from "shiki/core"

// Colors follow opencode's dark theme, tuned for the ink background.
const THEME: ThemeRegistration = {
  name: "migrate",
  type: "dark",
  colors: { "editor.background": "#00000000", "editor.foreground": "#dfe4ee" },
  tokenColors: [
    { settings: { foreground: "#dfe4ee" } },
    { scope: ["comment", "punctuation.definition.comment", "string.comment"], settings: { foreground: "#6b7394", fontStyle: "italic" } },
    {
      scope: ["keyword", "storage", "storage.type", "storage.modifier", "keyword.control", "keyword.other", "variable.language", "keyword.operator.new"],
      settings: { foreground: "#b39df3" },
    },
    { scope: ["entity.name.function", "support.function", "meta.function-call.generic", "variable.function"], settings: { foreground: "#fab283" } },
    { scope: ["string", "string.quoted", "string.template", "punctuation.definition.string", "string.regexp"], settings: { foreground: "#7fd88f" } },
    { scope: ["constant.numeric", "constant.language", "constant.character", "constant.other", "support.constant"], settings: { foreground: "#f5a742" } },
    {
      scope: ["entity.name.type", "entity.name.class", "support.type", "support.class", "entity.other.inherited-class", "entity.name.namespace", "entity.name.module"],
      settings: { foreground: "#e5c07b" },
    },
    { scope: ["keyword.operator", "punctuation.accessor", "punctuation.separator.key-value"], settings: { foreground: "#56b6c2" } },
    {
      scope: ["variable.parameter", "variable.other.property", "variable.other.object.property", "meta.object-literal.key", "support.type.property-name", "entity.name.tag", "variable.other.member", "entity.name.label"],
      settings: { foreground: "#e88e96" },
    },
    { scope: ["entity.other.attribute-name", "meta.decorator", "punctuation.decorator", "meta.annotation", "storage.type.annotation"], settings: { foreground: "#e5c07b" } },
    { scope: ["punctuation", "meta.brace", "punctuation.definition.tag"], settings: { foreground: "#8b93ab" } },
    { scope: ["markup.heading", "markup.heading entity.name"], settings: { foreground: "#fab283", fontStyle: "bold" } },
    { scope: ["markup.bold"], settings: { fontStyle: "bold" } },
    { scope: ["markup.italic"], settings: { fontStyle: "italic" } },
    { scope: ["markup.inline.raw", "markup.fenced_code"], settings: { foreground: "#7fd88f" } },
    { scope: ["markup.underline.link"], settings: { foreground: "#5c9cf5" } },
  ],
}

// Each grammar is its own chunk, loaded the first time a file needs it.
const GRAMMARS: Record<string, () => Promise<unknown>> = {
  go: () => import("shiki/langs/go.mjs"),
  rust: () => import("shiki/langs/rust.mjs"),
  elixir: () => import("shiki/langs/elixir.mjs"),
  erlang: () => import("shiki/langs/erlang.mjs"),
  csharp: () => import("shiki/langs/csharp.mjs"),
  typescript: () => import("shiki/langs/typescript.mjs"),
  tsx: () => import("shiki/langs/tsx.mjs"),
  javascript: () => import("shiki/langs/javascript.mjs"),
  jsx: () => import("shiki/langs/jsx.mjs"),
  kotlin: () => import("shiki/langs/kotlin.mjs"),
  java: () => import("shiki/langs/java.mjs"),
  scala: () => import("shiki/langs/scala.mjs"),
  python: () => import("shiki/langs/python.mjs"),
  php: () => import("shiki/langs/php.mjs"),
  ruby: () => import("shiki/langs/ruby.mjs"),
  json: () => import("shiki/langs/json.mjs"),
  jsonc: () => import("shiki/langs/jsonc.mjs"),
  yaml: () => import("shiki/langs/yaml.mjs"),
  toml: () => import("shiki/langs/toml.mjs"),
  xml: () => import("shiki/langs/xml.mjs"),
  sql: () => import("shiki/langs/sql.mjs"),
  shellscript: () => import("shiki/langs/shellscript.mjs"),
  dockerfile: () => import("shiki/langs/dockerfile.mjs"),
  markdown: () => import("shiki/langs/markdown.mjs"),
  html: () => import("shiki/langs/html.mjs"),
  css: () => import("shiki/langs/css.mjs"),
  groovy: () => import("shiki/langs/groovy.mjs"),
  make: () => import("shiki/langs/make.mjs"),
  proto: () => import("shiki/langs/proto.mjs"),
  graphql: () => import("shiki/langs/graphql.mjs"),
  ini: () => import("shiki/langs/ini.mjs"),
  dotenv: () => import("shiki/langs/dotenv.mjs"),
}

let highlighter: Promise<HighlighterCore> | undefined
const loaded = new Map<string, Promise<boolean>>()

function core() {
  highlighter ??= Promise.all([import("shiki/core"), import("shiki/engine/javascript")]).then(([shiki, engine]) =>
    shiki.createHighlighterCore({ themes: [THEME], langs: [], engine: engine.createJavaScriptRegexEngine({ forgiving: true }) }),
  )
  return highlighter
}

async function grammar(lang: string) {
  const load = GRAMMARS[lang]
  if (!load) return false
  if (!loaded.has(lang)) {
    loaded.set(
      lang,
      core().then(async (h) => {
        const module = (await load()) as { default: Parameters<HighlighterCore["loadLanguage"]>[0] }
        await h.loadLanguage(module.default)
        return true
      }).catch(() => false),
    )
  }
  return loaded.get(lang)!
}

export type Tokens = ThemedToken[][]

export async function tokenize(code: string, lang: string | undefined): Promise<Tokens | undefined> {
  if (!lang || !(await grammar(lang))) return undefined
  const h = await core()
  return h.codeToTokensBase(code, { lang, theme: "migrate" })
}

/** Highlighted lines once the grammar has loaded; undefined meanwhile (render the plain text). */
export function useTokens(code: string | undefined, lang: string | undefined) {
  const [tokens, setTokens] = useState<Tokens>()
  useEffect(() => {
    setTokens(undefined)
    if (code === undefined || code.length > 600_000) return
    let live = true
    tokenize(code, lang)
      .then((result) => live && setTokens(result))
      .catch(() => {})
    return () => {
      live = false
    }
  }, [code, lang])
  return tokens
}

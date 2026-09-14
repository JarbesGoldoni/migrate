import { Fragment } from "react"
import { cn } from "../lib/format"
import { classify, type RichKind, richTokens } from "../lib/rich"

const CHIP = "rounded-md px-1 py-px font-mono text-[0.88em] ring-1 ring-inset"

// Backticked snippets become chips; literals spotted in plain prose are only colored.
const CHIPS: Record<string, string> = {
  code: `${CHIP} bg-cyan-400/[0.08] text-cyan-200 ring-cyan-400/15`,
  status: `${CHIP} bg-amber-400/[0.08] text-amber-200 ring-amber-400/15`,
  method: `${CHIP} bg-emerald-400/[0.08] font-semibold text-emerald-300 ring-emerald-400/15`,
  path: `${CHIP} bg-sky-400/[0.07] text-sky-200 ring-sky-400/15`,
  json: `${CHIP} bg-violet-400/[0.08] text-violet-200 ring-violet-400/15`,
  string: `${CHIP} bg-emerald-400/[0.07] text-emerald-200 ring-emerald-400/15`,
}

const INLINE: Record<Exclude<RichKind, "text" | "code">, string> = {
  bold: "font-semibold text-white",
  identifier: "font-mono text-[0.92em] text-cyan-200",
  status: "font-mono text-[0.92em] text-amber-200",
  method: "font-mono text-[0.9em] font-semibold text-emerald-300",
  path: "font-mono text-[0.9em] text-sky-200",
  json: "font-mono text-[0.9em] text-violet-200",
  string: "font-mono text-[0.92em] text-emerald-200",
}

/** An agent's explanation, with its values, fields and status codes highlighted like terminal output. */
export function RichText({ text, className }: { text: string; className?: string }) {
  return (
    <span className={cn("leading-relaxed", className)}>
      {richTokens(text).map((token, i) => {
        if (token.kind === "text") return <Fragment key={i}>{token.text}</Fragment>
        const style = token.kind === "code" ? CHIPS[classify(token.text)] : INLINE[token.kind]
        return (
          <span key={i} className={style}>
            {token.text}
          </span>
        )
      })}
    </span>
  )
}

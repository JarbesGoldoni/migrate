import { Fragment } from "react"
import { cn } from "../lib/format"
import { classify, type RichKind, richTokens } from "../lib/rich"

// One quiet mono style with a hint of color per kind; backticked snippets also get a soft chip.
const TONE: Record<Exclude<RichKind, "text" | "bold" | "code">, string> = {
  status: "text-amber-200",
  method: "font-semibold text-emerald-300",
  path: "text-sky-200",
  json: "text-violet-200",
  string: "text-emerald-200",
  call: "text-cyan-100",
}

const MONO = "font-mono text-[0.86em]"
const CHIP = "rounded-[5px] bg-white/[0.06] px-1 py-px ring-1 ring-inset ring-white/[0.08]"

/** An agent's explanation, readable first: plain prose with its code literals set apart. */
export function RichText({ text, className }: { text: string; className?: string }) {
  return (
    <span className={cn("leading-relaxed", className)}>
      {richTokens(text).map((token, i) => {
        if (token.kind === "text") return <Fragment key={i}>{token.text}</Fragment>
        if (token.kind === "bold") {
          return (
            <strong key={i} className="font-semibold text-white">
              {token.text}
            </strong>
          )
        }
        const kind = token.kind === "code" ? classify(token.text) : token.kind
        return (
          <span key={i} className={cn(MONO, kind === "code" ? "text-slate-100" : TONE[kind], token.kind === "code" && CHIP)}>
            {token.text}
          </span>
        )
      })}
    </span>
  )
}

import { emitKeypressEvents } from "node:readline"

const wrap = (open: string) => (text: string) => `\x1b[${open}m${text}\x1b[0m`

export const paint = {
  bold: wrap("1"),
  dim: wrap("2"),
  underline: wrap("4"),
  cyan: wrap("38;5;51"),
  amber: wrap("38;5;214"),
  green: wrap("38;5;114"),
  red: wrap("38;5;203"),
  violet: wrap("38;5;141"),
}

/** A clickable hyperlink in terminals that support OSC 8; others show the text. */
export function link(url: string, text = url) {
  return `\x1b]8;;${url}\x1b\\${text}\x1b]8;;\x1b\\`
}

export type KeyInput = NodeJS.ReadableStream & { isTTY?: boolean; setRawMode?: (mode: boolean) => unknown }
export type TextOutput = { write(chunk: string): unknown; isTTY?: boolean }
export type Keypress = { name?: string; ctrl?: boolean; sequence?: string }
export type Choice = { label: string; hint?: string }

export function renderChoices(question: string, choices: Choice[], index: number) {
  return [
    `  ${paint.cyan("?")} ${paint.bold(question)}`,
    ...choices.map((choice, i) => {
      const hint = choice.hint ? `  ${paint.dim(choice.hint)}` : ""
      return i === index ? `  ${paint.cyan("❯")} ${paint.cyan(choice.label)}${hint}` : `    ${choice.label}${hint}`
    }),
  ]
}

/** Listen to single keypresses until the returned function is called. */
export function onKeys(input: KeyInput, handler: (key: Keypress) => void) {
  emitKeypressEvents(input)
  input.setRawMode?.(true)
  input.resume()
  const listener = (_: string, key: Keypress) => handler(key ?? {})
  input.on("keypress", listener)
  return () => {
    input.off("keypress", listener)
    input.setRawMode?.(false)
    input.pause()
  }
}

/** Arrow keys (or j/k, or a number) to move, Enter to choose. Escape and Ctrl+C resolve undefined. */
export function select(question: string, choices: Choice[], io: { input: KeyInput; output: TextOutput }): Promise<number | undefined> {
  return new Promise((resolve) => {
    let index = 0
    let drawn = 0
    const draw = () => {
      if (drawn) io.output.write(`\x1b[${drawn}A\x1b[0J`)
      const lines = renderChoices(question, choices, index)
      io.output.write(`${lines.join("\n")}\n`)
      drawn = lines.length
    }
    const finish = (value: number | undefined) => {
      stop()
      io.output.write(`\x1b[${drawn}A\x1b[0J`)
      const answer = value === undefined ? paint.dim("cancelled") : paint.cyan(choices[value].label)
      io.output.write(`  ${paint.cyan("?")} ${paint.bold(question)} ${paint.dim("›")} ${answer}\n`)
      resolve(value)
    }
    const stop = onKeys(io.input, (key) => {
      if (key.ctrl && key.name === "c") return finish(undefined)
      if (key.name === "escape") return finish(undefined)
      if (key.name === "up" || key.name === "k") index = (index - 1 + choices.length) % choices.length
      else if (key.name === "down" || key.name === "j") index = (index + 1) % choices.length
      else if (key.name === "return" || key.name === "enter") return finish(index)
      else if (key.sequence && /^[1-9]$/.test(key.sequence) && Number(key.sequence) <= choices.length) return finish(Number(key.sequence) - 1)
      else return
      draw()
    })
    draw()
  })
}

const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]

/** Show a spinner next to the text while the task runs; the line is cleared when it settles. */
export async function spin<T>(text: string, task: () => Promise<T>, output: TextOutput, intervalMs = 80): Promise<T> {
  if (!output.isTTY) return task()
  let frame = 0
  const draw = () => output.write(`\r\x1b[2K  ${paint.cyan(FRAMES[frame++ % FRAMES.length])} ${paint.dim(text)}`)
  draw()
  const timer = setInterval(draw, intervalMs)
  try {
    return await task()
  } finally {
    clearInterval(timer)
    output.write("\r\x1b[2K")
  }
}

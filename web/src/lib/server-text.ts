import type { Key, Params } from "./i18n-core"

// Reasons and errors the server phrases in English; shown in the viewer's language when recognized.
const EXACT: Record<string, Key> = {
  "Pick a batch first": "server.pickBatch",
  "Map the architecture first": "server.mapFirst",
  "Map the architecture and dependencies first": "server.mapFirst",
  "Find entry points first": "server.entrypointsFirst",
  "Extract the business rules first": "server.rulesFirst",
  "Write the characterization tests first": "server.testsFirst",
  "Containerize legacy first": "server.containerizeFirst",
  "Run the tests against legacy first": "server.legacyFirst",
  "Run the tests against legacy before building v2": "server.legacyFirst",
  "Every legacy response already matches the prediction": "server.allPredicted",
  "Every legacy response already matches the prediction and no test repeats another": "server.allPredicted",
  "Choose where to migrate first": "server.targetFirst",
  "Port the batch first": "server.portFirst",
  "Run parity first": "server.parityFirst",
  "Everything already matches": "server.allMatch",
  "Already running": "server.running",
  Stopped: "server.stopped",
  "Legacy did not answer over HTTP": "server.legacyNoAnswer",
  "Legacy or v2 did not answer over HTTP": "server.bothNoAnswer",
  "No container runtime or environment available": "server.noRuntime",
  "Go is not installed locally; building in a container": "server.goInContainer",
  "container build": "server.step.container",
  "v2 answers HTTP": "server.step.answers",
  "A step is still running. Stop it or wait for it to finish.": "server.busy",
}

const PATTERNS: Array<[RegExp, Key]> = [
  [/^The agent finished without writing (.+)$/, "server.noOutput"],
  [/^The agent stopped: (.+)$/, "server.agentStopped"],
  [/^Unknown batch (.+)$/, "server.unknownBatch"],
  [/^Unknown migration (.+)$/, "server.unknownMigration"],
]

export function serverText(text: string | undefined, t: (key: Key, params?: Params) => string): string {
  if (!text) return ""
  const key = EXACT[text]
  if (key) return t(key)
  for (const [pattern, patternKey] of PATTERNS) {
    const match = text.match(pattern)
    if (match) return t(patternKey, { detail: serverText(match[1], t) })
  }
  return text
}

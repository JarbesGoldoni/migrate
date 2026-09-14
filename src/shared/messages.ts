// Messages the server produces for people. The server keeps an English
// fallback next to each one; the UI renders the key in the viewer's language.

export const MESSAGE_KEYS = [
  "tool.read",
  "tool.scan",
  "tool.scanIn",
  "tool.list",
  "tool.search",
  "tool.edit",
  "tool.write",
  "tool.run",
  "tool.fetch",
  "tool.webSearch",
  "tool.plan",
  "tool.delegate",
  "activity.phaseStarted",
  "activity.phaseStartedBatch",
  "activity.phaseFailed",
  "activity.providerRetry",
  "activity.legacyAnswers",
  "activity.startingLegacy",
  "activity.legacyNoAnswer",
  "activity.resetLegacy",
  "activity.request",
  "activity.requestNoResponse",
  "activity.legacyRecorded",
  "activity.buildStepRunning",
  "activity.buildStepPassed",
  "activity.buildStepFailed",
  "activity.buildingV2",
  "activity.v2Running",
  "activity.v2Problems",
  "activity.resetBoth",
  "activity.parityIdentical",
  "activity.parityDifferent",
  "note.noRuntime",
  "note.legacyRunning",
  "note.legacyFailed",
  "note.legacyNoAnswer",
  "note.legacyMatched",
  "note.parity",
  "note.parityNoAnswer",
] as const

export type MessageKey = (typeof MESSAGE_KEYS)[number]

export type MessageParams = Record<string, string | number>

export type Message = { key: MessageKey; params?: MessageParams }

export function msg(key: MessageKey, params?: MessageParams): Message {
  return params ? { key, params } : { key }
}

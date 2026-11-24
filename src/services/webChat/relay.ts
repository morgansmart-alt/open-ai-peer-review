import { EXTENSION_SOURCE, PROTOCOL_VERSION } from "./protocol.ts"

export interface RelayJob {
  requestId: string
  airTabId: number
  providerTabId: number
}

export interface ProviderEvent {
  type?: string
  requestId?: string
  message?: string
  ok?: boolean
  text?: string
  defendedText?: string | null
  transcript?: unknown
  stopped?: boolean
  chatModel?: string
  notice?: string
  step?: string
  status?: string
}

export type RelayDecision =
  | { kind: "ignore" }
  | { kind: "progress"; requestId: string; message: string; airTabId: number; step: string; status: string }
  | { kind: "result"; requestId: string; airTabId: number; text: string; defendedText: string | null; transcript: unknown; stopped: boolean; chatModel: string; notice: string }
  | { kind: "error"; requestId: string; airTabId: number; message: string }

/** A review started from the extension panel has no AIR tab. A review started from the site does. */
export function airTabForRequest(sender: { tab?: { id?: number }; url?: string }, extensionBaseUrl: string): number {
  const url = sender.url ?? ""
  if (extensionBaseUrl && url.startsWith(extensionBaseUrl)) return 0
  return sender.tab?.id ?? 0
}

/**
 * Progress, results, and errors from the chat tab are forwarded only for the active job.
 * runtime.sendMessage reaches the panel. The AIR tab needs tabs.sendMessage.
 */
export function relayFromProvider(job: RelayJob | null, senderTabId: number | undefined, message: ProviderEvent): RelayDecision {
  if (!job || senderTabId == null || senderTabId !== job.providerTabId || message.requestId !== job.requestId) return { kind: "ignore" }
  if (message.type === "air-web-chat-progress") {
    return {
      kind: "progress",
      requestId: job.requestId,
      message: typeof message.message === "string" ? message.message : "",
      airTabId: job.airTabId,
      step: typeof message.step === "string" && message.step.trim() ? message.step.trim() : "Review",
      status: typeof message.status === "string" && message.status.trim() ? message.status.trim() : "update",
    }
  }
  if (message.type === "air-web-chat-done") {
    if (message.ok && typeof message.text === "string" && message.text) {
      return {
        kind: "result",
        requestId: job.requestId,
        airTabId: job.airTabId,
        text: message.text,
        defendedText: message.defendedText ?? null,
        transcript: message.transcript ?? [],
        stopped: Boolean(message.stopped),
        chatModel: typeof message.chatModel === "string" && message.chatModel.trim() ? message.chatModel.trim() : "unknown (site default)",
        notice: typeof message.notice === "string" ? message.notice : "",
      }
    }
    return { kind: "error", requestId: job.requestId, airTabId: job.airTabId, message: message.message || "The chat did not return a review." }
  }
  return { kind: "ignore" }
}

export function extensionEnvelope(decision: Exclude<RelayDecision, { kind: "ignore" }>): Record<string, unknown> {
  if (decision.kind === "progress") {
    return {
      source: EXTENSION_SOURCE,
      version: PROTOCOL_VERSION,
      type: "air-web-chat-progress",
      requestId: decision.requestId,
      message: decision.message,
      step: decision.step,
      status: decision.status,
    }
  }
  if (decision.kind === "result") {
    return {
      source: EXTENSION_SOURCE,
      version: PROTOCOL_VERSION,
      type: "air-web-chat-result",
      requestId: decision.requestId,
      text: decision.text,
      defendedText: decision.defendedText,
      transcript: decision.transcript,
      stopped: decision.stopped,
      chatModel: decision.chatModel,
      notice: decision.notice,
    }
  }
  return { source: EXTENSION_SOURCE, version: PROTOCOL_VERSION, type: "air-web-chat-error", requestId: decision.requestId, message: decision.message }
}

/** The panel always hears the event. The AIR page hears it when that page started the review. */
export function relayTargets(decision: Exclude<RelayDecision, { kind: "ignore" }>): { panel: true; airTabId: number | null } {
  return { panel: true, airTabId: decision.airTabId > 0 ? decision.airTabId : null }
}

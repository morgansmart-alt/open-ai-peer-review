import { isExtensionMessage, PAGE_SOURCE, PROTOCOL_VERSION, type WebChatPacket } from "./protocol.ts"

type ExtensionPayload = {
  source: string
  type: string
  version: number
  requestId?: string
  text?: string
  message?: string
  defendedText?: string | null
  transcript?: unknown
  stopped?: boolean
}

export interface WebChatRunResult {
  text: string
  defendedText: string | null
  transcript: unknown[]
  stopped: boolean
}

function post(message: Record<string, unknown>): void {
  window.postMessage({ source: PAGE_SOURCE, version: PROTOCOL_VERSION, ...message }, window.location.origin)
}

export function pingWebChatExtension(timeoutMs = 700): Promise<boolean> {
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => {
      window.removeEventListener("message", onMessage)
      resolve(false)
    }, timeoutMs)
    function onMessage(event: MessageEvent) {
      if (event.source !== window || event.origin !== window.location.origin) return
      if (!isExtensionMessage(event.data)) return
      if ((event.data as ExtensionPayload).type !== "air-web-chat-pong") return
      window.clearTimeout(timer)
      window.removeEventListener("message", onMessage)
      resolve(true)
    }
    window.addEventListener("message", onMessage)
    post({ type: "air-web-chat-ping" })
  })
}

export function runWebChatExtension(
  packet: WebChatPacket,
  onProgress?: (message: string) => void,
  signal?: AbortSignal,
  defenceRounds = 0,
): Promise<WebChatRunResult> {
  return new Promise((resolve, reject) => {
    let settled = false
    const timer = window.setTimeout(() => finish(new Error("The web chat did not finish within 15 minutes. The provider tab may still be open.")), 15 * 60 * 1000)
    function finish(error?: Error, result?: WebChatRunResult) {
      if (settled) return
      settled = true
      window.clearTimeout(timer)
      window.removeEventListener("message", onMessage)
      signal?.removeEventListener("abort", onAbort)
      if (error) reject(error)
      else resolve(result ?? { text: "", defendedText: null, transcript: [], stopped: false })
    }
    function onAbort() {
      post({ type: "air-web-chat-cancel", requestId: packet.requestId })
      finish(new DOMException("Aborted", "AbortError"))
    }
    function onMessage(event: MessageEvent) {
      if (event.source !== window || event.origin !== window.location.origin) return
      if (!isExtensionMessage(event.data, packet.requestId)) return
      const data = event.data as ExtensionPayload
      if (data.type === "air-web-chat-progress" && data.message) onProgress?.(data.message)
      if (data.type === "air-web-chat-result") {
        finish(undefined, {
          text: data.text ?? "",
          defendedText: data.defendedText ?? null,
          transcript: Array.isArray(data.transcript) ? data.transcript : [],
          stopped: Boolean(data.stopped),
        })
      }
      if (data.type === "air-web-chat-error") finish(new Error(data.message || "The web chat could not finish."))
    }
    window.addEventListener("message", onMessage)
    signal?.addEventListener("abort", onAbort)
    post({ type: "air-web-chat-request", requestId: packet.requestId, packet, defenceRounds })
  })
}

export function webChatPromptText(packet: WebChatPacket): string {
  const files = packet.files.map((file) => `## ${file.filename}\n${file.text}`).join("\n\n")
  return [packet.system, packet.instructions, files ? `Paper:\n${files}` : ""].filter(Boolean).join("\n\n")
}

import { originAllowed, EXTENSION_SOURCE, PAGE_SOURCE, PROTOCOL_VERSION } from "../src/services/webChat/protocol.ts"
import { lastError } from "./browser.ts"

function postToPage(message: Record<string, unknown>): void {
  window.postMessage(message, window.location.origin)
}

window.addEventListener("message", (event: MessageEvent) => {
  if (event.source !== window) return
  if (!originAllowed(event.origin)) return
  const data = event.data as { source?: string; type?: string; version?: number; requestId?: string } | null
  if (!data || data.source !== PAGE_SOURCE || data.version !== PROTOCOL_VERSION) return
  if (data.type === "air-web-chat-ping") {
    postToPage({ source: EXTENSION_SOURCE, type: "air-web-chat-pong", version: PROTOCOL_VERSION })
    return
  }
  if (data.type !== "air-web-chat-request" && data.type !== "air-web-chat-cancel") return
  chrome.runtime.sendMessage(data, (response: { ok?: boolean; message?: string } | undefined) => {
    const failed = lastError()
    if (failed) {
      postToPage({
        source: EXTENSION_SOURCE,
        type: "air-web-chat-error",
        version: PROTOCOL_VERSION,
        requestId: data.requestId,
        message: "The AIR extension did not answer. Reload this page after loading the extension.",
      })
      return
    }
    if (response && response.ok === false) {
      postToPage({
        source: EXTENSION_SOURCE,
        type: "air-web-chat-error",
        version: PROTOCOL_VERSION,
        requestId: data.requestId,
        message: response.message || "The extension refused this review.",
      })
    }
  })
})

chrome.runtime.onMessage.addListener((message: { source?: string }) => {
  if (!message || message.source !== EXTENSION_SOURCE) return
  postToPage(message as Record<string, unknown>)
})

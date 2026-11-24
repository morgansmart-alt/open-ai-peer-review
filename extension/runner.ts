import { webChatProvider } from "./adapters/index.ts"
import { officialCriteria } from "../src/domain/officialCriteria.ts"
import { readingCriteria } from "../src/domain/profiles.ts"
import { acceptWebChatResult } from "../src/services/webChat/accept.ts"
import { critiquesFromReport, DEFENCE_PAUSE_MS, runDefenceLoop } from "../src/services/webChat/defence.ts"
import { sendFollowUp, runTurn, type TurnHooks } from "../src/services/webChat/runTurn.ts"
import { EXTENSION_SOURCE, PROTOCOL_VERSION, type WebChatPacket } from "../src/services/webChat/protocol.ts"

let aborted = false

function showBanner(label: string): void {
  document.getElementById("air-web-chat-banner")?.remove()
  const bar = document.createElement("div")
  bar.id = "air-web-chat-banner"
  bar.setAttribute("role", "status")
  bar.style.cssText =
    "position:fixed;z-index:2147483646;top:0;left:0;right:0;padding:10px 14px;background:#0f3d3a;color:#f4f7f4;font:14px/1.4 sans-serif;"
  bar.append(document.createTextNode(`AIR is using this ${label} tab because you clicked Run. Stay and watch. AIR does not read your password or cookies. `))
  const close = document.createElement("button")
  close.type = "button"
  close.textContent = "Hide"
  close.style.cssText = "margin-left:8px;background:#fff;color:#0f3d3a;border:0;border-radius:999px;padding:4px 10px;cursor:pointer;"
  close.addEventListener("click", () => bar.remove())
  bar.append(close)
  ;(document.body ?? document.documentElement).append(bar)
}

function report(message: Record<string, unknown>): void {
  chrome.runtime.sendMessage({ source: EXTENSION_SOURCE, version: PROTOCOL_VERSION, ...message })
}

chrome.runtime.onMessage.addListener((message: { type?: string; requestId?: string; providerId?: string; packet?: WebChatPacket; defenceRounds?: number }, _sender, sendResponse) => {
  if (message?.type === "air-web-chat-abort") {
    aborted = true
    sendResponse({ ok: true })
    return true
  }
  if (message?.type !== "air-web-chat-run" || !message.requestId || !message.packet) return
  const provider = webChatProvider(message.providerId ?? message.packet.providerId)
  if (!provider) {
    sendResponse({ ok: false, started: false })
    report({ type: "air-web-chat-done", requestId: message.requestId, ok: false, message: "That chat site has no adapter." })
    return true
  }
  aborted = false
  showBanner(provider.label)
  sendResponse({ ok: true, started: true })
  const hooks: TurnHooks = {
    aborted: () => aborted,
    onProgress: (text) => report({ type: "air-web-chat-progress", requestId: message.requestId, message: text }),
    sleep: (ms) => new Promise((resolve) => window.setTimeout(resolve, ms)),
  }
  void runTurn(document, provider, message.packet, hooks).then(async (result) => {
    if (!result.ok) {
      report({ type: "air-web-chat-done", requestId: message.requestId, ok: false, message: result.message, code: result.code })
      return
    }
    const rounds = Math.min(3, Math.max(0, Math.round(Number(message.defenceRounds) || 0)))
    const criteria = readingCriteria(officialCriteria, message.packet.criterionProfile, false)
    if (!rounds) {
      report({ type: "air-web-chat-done", requestId: message.requestId, ok: true, text: result.text })
      return
    }
    const accepted = acceptWebChatResult(result.text, criteria)
    if (!accepted.ok) {
      report({ type: "air-web-chat-done", requestId: message.requestId, ok: true, text: result.text, defendedText: null, transcript: [], stopped: false })
      return
    }
    const paperText = message.packet.files.map((file) => file.text).join("\n\n")
    try {
      const defence = await runDefenceLoop({
        rounds,
        critiques: critiquesFromReport(accepted.report),
        paperText,
        aborted: () => aborted,
        pause: () => new Promise((resolve) => window.setTimeout(resolve, DEFENCE_PAUSE_MS)),
        onProgress: (text) => report({ type: "air-web-chat-progress", requestId: message.requestId, message: text }),
        send: (prompt) => sendFollowUp(document, provider, prompt, hooks),
      })
      report({
        type: "air-web-chat-done",
        requestId: message.requestId,
        ok: true,
        text: result.text,
        defendedText: defence.defendedText,
        transcript: defence.transcript,
        stopped: defence.stopped,
      })
    } catch (error) {
      report({
        type: "air-web-chat-done",
        requestId: message.requestId,
        ok: true,
        text: result.text,
        message: error instanceof Error ? error.message : "The defence stopped early.",
      })
    }
  })
  return true
})

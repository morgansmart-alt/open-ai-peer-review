import { webChatProvider } from "./adapters/index.ts"
import { officialCriteria } from "../src/domain/officialCriteria.ts"
import { readingCriteria } from "../src/domain/profiles.ts"
import { acceptWebChatResult } from "../src/services/webChat/accept.ts"
import { chooseDefendedText, critiquesFromReport, defenceFailureNotice, DEFENCE_PAUSE_MS, runDefenceLoop } from "../src/services/webChat/defence.ts"
import { sendFollowUp, runTurn, type TurnHooks } from "../src/services/webChat/runTurn.ts"
import { detectChatModel } from "../src/services/webChat/chatModel.ts"
import { settleChatJson } from "../src/services/jsonText.ts"
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
  const observedModel = () => detectChatModel(document, provider.id)
  let lastFocus = 0
  const focusChat = () => {
    lastFocus = Date.now()
    chrome.runtime.sendMessage({ type: "air-web-chat-focus" })
  }
  const hooks: TurnHooks = {
    aborted: () => aborted,
    onProgress: (text, meta) =>
      report({
        type: "air-web-chat-progress",
        requestId: message.requestId,
        message: text,
        step: meta?.step ?? "Review",
        status: meta?.status ?? "update",
        detail: meta?.detail ?? "",
      }),
    sleep: (ms) => {
      if (document.hidden && Date.now() - lastFocus > 2000) focusChat()
      return new Promise((resolve) => window.setTimeout(resolve, ms))
    },
    keepAwake: () =>
      new Promise((resolve) => {
        lastFocus = Date.now()
        chrome.runtime.sendMessage({ type: "air-web-chat-focus" }, () => resolve())
      }),
    loadTextPage: (url) =>
      new Promise((resolve) => {
        chrome.runtime.sendMessage({ type: "air-web-chat-text-page", url }, (response: { status?: number; body?: string } | undefined) => {
          if (chrome.runtime.lastError || !response || typeof response.status !== "number") {
            void fetch(url)
              .then(async (page) => resolve({ status: page.status, body: await page.text() }))
              .catch(() => resolve({ status: 0, body: "" }))
            return
          }
          resolve({ status: response.status, body: typeof response.body === "string" ? response.body : "" })
        })
      }),
  }
  void runTurn(document, provider, message.packet, hooks).then(async (result) => {
    if (!result.ok) {
      report({ type: "air-web-chat-done", requestId: message.requestId, ok: false, message: result.message, code: result.code })
      return
    }
    const criteria = readingCriteria(officialCriteria, message.packet.criterionProfile, false)
    const settled = await settleChatJson(
      result.text,
      (prompt) => sendFollowUp(document, provider, prompt, hooks, "corrected JSON"),
      (text) => hooks.onProgress?.(text, { step: "Corrected JSON", status: "sending" }),
      (text) => {
        const accepted = acceptWebChatResult(text, criteria)
        return accepted.ok ? { ok: true } : { ok: false, errors: accepted.errors }
      },
    )
    const rounds = Math.min(3, Math.max(0, Math.round(Number(message.defenceRounds) || 0)))
    const notice = result.notice
    if (!rounds) {
      report({ type: "air-web-chat-done", requestId: message.requestId, ok: true, text: settled.text, chatModel: observedModel(), notice })
      return
    }
    const accepted = acceptWebChatResult(settled.text, criteria)
    if (!accepted.ok) {
      report({ type: "air-web-chat-done", requestId: message.requestId, ok: true, text: settled.text, defendedText: null, transcript: [], stopped: false, chatModel: observedModel(), notice })
      return
    }
    const linked = result.route === "link"
    const paperText = linked ? "" : message.packet.files.map((file) => file.text).join("\n\n")
    try {
      const defence = await runDefenceLoop({
        rounds,
        critiques: critiquesFromReport(accepted.report),
        paperText,
        includeExcerpt: !linked,
        aborted: () => aborted,
        pause: () => new Promise((resolve) => window.setTimeout(resolve, DEFENCE_PAUSE_MS)),
        onProgress: (text) => hooks.onProgress?.(text, { step: text.replace(/\.$/, ""), status: "sending" }),
        send: (prompt, label, expect) => sendFollowUp(document, provider, prompt, hooks, label ?? "author defence", expect ?? "text"),
      })
      let defendedText = defence.defendedText
      if (defendedText) {
        try {
          const settledDefence = await settleChatJson(
            defendedText,
            (prompt) => sendFollowUp(document, provider, prompt, hooks, "corrected score after defence", "json"),
            (text) => hooks.onProgress?.(text, { step: "Score after author defence", status: "sending" }),
            (text) => {
              const checked = acceptWebChatResult(text, criteria)
              return checked.ok ? { ok: true } : { ok: false, errors: checked.errors }
            },
          )
          defendedText = chooseDefendedText(defendedText, settledDefence.text, criteria)
        } catch {
          // The reply already arrived. The panel reads the overall from it.
        }
      }
      report({
        type: "air-web-chat-done",
        requestId: message.requestId,
        ok: true,
        text: settled.text,
        defendedText,
        transcript: defence.transcript,
        stopped: defence.stopped,
        chatModel: observedModel(),
        notice,
      })
    } catch (error) {
      const reason = error instanceof Error ? error.message : "The defence stopped early."
      report({
        type: "air-web-chat-done",
        requestId: message.requestId,
        ok: true,
        text: settled.text,
        notice: [notice, defenceFailureNotice(reason)].filter(Boolean).join(" "),
        message: reason,
        chatModel: observedModel(),
      })
    }
  })
  return true
})

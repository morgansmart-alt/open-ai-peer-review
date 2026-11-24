import { webChatProvider } from "./adapters/index.ts"
import { JOB_KEY, sessionGet, sessionRemove, sessionSet, tabSend, type JobRecord } from "./browser.ts"
import { airTabForRequest, extensionEnvelope, relayFromProvider } from "../src/services/webChat/relay.ts"
import { EXTENSION_SOURCE, originAllowed, PROTOCOL_VERSION, validatePacket } from "../src/services/webChat/protocol.ts"

function senderOrigin(sender: { url?: string }): string {
  try {
    return new URL(sender.url ?? "").origin
  } catch {
    return ""
  }
}

function fromExtensionPage(sender: { url?: string }): boolean {
  const url = sender.url ?? ""
  return url.startsWith(chrome.runtime.getURL(""))
}

function requestAllowed(sender: { url?: string }): boolean {
  return fromExtensionPage(sender) || originAllowed(senderOrigin(sender))
}

function emit(message: Record<string, unknown>, airTabId: number): void {
  chrome.runtime.sendMessage(message, () => {
    void chrome.runtime.lastError
  })
  if (airTabId > 0) void tabSend(airTabId, message).catch(() => undefined)
}

function emitDecision(job: JobRecord, senderTabId: number | undefined, message: Parameters<typeof relayFromProvider>[2]): void {
  const decision = relayFromProvider(job, senderTabId, message)
  if (decision.kind === "ignore") return
  const envelope = extensionEnvelope(decision)
  const targets = { panel: true as const, airTabId: decision.airTabId > 0 ? decision.airTabId : 0 }
  emit(envelope, targets.airTabId)
}

function waitForLoad(tabId: number): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false
    const finish = (error?: Error) => {
      if (settled) return
      settled = true
      clearInterval(poll)
      clearTimeout(timer)
      chrome.tabs.onUpdated.removeListener(onUpdated)
      if (error) reject(error)
      else resolve()
    }
    const timer = setTimeout(() => finish(new Error("The chat tab did not finish loading.")), 30_000)
    const onUpdated = (id: number, info: { status?: string }) => {
      if (id === tabId && info.status === "complete") finish()
    }
    const poll = setInterval(() => {
      chrome.tabs.get(tabId, (tab) => {
        if (tab?.status === "complete") finish()
      })
    }, 400)
    chrome.tabs.onUpdated.addListener(onUpdated)
  })
}

async function wakeRunner(tabId: number, message: unknown): Promise<void> {
  let last = "The chat page did not answer."
  for (let attempt = 0; attempt < 15; attempt += 1) {
    try {
      const response = (await tabSend(tabId, message)) as { started?: boolean } | undefined
      if (response?.started) return
      last = "The chat page did not start the review."
    } catch (error) {
      last = error instanceof Error ? error.message : last
    }
    await new Promise((resolve) => setTimeout(resolve, 400))
  }
  throw new Error(`${last} If the tab is asking you to sign in, sign in, then click Review my paper again.`)
}

async function startJob(packetInput: unknown, defenceRounds = 0, airTabId = 0): Promise<{ ok: boolean; message?: string }> {
  const validated = validatePacket(packetInput)
  if (!validated.ok) return { ok: false, message: validated.message }
  const existing = await sessionGet<JobRecord>(JOB_KEY)
  if (existing && Date.now() - existing.startedAt < 20 * 60 * 1000) {
    return { ok: false, message: "A web-chat review is already running in another tab. Finish it, or cancel it from AIR, before starting another." }
  }
  const provider = webChatProvider(validated.packet.providerId)
  if (!provider) return { ok: false, message: "That chat site has no adapter." }
  const tab = await chrome.tabs.create({ url: provider.startUrl, active: true })
  if (!tab.id) return { ok: false, message: "The browser did not open a chat tab." }
  const job: JobRecord = {
    requestId: validated.packet.requestId,
    airTabId,
    providerTabId: tab.id,
    providerId: provider.id,
    startedAt: Date.now(),
  }
  await sessionSet(JOB_KEY, job)
  emit(
    { source: EXTENSION_SOURCE, version: PROTOCOL_VERSION, type: "air-web-chat-progress", requestId: job.requestId, message: `Opened ${provider.label}. Stay on that tab. The review runs because you clicked Review my paper.` },
    airTabId,
  )
  try {
    await waitForLoad(tab.id)
    await wakeRunner(tab.id, { type: "air-web-chat-run", requestId: job.requestId, providerId: provider.id, packet: validated.packet, defenceRounds })
  } catch (error) {
    await sessionRemove(JOB_KEY)
    return { ok: false, message: error instanceof Error ? error.message : "The chat tab could not start." }
  }
  return { ok: true }
}

chrome.runtime.onMessage.addListener((message: { source?: string; type?: string; requestId?: string; packet?: unknown; defenceRounds?: number; ok?: boolean; text?: string; message?: string; code?: string; defendedText?: string | null; transcript?: unknown; stopped?: boolean }, sender, sendResponse) => {
  if (message?.type === "air-web-chat-request") {
    if (!requestAllowed(sender)) {
      sendResponse({ ok: false, message: "A review can start from this extension or from the AIR site on your computer." })
      return true
    }
    const rounds = Math.min(3, Math.max(0, Math.round(Number(message.defenceRounds) || 0)))
    const airTabId = airTabForRequest(sender, chrome.runtime.getURL(""))
    void startJob(message.packet, rounds, airTabId).then(sendResponse)
    return true
  }
  if (message?.type === "air-web-chat-cancel") {
    if (!requestAllowed(sender)) {
      sendResponse({ ok: false, message: "A review can be cancelled from this extension or from the AIR site on your computer." })
      return true
    }
    void sessionGet<JobRecord>(JOB_KEY).then(async (job) => {
      if (job && job.requestId === message.requestId) {
        await tabSend(job.providerTabId, { type: "air-web-chat-abort", requestId: job.requestId }).catch(() => undefined)
        await sessionRemove(JOB_KEY)
      }
      sendResponse({ ok: true })
    })
    return true
  }
  if (message?.type === "air-web-chat-progress" || message?.type === "air-web-chat-done") {
    void sessionGet<JobRecord>(JOB_KEY).then(async (job) => {
      if (!job || sender.tab?.id !== job.providerTabId || message.requestId !== job.requestId) return
      if (message.type === "air-web-chat-done") await sessionRemove(JOB_KEY)
      emitDecision(job, sender.tab?.id, message)
    })
    sendResponse({ ok: true })
    return true
  }
  return undefined
})

if (chrome.sidePanel?.setPanelBehavior) {
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
} else {
  chrome.action.onClicked.addListener(() => {
    void chrome.tabs.create({ url: chrome.runtime.getURL("review.html") })
  })
}

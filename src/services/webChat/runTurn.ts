import type { ProviderAdapter } from "../../../extension/adapters/index.ts"
import { planDelivery, type DeliveryStep } from "./deliver.ts"
import { choosePaperTextUrl, couldNotReadPaper, recordIdFromPaperTextUrl, TEXT_PAGE_NOTE, textPageHasPaper, textPageUntrusted } from "./paperText.ts"
import {
  assistantText,
  attachTextFiles,
  attachmentReady,
  ATTACHMENT_SELECTORS,
  ackReply,
  describeButtons,
  describeCandidates,
  describeMessages,
  findComposer,
  findSubmit,
  pointerClick,
  pressEnterSequence,
  queryFirst,
  replyActionsVisible,
  requestSubmitButton,
  reviewJsonOnPage,
  sendLanded,
  visibleReplyText,
  stopControlActive,
  writeComposer,
  composerText,
} from "./dom.ts"
import type { WebChatPacket } from "./protocol.ts"

export interface TurnHooks {
  sleep(ms: number): Promise<void>
  aborted(): boolean
  onProgress?(message: string): void
  pollMs?: number
  stableMs?: number
  stepTimeoutMs?: number
  /** How long to wait for a file chip before giving up. */
  attachmentTimeoutMs?: number
  /** After this long, an enabled Send button counts as the file being ready. */
  attachmentChipMs?: number
  /** How long to wait for the message box to appear. */
  composerTimeoutMs?: number
  /** How long Send may stay enabled before the click is reported as a miss. */
  replyStartTimeoutMs?: number
  /** How long to wait for an enabled submit button to appear. */
  submitReadyMs?: number
  /** How long to wait for the submit button to stay enabled before the first attempt. */
  submitStableMs?: number
  /** How long to wait after a send attempt before trying the other method. */
  sendVerifyMs?: number
  /** Probe the public text page. Absent means a normal fetch. */
  loadTextPage?(url: string): Promise<{ status: number; body: string }>
}

export type TurnResult = { ok: true; text: string; steps: number; notice?: string } | { ok: false; code: string; message: string }

class TurnError extends Error {
  code: string
  constructor(code: string, message: string) {
    super(message)
    this.code = code
    this.name = "TurnError"
  }
}

function signedOut(provider: ProviderAdapter): string {
  return `${provider.label} is showing a sign-in page. Sign in on this tab, then click Run again in AIR. AIR does not see your password.`
}

function selectorMiss(provider: ProviderAdapter, diagnostic: string): string {
  const detail = diagnostic && diagnostic !== "none" ? ` Candidates: ${diagnostic}.` : " Candidates: none."
  return `AIR could not find the message box on ${provider.label}. The page may still be loading, or the site changed its layout. Reload the tab and run again.${detail} The selectors for this site are in extension/adapters/${provider.id}.ts.`
}

async function waitForComposer(doc: Document, provider: ProviderAdapter, hooks: TurnHooks): Promise<Element | null> {
  const timeoutMs = hooks.composerTimeoutMs ?? 20_000
  const pollMs = hooks.pollMs ?? 200
  const start = Date.now()
  let found = findComposer(doc, provider.selectors.composer)
  while (!found && Date.now() - start <= timeoutMs) {
    if (hooks.aborted()) throw new TurnError("cancelled", "Cancelled. The provider tab stays open.")
    await hooks.sleep(pollMs)
    found = findComposer(doc, provider.selectors.composer)
  }
  return found
}

function stepDiagnostic(doc: Document): string {
  return `${describeButtons(doc)} ${describeCandidates(doc)}`
}

function replyTimeoutReason(doc: Document, composer: Element): string {
  if (reviewJsonOnPage(doc, composer) || ackReply(doc, composer)) return "reply seen, JSON not parsed"
  const visible = visibleReplyText(doc, composer).replace(/\s+/g, " ").trim()
  if (visible.length > 40) return "reply seen, JSON not parsed"
  return "no reply seen"
}

async function waitForReply(doc: Document, provider: ProviderAdapter, before: string, hooks: TurnHooks, composer: Element, beforeJson = ""): Promise<string> {
  const pollMs = hooks.pollMs ?? 400
  const stableMs = hooks.stableMs ?? 2000
  const timeoutMs = hooks.stepTimeoutMs ?? 4 * 60 * 1000
  const startLimit = hooks.replyStartTimeoutMs ?? 20_000
  const start = Date.now()
  let last = before
  let stableFor = 0
  let lastJson = ""
  let jsonStable = 0
  let lastAck = ""
  let ackStable = 0
  let started = false
  while (Date.now() - start < timeoutMs) {
    if (hooks.aborted()) throw new TurnError("cancelled", "Cancelled. The provider tab stays open.")
    const json = reviewJsonOnPage(doc, composer)
    const freshJson = json && json !== beforeJson ? json : ""
    const ack = ackReply(doc, composer)
    const assistant = assistantText(doc, provider.selectors.assistant, composer)
    const stopping = stopControlActive(doc, provider.selectors.stop)
    if (freshJson || ack || (assistant && assistant !== before)) started = true
    if (freshJson) {
      if (freshJson === lastJson && jsonStable >= stableMs) return freshJson
      if (freshJson !== lastJson) {
        lastJson = freshJson
        jsonStable = 0
      } else jsonStable += pollMs
    } else {
      lastJson = ""
      jsonStable = 0
    }
    if (ack && !freshJson) {
      if (ack === lastAck && ackStable >= stableMs) return ack
      if (ack !== lastAck) {
        lastAck = ack
        ackStable = 0
      } else ackStable += pollMs
    } else if (!ack) {
      lastAck = ""
      ackStable = 0
    }
    if (!started && !stopping && Date.now() - start >= startLimit) {
      const send = findSubmit(doc, provider.selectors.submit, composer)
      if (send) {
        throw new TurnError(
          "send-timeout",
          `Send step on ${provider.label} did not start a reply. The Send button was still enabled. ${stepDiagnostic(doc)}`,
        )
      }
    }
    const settled = Boolean(assistant) && assistant !== before && assistant === last && !stopping && stableFor >= stableMs
    if (!freshJson && !ack && (settled || (started && !stopping && replyActionsVisible(doc) && assistant && assistant !== before))) return assistant
    if (assistant !== last) {
      last = assistant
      stableFor = 0
    } else {
      stableFor += pollMs
    }
    await hooks.sleep(pollMs)
  }
  throw new TurnError("timeout", `Reply step on ${provider.label} did not finish in time. ${replyTimeoutReason(doc, composer)}.`)
}

async function waitForEnabledSubmit(doc: Document, provider: ProviderAdapter, composer: Element, hooks: TurnHooks): Promise<Element | null> {
  const timeoutMs = hooks.submitReadyMs ?? 5_000
  const stableMs = hooks.submitStableMs ?? 300
  const pollMs = hooks.pollMs ?? 200
  const start = Date.now()
  let last: Element | null = null
  let stableFor = 0
  while (Date.now() - start <= timeoutMs) {
    if (hooks.aborted()) throw new TurnError("cancelled", "Cancelled. The provider tab stays open.")
    const button = findSubmit(doc, provider.selectors.submit, composer)
    if (button && button === last && stableFor >= stableMs) return button
    if (button && button === last) stableFor += pollMs
    else {
      last = button
      stableFor = button ? pollMs : 0
    }
    if (button && stableMs <= 0) return button
    await hooks.sleep(pollMs)
  }
  return last
}

async function verifySend(doc: Document, composer: Element, beforeAssistant: string, previousComposer: string, hooks: TurnHooks): Promise<boolean> {
  const timeoutMs = hooks.sendVerifyMs ?? 3_000
  const pollMs = hooks.pollMs ?? 200
  const start = Date.now()
  while (Date.now() - start <= timeoutMs) {
    if (hooks.aborted()) throw new TurnError("cancelled", "Cancelled. The provider tab stays open.")
    if (sendLanded(doc, composer, beforeAssistant, previousComposer)) return true
    await hooks.sleep(pollMs)
  }
  return sendLanded(doc, composer, beforeAssistant, previousComposer)
}

async function commitSend(doc: Document, provider: ProviderAdapter, composer: Element, beforeAssistant: string, hooks: TurnHooks): Promise<string> {
  const previousComposer = composerText(composer)
  const button = await waitForEnabledSubmit(doc, provider, composer, hooks)
  let primary = "none"
  if (button) {
    primary = requestSubmitButton(button) ? "requestSubmit" : "pointer"
    if (primary === "pointer") pointerClick(button)
    hooks.onProgress?.(`Send step on ${provider.label}. Tried ${primary}.`)
    if (await verifySend(doc, composer, beforeAssistant, previousComposer, hooks)) return primary
    if (sendLanded(doc, composer, beforeAssistant, previousComposer)) return primary
  }
  if (sendLanded(doc, composer, beforeAssistant, previousComposer)) return primary
  const entered = pressEnterSequence(composer)
  hooks.onProgress?.(`Send step on ${provider.label}. Tried Enter after ${primary} did not send.`)
  if (!entered) return primary
  if (await verifySend(doc, composer, beforeAssistant, previousComposer, hooks)) return "enter"
  const still = findSubmit(doc, provider.selectors.submit, composer)
  throw new TurnError(
    "send-timeout",
    `Send step on ${provider.label} did not start a reply. Tried ${primary}, then Enter. ${still ? "The Send button was still enabled." : "Send was not enabled."} ${stepDiagnostic(doc)} ${describeMessages(doc)}`,
  )
}

async function waitForAttachment(doc: Document, provider: ProviderAdapter, files: DeliveryStep["files"], hooks: TurnHooks): Promise<void> {
  const timeoutMs = hooks.attachmentTimeoutMs ?? 20_000
  const chipWindow = hooks.attachmentChipMs ?? 3_000
  const pollMs = hooks.pollMs ?? 200
  const selectors = provider.selectors.attachment?.length ? provider.selectors.attachment : ATTACHMENT_SELECTORS
  const start = Date.now()
  while (Date.now() - start <= timeoutMs) {
    if (hooks.aborted()) throw new TurnError("cancelled", "Cancelled. The provider tab stays open.")
    if (attachmentReady(doc, files, selectors)) return
    if (Date.now() - start >= chipWindow) {
      const composer = findComposer(doc, provider.selectors.composer)
      const send = composer ? findSubmit(doc, provider.selectors.submit, composer) : null
      if (send) return
    }
    await hooks.sleep(pollMs)
  }
  throw new TurnError(
    "upload-timeout",
    `Attachment step on ${provider.label} timed out. The file chip never showed as ready, and Send was not enabled. ${stepDiagnostic(doc)}`,
  )
}

async function sendStep(doc: Document, provider: ProviderAdapter, step: DeliveryStep, hooks: TurnHooks): Promise<string> {
  if (step.kind === "upload") {
    hooks.onProgress?.(`Attachment step on ${provider.label}. Waiting for the file chip, or for Send to become enabled.`)
    const input = queryFirst(doc, provider.selectors.fileInput)
    const attached = input ? attachTextFiles(input, step.files) : false
    if (!attached) throw new TurnError("upload-miss", "file upload was not accepted")
    await waitForAttachment(doc, provider, step.files, hooks)
  }
  const composer = findComposer(doc, provider.selectors.composer)
  if (!composer) throw new TurnError("selector-miss", selectorMiss(provider, describeCandidates(doc)))
  const before = assistantText(doc, provider.selectors.assistant, composer)
  const beforeJson = reviewJsonOnPage(doc, composer)
  writeComposer(composer, step.text)
  const method = await commitSend(doc, provider, composer, before, hooks)
  hooks.onProgress?.(`Send step on ${provider.label}. Method that sent: ${method}.`)
  return waitForReply(doc, provider, before, hooks, composer, beforeJson)
}

/** One more message in the chat that is already open. Waits until streaming stops. */
export async function sendFollowUp(doc: Document, provider: ProviderAdapter, text: string, hooks: TurnHooks): Promise<string> {
  const step: DeliveryStep = { kind: "paste", text, files: [], index: 1, total: 1, final: true }
  return sendStep(doc, provider, step, hooks)
}

async function pageIsLive(url: string, hooks: TurnHooks): Promise<boolean> {
  try {
    const loaded = hooks.loadTextPage ? await hooks.loadTextPage(url) : await fetch(url).then(async (response) => ({ status: response.status, body: await response.text() }))
    return textPageHasPaper(loaded.status, loaded.body)
  } catch {
    return false
  }
}

export async function runTurn(doc: Document, provider: ProviderAdapter, packet: WebChatPacket, hooks: TurnHooks): Promise<TurnResult> {
  try {
    const composer = await waitForComposer(doc, provider, hooks)
    if (!composer) {
      if (queryFirst(doc, provider.selectors.login)) return { ok: false, code: "signed-out", message: signedOut(provider) }
      return { ok: false, code: "selector-miss", message: selectorMiss(provider, describeCandidates(doc)) }
    }
    let providerForPlan = provider
    let activePacket = packet
    let notice: string | undefined
    if (activePacket.textUrl) {
      const id = recordIdFromPaperTextUrl(activePacket.textUrl)
      const load = hooks.loadTextPage ?? ((url: string) => fetch(url).then(async (response) => ({ status: response.status, body: await response.text() })))
      const chosen = id ? await choosePaperTextUrl(id, load) : (await pageIsLive(activePacket.textUrl, hooks) ? activePacket.textUrl : null)
      if (!chosen) {
        hooks.onProgress?.("The public text page is not available. Sending the paper in the chat instead.")
        const { textUrl: dropped, ...rest } = activePacket
        void dropped
        activePacket = rest
      } else if (chosen !== activePacket.textUrl) {
        hooks.onProgress?.("The static text file is not on the site yet. Using the text service instead.")
        activePacket = { ...activePacket, textUrl: chosen }
      }
    }
    let planned = planDelivery(activePacket, providerForPlan)
    if (planned.warning) hooks.onProgress?.(planned.warning)
    let steps = planned.steps
    let fellBack = false
    let linkFellBack = false
    for (let index = 0; index < steps.length; index += 1) {
      const step = steps[index]
      if (!step) continue
      hooks.onProgress?.(`Sending part ${step.index} of ${step.total} on ${provider.label}. Stay on this tab.`)
      try {
        const reply = await sendStep(doc, provider, step, hooks)
        if (step.link && !linkFellBack && (couldNotReadPaper(reply) || textPageUntrusted(reply))) {
          linkFellBack = true
          notice = TEXT_PAGE_NOTE
          hooks.onProgress?.(`${TEXT_PAGE_NOTE}. Sending the paper in the chat instead.`)
          const { textUrl: dropped, ...rest } = activePacket
          void dropped
          activePacket = rest
          planned = planDelivery(activePacket, providerForPlan)
          steps = planned.steps
          if (planned.warning) hooks.onProgress?.(planned.warning)
          index = -1
          continue
        }
        if (step.final) return { ok: true, text: reply, steps: steps.length, ...(notice ? { notice } : {}) }
      } catch (error) {
        if (error instanceof TurnError && error.code === "upload-miss" && !fellBack) {
          fellBack = true
          hooks.onProgress?.(`${provider.label} did not accept the file. Pasting the paper in parts instead.`)
          providerForPlan = { ...provider, fileUpload: false }
          planned = planDelivery(activePacket, providerForPlan)
          steps = planned.steps
          if (planned.warning) hooks.onProgress?.(planned.warning)
          index = -1
          continue
        }
        throw error
      }
    }
    return { ok: false, code: "empty", message: `${provider.label} finished without a final reply. The tab stays open.` }
  } catch (error) {
    if (error instanceof TurnError) return { ok: false, code: error.code, message: error.message }
    const message = error instanceof Error ? error.message : "The web chat run failed."
    return { ok: false, code: "error", message }
  }
}

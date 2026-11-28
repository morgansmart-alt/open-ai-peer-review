import type { ProviderAdapter } from "../../../extension/adapters/index.ts"
import { planDelivery, type DeliveryStep } from "./deliver.ts"
import {
  choosePaperTextPage,
  couldNotReadPaper,
  fullTextIncludedLine,
  fullTextPanelLine,
  linkReadingPrompt,
  paperForReviewer,
  recordIdFromPaperTextUrl,
  TEXT_PAGE_NOTE,
  textPageHasPaper,
  textPageUntrusted,
  withFullTextUnavailable,
} from "./paperText.ts"
import {
  assistantMessages,
  assistantSnapshot,
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
  requestSubmitButton,
  addedText,
  chooseReplyBlock,
  confirmComposerText,
  foldComposerText,
  liveTurnText,
  messageBlocks,
  replyAfter,
  reasoningActive,
  reviewJsonBlock,
  sendLanded,
  stopControlActive,
  visibleReplyText,
  composerText,
} from "./dom.ts"
import type { WebChatPacket } from "./protocol.ts"

export interface TurnHooks {
  sleep(ms: number): Promise<void>
  aborted(): boolean
  onProgress?(message: string, meta?: { step: string; status: string; detail?: string }): void
  /** The message box has been read back. `actual` is what it holds. */
  onVerified?(info: { label: string; actual: string; pending: string; chunk: string }): void
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
  /** How long an empty reply may last before a clear error and a re-poll. */
  replySilentMs?: number
  /** Probe the public text page. Absent means a normal fetch. */
  loadTextPage?(url: string): Promise<{ status: number; body: string }>
  /** Bring the chat tab forward so a background tab does not freeze the reply wait. */
  keepAwake?(): Promise<void> | void
}

export type TurnResult =
  | { ok: true; text: string; steps: number; route: "link" | "paste"; notice?: string }
  | { ok: false; code: string; message: string }

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

export type ReplyExpect = "json" | "text"

/** A thinking reply can run for many minutes. One step waits this long. */
export const REPLY_TIMEOUT_MS = 10 * 60 * 1000
/** The reply must sit still this long, with no Thinking indicator, before it is read. */
export const REPLY_STABLE_MS = 20_000

/** A reply is ready only after the text has been still for the full gate and the stop control is gone. */
export function replySettled(quietMs: number, stableMs: number, streaming: boolean, hasReply: boolean): boolean {
  return hasReply && !streaming && quietMs >= stableMs
}

function note(hooks: TurnHooks, step: string, status: string, detail: string, diagnostic = ""): void {
  hooks.onProgress?.(detail, { step, status, ...(diagnostic ? { detail: diagnostic } : {}) })
}

function replyDiagnostic(candidate: string, length: number, lastChange: number | null, stableFor = 0, stableMs = 5_000, streaming = false): string {
  const when = lastChange === null ? "none" : `${Math.max(0, Math.round((Date.now() - lastChange) / 1000))}s ago`
  const unchanged = Math.max(0, Math.round(stableFor / 1000))
  const need = Math.max(1, Math.round(stableMs / 1000))
  return `candidate ${candidate || "none"}, ${length} characters, last change ${when}, unchanged ${unchanged}s of ${need}s, stop control ${streaming ? "showing" : "gone"}`
}

function preferredReply(fromSelector: string, selectorName: string, fromRegion: { text: string; candidate: string }, expect: ReplyExpect): { text: string; candidate: string } {
  if (expect === "json") {
    if (reviewJsonBlock(fromRegion.text)) return fromRegion
    if (reviewJsonBlock(fromSelector)) return { text: fromSelector, candidate: selectorName }
    return { text: "", candidate: fromRegion.candidate || selectorName }
  }
  if (fromRegion.text.length >= fromSelector.length && fromRegion.text) return fromRegion
  if (fromSelector) return { text: fromSelector, candidate: selectorName }
  return fromRegion
}

function regionReply(doc: Document, composer: Element, beforeRegion: string, sentPrompt: string, expect: ReplyExpect): { text: string; candidate: string } {
  const block = chooseReplyBlock(messageBlocks(doc, composer), beforeRegion, sentPrompt, expect)
  if (block) return { text: block, candidate: "message-block" }
  const added = addedText(beforeRegion, visibleReplyText(doc, composer))
  if (!added || chooseReplyBlock([added], beforeRegion, sentPrompt, expect) === "") return { text: "", candidate: "" }
  return { text: added, candidate: "conversation-region" }
}

async function focusComposer(el: Element, hooks: TurnHooks): Promise<boolean> {
  const html = el as HTMLElement
  const start = Date.now()
  while (Date.now() - start <= 1_000) {
    if (typeof html.focus === "function") html.focus()
    const active = el.ownerDocument?.activeElement
    if (active === el || (active != null && el.contains(active))) return true
    await hooks.sleep(Math.min(hooks.pollMs ?? 50, 50))
  }
  return false
}

function replyTimeoutReason(reply: string, expect: ReplyExpect): string {
  if (!reply) return "no reply seen"
  if (expect === "json" && !reviewJsonBlock(reply)) return "reply seen, JSON not parsed"
  return "reply seen"
}

async function waitForReply(
  doc: Document,
  provider: ProviderAdapter,
  beforeMessages: string[],
  hooks: TurnHooks,
  composer: Element,
  label = "review",
  expect: ReplyExpect = "json",
  attempt = 1,
  beforeRegion = "",
  sentPrompt = "",
  beforeLive = "",
): Promise<string> {
  note(hooks, label, "waiting", `Waiting for the reply: ${label}.`)
  await hooks.keepAwake?.()
  const pollMs = hooks.pollMs ?? 400
  const stableMs = hooks.stableMs ?? REPLY_STABLE_MS
  const timeoutMs = hooks.stepTimeoutMs ?? REPLY_TIMEOUT_MS
  const silentMs = hooks.replySilentMs ?? REPLY_TIMEOUT_MS
  const startLimit = hooks.replyStartTimeoutMs ?? 20_000
  const start = Date.now()
  let lastReply = ""
  let lastAck = ""
  let ackStable = 0
  let started = false
  let lastChange: number | null = null
  let lastLog = 0
  let selector = ""
  while (Date.now() - start < timeoutMs) {
    if (hooks.aborted()) throw new TurnError("cancelled", "Cancelled. The provider tab stays open.")
    const live = liveTurnText(doc, provider.id, composer)
    const liveFresh = live.text && live.text !== beforeLive ? live.text : ""
    const snapshot = assistantSnapshot(doc, provider.selectors.assistant, composer)
    const fromSelector = replyAfter(beforeMessages, snapshot.texts)
    const fromRegion = regionReply(doc, composer, beforeRegion, sentPrompt, expect)
    const liveKnown = provider.id === "grok" || provider.id === "grok-x"
    const holdForNewTurn = liveKnown && beforeLive.length > 0 && !liveFresh
    const picked = liveFresh
      ? { text: liveFresh, candidate: live.candidate }
      : holdForNewTurn
        ? { text: "", candidate: live.candidate || "assistant-message" }
        : preferredReply(fromSelector, snapshot.selector, fromRegion, expect)
    const reply = picked.text
    selector = picked.candidate
    const json = reviewJsonBlock(reply)
    const ack = ackReply(doc, composer)
    const stopping = stopControlActive(doc, provider.selectors.stop)
    const thinking = reasoningActive(doc)
    const streaming = stopping || thinking
    const sendReady = Boolean(findSubmit(doc, provider.selectors.submit, composer))
    if (reply || ack) started = true
    const changed = reply !== lastReply
    if (changed) lastReply = reply
    if (changed || streaming || lastChange === null) lastChange = Date.now()
    const quietFor = Date.now() - lastChange
    const diagnostic = `${replyDiagnostic(selector, reply.length, changed ? Date.now() : lastChange, changed || streaming ? 0 : quietFor, stableMs, stopping)}${thinking ? ", thinking" : ""}`
    if (changed || Date.now() - lastLog >= 3_000) {
      note(hooks, label, reply ? "reading" : "waiting", `Waiting for the reply: ${label}.`, diagnostic)
      lastLog = Date.now()
    }
    if (expect === "text" && ack && !reply && !streaming) {
      if (ack === lastAck && ackStable >= stableMs) return ack
      if (ack !== lastAck) {
        lastAck = ack
        ackStable = 0
      } else ackStable += pollMs
    } else if (!ack) {
      lastAck = ""
      ackStable = 0
    }
    if (!started && !streaming && Date.now() - start >= startLimit) {
      if (sendReady) {
        throw new TurnError(
          "send-timeout",
          `Send step on ${provider.label} did not start a reply. The Send button was still enabled. ${diagnostic}. ${stepDiagnostic(doc)}`,
        )
      }
    }
    const settled = replySettled(quietFor, stableMs, streaming, Boolean(reply) && !changed)
    if (settled) {
      if (expect === "text") return reply
      if (liveFresh.trim()) return liveFresh
      return json || reply
    }
    if (!reply && !streaming && Date.now() - start >= silentMs) {
      const empty = replyDiagnostic(selector, 0, null, 0, stableMs, streaming)
      if (attempt < 2) {
        note(hooks, label, "waiting", `Still waiting for a stable reply: ${label}. ${empty}`, empty)
        await hooks.keepAwake?.()
        return waitForReply(doc, provider, beforeMessages, hooks, composer, label, expect, attempt + 1, beforeRegion, sentPrompt, beforeLive)
      }
      throw new TurnError("timeout", `Reply step (${label}) on ${provider.label} timed out with no reply. ${empty}.`)
    }
    await hooks.sleep(pollMs)
  }
  const snapshot = assistantSnapshot(doc, provider.selectors.assistant, composer)
  const fromSelector = replyAfter(beforeMessages, snapshot.texts)
  const fromRegion = regionReply(doc, composer, beforeRegion, sentPrompt, expect)
  const picked = preferredReply(fromSelector, snapshot.selector, fromRegion, expect)
  const reply = picked.text
  const seen = fromSelector || fromRegion.text || reply
  const diagnostic = replyDiagnostic(picked.candidate || (fromSelector ? snapshot.selector : ""), reply.length || seen.length, lastChange)
  if (attempt < 2) {
    note(hooks, label, "waiting", `Still waiting for a stable reply: ${label}. ${diagnostic}`, diagnostic)
    await hooks.keepAwake?.()
    return waitForReply(doc, provider, beforeMessages, hooks, composer, label, expect, attempt + 1, beforeRegion, sentPrompt, beforeLive)
  }
  throw new TurnError("timeout", `Reply step (${label}) on ${provider.label} did not finish. ${diagnostic}. ${replyTimeoutReason(seen, expect)}.`)
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

async function sendComposerText(
  doc: Document,
  provider: ProviderAdapter,
  composer: Element,
  text: string,
  hooks: TurnHooks,
  label: string,
  expect: ReplyExpect,
): Promise<string> {
  let pending = text
  let part = 1
  while (pending.length > 0) {
    const focused = await focusComposer(composer, hooks)
    note(hooks, label, focused ? "ready" : "waiting", focused ? `Composer focused. Inserting ${pending.length} characters.` : `Composer was not focused. Inserting ${pending.length} characters and re-reading the box.`)
    const placed = await confirmComposerText(composer, pending, { sleep: (ms) => hooks.sleep(ms), pollMs: Math.min(hooks.pollMs ?? 50, 50), timeoutMs: 2_000 })
    const verified = `Insert method ${placed.method}. Box holds ${placed.actual.length} raw, ${foldComposerText(placed.actual).length} normalised. Message has ${pending.length} raw, ${foldComposerText(pending).length} normalised.`
    note(hooks, label, placed.ok ? "verified" : "error", verified, verified)
    if (placed.ok) hooks.onVerified?.({ label, actual: placed.actual, pending, chunk: placed.chunk })
    if (!placed.ok) {
      throw new TurnError(
        "insert-miss",
        `The message box on ${provider.label} did not hold the message for ${label}. The box has ${placed.actual.length} characters and the message has ${pending.length}.`,
      )
    }
    const chunk = placed.chunk
    const rest = pending.slice(chunk.length).trim()
    const beforeMessages = assistantMessages(doc, provider.selectors.assistant, composer)
    const beforeRegion = visibleReplyText(doc, composer)
    const beforeLive = liveTurnText(doc, provider.id, composer).text
    const beforeAssistant = beforeMessages[beforeMessages.length - 1] ?? ""
    note(hooks, label, "sending", `Sending ${label}${rest ? ` part ${part}` : ""} on ${provider.label}. ${chunk.length} characters verified in the message box.`)
    const method = await commitSend(doc, provider, composer, beforeAssistant, hooks)
    note(hooks, label, "sent", `Send step on ${provider.label}. Method that sent: ${method}.`)
    if (!rest) return waitForReply(doc, provider, beforeMessages, hooks, composer, label, expect, 1, beforeRegion, chunk, beforeLive)
    part += 1
    pending = rest
    await waitForReply(doc, provider, beforeMessages, hooks, composer, `${label} part ${part - 1}`, "text", 1, beforeRegion, chunk, beforeLive)
  }
  throw new TurnError("insert-miss", `The message for ${label} was empty.`)
}

async function sendStep(doc: Document, provider: ProviderAdapter, step: DeliveryStep, hooks: TurnHooks, label = "review", expect: ReplyExpect = "json"): Promise<string> {
  if (step.kind === "upload") {
    note(hooks, label, "sending", `Attachment step on ${provider.label}. Waiting for the file chip, or for Send to become enabled.`)
    const input = queryFirst(doc, provider.selectors.fileInput)
    const attached = input ? attachTextFiles(input, step.files) : false
    if (!attached) throw new TurnError("upload-miss", "file upload was not accepted")
    await waitForAttachment(doc, provider, step.files, hooks)
  }
  const composer = findComposer(doc, provider.selectors.composer)
  if (!composer) throw new TurnError("selector-miss", selectorMiss(provider, describeCandidates(doc)))
  return sendComposerText(doc, provider, composer, step.text, hooks, label, step.final ? expect : "text")
}

/** One more message in the chat that is already open. A defence reply completes on stable text. A score completes on JSON. */
export async function sendFollowUp(
  doc: Document,
  provider: ProviderAdapter,
  text: string,
  hooks: TurnHooks,
  label = "follow-up",
  expect: ReplyExpect = "json",
): Promise<string> {
  const step: DeliveryStep = { kind: "paste", text, files: [], index: 1, total: 1, final: true }
  return sendStep(doc, provider, step, hooks, label, expect)
}

function clipPaper(paper: string, pasteLimit: number): string {
  const room = Math.max(2000, pasteLimit - 8000)
  if (paper.length <= room) return paper
  return `${paper.slice(0, room).trimEnd()}\n\n[AIR truncated this file.]`
}

async function loadedPage(
  url: string,
  load: (url: string) => Promise<{ status: number; body: string }>,
): Promise<{ url: string; body: string; unavailable: boolean } | null> {
  try {
    const loaded = await load(url)
    if (!textPageHasPaper(loaded.status, loaded.body)) return null
    return { url, body: loaded.body, unavailable: fullTextPanelLine(loaded.body) === "Full text unavailable" }
  } catch {
    return null
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
    let fullTextMissing = false
    let fetchedPaper = ""
    if (activePacket.textUrl) {
      const id = recordIdFromPaperTextUrl(activePacket.textUrl)
      const load = hooks.loadTextPage ?? ((url: string) => fetch(url).then(async (response) => ({ status: response.status, body: await response.text() })))
      const page = id ? await choosePaperTextPage(id, load) : await loadedPage(activePacket.textUrl, load)
      if (!page) {
        hooks.onProgress?.("The public text page is not available. Sending the paper in the chat instead.")
        const { textUrl: dropped, ...rest } = activePacket
        void dropped
        activePacket = rest
      } else {
        if (page.url !== activePacket.textUrl) {
          hooks.onProgress?.(
            page.url.includes("/functions/v1/paper-text")
              ? "Using the paper-text service so the review includes the PDF."
              : "The paper-text service is not available. Using the static text file.",
          )
        }
        activePacket = { ...activePacket, textUrl: page.url }
        fullTextMissing = page.unavailable
        fetchedPaper = page.body
      }
    }
    const reportSent = (info: { label: string; actual: string; pending: string; chunk: string }) => {
      if (info.label !== "public text link" || !fetchedPaper || fullTextMissing) return
      const sourceFold = foldComposerText(paperForReviewer(fetchedPaper))
      const sentFold = foldComposerText(info.chunk)
      const capped = sourceFold.length > 0 && !sentFold.includes(sourceFold)
      notice = fullTextIncludedLine(fetchedPaper.length, foldComposerText(info.actual).length, capped)
      hooks.onProgress?.(notice)
    }
    const sendingHooks = { ...hooks, onVerified: reportSent }
    let planned = planDelivery(activePacket, providerForPlan)
    if (planned.warning) hooks.onProgress?.(planned.warning)
    let steps = planned.steps
    if (fetchedPaper) {
      const line = fullTextPanelLine(fetchedPaper)
      notice = line
      hooks.onProgress?.(line)
      const copied = fullTextMissing ? "" : clipPaper(paperForReviewer(fetchedPaper), provider.pasteLimit)
      steps = steps.map((step) => {
        if (!step.link || !activePacket.textUrl) return step
        const prompt = linkReadingPrompt(activePacket.textUrl, activePacket.instructions, copied)
        return { ...step, text: fullTextMissing ? withFullTextUnavailable(prompt) : prompt }
      })
    }
    let fellBack = false
    let linkFellBack = false
    let route: "link" | "paste" = activePacket.textUrl ? "link" : "paste"
    note(hooks, "Review route", route, route === "link" ? `Review route: public text link. ${activePacket.textUrl}` : "Review route: pasted paper.")
    for (let index = 0; index < steps.length; index += 1) {
      const step = steps[index]
      if (!step) continue
      const label = step.link ? "public text link" : `part ${step.index} of ${step.total}`
      hooks.onProgress?.(`Sending part ${step.index} of ${step.total} on ${provider.label}. Stay on this tab.`)
      try {
        const reply = await sendStep(doc, provider, step, sendingHooks, label)
        if (step.link && !linkFellBack && (couldNotReadPaper(reply) || textPageUntrusted(reply))) {
          linkFellBack = true
          route = "paste"
          notice = TEXT_PAGE_NOTE
          hooks.onProgress?.(`${TEXT_PAGE_NOTE}. Review route: pasted paper.`)
          const { textUrl: dropped, ...rest } = activePacket
          void dropped
          activePacket = rest
          planned = planDelivery(activePacket, providerForPlan)
          steps = planned.steps
          if (planned.warning) hooks.onProgress?.(planned.warning)
          index = -1
          continue
        }
        if (step.final) return { ok: true, text: reply, steps: steps.length, route, ...(notice ? { notice } : {}) }
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

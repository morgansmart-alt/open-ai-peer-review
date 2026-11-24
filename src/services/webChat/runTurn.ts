import type { ProviderAdapter } from "../../../extension/adapters/index.ts"
import { planDelivery, type DeliveryStep } from "./deliver.ts"
import { assistantText, attachTextFiles, attachmentReady, ATTACHMENT_SELECTORS, clickElement, diagnose, isActiveStop, queryFirst, writeComposer } from "./dom.ts"
import type { WebChatPacket } from "./protocol.ts"

export interface TurnHooks {
  sleep(ms: number): Promise<void>
  aborted(): boolean
  onProgress?(message: string): void
  pollMs?: number
  stableMs?: number
  stepTimeoutMs?: number
  /** How long to wait for the chat to show the file as attached. */
  attachmentTimeoutMs?: number
}

export type TurnResult = { ok: true; text: string; steps: number } | { ok: false; code: string; message: string }

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

function selectorMiss(provider: ProviderAdapter): string {
  return `AIR could not find the message box on ${provider.label}. The page may still be loading, or the site changed its layout. Reload the tab and run again. The selectors for this site are in extension/adapters/${provider.id}.ts.`
}

async function waitForReply(doc: Document, provider: ProviderAdapter, before: string, hooks: TurnHooks): Promise<string> {
  const pollMs = hooks.pollMs ?? 400
  const stableMs = hooks.stableMs ?? 2000
  const timeoutMs = hooks.stepTimeoutMs ?? 4 * 60 * 1000
  const start = Date.now()
  let last = before
  let stableFor = 0
  while (Date.now() - start < timeoutMs) {
    if (hooks.aborted()) throw new TurnError("cancelled", "Cancelled. The provider tab stays open.")
    const text = assistantText(doc, provider.selectors.assistant)
    const stopping = provider.selectors.stop.some((selector) => {
      try {
        const found = queryFirst(doc, [selector])
        return Boolean(found && isActiveStop(found))
      } catch {
        return false
      }
    })
    if (text && text !== before && text === last && !stopping && stableFor >= stableMs) return text
    if (text !== last) {
      last = text
      stableFor = 0
    } else {
      stableFor += pollMs
    }
    await hooks.sleep(pollMs)
  }
  throw new TurnError("timeout", `${provider.label} did not finish a reply in time. The tab stays open so you can read what is there.`)
}

async function waitForAttachment(doc: Document, provider: ProviderAdapter, files: DeliveryStep["files"], hooks: TurnHooks): Promise<void> {
  const timeoutMs = hooks.attachmentTimeoutMs ?? 20_000
  const pollMs = hooks.pollMs ?? 200
  const selectors = provider.selectors.attachment?.length ? provider.selectors.attachment : ATTACHMENT_SELECTORS
  const start = Date.now()
  while (Date.now() - start <= timeoutMs) {
    if (hooks.aborted()) throw new TurnError("cancelled", "Cancelled. The provider tab stays open.")
    if (attachmentReady(doc, files, selectors)) return
    await hooks.sleep(pollMs)
  }
  throw new TurnError(
    "upload-timeout",
    `${provider.label} did not finish accepting the file. The attachment never showed as ready. Wait until the file chip appears, then run again.`,
  )
}

async function sendStep(doc: Document, provider: ProviderAdapter, step: DeliveryStep, hooks: TurnHooks): Promise<string> {
  if (step.kind === "upload") {
    const input = queryFirst(doc, provider.selectors.fileInput)
    const attached = input ? attachTextFiles(input, step.files) : false
    if (!attached) throw new TurnError("upload-miss", "file upload was not accepted")
    await waitForAttachment(doc, provider, step.files, hooks)
  }
  const composer = queryFirst(doc, provider.selectors.composer)
  if (!composer) throw new TurnError("selector-miss", selectorMiss(provider))
  const before = assistantText(doc, provider.selectors.assistant)
  writeComposer(composer, step.text)
  const submit = queryFirst(doc, provider.selectors.submit)
  if (!submit) throw new TurnError("selector-miss", `AIR could not find the send button on ${provider.label}. The site's page may have changed.`)
  const clicked = clickElement(submit)
  if (!clicked) throw new TurnError("double-click", `Send on ${provider.label} was already clicked for this message. AIR did not click again, so a Stop button is not pressed.`)
  return waitForReply(doc, provider, before, hooks)
}

/** One more message in the chat that is already open. Waits until streaming stops. */
export async function sendFollowUp(doc: Document, provider: ProviderAdapter, text: string, hooks: TurnHooks): Promise<string> {
  const step: DeliveryStep = { kind: "paste", text, files: [], index: 1, total: 1, final: true }
  return sendStep(doc, provider, step, hooks)
}

export async function runTurn(doc: Document, provider: ProviderAdapter, packet: WebChatPacket, hooks: TurnHooks): Promise<TurnResult> {
  try {
    const state = diagnose(doc, provider)
    if (state === "signed-out") return { ok: false, code: "signed-out", message: signedOut(provider) }
    if (state === "selector-miss") return { ok: false, code: "selector-miss", message: selectorMiss(provider) }
    let providerForPlan = provider
    let planned = planDelivery(packet, providerForPlan)
    if (planned.warning) hooks.onProgress?.(planned.warning)
    let steps = planned.steps
    let fellBack = false
    for (let index = 0; index < steps.length; index += 1) {
      const step = steps[index]
      if (!step) continue
      hooks.onProgress?.(`Sending part ${step.index} of ${step.total} on ${provider.label}. Stay on this tab.`)
      try {
        const reply = await sendStep(doc, provider, step, hooks)
        if (step.final) return { ok: true, text: reply, steps: steps.length }
      } catch (error) {
        if (error instanceof TurnError && error.code === "upload-miss" && !fellBack) {
          fellBack = true
          hooks.onProgress?.(`${provider.label} did not accept the file. Pasting the paper in parts instead.`)
          providerForPlan = { ...provider, fileUpload: false }
          planned = planDelivery(packet, providerForPlan)
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

import { webChatProvider } from "./adapters/index.ts"
import { officialCriteria } from "../src/domain/officialCriteria.ts"
import { readingCriteria } from "../src/domain/profiles.ts"
import { acceptWebChatResult } from "../src/services/webChat/accept.ts"
import { webChatModelId } from "../src/services/webChat/chatModel.ts"
import { WEB_CHAT_PDF_PAGES } from "../src/services/webChat/packet.ts"
import { EXTENSION_SOURCE, PAGE_SOURCE, PROTOCOL_VERSION } from "../src/services/webChat/protocol.ts"
import { renderReviewApp, type ReviewModel, type StepLogEntry } from "../src/services/webChat/reviewView.ts"
import { defendedFromReply } from "../src/services/webChat/defence.ts"
import { resolvePublication, type PublicationPreview } from "../src/services/webChat/publication.ts"
import { submissionFromReview } from "../src/services/webChat/submission.ts"
import { postWebChatSubmission } from "../src/services/webChat/submit.ts"
import {
  appendResult,
  exportBundle,
  ONBOARD_STORAGE_KEY,
  packetForLocalPaper,
  RESULT_STORAGE_KEY,
  resultCard,
  storedLocalReview,
  textFromPdfDocument,
  type PdfTextSource,
} from "../src/services/webChat/standalone.ts"
import { uid } from "../src/services/hash.ts"
import type { StoredReview } from "../src/domain/types.ts"

const root = document.querySelector("#app")
if (!root || !(root instanceof HTMLElement)) throw new Error("Missing panel root")

let providerId = "grok"
let profileId = "device"
let file: File | null = null
let link = ""
let publication: PublicationPreview | null = null
let defend = true
let defenceRounds = 2
let selected = new Set<string>()
let showOnboarding = true
let status = ""
let error = ""
let busy = false
let stepLog: StepLogEntry[] = []
let reviews: StoredReview[] = []
let requestId = ""
let pendingPaper: { filename: string; text: string; note?: string } | null = null

function rememberStep(step: string, stepStatus: string, detail = ""): StepLogEntry[] {
  const at = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
  return [...stepLog, { at, step, status: stepStatus, ...(detail ? { detail } : {}) }].slice(-40)
}

function storageGet(key: string): Promise<unknown> {
  return new Promise((resolve) => {
    chrome.storage.local.get(key, (data) => resolve(data?.[key]))
  })
}

function storageSet(key: string, value: unknown): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [key]: value }, () => resolve())
  })
}

function historyItem(review: StoredReview) {
  const card = resultCard(review)
  return {
    id: review.id,
    title: review.title,
    overall: card.overall,
    doi: review.doi === "local-file" ? "" : review.doi,
    url: review.paperUrl,
    site: review.modelId,
    model: review.modelId,
    createdAt: review.createdAt,
    mismatch: Boolean(card.mismatch),
    selected: selected.has(review.id),
  }
}

function paint(): void {
  const typing = document.activeElement instanceof HTMLInputElement && document.activeElement.id === "publication-link"
  const draft = typing ? document.activeElement.value : null
  const caret = typing ? document.activeElement.selectionStart : null
  const latest = reviews[0]
  renderReviewApp(
    root as HTMLElement,
    {
      showOnboarding,
      providerId,
      profileId,
      fileName: file?.name ?? "",
      link,
      publication: publication ? { title: publication.title, authors: publication.authors, doi: publication.doi, url: publication.url } : null,
      defend,
      defenceRounds,
      status,
      error,
      busy,
      stepLog,
      result: latest ? resultCard(latest) : null,
      history: reviews.map(historyItem),
    } satisfies ReviewModel,
    {
      onDismissOnboarding() {
        showOnboarding = false
        void storageSet(ONBOARD_STORAGE_KEY, true)
        paint()
      },
      onProvider(id) {
        providerId = id
        paint()
      },
      onProfile(id) {
        profileId = id
        paint()
      },
      onFile(next) {
        file = next
        error = ""
        paint()
      },
      onLink(value) {
        link = value
        publication = null
      },
      onLookup() {
        void lookup()
      },
      onDefend(on) {
        defend = on
        paint()
      },
      onRounds(rounds) {
        defenceRounds = Math.min(3, Math.max(1, rounds))
        paint()
      },
      onStop() {
        busy = false
        error = ""
        status = "Stopped. The chat tab stays open."
        stepLog = rememberStep("Stop", "idle")
        paint()
        void send({ type: "air-web-chat-cancel", requestId })
      },
      onReview() {
        void run()
      },
      onExport() {
        const blob = new Blob([exportBundle(reviews)], { type: "application/json" })
        const url = URL.createObjectURL(blob)
        const anchor = document.createElement("a")
        anchor.href = url
        anchor.download = "air-web-chat.json"
        anchor.click()
        URL.revokeObjectURL(url)
      },
      onToggle(id) {
        if (selected.has(id)) selected.delete(id)
        else selected.add(id)
        paint()
      },
      onSend(id) {
        void sendScores([id])
      },
      onSendSelected() {
        void sendScores([...selected])
      },
    },
  )
  if (draft !== null) {
    const field = document.getElementById("publication-link")
    if (field instanceof HTMLInputElement) {
      field.value = draft
      field.focus()
      if (caret !== null) field.setSelectionRange(caret, caret)
    }
  }
}

async function readPaper(next: File): Promise<{ filename: string; text: string; note?: string }> {
  const filename = next.name || "paper.txt"
  if (/\.pdf$/i.test(filename) || next.type === "application/pdf") {
    return readPdfBytes(filename, await next.arrayBuffer())
  }
  if (!/\.(txt|md|markdown|text)$/i.test(filename) && next.type && !next.type.startsWith("text/")) {
    throw new Error("Choose a PDF or a text file.")
  }
  return { filename, text: await next.text() }
}

function send(message: Record<string, unknown>): Promise<{ ok?: boolean; message?: string }> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ source: PAGE_SOURCE, version: PROTOCOL_VERSION, ...message }, (response) => {
      const failed = chrome.runtime.lastError?.message
      if (failed) resolve({ ok: false, message: "The extension did not answer. Reload it from chrome://extensions." })
      else resolve((response as { ok?: boolean; message?: string }) ?? { ok: false, message: "The extension did not answer." })
    })
  })
}

async function lookup(): Promise<void> {
  if (!link.trim() || busy) return
  busy = true
  error = ""
  status = "Looking up that publication…"
  paint()
  try {
    publication = await resolvePublication(link.trim(), (url, init) => fetch(url, init))
    status = "Check the title and authors, then click Review my paper."
    error = ""
  } catch (caught) {
    publication = null
    error = caught instanceof Error ? caught.message : "That link could not be read."
    status = ""
  } finally {
    busy = false
    paint()
  }
}

async function paperFromPublication(preview: PublicationPreview): Promise<{ filename: string; text: string; note?: string }> {
  const response = await fetch(preview.pdfUrl)
  if (!response.ok) throw new Error("The paper file could not be downloaded. You can save the PDF and choose the file instead.")
  const type = response.headers.get("content-type") || ""
  if (/\.pdf$/i.test(preview.filename) || type.includes("pdf")) {
    const bytes = await response.arrayBuffer()
    return readPdfBytes(preview.filename, bytes)
  }
  return { filename: preview.filename, text: await response.text() }
}

async function readPdfBytes(filename: string, bytes: ArrayBuffer): Promise<{ filename: string; text: string; note?: string }> {
  const pdfjs = (await import(chrome.runtime.getURL("vendor/pdf.min.mjs"))) as {
    GlobalWorkerOptions: { workerSrc: string }
    getDocument(src: { data: Uint8Array }): { promise: Promise<PdfTextSource> }
  }
  pdfjs.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL("vendor/pdf.worker.min.mjs")
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(bytes) }).promise
  const extracted = await textFromPdfDocument(pdf, WEB_CHAT_PDF_PAGES)
  return { filename, text: extracted.text, note: extracted.note }
}

async function run(): Promise<void> {
  if (busy) return
  if (!file && !publication) return
  const provider = webChatProvider(providerId)
  if (!provider) return
  busy = true
  error = ""
  stepLog = []
  status = "Reading the paper…"
  stepLog = rememberStep("Review", "reading")
  paint()
  try {
    const paper = file ? await readPaper(file) : await paperFromPublication(publication as PublicationPreview)
    if (!paper.text.trim()) {
      throw new Error(paper.note || "That file has no text to review. A scanned PDF needs a text file instead.")
    }
    pendingPaper = paper
    requestId = uid("web")
    const packet = packetForLocalPaper({
      requestId,
      providerId,
      criteria: officialCriteria,
      criterionProfile: profileId,
      filename: paper.filename,
      text: paper.text,
      source: publication?.source ?? null,
    })
    status = paper.note ? `${paper.note} Opening ${provider.label}. Stay on that tab.` : `Opening ${provider.label}. Stay on that tab.`
    paint()
    const started = await send({ type: "air-web-chat-request", requestId, packet, defenceRounds: defend ? defenceRounds : 0 })
    if (started.ok === false) throw new Error(started.message || "The review did not start.")
  } catch (caught) {
    busy = false
    status = ""
    error = caught instanceof Error ? caught.message : "The review did not start."
    paint()
  }
}

chrome.runtime.onMessage.addListener((message: { source?: string; type?: string; requestId?: string; text?: string; message?: string; step?: string; status?: string; detail?: string; defendedText?: string | null; transcript?: { round: number; kind: string; text: string }[]; stopped?: boolean; chatModel?: string; notice?: string }) => {
  if (!message || message.source !== EXTENSION_SOURCE || message.requestId !== requestId) return
  if (message.type === "air-web-chat-progress" && message.message) {
    if (!busy) return
    stepLog = rememberStep(message.step || "Review", message.status || "update", message.detail || "")
    status = message.message
    paint()
    return
  }
  if (message.type === "air-web-chat-error") {
    busy = false
    const stopped = typeof message.message === "string" && message.message.startsWith("Stopped.")
    if (stopped) {
      error = ""
      status = message.message || "Stopped. The chat tab stays open."
      stepLog = rememberStep("Stop", "idle")
    } else {
      status = ""
      error = message.message || "The chat did not finish."
    }
    paint()
    return
  }
  if (message.type === "air-web-chat-result") {
    void finish(message.text ?? "", message.defendedText ?? null, message.transcript ?? [], Boolean(message.stopped), message.chatModel, message.notice)
  }
})

async function finish(raw: string, defendedRaw: string | null, transcript: { round: number; kind: string; text: string }[], stopped: boolean, chatModel?: string, notice?: string): Promise<void> {
  const accepted = acceptWebChatResult(raw, readingCriteria(officialCriteria, profileId, false))
  if (!accepted.ok) {
    busy = false
    status = ""
    error = `The chat replied, but it was not a score AIR can keep. ${accepted.errors.slice(0, 2).join(" ")}`
    paint()
    return
  }
  const defended = defendedRaw ? defendedFromReply(defendedRaw) : null
  const stored = await storedLocalReview({
    providerId,
    criteria: officialCriteria,
    filename: pendingPaper?.filename || file?.name || publication?.filename || "paper",
    report: accepted.report,
    criterionProfile: profileId,
    publication: publication
      ? { title: publication.title, doi: publication.doi, url: publication.url, authors: publication.authors }
      : undefined,
  })
  stored.defenceTranscript = transcript
  if (defended?.ok) stored.defended = defended.defended
  const provider = webChatProvider(providerId)
  stored.modelId = webChatModelId(provider?.modelLabel ?? providerId, chatModel)
  const failure = notice?.includes("Defence step failed:") ? notice.slice(notice.indexOf("Defence step failed:")) : ""
  if (notice?.trim()) stored.sourceNote = notice.trim()
  reviews = appendResult(reviews, stored)
  await storageSet(RESULT_STORAGE_KEY, reviews)
  busy = false
  status = failure
    ? failure
    : stopped
      ? "Stopped. The blind score is kept. The chat tab stays open."
      : defended?.ok
        ? "Done. The blind score and the score after author defence are below."
        : "Done. The blind score is below."
  error = ""
  paint()
}

async function sendScores(ids: string[]): Promise<void> {
  const chosen = reviews.filter((review) => ids.includes(review.id))
  if (chosen.length === 0) return
  busy = true
  error = ""
  status = "Sending the selected scores…"
  paint()
  const notes: string[] = []
  for (const review of chosen) {
    const built = submissionFromReview(review, review.modelId)
    if (!built.ok) {
      notes.push(`${review.title}: ${built.error}`)
      continue
    }
    try {
      const response = await postWebChatSubmission(built.submission)
      if (response.status === 404 || response.status === 405) {
        notes.push("The leaderboard is not accepting web-chat scores yet. The submission service still has to be deployed. Your score stays on this browser.")
        break
      }
      if (!response.ok) notes.push(response.error || `The board returned ${response.status}.`)
      else notes.push(response.duplicate ? `${review.title} was already on the board.` : `${review.title} was sent. It is labelled uncalibrated web-chat.`)
    } catch {
      notes.push("The browser could not reach the leaderboard. Your score stays on this browser.")
      break
    }
  }
  busy = false
  status = notes.join(" ")
  error = ""
  paint()
}

function restoreSaved(): Promise<void> {
  return storageGet(ONBOARD_STORAGE_KEY).then((seen) => {
    showOnboarding = seen !== true
    return storageGet(RESULT_STORAGE_KEY)
  }).then((saved) => {
    reviews = Array.isArray(saved) ? (saved as StoredReview[]) : []
    paint()
  })
}

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") void restoreSaved()
})

void restoreSaved()

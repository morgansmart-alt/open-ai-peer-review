import type { ProviderAdapter } from "../../../extension/adapters/index.ts"
import { linkReadingPrompt } from "./paperText.ts"
import type { WebChatFile, WebChatPacket } from "./protocol.ts"

export interface DeliveryStep {
  kind: "upload" | "paste"
  text: string
  files: WebChatFile[]
  index: number
  total: number
  final: boolean
  /** A short message that asks the chat to open the public text page. */
  link?: boolean
}

export interface DeliveryPlan {
  steps: DeliveryStep[]
  warning: string | null
}

/** Split on a paragraph or sentence when one is near the cut, and keep every character of content. */
export function splitText(text: string, size: number): string[] {
  const clean = text.replace(/\r\n/g, "\n")
  if (!clean.trim()) return []
  const limit = Math.max(500, size)
  if (clean.length <= limit) return [clean]
  const parts: string[] = []
  let cursor = 0
  while (cursor < clean.length) {
    let end = Math.min(clean.length, cursor + limit)
    if (end < clean.length) {
      const paragraph = clean.lastIndexOf("\n\n", end)
      const sentence = clean.lastIndexOf(". ", end)
      const splitAt = paragraph > cursor + limit * 0.5 ? paragraph : sentence > cursor + limit * 0.5 ? sentence + 1 : end
      end = Math.max(cursor + 1, splitAt)
    }
    const piece = clean.slice(cursor, end).trim()
    if (piece) parts.push(piece)
    cursor = end
  }
  return parts
}

export function paperBody(files: WebChatFile[]): string {
  return files.map((file) => `## ${file.filename}\n${file.text}`).join("\n\n")
}

function numberSteps(steps: DeliveryStep[]): DeliveryStep[] {
  const total = steps.length
  return steps.map((step, index) => ({ ...step, index: index + 1, total }))
}

function paperPart(index: number, total: number, chunk: string): string {
  return [
    `AIR PAPER PART ${index} of ${total}.`,
    "Read this part and remember it.",
    `Reply with exactly: RECEIVED ${index}`,
    "Do not review yet.",
    "",
    chunk,
  ].join("\n")
}

const PAPER_HEADER = 220

/** Public record lines already written into the review instructions. */
export function sourceBanner(instructions: string): string {
  return instructions
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^(Source record\b|This version:|DOI:|Concept record\b|Concept DOI:)/.test(line))
    .join("\n")
}

function withBanner(banner: string, text: string): string {
  if (!banner.trim()) return text
  if (text.includes("This version:") || text.includes("DOI: https://doi.org/")) return text
  return `${banner}\n\n${text}`
}

function stamp(banner: string, text: string, limit: number): string {
  const next = withBanner(banner, text)
  return next.length <= limit ? next : text
}

function stampSteps(steps: DeliveryStep[], banner: string, limit: number): DeliveryStep[] {
  return steps.map((step) => ({ ...step, text: stamp(banner, step.text, limit) }))
}

function instructionSteps(text: string, pasteLimit: number, banner: string): DeliveryStep[] {
  const room = Math.max(500, pasteLimit - (banner.length > 0 ? banner.length + 2 : 0))
  if (text.length <= pasteLimit) {
    return [{ kind: "paste", text, files: [], index: 1, total: 1, final: true }]
  }
  const parts = splitText(text, Math.max(500, room - PAPER_HEADER))
  return parts.map((part, index) => {
    const final = index === parts.length - 1
    return {
      kind: "paste" as const,
      text: final
        ? part
        : [`AIR INSTRUCTIONS PART ${index + 1} of ${parts.length}.`, "Remember this.", `Reply with exactly: RECEIVED INSTRUCTIONS ${index + 1}`, "Do not review yet.", "", part].join("\n"),
      files: [],
      index: index + 1,
      total: parts.length,
      final,
    }
  })
}

function filePieces(files: WebChatFile[], fileCharLimit: number): WebChatFile[] {
  const pieces: WebChatFile[] = []
  for (const file of files) {
    if (file.text.length <= fileCharLimit) {
      pieces.push(file)
      continue
    }
    const parts = splitText(file.text, fileCharLimit)
    parts.forEach((part, index) => {
      const base = file.filename.replace(/[^\w.\- ]+/g, "_").slice(0, 60) || "paper"
      pieces.push({ filename: `${base}.part${index + 1}.txt`, text: part })
    })
  }
  return pieces
}

function fileBatches(files: WebChatFile[], fileCharLimit: number, maxFiles: number): WebChatFile[][] {
  const pieces = filePieces(files, fileCharLimit)
  const batches: WebChatFile[][] = []
  let current: WebChatFile[] = []
  let size = 0
  for (const piece of pieces) {
    const overflow = current.length > 0 && (current.length >= maxFiles || size + piece.text.length > fileCharLimit)
    if (overflow) {
      batches.push(current)
      current = []
      size = 0
    }
    current.push(piece)
    size += piece.text.length
  }
  if (current.length) batches.push(current)
  return batches
}

function uploadNote(index: number, total: number): string {
  return [`AIR PAPER FILES ${index} of ${total} are attached.`, "Read the attached files and remember them.", `Reply with exactly: RECEIVED FILES ${index}`, "Do not review yet."].join("\n")
}

/**
 * Prefer one file upload plus the criteria prompt.
 * Fall back to several uploads, then to pasted parts that still contain the whole paper.
 */
export function planDelivery(packet: WebChatPacket, provider: ProviderAdapter): DeliveryPlan {
  const files = packet.files.filter((file) => file.text.trim())
  const finalText = [packet.system, packet.instructions].filter(Boolean).join("\n\n")
  const closing = files.length
    ? `${finalText}\n\nThe paper is in the attached files or in the earlier messages labelled AIR PAPER. Score that text. Return one JSON object and nothing else.`
    : finalText
  const banner = sourceBanner(packet.instructions)
  const paper = paperBody(files)
  const combined = [paper, closing].filter(Boolean).join("\n\n")
  const canUpload = provider.fileUpload && provider.fileCharLimit > 0 && provider.maxFiles > 0 && files.length > 0

  if (packet.textUrl) {
    return {
      steps: [
        {
          kind: "paste",
          text: linkReadingPrompt(packet.textUrl, packet.system, packet.instructions),
          files: [],
          index: 1,
          total: 1,
          final: true,
          link: true,
        },
      ],
      warning: null,
    }
  }

  if (provider.id === "grok-x" && combined.length > 0 && combined.length <= provider.pasteLimit) {
    return {
      steps: [{ kind: "paste", text: combined, files: [], index: 1, total: 1, final: true }],
      warning: warn(provider, 1, files),
    }
  }

  if (canUpload) {
    const batches = fileBatches(files, provider.fileCharLimit, provider.maxFiles)
    const instructionsFit = closing.length <= provider.pasteLimit
    const steps: DeliveryStep[] = []
    batches.forEach((batch, index) => {
      const lastBatch = index === batches.length - 1
      if (lastBatch && instructionsFit) {
        steps.push({ kind: "upload", text: closing, files: batch, index: 1, total: 1, final: true })
        return
      }
      steps.push({
        kind: "upload",
        text: uploadNote(index + 1, batches.length),
        files: batch,
        index: 1,
        total: 1,
        final: false,
      })
    })
    if (!instructionsFit || steps.every((step) => !step.final)) {
      steps.push(...instructionSteps(closing, provider.pasteLimit, banner).map((step) => ({ ...step, final: step.final })))
      // instructionSteps marks its own last item final; earlier upload steps stay non-final.
      // If instructionSteps produced a final and uploads also marked one final, clear the upload final.
    }
    const numbered = stampSteps(
      numberSteps(steps).map((step, index, all) => ({ ...step, final: index === all.length - 1 })),
      banner,
      provider.pasteLimit,
    )
    return { steps: numbered, warning: warn(provider, numbered.length, files) }
  }

  const bannerRoom = banner.length > 0 ? banner.length + 2 : 0
  const chunkSize = Math.max(500, provider.pasteLimit - PAPER_HEADER - bannerRoom)
  const chunks = paper ? splitText(paper, chunkSize) : []
  const paperSteps: DeliveryStep[] = chunks.map((chunk, index) => ({
    kind: "paste",
    text: paperPart(index + 1, chunks.length, chunk),
    files: [],
    index: 1,
    total: 1,
    final: false,
  }))
  const steps = stampSteps(
    numberSteps([...paperSteps, ...instructionSteps(closing, provider.pasteLimit, banner)]).map((step, index, all) => ({
      ...step,
      final: index === all.length - 1,
    })),
    banner,
    provider.pasteLimit,
  )
  return { steps, warning: warn(provider, steps.length, files) }
}

function warn(provider: ProviderAdapter, turns: number, files: WebChatFile[]): string | null {
  const notes: string[] = []
  if (!provider.fileUpload && files.some((file) => file.text.length > provider.pasteLimit)) {
    notes.push(`${provider.label} is pasted in parts on this adapter.`)
  }
  if (turns > provider.comfortableTurns) {
    notes.push(`${provider.label} will receive ${turns} messages. A thread that long can hit the site's rate limit. The tab stays in front of you.`)
  }
  return notes.join(" ") || null
}

import type { CriteriaSet, ReviewReport, StoredReview } from "../../domain/types.ts"
import type { ZenodoRecord } from "../zenodo.ts"
import { sha256Hex, uid } from "../hash.ts"
import { scoringMismatch } from "../../domain/scoring.ts"
import { draftWebChatReview, scrubPrivateUrls } from "./accept.ts"
import { buildWebChatPacket } from "./packet.ts"
import { paperTextRecordId } from "./paperText.ts"
import { hasAirFeedback } from "../airFeedback.ts"
import { WEB_CHAT_LABEL, type WebChatPacket } from "./protocol.ts"

export const RESULT_STORAGE_KEY = "air-web-chat-results"
export const ONBOARD_STORAGE_KEY = "air-web-chat-seen"
export const EXPORT_SOURCE = "air-web-chat-extension"
export const RESULT_CAP = 30

/** Chat-share addresses only. Ordinary https links in a paper stay. */
const CHAT_SHARE =
  /https?:\/\/(?:www\.)?(?:share\.google\/aimode\/[^\s)"']+|chatgpt\.com\/share\/[^\s)"']+|chat\.openai\.com\/share\/[^\s)"']+|claude\.ai\/share\/[^\s)"']+|grok\.com\/share\/[^\s)"']+)/gi

export function localPaperRecord(filename: string): ZenodoRecord {
  const title = filename.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim() || "Local paper"
  const today = new Date().toISOString().slice(0, 10)
  return {
    id: "local",
    conceptId: "local",
    doi: "local-file",
    conceptDoi: "local-file",
    title,
    creators: [],
    description: "",
    descriptionHtml: "",
    keywords: [],
    version: "local",
    recordVersion: "local",
    license: "",
    publicationDate: today,
    related: [],
    resourceType: "publication",
    access: { record: "open", files: "open" },
    files: [],
    htmlUrl: "",
  }
}

/** Pull a Zenodo version id and DOI out of uploaded paper text. Private chat links are ignored. */
export function sourceRecordFromText(filename: string, text: string): ZenodoRecord | null {
  const base = localPaperRecord(filename)
  const withoutChats = text.replace(/https?:\/\/(?:www\.)?(?:share\.google|chatgpt\.com\/share|claude\.ai\/share|grok\.com\/share)\S+/gi, "")
  const recordIds = [...withoutChats.matchAll(/zenodo\.org\/records\/(\d+)/gi)].map((match) => match[1] ?? "").filter(Boolean)
  const dois = [...withoutChats.matchAll(/\b(10\.5281\/zenodo\.(\d+))\b/gi)].map((match) => ({ doi: match[1] ?? "", id: match[2] ?? "" }))
  const versionId = recordIds[0] || dois[0]?.id || ""
  const doi = dois[0]?.doi || (versionId ? `10.5281/zenodo.${versionId}` : "")
  if (!versionId && !doi) return null
  const concept = withoutChats.match(/concept(?:recid|doi)?[:\s]+(?:10\.5281\/zenodo\.)?(\d{5,})/i)?.[1] ?? ""
  const conceptId = concept || versionId
  return {
    ...base,
    id: versionId || base.id,
    conceptId: conceptId || base.conceptId,
    doi: doi || base.doi,
    conceptDoi: conceptId ? `10.5281/zenodo.${conceptId}` : doi || base.conceptDoi,
    htmlUrl: versionId ? `https://zenodo.org/records/${versionId}` : "",
    title: base.title,
  }
}

export function packetForLocalPaper(options: {
  requestId: string
  providerId: string
  criteria: CriteriaSet
  filename: string
  text: string
  criterionProfile?: string
  /** Lookup result. When absent, a DOI or Zenodo URL in the paper text is used. */
  source?: ZenodoRecord | null
}): WebChatPacket {
  const record = options.source ?? sourceRecordFromText(options.filename, options.text) ?? localPaperRecord(options.filename)
  return buildWebChatPacket({
    requestId: options.requestId,
    providerId: options.providerId,
    criteria: options.criteria,
    criterionProfile: options.criterionProfile,
    record,
    documents: [{ filename: options.filename, text: options.text }],
    useTextPage: Boolean(paperTextRecordId(record)),
  })
}

export function stripChatShareLinks<T>(value: T): T {
  const scrub = (text: string) => text.replace(CHAT_SHARE, "[private link]")
  const walk = (item: unknown): unknown => {
    if (typeof item === "string") return scrub(item)
    if (Array.isArray(item)) return item.map(walk)
    if (item && typeof item === "object") {
      return Object.fromEntries(Object.entries(item as Record<string, unknown>).map(([key, child]) => [key, walk(child)]))
    }
    return item
  }
  return walk(value) as T
}

export async function storedLocalReview(options: {
  providerId: string
  criteria: CriteriaSet
  filename: string
  report: ReviewReport
  privateUrls?: string[]
  publication?: { title: string; doi: string; url: string; authors: string[] }
  criterionProfile?: string
}): Promise<StoredReview> {
  const record = localPaperRecord(options.filename)
  const report = stripChatShareLinks(scrubPrivateUrls(options.report, options.privateUrls ?? []))
  const modelHint = `${options.providerId} (web chat, uncalibrated)`
  const review = draftWebChatReview({
    id: uid("review"),
    packet: {
      version: 1,
      requestId: "local",
      providerId: options.providerId,
      system: "",
      instructions: "local",
      files: [],
    },
    report,
    record: {
      doi: record.doi,
      id: record.id,
      conceptId: record.conceptId,
      recordVersion: record.recordVersion,
      title: record.title,
      creators: [],
      keywords: [],
      publicationDate: record.publicationDate,
      license: record.license,
    },
    criteria: options.criteria,
    customCriteria: false,
    outputHash: await sha256Hex(`${modelHint}\n${JSON.stringify(report)}`),
    createdAt: new Date().toISOString(),
    privateUrls: [],
    privateContextCount: 0,
  })
  return {
    ...review,
    tier: "uncalibrated web-chat",
    source: "web-chat extension",
    criterionProfile: options.criterionProfile || review.criterionProfile,
    doi: options.publication?.doi || review.doi,
    title: options.publication?.title || review.title,
    creators: options.publication?.authors ?? review.creators,
    paperUrl: options.publication?.url || review.paperUrl,
  }
}

export function appendResult(existing: StoredReview[], next: StoredReview, cap = RESULT_CAP): StoredReview[] {
  const key = `${(next.doi || next.paperUrl || "").toLowerCase()}|${next.modelId.toLowerCase()}`
  const without = existing.filter((item) => item.id !== next.id && `${(item.doi || item.paperUrl || "").toLowerCase()}|${item.modelId.toLowerCase()}` !== key)
  return [next, ...without].slice(0, cap)
}

export interface ExportBundle {
  source: typeof EXPORT_SOURCE
  version: 1
  label: typeof WEB_CHAT_LABEL
  reviews: StoredReview[]
}

export function exportBundle(reviews: StoredReview[]): string {
  const body: ExportBundle = {
    source: EXPORT_SOURCE,
    version: 1,
    label: WEB_CHAT_LABEL,
    reviews: reviews.map((review) => stripChatShareLinks(review)),
  }
  return JSON.stringify(body, null, 2)
}

export function parseExport(raw: string): { ok: true; reviews: StoredReview[] } | { ok: false; error: string } {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { ok: false, error: "That file is not JSON." }
  }
  const record = parsed && typeof parsed === "object" ? (parsed as { reviews?: unknown; source?: unknown }) : null
  const list = Array.isArray(record?.reviews) ? record.reviews : Array.isArray(parsed) ? parsed : null
  if (!list) return { ok: false, error: "That file has no reviews to import." }
  const reviews: StoredReview[] = []
  for (const item of list) {
    if (!item || typeof item !== "object") continue
    const review = stripChatShareLinks(item as StoredReview)
    if (!review.report || !review.id) continue
    reviews.push({
      ...review,
      tier: review.tier === "uncalibrated web-chat" || review.tier === "free-web-chat" ? review.tier : "uncalibrated web-chat",
      source: review.source ?? "web-chat extension",
      mock: false,
      sample: false,
    })
  }
  if (reviews.length === 0) return { ok: false, error: "That file has no readings AIR can keep." }
  return { ok: true, reviews }
}

export function resultCard(review: StoredReview): {
  title: string
  overall: number
  recommendation: string
  summary: string
  mismatch: string | null
  label: string
  defendedOverall: number | null
  defendedLabel: string
  scores: { criterionId: string; score: number }[]
  feedback: { label: string; text: string }[]
  model: string
} {
  const check = scoringMismatch(review)
  const feedback = hasAirFeedback(review.report.airFeedback) ? review.report.airFeedback : undefined
  const labels: { key: keyof NonNullable<typeof feedback>; label: string }[] = [
    { key: "criteria", label: "Criteria" },
    { key: "profile", label: "Profile" },
    { key: "missingContext", label: "Missing context or files" },
    { key: "prompt", label: "Prompt" },
    { key: "rubric", label: "Rubric" },
    { key: "scoringProcess", label: "Scoring process" },
  ]
  return {
    title: review.title,
    overall: review.report.overallScore,
    recommendation: review.report.recommendation,
    summary: review.report.summary,
    mismatch: check.mismatch ? `Scoring mismatch, needs re-check. ${check.reason ?? ""}`.trim() : null,
    label: WEB_CHAT_LABEL,
    defendedOverall: review.defended?.overallScore ?? null,
    defendedLabel: review.defended?.label ?? "",
    model: review.modelId,
    scores: review.report.scores.map((score) => ({ criterionId: score.criterionId, score: score.score })),
    feedback: feedback ? labels.flatMap((item) => (feedback[item.key] ? [{ label: item.label, text: feedback[item.key] as string }] : [])) : [],
  }
}

export interface PdfTextSource {
  numPages: number
  getPage(pageNumber: number): Promise<{ getTextContent(): Promise<{ items: { str?: string }[] }> }>
}

export async function textFromPdfDocument(pdf: PdfTextSource, pageCap: number): Promise<{ text: string; note?: string }> {
  const cap = Math.max(1, pageCap)
  const limit = Math.min(pdf.numPages, cap)
  const parts: string[] = []
  for (let pageNumber = 1; pageNumber <= limit; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber)
    const content = await page.getTextContent()
    const line = content.items
      .map((item) => item.str ?? "")
      .join(" ")
      .replace(/[ \t]{2,}/g, " ")
      .trim()
    if (line) parts.push(line)
  }
  return {
    text: parts.join("\n\n"),
    note: pdf.numPages > cap ? `Read the first ${cap} of ${pdf.numPages} pages.` : undefined,
  }
}

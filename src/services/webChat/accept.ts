import { webChatProvider } from "../../../extension/adapters/index.ts"
import type { CriteriaSet, ReviewReport, StoredReview } from "../../domain/types.ts"
import { extractJsonValue, validateReport } from "../validateReport.ts"
import { WEB_CHAT_LABEL, WEB_CHAT_TIER, type WebChatPacket } from "./protocol.ts"

export function acceptWebChatResult(
  raw: string,
  criteria: CriteriaSet,
): { ok: true; report: ReviewReport } | { ok: false; errors: string[] } {
  let parsed: unknown
  try {
    parsed = extractJsonValue(raw)
  } catch (error) {
    return { ok: false, errors: [error instanceof Error ? error.message : "No JSON object was found in the chat reply."] }
  }
  return validateReport(parsed, criteria)
}

/** Replace private chat addresses the model echoed. The count stays; the address does not. */
export function scrubPrivateUrls<T>(value: T, urls: string[]): T {
  const needles = [...new Set(urls.map((url) => url.trim()).filter((url) => url.length > 8))]
  if (needles.length === 0) return value
  const scrub = (text: string) => needles.reduce((current, url) => current.split(url).join("[private link]"), text)
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

export function webChatPublishMessage(): string {
  return `${WEB_CHAT_LABEL}. AIR kept this reading on this device. It stays out of the shared board and out of the two-model corroboration count.`
}

export function isUncalibratedTier(tier: StoredReview["tier"]): boolean {
  return tier === "free-screening" || tier === WEB_CHAT_TIER
}

export function draftWebChatReview(options: {
  id: string
  packet: WebChatPacket
  report: ReviewReport
  record: {
    doi: string
    id: string
    conceptId: string
    recordVersion: string
    title: string
    creators: string[]
    keywords: string[]
    publicationDate: string
    license: string
  }
  criteria: CriteriaSet
  customCriteria: boolean
  outputHash: string
  createdAt: string
  privateUrls: string[]
  privateContextCount: number
}): StoredReview {
  const provider = webChatProvider(options.packet.providerId)
  return {
    id: options.id,
    sample: false,
    mock: false,
    doi: options.record.doi,
    recordId: options.record.id,
    conceptRecordId: options.record.conceptId,
    recordVersion: options.record.recordVersion,
    title: options.record.title,
    creators: options.record.creators,
    keywords: options.record.keywords,
    publicationDate: options.record.publicationDate,
    license: options.record.license,
    assessorId: provider?.assessorId ?? "web-chat",
    modelId: `${provider?.modelLabel ?? options.packet.providerId} (web chat, uncalibrated)`,
    provider: provider?.provider ?? "compatible",
    criteriaId: options.criteria.id,
    criteriaVersion: options.criteria.version,
    customCriteria: options.customCriteria,
    tier: WEB_CHAT_TIER,
    criterionProfile: options.packet.criterionProfile,
    report: scrubPrivateUrls(options.report, options.privateUrls),
    outputHash: options.outputHash,
    createdAt: options.createdAt,
    privateContextCount: options.privateContextCount,
  }
}

import { chunksFor, shouldSummarize } from "./prompts.ts"
import { FREE_DAILY_REQUEST_CAP, PROVIDER_ALTERNATIVES } from "./providers.ts"

/** Combined section notes are reduced again while they are longer than this. */
export const DIGEST_BUDGET = 28_000

/** Several sections share one summary call. One section per call burns a free daily cap. */
export const SUMMARY_BATCH_SECTIONS = 6
export const SUMMARY_BATCH_CHARS = 48_000

export interface ReviewCallEstimate {
  calls: number
  summaryCalls: number
  /** Criteria are always one scoring call, not one call per criterion. */
  scoreCalls: number
}

export function summaryBatches<T extends { text: string }>(sections: T[]): T[][] {
  const batches: T[][] = []
  let current: T[] = []
  let chars = 0
  for (const section of sections) {
    const overflow =
      current.length >= SUMMARY_BATCH_SECTIONS || (current.length > 0 && chars + section.text.length > SUMMARY_BATCH_CHARS)
    if (overflow) {
      batches.push(current)
      current = []
      chars = 0
    }
    current.push(section)
    chars += section.text.length
  }
  if (current.length > 0) batches.push(current)
  return batches
}

/**
 * Planned model calls for one in-depth reading.
 * The score is a single call that includes every criterion. Section summaries are batched.
 * A repair, if the JSON is unusable, is one extra call and is not included here.
 */
export function estimateReviewCalls(documents: { filename?: string; text: string }[], provider: string): ReviewCallEstimate {
  const scoreCalls = 1
  const named = documents.map((document, index) => ({ filename: document.filename || `file-${index + 1}.txt`, text: document.text }))
  if (!shouldSummarize(named, provider)) return { calls: scoreCalls, summaryCalls: 0, scoreCalls }
  const batches = summaryBatches(chunksFor(named))
  let summaryCalls = batches.length
  let pieces = Math.max(1, batches.length)
  let chars = pieces * 1_200
  for (let round = 0; chars > DIGEST_BUDGET && pieces > 1 && round < 4; round += 1) {
    const groups = Math.ceil(pieces / 4)
    summaryCalls += groups
    pieces = groups
    chars = pieces * 1_200
  }
  return { calls: summaryCalls + scoreCalls, summaryCalls, scoreCalls }
}

export function reviewCallEstimateMessage(calls: number): { level: "none" | "info" | "warn"; text: string } {
  if (calls <= 1) return { level: "none", text: "" }
  const head = `This in-depth review is about ${calls} model calls. All criteria are scored together in one call.`
  if (calls > FREE_DAILY_REQUEST_CAP) {
    return {
      level: "warn",
      text: `${head} That is above a free daily cap of about ${FREE_DAILY_REQUEST_CAP} requests. Gemini’s free tier is about 20 a day, and a failed call still counts, so this may use up the daily free quota. ${PROVIDER_ALTERNATIVES}`,
    }
  }
  if (calls * 2 > FREE_DAILY_REQUEST_CAP) {
    return {
      level: "warn",
      text: `${head} A free daily cap is about ${FREE_DAILY_REQUEST_CAP} requests, and a failed call still counts, so this may use up the daily free quota. ${PROVIDER_ALTERNATIVES}`,
    }
  }
  return { level: "info", text: `${head} A repair, if the first answer is not usable JSON, adds one more call.` }
}

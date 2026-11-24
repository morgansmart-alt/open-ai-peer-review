import type { AirFeedback, StoredReview } from "../domain/types.ts"

const FIELDS = ["criteria", "profile", "missingContext", "prompt", "rubric", "scoringProcess"] as const

const ALIASES: Record<string, (typeof FIELDS)[number]> = {
  criteria: "criteria",
  criterion: "criteria",
  profile: "profile",
  missingContext: "missingContext",
  missing_context: "missingContext",
  missing: "missingContext",
  files: "missingContext",
  prompt: "prompt",
  rubric: "rubric",
  scoringProcess: "scoringProcess",
  scoring_process: "scoringProcess",
  scoring: "scoringProcess",
}

function clip(value: unknown): string {
  if (typeof value !== "string") return ""
  return value
    .trim()
    .replace(/https?:\/\/(?:www\.)?(?:share\.google\/aimode|chatgpt\.com\/share|chat\.openai\.com\/share|claude\.ai\/share|grok\.com\/share)\/\S+/gi, "[private link]")
    .slice(0, 1000)
}

/** Keep a usable note. Anything else, including a missing field, becomes absent. */
export function parseAirFeedback(input: unknown): AirFeedback | undefined {
  if (input == null || input === "") return undefined
  if (typeof input === "string") {
    const note = clip(input)
    return note ? { scoringProcess: note } : undefined
  }
  if (typeof input !== "object" || Array.isArray(input)) return undefined
  const feedback: AirFeedback = {}
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    const field = ALIASES[key]
    const text = clip(value)
    if (!field || !text) continue
    feedback[field] = text
  }
  return Object.keys(feedback).length > 0 ? feedback : undefined
}

export function hasAirFeedback(feedback: AirFeedback | undefined): feedback is AirFeedback {
  return Boolean(feedback && Object.values(feedback).some((item) => item && item.trim()))
}

export interface AirFeedbackExportItem {
  reviewId: string
  doi: string
  title: string
  modelId: string
  criteriaVersion: string
  criterionProfile: string
  createdAt: string
  airFeedback: AirFeedback
}

/** Maintainer export. Scores are not included. */
export function airFeedbackExport(reviews: StoredReview[], exportedAt = new Date().toISOString()): string {
  const items: AirFeedbackExportItem[] = []
  for (const review of reviews) {
    if (!hasAirFeedback(review.report.airFeedback)) continue
    items.push({
      reviewId: review.id,
      doi: review.doi,
      title: review.title,
      modelId: review.modelId,
      criteriaVersion: review.criteriaVersion,
      criterionProfile: review.criterionProfile ?? "",
      createdAt: review.createdAt,
      airFeedback: review.report.airFeedback,
    })
  }
  return JSON.stringify({ source: "air-feedback", exportedAt, items }, null, 2)
}

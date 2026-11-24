import { categoryLabel } from "../domain/criteria.ts"
import { median } from "../domain/ranking.ts"
import { boardValue, scoringMismatch } from "../domain/scoring.ts"
import type { CriteriaSet, EvidenceLabel, StoredReview } from "../domain/types.ts"
import { isHumanReview } from "../domain/versions.ts"
import { isUncalibratedWebChat } from "../services/webChat/protocol.ts"

export type ReviewerBadge = "Calibrated AI" | "Human review" | "free web-chat, uncalibrated" | "Free screening" | "Demo" | "Community reply"

export function reviewerBadge(review: Pick<StoredReview, "origin" | "assessorId" | "tier" | "source" | "mock">): ReviewerBadge {
  if (review.origin === "community-ai" || review.tier === "community-ai") return "Community reply"
  if (isHumanReview(review)) return "Human review"
  if (isUncalibratedWebChat(review)) return "free web-chat, uncalibrated"
  if (review.tier === "free-screening") return "Free screening"
  if (review.mock || review.tier === "demo") return "Demo"
  return "Calibrated AI"
}

/** Demo readings are labelled, and they still show on a sample card. Human, web-chat, screening, and community scores stay out of the bar. */
export function inCriterionBar(review: Pick<StoredReview, "origin" | "assessorId" | "tier" | "source" | "mock" | "customCriteria">): boolean {
  if (review.customCriteria) return false
  const badge = reviewerBadge(review)
  return badge === "Calibrated AI" || badge === "Demo"
}

export function publicDoiUrl(doi: string): string | null {
  const trimmed = doi.trim()
  if (!/^10\.\d+\//.test(trimmed)) return null
  if (/sample/i.test(trimmed)) return null
  if (/\s/.test(trimmed)) return null
  return `https://doi.org/${trimmed}`
}

export interface CriterionBar {
  id: string
  name: string
  median: number | null
  marks: Array<{
    reviewId: string
    name: string
    badge: ReviewerBadge
    score: number
    evidence?: EvidenceLabel
    rationale: string
  }>
}

export interface ReadingLine {
  id: string
  name: string
  badge: ReviewerBadge
  score: number
  verdict: string
  mismatch: boolean
  possible: number
  proven: number
  mock: boolean
}

export function criterionBars(reviews: StoredReview[], criteria: CriteriaSet, names: Record<string, string>): CriterionBar[] {
  const ids = [...criteria.criteria.map((criterion) => criterion.id)]
  for (const review of reviews) {
    for (const score of review.report.scores) {
      if (!ids.includes(score.criterionId)) ids.push(score.criterionId)
    }
  }
  return ids.map((id) => {
    const marks = reviews.flatMap((review) => {
      const score = review.report.scores.find((item) => item.criterionId === id)
      if (!score || !inCriterionBar(review)) return []
      return [
        {
          reviewId: review.id,
          name: names[review.assessorId] ?? review.assessorId,
          badge: reviewerBadge(review),
          score: boardValue(score.score, review.report, review.criteriaVersion),
          evidence: score.evidence,
          rationale: score.rationale,
        },
      ]
    })
    return {
      id,
      name: criteria.criteria.find((criterion) => criterion.id === id)?.name ?? id,
      median: median(marks.map((mark) => mark.score)),
      marks,
    }
  })
}

export function readingLines(reviews: StoredReview[], criteria: CriteriaSet, names: Record<string, string>): ReadingLine[] {
  return reviews.map((review) => ({
    id: review.id,
    name: isHumanReview(review) ? "Human reviewer" : (names[review.assessorId] ?? review.assessorId),
    badge: reviewerBadge(review),
    score: boardValue(review.report.overallScore, review.report, review.criteriaVersion),
    verdict: categoryLabel(criteria, review.report.recommendation),
    mismatch: scoringMismatch(review).mismatch,
    possible: review.report.scores.filter((score) => score.evidence === "possible").length,
    proven: review.report.scores.filter((score) => score.evidence === "proven").length,
    mock: review.mock,
  }))
}

export function sharedVerdict(lines: ReadingLine[]): { label: string; mixed: boolean } | null {
  const counted = lines.filter((line) => line.badge === "Calibrated AI" || line.badge === "Demo")
  const verdicts = [...new Set(counted.map((line) => line.verdict))]
  if (verdicts.length === 0) return null
  if (verdicts.length === 1) return { label: verdicts[0] ?? "", mixed: false }
  return { label: "Verdicts differ across readings", mixed: true }
}

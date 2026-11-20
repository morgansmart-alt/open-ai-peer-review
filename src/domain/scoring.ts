import { round2, weightedMean } from "./criteria.ts"
import { airCriteriaV01, officialCriteria } from "./officialCriteria.ts"
import type { CriteriaSet, ReviewReport, StoredReview } from "./types.ts"

export const BOARD_MAX = 100
export const BOARD_PRIOR = 50
export const MISMATCH_POINTS = 10
export const ASSESSOR_SPREAD = 30

export function criteriaForReview(review: StoredReview): CriteriaSet {
  return review.criteriaVersion.startsWith("0.1") ? airCriteriaV01 : officialCriteria
}

/** 5 means a stored 1–5 score, 10 a stored 0–10 score, 100 a stored 0–100 score. */
export function storedScale(report: Pick<ReviewReport, "scale">, criteriaVersion: string): number {
  if (report.scale === 100 || report.scale === 10 || report.scale === 5) return report.scale
  if (criteriaVersion.startsWith("0.1")) return 5
  return 10
}

export function toBoard(score: number, scale: number): number {
  if (scale >= 100) return round2(score)
  if (scale <= 5) return round2(((score - 1) / 4) * BOARD_MAX)
  return round2(score * (BOARD_MAX / scale))
}

export function boardValue(score: number, report: Pick<ReviewReport, "scale">, criteriaVersion: string): number {
  return toBoard(score, storedScale(report, criteriaVersion))
}

export function expectedVerdict(board: number): "encourage" | "revise" | "major-revision" | "not-ready" {
  if (board >= 80) return "encourage"
  if (board >= 60) return "revise"
  if (board >= 40) return "major-revision"
  return "not-ready"
}

export function describeScoring(input: {
  scores: { criterionId: string; score: number }[]
  statedOverall: number | null
  recommendation: string
  criteria: CriteriaSet
}): { scale: number; statedOverall: number | null; scoringCheck: NonNullable<ReviewReport["scoringCheck"]> } {
  const scale = input.criteria.scale.max >= 100 ? 100 : input.criteria.scale.max <= 5 ? 5 : 10
  const internalRaw = weightedMean(input.scores, input.criteria)
  const internal = internalRaw === null ? null : toBoard(internalRaw, scale)
  const stated = input.statedOverall === null ? null : toBoard(input.statedOverall, scale)
  const reasons: string[] = []
  if (internal !== null && stated !== null && Math.abs(stated - internal) > MISMATCH_POINTS) {
    reasons.push(`Stated overall ${stated} differs from the weighted score ${internal} by more than ${MISMATCH_POINTS}.`)
  }
  if (internal !== null && input.recommendation && input.recommendation !== expectedVerdict(internal)) {
    reasons.push(`Verdict ${input.recommendation} does not match the score band for ${internal} (expected ${expectedVerdict(internal)}).`)
  }
  return {
    scale,
    statedOverall: input.statedOverall,
    scoringCheck: {
      internal: internal ?? 0,
      statedOverall: stated,
      mismatch: reasons.length > 0,
      reason: reasons.join(" ") || null,
    },
  }
}

export function scoringMismatch(review: StoredReview): { mismatch: boolean; reason: string | null; internal: number | null } {
  const criteria = criteriaForReview(review)
  const internalRaw = weightedMean(review.report.scores, criteria)
  if (internalRaw === null) return { mismatch: false, reason: null, internal: null }
  const scale = storedScale(review.report, review.criteriaVersion)
  const internal = toBoard(internalRaw, scale)
  const stated = toBoard(review.report.overallScore, scale)
  const reasons: string[] = []
  if (Math.abs(stated - internal) > MISMATCH_POINTS) {
    reasons.push(`Stated overall ${stated} differs from the weighted score ${internal} by more than ${MISMATCH_POINTS}.`)
  }
  const expected = expectedVerdict(internal)
  if (review.report.recommendation && review.report.recommendation !== expected) {
    reasons.push(`Verdict ${review.report.recommendation} does not match the score band for ${internal} (expected ${expected}).`)
  }
  const reason = reasons.join(" ")
  return { mismatch: reasons.length > 0, reason: reason || null, internal }
}

import { round2, weightedMean } from "./criteria.ts"
import { applyCriterionProfile } from "./profiles.ts"
import { airCriteriaV01, officialCriteria } from "./officialCriteria.ts"
import type { CriteriaSet, ReviewReport, StoredReview } from "./types.ts"

export const BOARD_MAX = 100
export const BOARD_PRIOR = 50
export const MISMATCH_POINTS = 10
/** Band checks use the score rounded to the nearest point, so 79.74 is the same band as 80. */
export const ASSESSOR_SPREAD = 30

export function criteriaForReview(review: StoredReview): CriteriaSet {
  if (review.criteriaVersion.startsWith("0.1")) return airCriteriaV01
  if (review.customCriteria) return officialCriteria
  return applyCriterionProfile(officialCriteria, review.criterionProfile)
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

/** Leaderboard value. Criterion scores win over the model's stated total. */
export function rankedBoardScore(review: StoredReview): number {
  const criteria = criteriaForReview(review)
  const weighted = weightedMean(review.report.scores, criteria)
  const scale = storedScale(review.report, review.criteriaVersion)
  if (weighted === null) return boardValue(review.report.overallScore, review.report, review.criteriaVersion)
  return toBoard(weighted, scale)
}

export function expectedVerdict(board: number): "encourage" | "revise" | "major-revision" | "not-ready" {
  if (board >= 80) return "encourage"
  if (board >= 60) return "revise"
  if (board >= 40) return "major-revision"
  return "not-ready"
}

/**
 * Accept / sound shares the top band with encourage. Both mean a 0–100 score of at least 80.
 * Older readings that stored encourage stay in band. A non-proposal profile may store accept.
 */
export function recommendationMatchesBand(recommendation: string, board: number): boolean {
  const expected = expectedVerdict(Math.round(board))
  if (recommendation === expected) return true
  return recommendation === "accept" && expected === "encourage"
}

/** The verdict the card shows. A band disagreement uses the band, and the model's word stays in the note. */
export function bandRecommendation(recommendation: string, board: number): string {
  if (!recommendation || recommendationMatchesBand(recommendation, board)) return recommendation
  return expectedVerdict(Math.round(board))
}

export function verdictBandNote(recommendation: string, board: number): string | null {
  if (!recommendation || recommendationMatchesBand(recommendation, board)) return null
  const rounded = Math.round(board)
  return `The model said ${recommendation}. The band for ${rounded} is ${expectedVerdict(rounded)}.`
}

export function describeScoring(input: {
  scores: { criterionId: string; score: number; uncited?: boolean }[]
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
  return {
    scale,
    statedOverall: input.statedOverall,
    scoringCheck: {
      internal: internal ?? 0,
      statedOverall: stated,
      mismatch: reasons.length > 0,
      reason: reasons.join(" ") || null,
      verdictNote: internal !== null ? verdictBandNote(input.recommendation, internal) : null,
    },
  }
}

export function scoringMismatch(review: StoredReview): {
  mismatch: boolean
  reason: string | null
  internal: number | null
  verdictNote: string | null
  shownRecommendation: string
} {
  const criteria = criteriaForReview(review)
  const internalRaw = weightedMean(review.report.scores, criteria)
  if (internalRaw === null) {
    return { mismatch: false, reason: null, internal: null, verdictNote: null, shownRecommendation: review.report.recommendation }
  }
  const scale = storedScale(review.report, review.criteriaVersion)
  const internal = toBoard(internalRaw, scale)
  const statedSource = review.report.statedOverall != null ? review.report.statedOverall : review.report.overallScore
  const stated = toBoard(statedSource, scale)
  const reasons: string[] = []
  if (Math.abs(stated - internal) > MISMATCH_POINTS) {
    reasons.push(`Stated overall ${stated} differs from the weighted score ${internal} by more than ${MISMATCH_POINTS}.`)
  }
  const reason = reasons.join(" ")
  return {
    mismatch: reasons.length > 0,
    reason: reason || null,
    internal,
    verdictNote: verdictBandNote(review.report.recommendation, internal),
    shownRecommendation: bandRecommendation(review.report.recommendation, internal),
  }
}

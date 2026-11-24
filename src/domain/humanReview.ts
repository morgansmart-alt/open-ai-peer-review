import { weightedMean } from "./criteria.ts"
import { describeScoring } from "./scoring.ts"
import type { CriteriaSet, EvidenceLabel, MajorIssue, ReviewReport } from "./types.ts"
import { quoteInPublication } from "./versions.ts"

export interface HumanCriterionDraft {
  criterionId: string
  score: number
  rationale: string
  quote: string
  evidence: EvidenceLabel
}

export function emptyHumanDrafts(criteria: CriteriaSet): HumanCriterionDraft[] {
  return criteria.criteria.map((criterion) => ({
    criterionId: criterion.id,
    score: 50,
    rationale: "",
    quote: "",
    evidence: "possible",
  }))
}

export function buildHumanReport(input: {
  criteria: CriteriaSet
  summary: string
  recommendation: string
  statedOverall: number
  drafts: HumanCriterionDraft[]
  strengths: string[]
  majorIssues: MajorIssue[]
  publicationText: string
}): { ok: true; report: ReviewReport } | { ok: false; errors: string[] } {
  const errors: string[] = []
  const summary = input.summary.trim()
  if (summary.length < 40) errors.push("Write a summary of at least 40 characters.")
  const allowed = new Set(input.criteria.recommendationCategories.map((item) => item.id))
  if (!allowed.has(input.recommendation)) {
    errors.push("Choose a recommendation.")
  }
  const scores = input.criteria.criteria.map((criterion) => {
    const draft = input.drafts.find((item) => item.criterionId === criterion.id)
    if (!draft) {
      errors.push(`Score ${criterion.name}.`)
      return null
    }
    if (!Number.isFinite(draft.score) || draft.score < input.criteria.scale.min || draft.score > input.criteria.scale.max) {
      errors.push(`${criterion.name} must be between ${input.criteria.scale.min} and ${input.criteria.scale.max}.`)
    }
    const rationale = draft.rationale.trim()
    if (rationale.length < 8) errors.push(`${criterion.name} needs a short rationale.`)
    const quote = draft.quote.trim()
    if (quote && !quoteInPublication(quote, input.publicationText)) {
      errors.push(`${criterion.name}: the quotation is not in this version's loaded text.`)
    } else if (draft.evidence === "proven" && !quote) {
      errors.push(`${criterion.name} is marked proven, so quote the publication. Possible does not need a quotation.`)
    }
    return {
      criterionId: criterion.id,
      score: draft.score,
      rationale,
      confidence: "medium" as const,
      evidence: draft.evidence,
      citations: quote ? [{ quote: quote.slice(0, 500), location: "Quoted from this version" }] : [],
    }
  })
  const ready = scores.filter((score): score is NonNullable<typeof score> => score !== null)
  const idea = ready.length === input.criteria.criteria.length ? weightedMean(ready, input.criteria, input.criteria.ideaCriterionIds) : null
  if (idea === null) errors.push("Score every criterion so the idea score can be weighted.")
  const issues = input.majorIssues.flatMap((issue) => {
    const claim = issue.claim.trim()
    if (!claim && !issue.reason.trim() && !issue.quotedPassage.trim()) return []
    if (!claim) {
      errors.push("A failure needs a claim.")
      return []
    }
    const quotedPassage = issue.quotedPassage.trim()
    if (quotedPassage && !quoteInPublication(quotedPassage, input.publicationText)) {
      errors.push(`The failure “${claim.slice(0, 80)}” quotes text that is not in this version.`)
    }
    return [{ criterionId: issue.criterionId || input.criteria.criteria[0]?.id || "evidence-labelling", claim, quotedPassage, reason: issue.reason.trim() || claim }]
  })
  if (errors.length || idea === null) return { ok: false, errors }
  const check = describeScoring({
    scores: ready,
    statedOverall: input.statedOverall,
    recommendation: input.recommendation,
    criteria: input.criteria,
  })
  return {
    ok: true,
    report: {
      summary,
      scores: ready,
      overallScore: input.statedOverall,
      ideaScore: idea,
      recommendation: input.recommendation,
      scale: check.scale,
      scoringCheck: check.scoringCheck,
      strengths: input.strengths.map((item) => item.trim()).filter(Boolean).slice(0, 6),
      majorIssues: issues,
      minorIssues: [],
      questionsForAuthors: [],
      suggestedNextSteps: [],
    },
  }
}

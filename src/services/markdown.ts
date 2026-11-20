import { categoryLabel } from "../domain/criteria.ts"
import { boardValue } from "../domain/scoring.ts"
import { DISCLAIMER, type CriteriaSet, type StoredReview } from "../domain/types.ts"

export function reportToMarkdown(review: StoredReview, criteria: CriteriaSet, assessorName: string): string {
  const lines = [
    `# AIR reading: ${review.title}`,
    "",
    DISCLAIMER,
    "",
    review.mock ? "_Demo reading. No model was called._" : "",
    "",
    `- DOI: ${review.doi}`,
    `- Record version: ${review.recordVersion}`,
    `- Assessor: ${assessorName}`,
    `- Model: ${review.modelId}`,
    `- Provider: ${review.provider}`,
    `- Criteria: ${criteria.name} ${review.criteriaVersion}${review.customCriteria ? " (custom, unranked)" : ""}`,
    `- Generated: ${review.createdAt}`,
    review.privateContextCount
      ? `- Private AI context links sent to the model: ${review.privateContextCount}. Addresses are not included.`
      : "",
    `- Output hash: ${review.outputHash}`,
    `- Overall: ${boardValue(review.report.overallScore, review.report, review.criteriaVersion).toFixed(0)} / 100`,
    `- Idea score: ${boardValue(review.report.ideaScore, review.report, review.criteriaVersion).toFixed(0)} / 100`,
    review.report.scoringCheck?.mismatch ? `- Scoring mismatch, needs re-check. ${review.report.scoringCheck.reason ?? ""}` : "",
    `- Recommendation: ${categoryLabel(criteria, review.report.recommendation)}`,
    "",
    "## Summary",
    "",
    review.report.summary,
    "",
    "## Scores",
    "",
  ]
  for (const score of review.report.scores) {
    const criterion = criteria.criteria.find((item) => item.id === score.criterionId)
    lines.push(`### ${criterion?.name ?? score.criterionId} — ${score.score}/5`, "", score.rationale, "")
    for (const citation of score.citations) {
      lines.push(`> ${citation.quote}`, `> — ${citation.location}`, "")
    }
  }
  lines.push("## Strengths", "", ...review.report.strengths.map((item) => `- ${item}`), "")
  lines.push("## Major issues", "")
  if (review.report.majorIssues.length === 0) lines.push("None recorded.", "")
  for (const issue of review.report.majorIssues) {
    lines.push(`- **${issue.criterionId}.** ${issue.claim}`, `  - Passage: ${issue.quotedPassage || "none quoted"}`, `  - Why it matters: ${issue.reason}`)
  }
  lines.push("", "## Minor issues", "", ...(review.report.minorIssues.length ? review.report.minorIssues.map((item) => `- ${item}`) : ["None recorded."]), "")
  lines.push("## Questions for the authors", "", ...review.report.questionsForAuthors.map((item) => `- ${item}`), "")
  lines.push("## Suggested next steps", "", ...review.report.suggestedNextSteps.map((item) => `- ${item}`), "")
  return lines.filter((line) => line !== undefined).join("\n")
}

export function downloadText(filename: string, contents: string, type: string): void {
  const blob = new Blob([contents], { type })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

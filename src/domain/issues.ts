import type { IssueRound, IssueStatus, IssueThread, MajorIssue, NodeSubmission, SourceResult, StoredReview } from "./types.ts"

export const ROUND_LIMIT = 6

export function claimKey(doi: string, recordVersion: string, criterionId: string, claim: string): string {
  return `${doi}@@${recordVersion}@@${criterionId}@@${claim.trim().toLowerCase()}`
}

export function statusFromCheck(
  result: SourceResult,
  existingRounds: number,
  issueVersion: string,
  checkedVersion: string,
): IssueStatus {
  if (result === "ADDRESSED" && checkedVersion && checkedVersion !== issueVersion) return "fixed-in-new-version"
  if (result === "ADDRESSED") return "addressed-in-publication"
  if (result === "PARTIALLY_ADDRESSED") return "partially-addressed"
  if (existingRounds + 1 >= 3 || existingRounds + 1 >= ROUND_LIMIT) return "unresolved"
  return "open"
}

export function canAppendRound(issue: IssueThread): boolean {
  return issue.rounds.length < ROUND_LIMIT
}

export interface VersionRef {
  id: string
  publicationDate: string
}

export function newerVersion(versions: VersionRef[], currentId: string): VersionRef | null {
  const sorted = [...versions].sort((a, b) => {
    const byDate = a.publicationDate.localeCompare(b.publicationDate)
    if (byDate !== 0) return byDate
    return a.id.localeCompare(b.id)
  })
  const currentIndex = sorted.findIndex((item) => item.id === currentId)
  if (currentIndex === -1) return sorted.at(-1) ?? null
  return sorted[currentIndex + 1] ?? null
}

function threadFrom(
  issue: MajorIssue,
  base: Pick<IssueThread, "doi" | "recordVersion" | "source" | "sourceId">,
  authorLabel: string,
  authorRole: IssueRound["authorRole"],
  index: number,
  createdAt: string,
): IssueThread {
  const round: IssueRound = {
    id: `round_${base.sourceId}_${index}`,
    kind: "claim",
    authorLabel,
    authorRole,
    citations: issue.quotedPassage ? [{ quote: issue.quotedPassage, location: "Quoted in the failure claim" }] : [],
    body: issue.reason,
    createdAt,
  }
  return {
    id: `issue_${base.sourceId}_${index}_${issue.criterionId}`,
    doi: base.doi,
    recordVersion: base.recordVersion,
    source: base.source,
    sourceId: base.sourceId,
    criterionId: issue.criterionId,
    claim: issue.claim,
    quotedPassage: issue.quotedPassage,
    reason: issue.reason,
    status: "open",
    rounds: [round],
    createdAt,
    updatedAt: createdAt,
  }
}

export function issuesFromReview(review: StoredReview, authorLabel: string): IssueThread[] {
  const issues = review.report.majorIssues.map((issue, index) =>
    threadFrom(
      issue,
      { doi: review.doi, recordVersion: review.recordVersion, source: "review-major", sourceId: review.id },
      authorLabel,
      "reviewer",
      index,
      review.createdAt,
    ),
  )
  if (review.report.physics?.classification === "CHALLENGES") {
    const laws = review.report.physics.laws.join(", ") || "a named law"
    issues.push(
      threadFrom(
        {
          criterionId: "physics",
          claim: `The reading classifies this account as CHALLENGES current understanding (${laws}). That is not an automatic fail. The work needs to show how the clash is addressed.`,
          quotedPassage: review.report.physics.howAddressed,
          reason: review.report.physics.howAddressed || "Name the energy source, the exception, or the law that still holds.",
        },
        { doi: review.doi, recordVersion: review.recordVersion, source: "review-major", sourceId: review.id },
        authorLabel,
        "reviewer",
        issues.length,
        review.createdAt,
      ),
    )
  }
  return issues
}

export function issuesFromNode(node: NodeSubmission, authorLabel: string): IssueThread[] {
  if (node.verdict !== "fail") return []
  const modes: MajorIssue[] =
    node.failureModes.length > 0
      ? node.failureModes
      : node.errorsFound.map((error) => ({
          criterionId: "evidence-labelling",
          claim: error,
          quotedPassage: "",
          reason: error,
        }))
  return modes.map((issue, index) =>
    threadFrom(
      issue,
      { doi: node.doi, recordVersion: node.recordVersion, source: "node-fail", sourceId: node.id },
      authorLabel,
      "node",
      index,
      node.createdAt,
    ),
  )
}

export function mergeIssues(existing: IssueThread[], incoming: IssueThread[]): IssueThread[] {
  const seen = new Set(existing.map((issue) => claimKey(issue.doi, issue.recordVersion, issue.criterionId, issue.claim)))
  const next = [...existing]
  for (const issue of incoming) {
    const key = claimKey(issue.doi, issue.recordVersion, issue.criterionId, issue.claim)
    if (seen.has(key)) continue
    seen.add(key)
    next.push(issue)
  }
  return next
}

export function statusLabel(status: IssueStatus): string {
  switch (status) {
    case "open":
      return "Open"
    case "addressed-in-publication":
      return "Addressed in the publication"
    case "partially-addressed":
      return "Partially addressed"
    case "unresolved":
      return "Unresolved"
    case "fixed-in-new-version":
      return "Fixed in a newer version"
  }
}

export function issueCounts(issues: IssueThread[]): { open: number; unresolved: number; partial: number; addressed: number } {
  const counts = { open: 0, unresolved: 0, partial: 0, addressed: 0 }
  for (const issue of issues) {
    if (issue.status === "open") counts.open += 1
    else if (issue.status === "unresolved") counts.unresolved += 1
    else if (issue.status === "partially-addressed") counts.partial += 1
    else counts.addressed += 1
  }
  return counts
}

export function issuePenalty(issues: IssueThread[]): number {
  const counts = issueCounts(issues)
  return Math.min(0.4, counts.unresolved * 0.08 + counts.open * 0.04 + counts.partial * 0.03)
}

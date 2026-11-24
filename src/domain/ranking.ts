import type { AssessorProfile } from "./types.ts"
import { round2 } from "./criteria.ts"
import { computeReputations, fidelityFor, nodesForReviews, type FidelitySummary } from "./fidelity.ts"
import { issueCounts, issuePenalty } from "./issues.ts"
import { ASSESSOR_SPREAD, BOARD_PRIOR, boardValue, rankedBoardScore, scoringMismatch } from "./scoring.ts"
import type { AirDatabase, IssueThread, StoredReview } from "./types.ts"
import { isCommunityAiRecord } from "./moltbook.ts"
import { isHumanReview } from "./versions.ts"

export const PRIOR = 3
export { BOARD_PRIOR }
export const SHRINK_K = 2
const DISPUTE_NUDGE = 1.5
const VERIFY_BOOST = 1
const NUDGE_CAP = 5

export function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 1) return sorted[mid] ?? null
  const left = sorted[mid - 1]
  const right = sorted[mid]
  if (left === undefined || right === undefined) return null
  return round2((left + right) / 2)
}

export function shrink(score: number, count: number, prior = PRIOR): number {
  if (count <= 0) return prior
  return round2((count / (count + SHRINK_K)) * score + (SHRINK_K / (count + SHRINK_K)) * prior)
}

/** AIR v0.1 scores are 1–5. Kept so older tests can still read a 0–10 stretch. The board itself uses toBoard. */
export function normalizeToTen(score: number, criteriaVersion: string): number {
  if (criteriaVersion.startsWith("0.1")) return round2(((score - 1) / 4) * 10)
  return score
}

export interface AssessorCell {
  median: number
  count: number
  rankScore: number
}

export interface RankRow {
  key: string
  sample: boolean
  demo: boolean
  doi: string
  recordId: string
  conceptRecordId: string
  recordVersion: string
  title: string
  creators: string[]
  keywords: string[]
  publicationDate: string
  byAssessor: Record<string, AssessorCell>
  panelMedian: number | null
  panelRankScore: number | null
  ideaMedian: number | null
  ideaRankScore: number | null
  subscores: Record<string, { median: number | null; rankScore: number | null }>
  physicsClass: string | null
  criteriaVersions: string[]
  reviewCount: number
  fidelity: FidelitySummary
  issuePenalty: number
  openIssues: number
  unresolvedIssues: number
  partialIssues: number
  addressedIssues: number
  mismatchCount: number
  humanMedian: number | null
  humanCount: number
  humanMismatchCount: number
  humanReviews: StoredReview[]
  assessorsDisagree: boolean
  reviews: StoredReview[]
  issues: IssueThread[]
}

export interface RankingMethod {
  id: string
  label: string
  hint: string
  value: (row: RankRow) => number | null
}

const extraMethods: RankingMethod[] = []

export function registerRankingMethod(method: RankingMethod): void {
  const index = extraMethods.findIndex((item) => item.id === method.id)
  if (index >= 0) extraMethods[index] = method
  else extraMethods.push(method)
}

export function paperKey(doi: string, recordVersion: string): string {
  return `${doi}@@${recordVersion}`
}

function nudgeFor(rowPenalty: number, disputed: boolean): number {
  return Math.min(NUDGE_CAP, rowPenalty + (disputed ? DISPUTE_NUDGE : 0))
}

function humanStats(reviews: StoredReview[]): Pick<RankRow, "humanMedian" | "humanCount" | "humanMismatchCount" | "humanReviews"> {
  const counted = reviews.filter((review) => !scoringMismatch(review).mismatch)
  return {
    humanMedian: median(counted.map((review) => boardValue(review.report.overallScore, review.report, review.criteriaVersion))),
    humanCount: counted.length,
    humanMismatchCount: reviews.length - counted.length,
    humanReviews: reviews,
  }
}

export function buildRanking(db: AirDatabase, now = Date.now()): RankRow[] {
  const reputations = computeReputations(db.nodes)
  const groups = new Map<string, StoredReview[]>()
  const humanGroups = new Map<string, StoredReview[]>()
  for (const review of db.reviews) {
    if (review.customCriteria || isCommunityAiRecord(review)) continue
    const key = paperKey(review.doi, review.recordVersion)
    if (isHumanReview(review)) {
      const list = humanGroups.get(key) ?? []
      list.push(review)
      humanGroups.set(key, list)
      continue
    }
    if (review.tier === "free-screening") continue
    const list = groups.get(key) ?? []
    list.push(review)
    groups.set(key, list)
  }

  const rows: RankRow[] = []
  for (const [key, reviews] of groups) {
    const first = reviews[0]
    if (!first) continue
    const mismatchCount = reviews.filter((review) => scoringMismatch(review).mismatch).length
    const counted = reviews.filter((review) => !scoringMismatch(review).mismatch)
    const byAssessor: Record<string, AssessorCell> = {}
    const assessorIds = [...new Set(counted.map((review) => review.assessorId))]
    for (const assessorId of assessorIds) {
      const mine = counted.filter((review) => review.assessorId === assessorId)
      const value = median(mine.map((review) => rankedBoardScore(review)))
      if (value === null) continue
      byAssessor[assessorId] = { median: value, count: mine.length, rankScore: shrink(value, mine.length, BOARD_PRIOR) }
    }
    const assessorMedians = Object.values(byAssessor).map((cell) => cell.median)
    const panelMedian = median(assessorMedians)
    const ideaMedian = median(counted.map((review) => boardValue(review.report.ideaScore, review.report, review.criteriaVersion)))
    const subscores: RankRow["subscores"] = {}
    for (const sub of SUBSCORE_IDS) {
      const values = counted.flatMap((review) => {
        const found = review.report.scores.find((score) => score.criterionId === sub.id)
        return found ? [boardValue(found.score, review.report, review.criteriaVersion)] : []
      })
      const subMedian = median(values)
      subscores[sub.id] = {
        median: subMedian,
        rankScore: subMedian === null ? null : shrink(subMedian, values.length, BOARD_PRIOR),
      }
    }
    const classes = reviews.flatMap((review) => (review.report.physics ? [review.report.physics.classification] : []))
    const issues = db.issues.filter((issue) => issue.doi === first.doi && issue.recordVersion === first.recordVersion)
    const counts = issueCounts(issues)
    const penalty = issuePenalty(issues)
    const fidelity = fidelityFor(nodesForReviews(db.nodes, reviews), reputations, now)
    const nudge = nudgeFor(penalty, fidelity.disputed)
    const boost = fidelity.verifiedBoost ? VERIFY_BOOST : 0
    rows.push({
      key,
      sample: reviews.every((review) => review.sample),
      demo: reviews.every((review) => review.mock || review.sample),
      doi: first.doi,
      recordId: first.recordId,
      conceptRecordId: first.conceptRecordId,
      recordVersion: first.recordVersion,
      title: first.title,
      creators: first.creators,
      keywords: first.keywords,
      publicationDate: first.publicationDate,
      byAssessor,
      panelMedian,
      panelRankScore: panelMedian === null ? null : round2(shrink(panelMedian, counted.length, BOARD_PRIOR) - nudge + boost),
      ideaMedian,
      ideaRankScore: ideaMedian === null ? null : round2(shrink(ideaMedian, counted.length, BOARD_PRIOR) - nudge + boost),
      subscores,
      physicsClass: classes.sort((a, b) => classes.filter((item) => item === b).length - classes.filter((item) => item === a).length)[0] ?? null,
      criteriaVersions: [...new Set(reviews.map((review) => review.criteriaVersion))],
      reviewCount: reviews.length,
      mismatchCount,
      assessorsDisagree: assessorMedians.length >= 2 && Math.max(...assessorMedians) - Math.min(...assessorMedians) > ASSESSOR_SPREAD,
      fidelity,
      issuePenalty: round2(penalty),
      openIssues: counts.open,
      unresolvedIssues: counts.unresolved,
      partialIssues: counts.partial,
      addressedIssues: counts.addressed,
      ...humanStats(humanGroups.get(key) ?? []),
      reviews: [...reviews].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      issues,
    })
  }
  for (const [key, humans] of humanGroups) {
    if (groups.has(key)) continue
    const first = humans[0]
    if (!first) continue
    const issues = db.issues.filter((issue) => issue.doi === first.doi && issue.recordVersion === first.recordVersion)
    const counts = issueCounts(issues)
    rows.push({
      key,
      sample: humans.every((review) => review.sample),
      demo: false,
      doi: first.doi,
      recordId: first.recordId,
      conceptRecordId: first.conceptRecordId,
      recordVersion: first.recordVersion,
      title: first.title,
      creators: first.creators,
      keywords: first.keywords,
      publicationDate: first.publicationDate,
      byAssessor: {},
      panelMedian: null,
      panelRankScore: null,
      ideaMedian: null,
      ideaRankScore: null,
      subscores: {},
      physicsClass: null,
      criteriaVersions: [...new Set(humans.map((review) => review.criteriaVersion))],
      reviewCount: 0,
      mismatchCount: 0,
      assessorsDisagree: false,
      fidelity: fidelityFor([], reputations, now),
      issuePenalty: round2(issuePenalty(issues)),
      openIssues: counts.open,
      unresolvedIssues: counts.unresolved,
      partialIssues: counts.partial,
      addressedIssues: counts.addressed,
      ...humanStats(humans),
      reviews: [],
      issues,
    })
  }
  return rows
}

export const SUBSCORE_IDS: { id: string; label: string; hint: string }[] = [
  { id: "impact", label: "Impact", hint: "Scale of benefit" },
  { id: "feasibility", label: "Feasibility", hint: "Path to build or test" },
  { id: "physics", label: "Physics check", hint: "How well the work meets the laws it uses" },
  { id: "simulation", label: "Simulation", hint: "Reported simulation evidence" },
  { id: "estimated-value", label: "Estimated value", hint: "Quality of the AI value estimate, not a dollar forecast" },
  { id: "global-goals", label: "Global goals", hint: "Alignment with documented public goals" },
]

export function listRankingMethods(profiles: AssessorProfile[]): RankingMethod[] {
  const methods: RankingMethod[] = [
    {
      id: "panel",
      label: "Panel",
      hint: "Cautious combined score across assessors, on a 0–100 board",
      value: (row) => row.panelRankScore,
    },
    ...SUBSCORE_IDS.map(
      (sub): RankingMethod => ({
        id: sub.id,
        label: sub.label,
        hint: sub.hint,
        value: (row) => row.subscores[sub.id]?.rankScore ?? null,
      }),
    ),
    {
      id: "idea",
      label: "Idea",
      hint: "Impact and global-goals alignment",
      value: (row) => row.ideaRankScore,
    },
    ...profiles.map(
      (profile): RankingMethod => ({
        id: profile.id,
        label: profile.shortName,
        hint: `${profile.name}'s own median`,
        value: (row) => row.byAssessor[profile.id]?.rankScore ?? null,
      }),
    ),
  ]
  const seen = new Set(methods.map((method) => method.id))
  for (const method of extraMethods) {
    if (!seen.has(method.id)) methods.push(method)
  }
  return methods
}

export function sortRows(rows: RankRow[], method: RankingMethod): RankRow[] {
  return [...rows].sort((a, b) => {
    const left = method.value(a)
    const right = method.value(b)
    if (left === null && right === null) return a.title.localeCompare(b.title)
    if (left === null) return 1
    if (right === null) return -1
    if (right !== left) return right - left
    return a.title.localeCompare(b.title)
  })
}

export function tendency(
  rows: RankRow[],
  assessorId: string,
): { delta: number | null; label: string; compared: number } {
  const deltas: number[] = []
  for (const row of rows) {
    const mine = row.byAssessor[assessorId]
    if (!mine) continue
    const others = Object.entries(row.byAssessor)
      .filter(([id]) => id !== assessorId)
      .map(([, cell]) => cell.median)
    const otherMedian = median(others)
    if (otherMedian === null) continue
    deltas.push(mine.median - otherMedian)
  }
  if (deltas.length === 0) {
    return { delta: null, label: "Not enough shared records yet", compared: 0 }
  }
  const delta = round2(deltas.reduce((total, value) => total + value, 0) / deltas.length)
  const label = delta <= -2.5 ? "Harsher than the panel" : delta >= 2.5 ? "More lenient than the panel" : "Close to the panel"
  return { delta, label, compared: deltas.length }
}

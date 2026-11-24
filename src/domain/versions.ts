import type { IssueRound, IssueStatus, IssueThread, RoundKind, SourceResult, StoredReview } from "./types.ts"

export const ROUND_LIMIT = 6

const OUTSTANDING: ReadonlySet<IssueStatus> = new Set(["open", "unresolved", "partially-addressed"])
const CLOSED: ReadonlySet<IssueStatus> = new Set(["addressed-in-publication", "fixed-in-new-version"])

export interface VersionIdentity {
  id?: string
  doi?: string
}

/** Version DOI when the record has one, otherwise the Zenodo record id. Never a reconstructed `{id}@{date}` stamp. */
export function stableVersionId(version: VersionIdentity): string {
  const doi = version.doi?.trim()
  if (doi) return doi
  return version.id?.trim() || ""
}

/** Numeric Zenodo record id from a DOI, a bare id, or a `{id}@{date}` stamp. Version labels such as `v3` do not match. */
export function zenodoRecordId(value: string): string | null {
  const doi = value.match(/10\.5281\/zenodo\.(\d+)/i)
  if (doi?.[1]) return doi[1]
  const stamped = value.match(/^(\d{5,})@/)
  if (stamped?.[1]) return stamped[1]
  if (/^\d{5,}$/.test(value)) return value
  return null
}

export function samePublication(a: string, b: string): boolean {
  if (a === b) return true
  const left = zenodoRecordId(a)
  const right = zenodoRecordId(b)
  return Boolean(left && right && left === right)
}

export function isHumanReview(review: Pick<StoredReview, "origin" | "assessorId">): boolean {
  return review.origin === "human" || review.assessorId === "human"
}

export function normalizeClaim(claim: string): string {
  return claim.trim().toLowerCase().replace(/\s+/g, " ")
}

export interface RoundProposal {
  kind: RoundKind
  recordVersionChecked?: string
}

type RoundSlice = Pick<IssueRound, "kind" | "recordVersionChecked">

/**
 * Rounds belong to a version window.
 * A source check or re-check names its window through `recordVersionChecked`.
 * A claim stays on the version that opened the thread.
 * A rebuttal or counter stays in the window of the latest check, or the opening version.
 * Each window holds at most six rounds. A later version starts a fresh window.
 */
export function roundWindowVersion(issueVersion: string, rounds: readonly RoundSlice[], index: number): string {
  let active = issueVersion
  for (let walk = 0; walk <= index; walk += 1) {
    const item = rounds[walk]
    if (!item) continue
    const checked = item.recordVersionChecked?.trim() ?? ""
    if ((item.kind === "source-check" || item.kind === "recheck") && checked) active = checked
  }
  const item = rounds[index]
  if (!item) return active
  const checked = item.recordVersionChecked?.trim() ?? ""
  if ((item.kind === "source-check" || item.kind === "recheck") && checked) return checked
  if (item.kind === "claim") return issueVersion
  return active
}

function windowCount(issueVersion: string, rounds: readonly RoundSlice[], version: string): number {
  return rounds.filter((_, index) => roundWindowVersion(issueVersion, rounds, index) === version).length
}

export function canAppendRound(issue: IssueThread, proposal?: RoundProposal): boolean {
  if (!proposal) {
    if (issue.rounds.length === 0) return true
    const version = roundWindowVersion(issue.recordVersion, issue.rounds, issue.rounds.length - 1)
    return windowCount(issue.recordVersion, issue.rounds, version) < ROUND_LIMIT
  }
  const rounds: RoundSlice[] = [...issue.rounds, { kind: proposal.kind, recordVersionChecked: proposal.recordVersionChecked }]
  const version = roundWindowVersion(issue.recordVersion, rounds, rounds.length - 1)
  return windowCount(issue.recordVersion, rounds, version) <= ROUND_LIMIT
}

export function legacySixRoundMessage(message: string): boolean {
  return /stops at six rounds/i.test(message)
}

/** True when this appended round is legal under fluid windows but the unmigrated database still rejects it. */
export function fluidRoundPastLegacyCap(issue: IssueThread): boolean {
  if (issue.rounds.length <= ROUND_LIMIT) return false
  const added = issue.rounds[issue.rounds.length - 1]
  if (!added) return false
  const previous: IssueThread = { ...issue, rounds: issue.rounds.slice(0, -1) }
  return canAppendRound(previous, { kind: added.kind, recordVersionChecked: added.recordVersionChecked })
}

export const LOCAL_FLUID_ROUND_NOTE =
  "Saved on this browser. The shared board still stops at six rounds until its database is updated."

export function quoteInPublication(quote: string, text: string): boolean {
  const needle = quote.trim().toLowerCase().replace(/\s+/g, " ")
  if (needle.length < 12) return false
  const haystack = text.toLowerCase().replace(/\s+/g, " ")
  return haystack.includes(needle)
}

export function publicationPlainText(documents: { text: string }[], description = ""): string {
  return [description, ...documents.map((document) => document.text)].filter((part) => part.trim()).join("\n\n")
}

/** An addressed or partial result stands only when a quotation is actually in the text that was searched. */
export function settleCheckResult(
  result: SourceResult,
  citations: { quote: string; location: string }[],
  publicationText: string,
): { result: SourceResult; citations: { quote: string; location: string }[] } {
  const verified = citations.filter((citation) => quoteInPublication(citation.quote, publicationText))
  if ((result === "ADDRESSED" || result === "PARTIALLY_ADDRESSED") && verified.length === 0) {
    return { result: "NOT_ADDRESSED", citations: [] }
  }
  return { result, citations: verified }
}

export interface TextDocument {
  filename: string
  text: string
}

/**
 * A re-check against another Zenodo record searches only that record's text.
 * The files already loaded for the version on screen are not reused.
 */
export function documentsForRecheck(
  current: { id: string; documents: TextDocument[] },
  target: { id: string; documents: TextDocument[] },
): TextDocument[] {
  const usable = (documents: TextDocument[]) => documents.filter((document) => document.text.trim())
  if (target.id !== current.id) {
    const next = usable(target.documents)
    if (next.length === 0) {
      throw new Error("Load the newer version's files before re-checking. This check does not search the version already on screen.")
    }
    return next
  }
  const next = usable(current.documents)
  if (next.length === 0) throw new Error("Load this version's files before a source check.")
  return next
}

export function textBundle(
  record: { description: string; hasTextualFiles: boolean },
  documents: TextDocument[],
): TextDocument[] {
  const usable = documents.filter((document) => document.text.trim())
  if (usable.length > 0) return usable
  if (!record.hasTextualFiles && record.description.trim()) return [{ filename: "description", text: record.description }]
  return []
}

export interface ConceptVersionRef {
  doi: string
  recordVersion: string
}

export function carryForwardWorkList(input: {
  issues: IssueThread[]
  current: ConceptVersionRef
  conceptDois: string[]
}): { outstanding: IssueThread[]; closed: IssueThread[] } {
  const dois = new Set(input.conceptDois)
  const inConcept = input.issues.filter((issue) => dois.has(issue.doi))
  const onCurrent = (issue: IssueThread) => issue.doi === input.current.doi && issue.recordVersion === input.current.recordVersion
  const currentClaims = new Set(inConcept.filter(onCurrent).map((issue) => normalizeClaim(issue.claim)))
  const closed = inConcept
    .filter((issue) => CLOSED.has(issue.status))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id))
  const earlier = inConcept
    .filter((issue) => !onCurrent(issue) && OUTSTANDING.has(issue.status))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
  const seen = new Set<string>()
  const outstanding: IssueThread[] = []
  for (const issue of earlier) {
    const key = normalizeClaim(issue.claim)
    if (!key || currentClaims.has(key) || seen.has(key)) continue
    seen.add(key)
    outstanding.push(issue)
  }
  return { outstanding, closed }
}

export interface LineageSource {
  conceptRecordId: string
  recordId: string
  doi: string
  recordVersion: string
  publicationDate: string
  panelMedian: number | null
  ideaMedian: number | null
  openIssues: number
  unresolvedIssues: number
  partialIssues: number
  addressedIssues: number
}

export interface LineagePoint {
  recordId: string
  doi: string
  recordVersion: string
  publicationDate: string
  panelMedian: number | null
  ideaMedian: number | null
  open: number
  partial: number
  fixed: number
  place: "earlier" | "latest"
}

export function scoreLineage(rows: LineageSource[], conceptRecordId: string): LineagePoint[] {
  if (!conceptRecordId) return []
  const matched = rows.filter((row) => row.conceptRecordId === conceptRecordId)
  return markLatest(
    matched
      .map((row) => ({
        recordId: row.recordId,
        doi: row.doi,
        recordVersion: row.recordVersion,
        publicationDate: row.publicationDate,
        panelMedian: row.panelMedian,
        ideaMedian: row.ideaMedian,
        open: row.openIssues + row.unresolvedIssues,
        partial: row.partialIssues,
        fixed: row.addressedIssues,
        place: "earlier" as const,
      }))
      .sort(byDate),
  )
}

export function mergeLineage(
  points: LineagePoint[],
  versions: { id: string; doi: string; publicationDate: string; recordVersion?: string }[],
): LineagePoint[] {
  const byId = new Map(points.map((point) => [point.recordId, point]))
  const merged = versions.map((version) => {
    const existing = byId.get(version.id)
    if (existing) return { ...existing, publicationDate: existing.publicationDate || version.publicationDate }
    return {
      recordId: version.id,
      doi: version.doi,
      recordVersion: version.recordVersion || stableVersionId(version),
      publicationDate: version.publicationDate,
      panelMedian: null,
      ideaMedian: null,
      open: 0,
      partial: 0,
      fixed: 0,
      place: "earlier" as const,
    }
  })
  for (const point of points) {
    if (!merged.some((item) => item.recordId === point.recordId)) merged.push(point)
  }
  return markLatest(merged.sort(byDate))
}

function byDate(a: { publicationDate: string; recordId: string }, b: { publicationDate: string; recordId: string }): number {
  const byPublication = a.publicationDate.localeCompare(b.publicationDate)
  if (byPublication !== 0) return byPublication
  return a.recordId.localeCompare(b.recordId)
}

function markLatest(points: LineagePoint[]): LineagePoint[] {
  if (points.length === 0) return []
  return points.map((point, index) => ({ ...point, place: index === points.length - 1 ? "latest" : "earlier" }))
}

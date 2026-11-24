import { officialCriteria } from "../../domain/officialCriteria.ts"
import { criteriaForReview, describeScoring } from "../../domain/scoring.ts"
import type { CriteriaSet, StoredReview } from "../../domain/types.ts"
import { stripChatShareLinks } from "./standalone.ts"
import { WEB_CHAT_SOURCE, UNCALIBRATED_WEB_CHAT_TIER } from "./protocol.ts"

export const SUBMIT_LIMIT = 12
export const SUBMIT_WINDOW_MS = 10 * 60 * 1000
export const AIR_SITE_URL = "https://morgansmart-alt.github.io/open-ai-peer-review/"
/** Scores are posted straight to the Supabase function. GitHub Pages does not receive them. */
export const WEB_CHAT_SUBMIT_URL = "https://lotswxboafsenmszijpf.supabase.co/functions/v1/submit-web-chat"

const TOP_KEYS = new Set(["source", "tier", "paper", "site", "model", "criteriaVersion", "criterionProfile", "scores", "summary", "overallScore", "recommendation", "createdAt", "defended"])
const DEFENDED_KEYS = new Set(["label", "overallScore", "recommendation", "summary", "scores"])
const PAPER_KEYS = new Set(["title", "doi", "url"])

export interface DefendedScore {
  label: "after author defence"
  overallScore: number
  recommendation: string
  summary: string
  scores: { criterionId: string; score: number }[]
}

export interface WebChatSubmission {
  source: typeof WEB_CHAT_SOURCE
  tier: typeof UNCALIBRATED_WEB_CHAT_TIER
  paper: { title: string; doi: string; url: string }
  site: string
  model: string
  criteriaVersion: string
  /** Paper-type profile. Absent means the device or engineering set. */
  criterionProfile?: string
  scores: { criterionId: string; score: number }[]
  summary: string
  /** Blind score. This is the ranking value. */
  overallScore: number
  recommendation: string
  createdAt: string
  defended?: DefendedScore
}

export interface SubmissionRow {
  id: string
  doi: string
  site: string
  model: string
  title: string
  paper_url: string
  blind_score: number
  defended_score: number | null
  payload: WebChatSubmission & { id: string }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

export function dedupeKey(doiOrUrl: string, site: string, model: string): string {
  return [doiOrUrl.trim().toLowerCase(), site.trim().toLowerCase(), model.trim().toLowerCase()].join("|")
}

function stableHash(text: string): string {
  let hash = 2166136261
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16).padStart(8, "0")
}

export function submissionId(doiOrUrl: string, site: string, model: string): string {
  const key = dedupeKey(doiOrUrl, site, model)
  return `webchat_${stableHash(key)}${stableHash(`${key}|air`)}`
}

function clip(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : ""
}

export function submissionFromReview(review: StoredReview, site: string): { ok: true; submission: WebChatSubmission } | { ok: false; error: string } {
  const criteria = criteriaForReview(review)
  const checkScores = review.report.scores.map((score) => ({ criterionId: score.criterionId, score: score.score }))
  const described = describeScoring({
    scores: checkScores,
    statedOverall: review.report.overallScore,
    recommendation: review.report.recommendation,
    criteria,
  })
  if (described.scoringCheck.mismatch) {
    return { ok: false, error: "Scoring mismatch, needs re-check. This score stays on this browser until the chat is run again." }
  }
  const paperKey = review.doi && review.doi !== "local-file" ? review.doi : review.paperUrl || review.doi
  if (!paperKey) return { ok: false, error: "Add a DOI or a link before sending this score." }
  const summary = stripChatShareLinks(review.report.summary)
  const submission: WebChatSubmission = {
    source: WEB_CHAT_SOURCE,
    tier: UNCALIBRATED_WEB_CHAT_TIER,
    paper: { title: review.title, doi: review.doi === "local-file" ? "" : review.doi, url: review.paperUrl || "" },
    site,
    model: review.modelId,
    criteriaVersion: review.criteriaVersion,
    ...(review.criterionProfile ? { criterionProfile: review.criterionProfile } : {}),
    scores: checkScores,
    summary,
    overallScore: review.report.overallScore,
    recommendation: review.report.recommendation,
    createdAt: review.createdAt,
    ...(review.defended ? { defended: review.defended } : {}),
  }
  const checked = validateWebChatSubmission(submission, criteria)
  if (checked.ok) return { ok: true, submission: checked.submission }
  if (submission.defended) {
    const { defended: dropped, ...blind } = submission
    void dropped
    const retry = validateWebChatSubmission(blind, criteria)
    if (retry.ok) return { ok: true, submission: retry.submission }
  }
  return checked
}

export function validateWebChatSubmission(
  input: unknown,
  criteria: CriteriaSet = officialCriteria,
): { ok: true; submission: WebChatSubmission } | { ok: false; error: string } {
  if (!isRecord(input)) return { ok: false, error: "The score was not a JSON object." }
  for (const key of Object.keys(input)) {
    if (!TOP_KEYS.has(key)) return { ok: false, error: "The score included a field the board does not accept." }
  }
  if (input.source !== WEB_CHAT_SOURCE || input.tier !== UNCALIBRATED_WEB_CHAT_TIER) {
    return { ok: false, error: "Only an uncalibrated web-chat score can use this path." }
  }
  if (!isRecord(input.paper)) return { ok: false, error: "The paper title and link are missing." }
  for (const key of Object.keys(input.paper)) {
    if (!PAPER_KEYS.has(key)) return { ok: false, error: "The paper field included extra text." }
  }
  const title = clip(input.paper.title, 300)
  const doi = clip(input.paper.doi, 300)
  const url = clip(input.paper.url, 500)
  if (!title) return { ok: false, error: "The paper needs a title." }
  if (!doi && !url) return { ok: false, error: "The paper needs a DOI or a link." }
  const site = clip(input.site, 80)
  const model = clip(input.model, 160)
  if (!site || !model) return { ok: false, error: "The chat site and model name are missing." }
  const criteriaVersion = clip(input.criteriaVersion, 40)
  if (!criteriaVersion.startsWith("0.2")) return { ok: false, error: "The board accepts AIR v0.2 scores." }
  const criterionProfile = clip(input.criterionProfile, 40)
  if (!Array.isArray(input.scores)) return { ok: false, error: "The criterion scores are missing." }
  const scores = input.scores.map((item) => {
    if (!isRecord(item)) return null
    if (Object.keys(item).some((key) => key !== "criterionId" && key !== "score")) return null
    const criterionId = clip(item.criterionId, 80)
    const score = Number(item.score)
    return { criterionId, score }
  })
  if (scores.some((item) => item === null)) return { ok: false, error: "A criterion score had extra text." }
  const ready = scores.filter((item): item is { criterionId: string; score: number } => item !== null)
  const wanted = new Set(criteria.criteria.map((item) => item.id))
  if (ready.length !== wanted.size || ready.some((item) => !wanted.has(item.criterionId) || !Number.isInteger(item.score))) {
    return { ok: false, error: "Every criterion in this profile needs an integer score." }
  }
  const summary = stripChatShareLinks(clip(input.summary, 4000))
  if (summary.length < 40) return { ok: false, error: "The summary is too short." }
  if (/https?:\/\/(?:share\.google|chatgpt\.com\/share|claude\.ai\/share|grok\.com\/share)/i.test(summary)) {
    return { ok: false, error: "A private chat link was still in the summary." }
  }
  const overallScore = Number(input.overallScore)
  if (!Number.isInteger(overallScore)) return { ok: false, error: "The overall score must be an integer." }
  const recommendation = clip(input.recommendation, 80)
  const described = describeScoring({ scores: ready, statedOverall: overallScore, recommendation, criteria })
  if (described.scoringCheck.mismatch) {
    return { ok: false, error: "Scoring mismatch, needs re-check. This score was not sent." }
  }
  const createdAt = clip(input.createdAt, 40)
  if (!Number.isFinite(Date.parse(createdAt))) return { ok: false, error: "The score needs a timestamp." }
  const defended = readDefended(input.defended, criteria)
  if (!defended.ok) return defended
  return {
    ok: true,
    submission: {
      source: WEB_CHAT_SOURCE,
      tier: UNCALIBRATED_WEB_CHAT_TIER,
      paper: { title, doi, url },
      site,
      model,
      criteriaVersion,
      ...(criterionProfile ? { criterionProfile } : {}),
      scores: ready,
      summary,
      overallScore,
      recommendation,
      createdAt,
      ...(defended.score ? { defended: defended.score } : {}),
    },
  }
}

function readDefended(
  input: unknown,
  criteria: CriteriaSet,
): { ok: true; score: DefendedScore | null } | { ok: false; error: string } {
  if (input === undefined || input === null) return { ok: true, score: null }
  if (!isRecord(input)) return { ok: false, error: "The defended score was not a JSON object." }
  for (const key of Object.keys(input)) {
    if (!DEFENDED_KEYS.has(key)) return { ok: false, error: "The defended score included a field the board does not accept." }
  }
  if (input.label !== "after author defence") return { ok: false, error: "The second score must be labelled after author defence." }
  if (!Array.isArray(input.scores)) return { ok: false, error: "The defended score is missing its criterion scores." }
  const scores = input.scores.flatMap((item) => {
    if (!isRecord(item) || Object.keys(item).some((key) => key !== "criterionId" && key !== "score")) return []
    const criterionId = clip(item.criterionId, 80)
    const score = Number(item.score)
    return Number.isInteger(score) && criterionId ? [{ criterionId, score }] : []
  })
  const wanted = new Set(criteria.criteria.map((item) => item.id))
  if (scores.length !== wanted.size || scores.some((item) => !wanted.has(item.criterionId))) {
    return { ok: false, error: "The defended score needs every criterion in this profile." }
  }
  const summary = stripChatShareLinks(clip(input.summary, 4000))
  if (summary.length < 40) return { ok: false, error: "The defended summary is too short." }
  if (/https?:\/\/(?:share\.google|chatgpt\.com\/share|claude\.ai\/share|grok\.com\/share)/i.test(summary)) {
    return { ok: false, error: "A private chat link was still in the defended summary." }
  }
  const overallScore = Number(input.overallScore)
  if (!Number.isInteger(overallScore)) return { ok: false, error: "The defended score must be an integer." }
  const recommendation = clip(input.recommendation, 80)
  const described = describeScoring({ scores, statedOverall: overallScore, recommendation, criteria })
  if (described.scoringCheck.mismatch) return { ok: false, error: "The defended score clashes with its own weighted total, so it was not sent." }
  return { ok: true, score: { label: "after author defence", overallScore, recommendation, summary, scores } }
}

export function toSubmissionRow(submission: WebChatSubmission): SubmissionRow {
  const paperKey = submission.paper.doi || submission.paper.url
  const id = submissionId(paperKey, submission.site, submission.model)
  return {
    id,
    doi: paperKey.slice(0, 300),
    site: submission.site.slice(0, 80),
    model: submission.model.slice(0, 160),
    title: submission.paper.title.slice(0, 300),
    paper_url: submission.paper.url.slice(0, 500),
    blind_score: submission.overallScore,
    defended_score: submission.defended?.overallScore ?? null,
    payload: { ...submission, id },
  }
}

export function decideWebChatSubmission(
  input: unknown,
  context: { recentCount: number; existingIds: string[] },
): { ok: true; status: 200 | 201; duplicate: boolean; row: SubmissionRow } | { ok: false; status: number; error: string } {
  if (context.recentCount >= SUBMIT_LIMIT) {
    return { ok: false, status: 429, error: "Too many scores were sent in a short time. Wait and try again." }
  }
  const validated = validateWebChatSubmission(input)
  if (!validated.ok) return { ok: false, status: 400, error: validated.error }
  const row = toSubmissionRow(validated.submission)
  if (context.existingIds.includes(row.id)) return { ok: true, status: 200, duplicate: true, row }
  return { ok: true, status: 201, duplicate: false, row }
}

export function submissionToStored(payload: WebChatSubmission & { id?: string }): StoredReview {
  return {
    id: payload.id || submissionId(payload.paper.doi || payload.paper.url, payload.site, payload.model),
    sample: false,
    mock: false,
    doi: payload.paper.doi || payload.paper.url,
    recordId: "",
    conceptRecordId: "",
    recordVersion: "web-chat",
    title: payload.paper.title,
    creators: [],
    keywords: [],
    publicationDate: "",
    license: "",
    assessorId: payload.site,
    modelId: payload.model,
    provider: "compatible",
    criteriaId: "air",
    criteriaVersion: payload.criteriaVersion,
    criterionProfile: payload.criterionProfile,
    customCriteria: false,
    tier: UNCALIBRATED_WEB_CHAT_TIER,
    source: WEB_CHAT_SOURCE,
    paperUrl: payload.paper.url,
    defended: payload.defended,
    report: {
      summary: payload.summary,
      scores: payload.scores.map((score) => ({ criterionId: score.criterionId, score: score.score, rationale: "Score from an uncalibrated web chat.", citations: [] })),
      overallScore: payload.overallScore,
      ideaScore: payload.overallScore,
      recommendation: payload.recommendation,
      scale: 100,
      strengths: [],
      majorIssues: [],
      minorIssues: [],
      questionsForAuthors: [],
      suggestedNextSteps: [],
    },
    outputHash: "",
    createdAt: payload.createdAt,
    privateContextCount: 0,
  }
}

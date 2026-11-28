import type { CriteriaSet, ReviewReport } from "../../domain/types.ts"
import { acceptWebChatResult } from "./accept.ts"
import { officialCriteria } from "../../domain/officialCriteria.ts"
import { lastScoreJson } from "../jsonText.ts"
import { CAREFUL_DEFENCE_ENDING } from "../prompts.ts"
import type { DefendedScore } from "./submission.ts"

export const DEFENCE_DEFAULT_ROUNDS = 2
export const DEFENCE_MAX_ROUNDS = 3
/** Pause between chat turns so a site can finish streaming and cool its rate limit. */
export const DEFENCE_PAUSE_MS = 4_000
export const DEFENDED_LABEL = "after author defence" as const

export interface Critique {
  criterionId: string
  claim: string
  reason: string
  quotedPassage: string
}

export interface DefenceTurn {
  round: number
  kind: "rebuttal" | "reply" | "rescore" | "rescore-reply"
  text: string
}

export function clampDefenceRounds(value: number): number {
  if (!Number.isFinite(value)) return DEFENCE_DEFAULT_ROUNDS
  return Math.min(DEFENCE_MAX_ROUNDS, Math.max(1, Math.round(value)))
}

function clipDefence(text: string, limit: number): string {
  const trimmed = text.replace(/\s+/g, " ").trim()
  if (trimmed.length <= limit) return trimmed
  return `${trimmed.slice(0, limit - 1)}…`
}

export function critiquesFromReport(report: Pick<ReviewReport, "majorIssues" | "summary">): Critique[] {
  const issues = (report.majorIssues ?? []).flatMap((issue) => {
    const claim = issue.claim?.trim()
    if (!claim) return []
    return [{
      criterionId: issue.criterionId,
      claim: clipDefence(claim, 220),
      reason: clipDefence(issue.reason?.trim() || "", 180),
      quotedPassage: clipDefence(issue.quotedPassage?.trim() || "", 120),
    }]
  })
  if (issues.length > 0) return issues.slice(0, 4)
  const summary = report.summary?.trim()
  return summary ? [{ criterionId: "summary", claim: clipDefence(summary, 320), reason: "", quotedPassage: "" }] : []
}

export function defenceFailureNotice(reason: string): string {
  const detail = reason.replace(/\s+/g, " ").trim().replace(/\.+$/, "") || "the defence step did not finish"
  return `Defence step failed: ${detail}. Blind score saved.`
}

export function rebuttalPrompt(options: {
  round: number
  rounds: number
  critiques: Critique[]
  paperText: string
  /** False when the review used the public text link. The defence must not paste the PDF. */
  includeExcerpt?: boolean
}): string {
  const includeExcerpt = options.includeExcerpt !== false
  const excerpt = includeExcerpt ? options.paperText.replace(/\s+/g, " ").trim().slice(0, 6_000) : ""
  const lines = options.critiques.slice(0, 4).map((critique, index) => {
    const claim = clipDefence(critique.claim, 220)
    const reason = critique.reason ? ` Why it was raised: ${clipDefence(critique.reason, 180)}` : ""
    const quote = critique.quotedPassage ? ` Quoted passage: "${clipDefence(critique.quotedPassage, 120)}"` : ""
    return `${index + 1}. [${critique.criterionId}] ${claim}${reason}${quote}`
  })
  return [
    `Author defence, round ${options.round} of ${options.rounds}.`,
    includeExcerpt
      ? "Answer only from the paper text already in this chat and the excerpt below."
      : "The paper is already in this chat. Do not paste it again. Answer only from that text.",
    "Quote a section or a page when the paper itself states one. If a criticism is fair, say so plainly.",
    "Do not invent data, experiments, citations, or page numbers.",
    "",
    "Criticisms to answer:",
    ...lines,
    ...(includeExcerpt ? ["", "Paper excerpt:", excerpt || "(The paper text is in the earlier messages.)"] : []),
  ].join("\n")
}

export function rescorePrompt(): string {
  return [
    "Score the paper again with the same AIR v0.2 rubric.",
    "The first score stays the official blind score. This second score is after author defence.",
    "Use only the paper text in this chat. Do not invent data. Do not ask for an attachment.",
    CAREFUL_DEFENCE_ENDING,
    "Keep the same fields as the first review: summary, scores for every criterion, overallScore, and recommendation.",
  ].join("\n")
}

export async function runDefenceLoop(options: {
  rounds: number
  critiques: Critique[]
  paperText: string
  includeExcerpt?: boolean
  send: (prompt: string, label?: string, expect?: "json" | "text") => Promise<string>
  aborted: () => boolean
  pause?: () => Promise<void>
  onProgress?: (message: string) => void
}): Promise<{ transcript: DefenceTurn[]; defendedText: string | null; stopped: boolean }> {
  const rounds = clampDefenceRounds(options.rounds)
  const transcript: DefenceTurn[] = []
  const pause = options.pause ?? (async () => undefined)
  const includeExcerpt = options.includeExcerpt !== false
  for (let round = 1; round <= rounds; round += 1) {
    if (options.aborted()) return { transcript, defendedText: null, stopped: true }
    options.onProgress?.(`Defence round ${round} of ${rounds}. Stay on the chat tab.`)
    const prompt = rebuttalPrompt({ round, rounds, critiques: options.critiques, paperText: options.paperText, includeExcerpt })
    transcript.push({ round, kind: "rebuttal", text: prompt })
    const reply = await options.send(prompt, `defence round ${round} of ${rounds}`, "text")
    if (options.aborted()) return { transcript, defendedText: null, stopped: true }
    transcript.push({ round, kind: "reply", text: reply })
    await pause()
  }
  if (options.aborted()) return { transcript, defendedText: null, stopped: true }
  options.onProgress?.("Asking for the score after author defence.")
  const prompt = rescorePrompt()
  transcript.push({ round: rounds, kind: "rescore", text: prompt })
  const defendedText = await options.send(prompt, "score after author defence", "json")
  if (options.aborted()) return { transcript, defendedText: null, stopped: true }
  transcript.push({ round: rounds, kind: "rescore-reply", text: defendedText })
  return { transcript, defendedText, stopped: false }
}

function roundedOverall(value: unknown): number | null {
  const score = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : Number.NaN
  if (!Number.isFinite(score)) return null
  const rounded = Math.round(score * 100) / 100
  if (rounded < 0 || rounded > 100) return null
  return rounded
}

/** The number a reply states when it does not return a full score sheet. */
export function statedDefenceOverall(raw: string): number | null {
  const scored = lastScoreJson(raw)
  const fromJson = scored && typeof scored.value === "object" && scored.value
    ? roundedOverall((scored.value as { overallScore?: unknown }).overallScore)
    : null
  if (fromJson !== null) return fromJson
  const match = raw.match(/overall(?:\s+score)?\s+(?:remains|stays|stayed|is|was|of|:)\s*(?:at\s+)?(\d{1,3}(?:\.\d+)?)\b/i)
  if (!match) return null
  return roundedOverall(Number(match[1]))
}

function partialDefended(raw: string, overall: number): DefendedScore {
  const scored = lastScoreJson(raw)
  const row = scored && typeof scored.value === "object" && scored.value ? (scored.value as Record<string, unknown>) : {}
  const summaryRaw = typeof row.summary === "string" ? row.summary.trim() : ""
  const summary = summaryRaw.length >= 40
    ? summaryRaw.slice(0, 4000)
    : "The chat stated an overall score after author defence. The reply did not include a full score sheet."
  const recommendation = typeof row.recommendation === "string" ? row.recommendation.trim().slice(0, 80) : ""
  const scores = Array.isArray(row.scores)
    ? row.scores.flatMap((item) => {
        if (!item || typeof item !== "object") return []
        const record = item as { criterionId?: unknown; score?: unknown; uncited?: unknown }
        const criterionId = typeof record.criterionId === "string" ? record.criterionId.trim() : ""
        const score = Number(record.score)
        return criterionId && Number.isInteger(score)
          ? [{ criterionId, score, ...(record.uncited === true ? { uncited: true as const } : {}) }]
          : []
      })
    : []
  return { label: DEFENDED_LABEL, overallScore: overall, recommendation, summary, scores }
}

export function defendedFromReply(
  raw: string,
  criteria: CriteriaSet = officialCriteria,
): { ok: true; defended: DefendedScore; partial?: boolean } | { ok: false; error: string } {
  const accepted = acceptWebChatResult(raw, criteria)
  const clashes = accepted.ok && accepted.report.scoringCheck?.mismatch === true
  if (accepted.ok && !clashes) {
    return {
      ok: true,
      defended: {
        label: DEFENDED_LABEL,
        overallScore: accepted.report.overallScore,
        recommendation: accepted.report.recommendation,
        summary: accepted.report.summary,
        scores: accepted.report.scores.map((score) => ({
          criterionId: score.criterionId,
          score: score.score,
          ...(score.uncited ? { uncited: true } : {}),
        })),
      },
    }
  }
  const stated = statedDefenceOverall(raw)
  if (stated == null) {
    const error = accepted.ok ? "The defended score clashes with its own weighted total." : accepted.errors[0] || "The defended score was not usable JSON."
    return { ok: false, error }
  }
  return { ok: true, partial: true, defended: partialDefended(raw, stated) }
}

/** Prefer a sheet that validates. Otherwise keep whichever reply still names an overall. */
export function chooseDefendedText(original: string, settled: string, criteria: CriteriaSet): string {
  if (acceptWebChatResult(settled, criteria).ok) return settled
  if (acceptWebChatResult(original, criteria).ok) return original
  if (statedDefenceOverall(settled) != null) return settled
  return original
}

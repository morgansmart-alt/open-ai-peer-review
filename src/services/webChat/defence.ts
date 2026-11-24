import type { ReviewReport } from "../../domain/types.ts"
import { acceptWebChatResult } from "./accept.ts"
import { officialCriteria } from "../../domain/officialCriteria.ts"
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

export function critiquesFromReport(report: Pick<ReviewReport, "majorIssues" | "summary">): Critique[] {
  const issues = (report.majorIssues ?? []).flatMap((issue) => {
    const claim = issue.claim?.trim()
    if (!claim) return []
    return [{ criterionId: issue.criterionId, claim, reason: issue.reason?.trim() || "", quotedPassage: issue.quotedPassage?.trim() || "" }]
  })
  if (issues.length > 0) return issues.slice(0, 6)
  const summary = report.summary?.trim()
  return summary ? [{ criterionId: "summary", claim: summary.slice(0, 500), reason: "", quotedPassage: "" }] : []
}

export function rebuttalPrompt(options: { round: number; rounds: number; critiques: Critique[]; paperText: string }): string {
  const excerpt = options.paperText.replace(/\s+/g, " ").trim().slice(0, 6_000)
  const lines = options.critiques.map((critique, index) => {
    const quote = critique.quotedPassage ? ` Quoted passage: "${critique.quotedPassage}"` : ""
    const reason = critique.reason ? ` Why it was raised: ${critique.reason}` : ""
    return `${index + 1}. [${critique.criterionId}] ${critique.claim}${reason}${quote}`
  })
  return [
    `Author defence, round ${options.round} of ${options.rounds}.`,
    "Answer only from the paper text already in this chat and the excerpt below.",
    "Quote a section or a page when the paper itself states one. If a criticism is fair, say so plainly.",
    "Do not invent data, experiments, citations, or page numbers.",
    "",
    "Criticisms to answer:",
    ...lines,
    "",
    "Paper excerpt:",
    excerpt || "(The paper text is in the earlier messages.)",
  ].join("\n")
}

export function rescorePrompt(): string {
  return [
    "Score the paper again with the same AIR v0.2 rubric.",
    "The first score stays the official blind score. This second score is after author defence.",
    "Use only the paper text in this chat. Do not invent data. Return one JSON object and nothing else.",
    "Keep the same fields as the first review: summary, scores for every criterion, overallScore, and recommendation.",
  ].join("\n")
}

export async function runDefenceLoop(options: {
  rounds: number
  critiques: Critique[]
  paperText: string
  send: (prompt: string) => Promise<string>
  aborted: () => boolean
  pause?: () => Promise<void>
  onProgress?: (message: string) => void
}): Promise<{ transcript: DefenceTurn[]; defendedText: string | null; stopped: boolean }> {
  const rounds = clampDefenceRounds(options.rounds)
  const transcript: DefenceTurn[] = []
  const pause = options.pause ?? (async () => undefined)
  for (let round = 1; round <= rounds; round += 1) {
    if (options.aborted()) return { transcript, defendedText: null, stopped: true }
    options.onProgress?.(`Defence round ${round} of ${rounds}. Stay on the chat tab.`)
    const prompt = rebuttalPrompt({ round, rounds, critiques: options.critiques, paperText: options.paperText })
    transcript.push({ round, kind: "rebuttal", text: prompt })
    const reply = await options.send(prompt)
    if (options.aborted()) return { transcript, defendedText: null, stopped: true }
    transcript.push({ round, kind: "reply", text: reply })
    await pause()
  }
  if (options.aborted()) return { transcript, defendedText: null, stopped: true }
  options.onProgress?.("Asking for the score after author defence.")
  const prompt = rescorePrompt()
  transcript.push({ round: rounds, kind: "rescore", text: prompt })
  const defendedText = await options.send(prompt)
  if (options.aborted()) return { transcript, defendedText: null, stopped: true }
  transcript.push({ round: rounds, kind: "rescore-reply", text: defendedText })
  return { transcript, defendedText, stopped: false }
}

export function defendedFromReply(raw: string): { ok: true; defended: DefendedScore } | { ok: false; error: string } {
  const accepted = acceptWebChatResult(raw, officialCriteria)
  if (!accepted.ok) return { ok: false, error: accepted.errors[0] || "The defended score was not usable JSON." }
  const describedOk = accepted.report.scoringCheck?.mismatch !== true
  if (!describedOk) return { ok: false, error: "The defended score clashes with its own weighted total." }
  return {
    ok: true,
    defended: {
      label: DEFENDED_LABEL,
      overallScore: accepted.report.overallScore,
      recommendation: accepted.report.recommendation,
      summary: accepted.report.summary,
      scores: accepted.report.scores.map((score) => ({ criterionId: score.criterionId, score: score.score })),
    },
  }
}

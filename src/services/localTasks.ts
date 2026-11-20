import { estimateTokens } from "../domain/freeModels.ts"
import type { CriteriaSet, ReviewReport } from "../domain/types.ts"
import type { ZenodoRecord } from "./zenodo.ts"
import { extractJsonValue, validateReport } from "./validateReport.ts"
import { verifyQuotes } from "./review.ts"
import { reviewSystemPrompt, reviewUserPrompt } from "./prompts.ts"
import { chunkText, quoteMatchesCorpus } from "./textTools.ts"
import { fenceAuthorText, POSSIBLE_VS_PROVEN, type PaperSlice } from "./paperSearch.ts"

export const LOCAL_SCREENING_LABEL = "Local screening, not ranked"

export function charsForContext(contextTokens: number, reserveTokens = 1_500): number {
  const room = Math.max(256, contextTokens - reserveTokens)
  return Math.max(800, Math.floor(room * 2.7))
}

export function chunkForLocal(text: string, contextTokens: number): string[] {
  return chunkText(text, charsForContext(contextTokens))
}

export function askPrompt(question: string, slices: PaperSlice[]): string {
  const packed = slices.map((slice) => `## ${slice.label} (${slice.id})\n${slice.text}`).join("\n\n")
  return [
    "Answer the question from the author material only. Cite a short quotation from it in double quotes, and name the page or section.",
    POSSIBLE_VS_PROVEN,
    `Question: ${question}`,
    fenceAuthorText(packed || "(no matching passage)"),
  ].join("\n\n")
}

export function extractPrompt(sectionLabel: string, text: string): string {
  return [
    "List claims, risks, and mitigations from this section. Return JSON: {\"items\":[{\"kind\":\"claim\"|\"risk\"|\"mitigation\",\"text\":\"string\",\"quote\":\"verbatim\",\"label\":\"measured\"|\"modelled\"|\"derived\"|\"proposed\"}]}.",
    "The quote must be copied from the author material. A summary is not a quote.",
    POSSIBLE_VS_PROVEN,
    `Section: ${sectionLabel}`,
    fenceAuthorText(text),
  ].join("\n\n")
}

export function summaryPrompt(sectionLabel: string, text: string): string {
  return [
    "Write a section summary of at most 300 words. Start with the words AI SECTION SUMMARY. This summary is not quotable.",
    POSSIBLE_VS_PROVEN,
    `Section: ${sectionLabel}`,
    fenceAuthorText(text),
  ].join("\n\n")
}

export interface CheckedQuote {
  quote: string
  verified: boolean
}

export function quotesInAnswer(answer: string, corpus: string): CheckedQuote[] {
  const found = [...answer.matchAll(/"([^"]{12,400})"/g)].map((match) => match[1] ?? "")
  return found.map((quote) => ({ quote, verified: quoteMatchesCorpus(quote, corpus) }))
}

export type GeminiPlan = "free" | "plus" | "pro"

export const GEMINI_PLAN_TOKENS: Record<GeminiPlan, number> = {
  free: 32_000,
  plus: 128_000,
  pro: 1_000_000,
}

export function buildGeminiHandoff(input: {
  record: ZenodoRecord
  criteria: CriteriaSet
  documents: { filename: string; text: string }[]
  plan: GeminiPlan
}): { prompt: string; coverage: "full" | "partial"; note: string } {
  const budgetTokens = GEMINI_PLAN_TOKENS[input.plan]
  const budgetChars = Math.floor(budgetTokens * 2.7 * 0.65)
  const full = input.documents.map((document) => `## ${document.filename}\n${document.text}`).join("\n\n")
  const fits = estimateTokens(full.length) <= budgetTokens * 0.65
  const body = fits ? full : full.slice(0, budgetChars)
  const coverage = fits ? "full" : "partial"
  const note = fits
    ? "The whole extracted text is in the prompt."
    : `A free Gemini account takes about 32,000 tokens. This ${input.plan} prompt holds part of the paper, so the reading is partial and cannot be published as a full review.`
  const prompt = [reviewSystemPrompt(input.criteria), POSSIBLE_VS_PROVEN, reviewUserPrompt(input.record, input.criteria, fenceAuthorText(body), [])].join("\n\n")
  return { prompt, coverage, note }
}

export function assessPastedReply(
  raw: string,
  criteria: CriteriaSet,
  corpus: string,
  coverage: "full" | "partial",
): { ok: true; report: ReviewReport } | { ok: false; errors: string[] } {
  let parsed: unknown
  try {
    parsed = extractJsonValue(raw)
  } catch (error) {
    return { ok: false, errors: [error instanceof Error ? error.message : "The pasted text was not JSON."] }
  }
  const validated = validateReport(parsed, criteria)
  if (!validated.ok) return validated
  const report = verifyQuotes(
    {
      ...validated.report,
      reading: { pagesRead: coverage === "full" ? 1 : 0, pagesTotal: 1, chunksSummarised: 0, coverage },
      provenance: {
        source: "gemini-web",
        label: "Gemini web, pasted",
        humanHandoff: true,
        selfReported: true,
      },
    },
    corpus,
  )
  return { ok: true, report }
}

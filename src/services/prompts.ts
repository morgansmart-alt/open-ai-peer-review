import { conversationPromptBlock } from "../domain/conversationLinks.ts"
import { globalGoals } from "../domain/goals.ts"
import type { ConversationLink } from "../domain/conversationLinks.ts"
import type { CriteriaSet, MajorIssue, ReviewReport } from "../domain/types.ts"
import type { RelatedSnippet, ZenodoRecord } from "./zenodo.ts"
import { anchorExcerpts, sectionsFor } from "./textTools.ts"

/** Safe single-call size. 1M-token models can take about 1.4M characters; a 200k-token model about 400k. */
export function singleCallCharBudget(provider: string): number {
  if (provider === "gemini" || provider === "xai" || provider === "openai") return 1_400_000
  if (provider === "anthropic") return 400_000
  return 350_000
}

export function textFitsSingleCall(documents: { text: string }[], provider: string): boolean {
  const total = documents.reduce((sum, document) => sum + document.text.length, 0)
  return total <= singleCallCharBudget(provider)
}

export function reviewSystemPrompt(criteria: CriteriaSet): string {
  return [
    "You are an AIR reviewer. Return one JSON object and nothing else.",
    "Judge the work on its logic and evidence. Do not score author credentials, affiliations, reputation, or identity. If those appear, ignore them.",
    "Be specific and kind. Every criticism needs a way to resolve it.",
    "Quote only passages that appear in the text you were given. Do not invent page numbers, results, or citations.",
    `Score every criterion with an integer from ${criteria.scale.min} to ${criteria.scale.max}.`,
    criteria.scale.max >= 100
      ? "The board is out of 100. AIR weights the criterion scores itself. If you include overallScore, keep it within 10 points of that weighted total. recommendation must match the band: encourage from 80, revise from 60, major-revision from 40, otherwise not-ready."
      : "",
    criteria.reportSchema === "0.2"
      ? [
          "On every score set confidence to low, medium, or high. Untested is not the same as wrong. A CHALLENGES physics class is not an automatic fail.",
          "A simulation or verification run means a named script, an audit table, or a numerical cross-check. Say which of those the record contains. A sentence that only claims \"we simulated\" is not a completed run.",
          "Mark a global goal direct only when the record gives a bounded quantitative contribution, with a number and a unit or a range. A TRL 1–3 concept without that estimate is at most partial.",
          "Under consistency, look for numbers carried over from an earlier version, an erratum, or a supplement after the text changed. Flag a stale figure.",
          "Quote only text marked as the paper or as VERBATIM EXCERPTS. A block labelled AI SECTION SUMMARIES is not the paper. Do not present a summary sentence as a quotation.",
        ].join("\n")
      : "",
    "Principles:",
    ...criteria.principles.map((principle) => `- ${principle}`),
  ].join("\n")
}

export function reviewUserPrompt(record: ZenodoRecord, criteria: CriteriaSet, packet: string, conversations: ConversationLink[] = []): string {
  const schema = {
    summary: "string, 80-180 words",
    scores: criteria.criteria.map((criterion) => ({
      criterionId: criterion.id,
      score: `${criteria.scale.min}-${criteria.scale.max}`,
      rationale: "string citing the record",
      citations: [{ quote: "verbatim", location: "file or section" }],
      ...(criteria.reportSchema === "0.2" ? { confidence: "low | medium | high" } : {}),
    })),
    ...(criteria.reportSchema === "0.2"
      ? {
          ontologyClass: "physical-testable | physical-not-yet-testable | logical-mathematical | metaphysical-philosophical",
          physics: { classification: "CONSISTENT | EXTENDS | CHALLENGES", laws: ["named law"], howAddressed: "string" },
          simulation: { reported: "integer or null", passed: "integer or null", methods: "string", inputsAvailable: false },
          valueEstimate: {
            assumptions: ["string"],
            marketDisruption: "string",
            addressableMarket: { low: "string", central: "string", high: "string", unit: "string" },
            units: { low: "string", central: "string", high: "string", unit: "string" },
            valuePerUnit: { low: "string", central: "string", high: "string", unit: "string" },
            overallBenefit: { low: "string", central: "string", high: "string", unit: "string" },
          },
          goals: globalGoals.goals.map((goal) => ({ goalId: goal.id, level: "none | indirect | partial | direct", note: "string" })),
        }
      : {}),
    overallScore: criteria.scale.max >= 100 ? "integer 0-100, within 10 of the weighted criterion total" : `number from ${criteria.scale.min} to ${criteria.scale.max}`,
    recommendation: criteria.recommendationCategories.map((item) => item.id).join(" | "),
    strengths: ["string"],
    majorIssues: [{ criterionId: "id", claim: "what is wrong", quotedPassage: "verbatim or empty", reason: "why it matters and how to fix it" }],
    minorIssues: ["string"],
    questionsForAuthors: ["string"],
    suggestedNextSteps: ["string"],
  }
  const guide = criteria.criteria
    .map((criterion) => {
      const bands = criterion.bands?.map((band) => `${band.min}-${band.max}: ${band.label}`).join(" ") ?? ""
      return `${criterion.id} (weight ${criterion.weight}): ${criterion.name}. ${criterion.description} Guidance: ${criterion.guidance} ${bands}`
    })
    .join("\n")
  const goalsGuide =
    criteria.reportSchema === "0.2"
      ? ["Documented goals you may score against. Do not add goals that are not in this list.", ...globalGoals.goals.map((goal) => `- ${goal.id}: ${goal.statement} (${goal.sourceUrl})`)].join("\n")
      : ""
  return [
    `Record: ${record.title}`,
    `DOI: ${record.doi}`,
    `Version: ${record.recordVersion}`,
    `Date: ${record.publicationDate}`,
    `License: ${record.license || "unspecified"}`,
    `Keywords: ${record.keywords.join(", ") || "none"}`,
    "",
    "Criteria:",
    guide,
    goalsGuide,
    "",
    "Return JSON with this shape:",
    JSON.stringify(schema),
    "",
    conversationPromptBlock(conversations),
    "",
    "Use majorIssues only for failure modes a reviser must face. Leave it empty if nothing rises to that level.",
    "",
    "Record text:",
    packet,
  ].join("\n")
}

export function buildPacket(record: ZenodoRecord, documents: { filename: string; text: string }[], summaries: string[] | null): string {
  const fileList = record.files.map((file) => `- ${file.key} (${file.size} bytes)`).join("\n")
  const description = record.description.slice(0, 4000)
  const verbatim = documents.map((document) => `## ${document.filename}\n${summaries ? anchorExcerpts(document.text) : document.text}`).join("\n\n")
  const body = summaries
    ? ["AI SECTION SUMMARIES (NOT VERBATIM QUOTES)", "Do not quote this block as paper text.", ...summaries, "", "VERBATIM EXCERPTS", verbatim].join("\n\n")
    : verbatim
  return [`Description:\n${description}`, `Files:\n${fileList || "- none"}`, body].join("\n\n")
}

export function shouldSummarize(documents: { text: string }[], provider = "compatible"): boolean {
  return !textFitsSingleCall(documents, provider)
}

export function chunksFor(documents: { filename: string; text: string }[]): { label: string; text: string }[] {
  return sectionsFor(documents)
}

export function summarySystemPrompt(): string {
  return "Summarise this section for a later peer review. Preserve numbers, units, equations, named claims, limitations, and open questions, plus one or two short verbatim quotes. Note where this section sits in the document. Plain text, under 350 words."
}

export function reduceSystemPrompt(): string {
  return "Combine these section notes into one digest for a peer review. Cover every section you are given, including the last ones. Keep numbers, equations, named claims, limitations, and one short verbatim quote from each section. Plain text."
}

export function sourceCheckPrompt(
  issue: Pick<MajorIssue, "claim" | "quotedPassage" | "reason" | "criterionId">,
  packet: string,
  related: RelatedSnippet[],
  conversations: ConversationLink[] = [],
): string {
  const linked = related.map((item) => `${item.doi} ${item.title}\n${item.description}`).join("\n\n") || "None loaded."
  return [
    "Decide whether the failure is addressed by the publication text.",
    "Return JSON: {\"result\":\"ADDRESSED\"|\"PARTIALLY_ADDRESSED\"|\"NOT_ADDRESSED\",\"explanation\":\"string\",\"citations\":[{\"quote\":\"verbatim\",\"location\":\"where\"}]}",
    "ADDRESSED means the publication text answers the failure with a passage a reader can check. A chat link is not a citation. PARTIALLY_ADDRESSED means the publication touches the topic but leaves the failure standing. NOT_ADDRESSED means you cannot find such a passage. Do not invent quotes. If you cannot open a conversation link, say so and do not guess its contents.",
    `Criterion: ${issue.criterionId}`,
    `Failure: ${issue.claim}`,
    `Quoted passage from the claim: ${issue.quotedPassage || "(none)"}`,
    `Why it was raised: ${issue.reason}`,
    "",
    "Related records:",
    linked,
    "",
    conversationPromptBlock(conversations),
    "",
    "Publication text:",
    packet,
  ].join("\n")
}

export function independentPrompt(report: ReviewReport, packet: string, criteria: CriteriaSet, conversations: ConversationLink[] = []): string {
  return [
    "You are an independent check on an existing AIR reading. Judge the reading against the record, not the author's identity.",
    "Return JSON only:",
    JSON.stringify({
      verdict: "pass | fail",
      summary: "string",
      judgements: criteria.criteria.map((criterion) => ({
        criterionId: criterion.id,
        agree: true,
        theirScore: 3,
        note: "string",
      })),
      errorsFound: ["string"],
      failureModes: [{ criterionId: "id", claim: "string", quotedPassage: "string", reason: "string" }],
    }),
    "pass means the original scores are defensible. fail means a material score is unsupported or a real error was missed. Cite only the publication text you were given. Never invent the contents of a conversation link.",
    "",
    conversationPromptBlock(conversations),
    "",
    "Original reading:",
    JSON.stringify(report),
    "",
    "Record:",
    packet,
  ].join("\n")
}

export function repairPrompt(raw: string, errors: string[]): string {
  return `The previous output was not valid AIR JSON. Return only a corrected JSON object. Keep the original judgements unless a field was missing or invalid.\nErrors:\n${errors.join("\n")}\n\nPrevious output:\n${raw.slice(0, 12_000)}`
}

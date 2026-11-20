import type { ConversationLink } from "../domain/conversationLinks.ts"
import { sha256Hex } from "./hash.ts"
import type { AssessorProfile, CriteriaSet, ProviderSettings, ReviewReport, SourceResult } from "../domain/types.ts"
import { buildDemoReport, buildDemoSourceCheck, buildDemoVerdict } from "./mockReview.ts"
import { completeChat, resolvedModel } from "./providers.ts"
import {
  buildPacket,
  chunksFor,
  independentPrompt,
  reduceSystemPrompt,
  repairPrompt,
  reviewSystemPrompt,
  reviewUserPrompt,
  shouldSummarize,
  sourceCheckPrompt,
  summarySystemPrompt,
} from "./prompts.ts"
import { bundleItems, readingCoverage } from "./textTools.ts"
import { extractJsonValue, validateReport } from "./validateReport.ts"
import type { RelatedSnippet, ZenodoRecord } from "./zenodo.ts"
import type { CriterionJudgement, MajorIssue, Verdict } from "../domain/types.ts"

export interface RunContext {
  profile: AssessorProfile
  settings: ProviderSettings
  criteria: CriteriaSet
  record: ZenodoRecord
  documents: { filename: string; text: string; pagesRead?: number; pagesTotal?: number; pages?: number }[]
  conversationLinks?: ConversationLink[]
  demo: boolean
  signal?: AbortSignal
  onProgress?: (message: string) => void
}

async function completeJson(ctx: RunContext, system: string, user: string): Promise<unknown> {
  const model = resolvedModel(ctx.profile, ctx.settings)
  const first = await completeChat(ctx.profile, ctx.settings, { model, system, user, json: true, signal: ctx.signal })
  try {
    return extractJsonValue(first)
  } catch {
    ctx.onProgress?.(`${ctx.profile.name} returned malformed JSON. Asking for a repair.`)
    const second = await completeChat(ctx.profile, ctx.settings, {
      model,
      system,
      user: repairPrompt(first, ["The output was not parseable JSON."]),
      json: true,
      signal: ctx.signal,
    })
    return extractJsonValue(second)
  }
}

async function validatedReport(ctx: RunContext, packet: string, conversations: ConversationLink[]): Promise<ReviewReport> {
  const system = reviewSystemPrompt(ctx.criteria)
  const user = reviewUserPrompt(ctx.record, ctx.criteria, packet, conversations)
  const model = resolvedModel(ctx.profile, ctx.settings)
  let raw = await completeChat(ctx.profile, ctx.settings, { model, system, user, json: true, signal: ctx.signal })
  let parsed: unknown = null
  try {
    parsed = extractJsonValue(raw)
  } catch {
    parsed = null
  }
  let validated = parsed ? validateReport(parsed, ctx.criteria) : { ok: false as const, errors: ["The output was not JSON."] }
  if (validated.ok) return validated.report
  ctx.onProgress?.(`${ctx.profile.name}'s reading did not match the schema. Asking for a repair.`)
  const repaired = await completeChat(ctx.profile, ctx.settings, {
    model,
    system,
    user: repairPrompt(raw, validated.errors),
    json: true,
    signal: ctx.signal,
  })
  parsed = extractJsonValue(repaired)
  validated = validateReport(parsed, ctx.criteria)
  if (!validated.ok) {
    throw new Error(`${ctx.profile.name} did not return a usable reading. ${validated.errors.slice(0, 3).join(" ")}`)
  }
  return validated.report
}

const DIGEST_BUDGET = 28_000

async function summariseSections(ctx: RunContext): Promise<string[] | null> {
  if (!shouldSummarize(ctx.documents)) return null
  const sections = chunksFor(ctx.documents)
  let summaries = []
  for (let index = 0; index < sections.length; index += 1) {
    const section = sections[index]
    if (!section) continue
    ctx.onProgress?.(`Summarising section ${index + 1} of ${sections.length}…`)
    const summary = await completeChat(ctx.profile, ctx.settings, {
      model: resolvedModel(ctx.profile, ctx.settings),
      system: summarySystemPrompt(),
      user: `Section ${index + 1} of ${sections.length} (${section.label}).\n\n${section.text}`,
      json: false,
      signal: ctx.signal,
    })
    summaries.push(`${section.label}: ${summary}`)
  }
  let round = 0
  while (summaries.join("\n\n").length > DIGEST_BUDGET && summaries.length > 1 && round < 4) {
    const groups = bundleItems(summaries, 4)
    const next: string[] = []
    for (let index = 0; index < groups.length; index += 1) {
      const group = groups[index]
      if (!group) continue
      ctx.onProgress?.(`Combining sections ${index + 1} of ${groups.length}…`)
      const summary = await completeChat(ctx.profile, ctx.settings, {
        model: resolvedModel(ctx.profile, ctx.settings),
        system: reduceSystemPrompt(),
        user: group.join("\n\n"),
        json: false,
        signal: ctx.signal,
      })
      next.push(summary)
    }
    summaries = next
    round += 1
  }
  return summaries
}

export async function runReview(ctx: RunContext): Promise<ReviewReport> {
  const text = [ctx.record.description, ...ctx.documents.map((document) => document.text)].filter(Boolean).join("\n\n")
  const sections = chunksFor(ctx.documents)
  const chunksSummarised = shouldSummarize(ctx.documents) ? sections.length : 0
  const reading = readingCoverage(ctx.documents, chunksSummarised)
  if (ctx.demo) {
    ctx.onProgress?.(`Building a demo reading for ${ctx.profile.name}.`)
    return {
      ...buildDemoReport({
        profile: ctx.profile,
        criteria: ctx.criteria,
        text,
        filenames: ctx.documents.map((document) => document.filename),
        title: ctx.record.title,
      }),
      reading,
    }
  }
  const summaries = await summariseSections(ctx)
  ctx.onProgress?.(`${ctx.profile.name} is scoring the record.`)
  const report = await validatedReport(ctx, buildPacket(ctx.record, ctx.documents, summaries), ctx.conversationLinks ?? [])
  return { ...report, reading }
}

export interface SourceCheckDraft {
  result: SourceResult
  explanation: string
  citations: { quote: string; location: string }[]
}

export async function runSourceCheck(options: {
  ctx: RunContext
  claim: string
  quotedPassage: string
  reason: string
  criterionId: string
  related: RelatedSnippet[]
}): Promise<SourceCheckDraft> {
  const text = [options.ctx.record.description, ...options.ctx.documents.map((document) => document.text)].join("\n\n")
  if (options.ctx.demo) {
    return buildDemoSourceCheck(options.claim, text, options.ctx.record.recordVersion)
  }
  const packet = buildPacket(options.ctx.record, options.ctx.documents, null)
  const raw = await completeJson(
    options.ctx,
    "You check whether a publication addresses a specific failure. Return JSON only. Do not invent quotations.",
    sourceCheckPrompt(
      { claim: options.claim, quotedPassage: options.quotedPassage, reason: options.reason, criterionId: options.criterionId },
      packet,
      options.related,
      options.ctx.conversationLinks ?? [],
    ),
  )
  const record = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {}
  const result = record.result
  if (result !== "ADDRESSED" && result !== "PARTIALLY_ADDRESSED" && result !== "NOT_ADDRESSED") {
    throw new Error("The source check did not return ADDRESSED, PARTIALLY_ADDRESSED, or NOT_ADDRESSED.")
  }
  const citations = Array.isArray(record.citations)
    ? record.citations.flatMap((item) => {
        if (typeof item !== "object" || item === null) return []
        const quote = "quote" in item && typeof item.quote === "string" ? item.quote : ""
        const location = "location" in item && typeof item.location === "string" ? item.location : "Record"
        return quote ? [{ quote: quote.slice(0, 500), location }] : []
      })
    : []
  return {
    result,
    explanation: typeof record.explanation === "string" ? record.explanation.slice(0, 2000) : "",
    citations,
  }
}

export interface VerdictDraft {
  verdict: Verdict
  summary: string
  judgements: CriterionJudgement[]
  errorsFound: string[]
  failureModes: MajorIssue[]
  promptHash: string
}

export async function runIndependent(options: { ctx: RunContext; original: ReviewReport }): Promise<VerdictDraft> {
  const text = [options.ctx.record.description, ...options.ctx.documents.map((document) => document.text)].join("\n\n")
  const prompt = independentPrompt(
    options.original,
    buildPacket(options.ctx.record, options.ctx.documents, null),
    options.ctx.criteria,
    options.ctx.conversationLinks ?? [],
  )
  const promptHash = await sha256Hex(prompt)
  if (options.ctx.demo) {
    return { ...buildDemoVerdict({
      profile: options.ctx.profile,
      criteria: options.ctx.criteria,
      originalScores: options.original.scores,
      text,
      title: options.ctx.record.title,
    }), promptHash }
  }
  const raw = await completeJson(options.ctx, "You independently check an AIR reading. Return JSON only.", prompt)
  const record = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {}
  if (record.verdict !== "pass" && record.verdict !== "fail") throw new Error("The independent check did not return pass or fail.")
  const judgements: CriterionJudgement[] = options.ctx.criteria.criteria.map((criterion) => {
    const found = Array.isArray(record.judgements)
      ? record.judgements.find((item) => typeof item === "object" && item !== null && "criterionId" in item && item.criterionId === criterion.id)
      : null
    const row = typeof found === "object" && found !== null ? (found as Record<string, unknown>) : {}
    const theirScore = Number(row.theirScore)
    return {
      criterionId: criterion.id,
      agree: Boolean(row.agree),
      theirScore: Number.isInteger(theirScore) ? theirScore : null,
      note: typeof row.note === "string" ? row.note.slice(0, 500) : "",
    }
  })
  const failureModes: MajorIssue[] = Array.isArray(record.failureModes)
    ? record.failureModes.flatMap((item) => {
        if (typeof item !== "object" || item === null) return []
        const row = item as Record<string, unknown>
        const claim = typeof row.claim === "string" ? row.claim : ""
        if (!claim) return []
        return [
          {
            criterionId: typeof row.criterionId === "string" ? row.criterionId : options.ctx.criteria.criteria[0]?.id ?? "clarity",
            claim: claim.slice(0, 500),
            quotedPassage: typeof row.quotedPassage === "string" ? row.quotedPassage.slice(0, 500) : "",
            reason: typeof row.reason === "string" ? row.reason.slice(0, 800) : claim,
          },
        ]
      })
    : []
  return {
    verdict: record.verdict,
    summary: typeof record.summary === "string" ? record.summary.slice(0, 2000) : "",
    judgements,
    errorsFound: Array.isArray(record.errorsFound) ? record.errorsFound.filter((item): item is string => typeof item === "string").slice(0, 8) : [],
    failureModes,
    promptHash,
  }
}

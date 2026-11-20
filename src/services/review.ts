import type { ConversationLink } from "../domain/conversationLinks.ts"
import { sha256Hex } from "./hash.ts"
import type { AssessorProfile, Citation, CriteriaSet, CriterionJudgement, MajorIssue, ProviderSettings, ReviewReport, SourceResult, Verdict } from "../domain/types.ts"
import { buildDemoReport, buildDemoSourceCheck, buildDemoVerdict } from "./mockReview.ts"
import { FREE_PROVIDER_IDS, jobForText, tokensForJob } from "../domain/freeModels.ts"
import { completeChat, resolvedModel } from "./providers.ts"
import { loadRouterHealth, saveRouterHealth } from "./routerStore.ts"
import { routeComplete } from "./router.ts"
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
import { bundleItems, quoteMatchesCorpus, readingCoverage } from "./textTools.ts"
import { extractJsonValue, validateReport } from "./validateReport.ts"
import type { RelatedSnippet, ZenodoRecord } from "./zenodo.ts"

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
  autoPick?: boolean
  keys?: Record<string, string>
}

async function completeText(ctx: RunContext, system: string, user: string, json: boolean): Promise<{ content: string; model: string; family?: string; attempts?: string[]; provider?: string }> {
  const model = resolvedModel(ctx.profile, ctx.settings)
  const providersWithKeys = FREE_PROVIDER_IDS.filter((id) => Boolean(ctx.keys?.[id]?.trim()))
  const useRouter = Boolean(ctx.autoPick) && providersWithKeys.length > 0
  if (!useRouter) return completeChat(ctx.profile, ctx.settings, { model, system, user, json, signal: ctx.signal })
  const job = jobForText(user.length)
  const routed = await routeComplete({
    tokens: tokensForJob(job, user.length + system.length),
    job,
    providersWithKeys,
    health: loadRouterHealth(),
    now: Date.now(),
    privateMaterial: (ctx.conversationLinks?.length ?? 0) > 0,
    call: async (candidate) => {
      const profile = { ...ctx.profile, provider: candidate.provider, defaultModel: candidate.model, defaultBaseUrl: baseUrlFor(candidate.provider) }
      try {
        const result = await completeChat(profile, ctx.settings, {
          model: candidate.model,
          system,
          user,
          json,
          signal: ctx.signal,
        })
        return { status: 200, body: "", content: result.content, servedModel: result.model }
      } catch (error) {
        const message = error instanceof Error ? error.message : "The provider failed."
        const status = /429|rate limit|quota/i.test(message) ? 429 : /503|overloaded|high demand/i.test(message) ? 503 : /401|rejected that API key/i.test(message) ? 401 : /credit|spending/i.test(message) ? 403 : 500
        return { status, body: message }
      }
    },
  })
  saveRouterHealth(routed.health)
  if (!routed.ok && routed.attempts.length === 0) {
    if ((ctx.conversationLinks?.length ?? 0) > 0) {
      throw new Error("Private notes are not sent to free models that may train on prompts. Use a paid key, or remove the private link.")
    }
    return completeChat(ctx.profile, ctx.settings, { model, system, user, json, signal: ctx.signal })
  }
  if (!routed.ok) throw new Error(routed.error)
  return { content: routed.content, model: routed.servedModel, family: routed.family, attempts: routed.attempts, provider: routed.model.provider }
}

function baseUrlFor(provider: string): string {
  if (provider === "gemini") return "https://generativelanguage.googleapis.com/v1beta"
  if (provider === "openrouter") return "https://openrouter.ai/api/v1"
  if (provider === "groq") return "https://api.groq.com/openai/v1"
  if (provider === "cohere") return "https://api.cohere.ai/compatibility/v1"
  return ""
}

async function completeJson(ctx: RunContext, system: string, user: string): Promise<unknown> {
  const first = await completeText(ctx, system, user, true)
  try {
    return extractJsonValue(first.content)
  } catch {
    ctx.onProgress?.(`${ctx.profile.name} returned malformed JSON. Asking for a repair.`)
    const second = await completeText(ctx, system, repairPrompt(first.content, ["The output was not parseable JSON."]), true)
    return extractJsonValue(second.content)
  }
}

async function validatedReport(ctx: RunContext, packet: string, conversations: ConversationLink[]): Promise<{ report: ReviewReport; model: string; family?: string; attempts?: string[]; provider?: string }> {
  const system = reviewSystemPrompt(ctx.criteria)
  const user = reviewUserPrompt(ctx.record, ctx.criteria, packet, conversations)
  const first = await completeText(ctx, system, user, true)
  let raw = first.content
  let model = first.model
  let parsed: unknown = null
  try {
    parsed = extractJsonValue(raw)
  } catch {
    parsed = null
  }
  let validated = parsed ? validateReport(parsed, ctx.criteria) : { ok: false as const, errors: ["The output was not JSON."] }
  if (validated.ok) return { report: validated.report, model, family: first.family, attempts: first.attempts, provider: first.provider }
  ctx.onProgress?.(`${ctx.profile.name}'s reading did not match the schema. Asking for a repair.`)
  const repaired = await completeText(ctx, system, repairPrompt(raw, validated.errors), true)
  raw = repaired.content
  model = repaired.model || model
  parsed = extractJsonValue(raw)
  validated = validateReport(parsed, ctx.criteria)
  if (!validated.ok) {
    throw new Error(`${ctx.profile.name} did not return a usable reading. ${validated.errors.slice(0, 3).join(" ")}`)
  }
  return { report: validated.report, model, family: repaired.family ?? first.family, attempts: repaired.attempts ?? first.attempts, provider: repaired.provider ?? first.provider }
}

function verifyQuotes(report: ReviewReport, corpus: string): ReviewReport {
  let unverifiedQuotes = 0
  const mark = (quote: string): boolean => {
    const verified = quoteMatchesCorpus(quote, corpus)
    if (quote.trim() && !verified) unverifiedQuotes += 1
    return verified
  }
  const scores = report.scores.map((score) => ({
    ...score,
    citations: score.citations.map((citation: Citation) => ({ ...citation, quoteVerified: citation.quote.trim() ? mark(citation.quote) : undefined })),
  }))
  const majorIssues = report.majorIssues.map((issue: MajorIssue) => ({
    ...issue,
    quoteVerified: issue.quotedPassage.trim() ? mark(issue.quotedPassage) : undefined,
  }))
  return { ...report, scores, majorIssues, unverifiedQuotes }
}

const DIGEST_BUDGET = 28_000

async function summariseSections(ctx: RunContext): Promise<string[] | null> {
  if (!shouldSummarize(ctx.documents, ctx.profile.provider)) return null
  const sections = chunksFor(ctx.documents)
  let summaries = []
  for (let index = 0; index < sections.length; index += 1) {
    const section = sections[index]
    if (!section) continue
    ctx.onProgress?.(`Summarising section ${index + 1} of ${sections.length}…`)
    const summary = await completeText(ctx, summarySystemPrompt(), `Section ${index + 1} of ${sections.length} (${section.label}).\n\n${section.text}`, false)
    summaries.push(`${section.label}: ${summary.content}`)
  }
  let round = 0
  while (summaries.join("\n\n").length > DIGEST_BUDGET && summaries.length > 1 && round < 4) {
    const groups = bundleItems(summaries, 4)
    const next: string[] = []
    for (let index = 0; index < groups.length; index += 1) {
      const group = groups[index]
      if (!group) continue
      ctx.onProgress?.(`Combining sections ${index + 1} of ${groups.length}…`)
      const summary = await completeText(ctx, reduceSystemPrompt(), group.join("\n\n"), false)
      next.push(summary.content)
    }
    summaries = next
    round += 1
  }
  return summaries
}

export async function runReview(ctx: RunContext): Promise<ReviewReport> {
  const text = [ctx.record.description, ...ctx.documents.map((document) => document.text)].filter(Boolean).join("\n\n")
  const summarise = shouldSummarize(ctx.documents, ctx.profile.provider)
  const sections = chunksFor(ctx.documents)
  const reading = readingCoverage(ctx.documents, summarise ? sections.length : 0)
  const corpus = text
  if (ctx.demo) {
    ctx.onProgress?.(`Building a demo reading for ${ctx.profile.name}.`)
    return verifyQuotes(
      {
        ...buildDemoReport({
          profile: ctx.profile,
          criteria: ctx.criteria,
          text,
          filenames: ctx.documents.map((document) => document.filename),
          title: ctx.record.title,
        }),
        reading,
      },
      corpus,
    )
  }
  const summaries = await summariseSections(ctx)
  ctx.onProgress?.(`${ctx.profile.name} is scoring the record.`)
  const scored = await validatedReport(ctx, buildPacket(ctx.record, ctx.documents, summaries), ctx.conversationLinks ?? [])
  return verifyQuotes(
    {
      ...scored.report,
      reading,
      servedModel: scored.model,
      router: scored.family ? { family: scored.family, provider: scored.provider, attempts: scored.attempts ?? [], job: jobForText(text.length) } : undefined,
    },
    corpus,
  )
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

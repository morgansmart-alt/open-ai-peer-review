import { describe, expect, it } from "vitest"
import { officialCriteria } from "../../domain/officialCriteria.ts"
import { buildRanking } from "../../domain/ranking.ts"
import { ladderTier } from "../../domain/fidelity.ts"
import { decideWebChatSubmission, submissionFromReview, validateWebChatSubmission, WEB_CHAT_SUBMIT_URL } from "./submission.ts"
import { WEB_CHAT_SOURCE, UNCALIBRATED_WEB_CHAT_TIER } from "./protocol.ts"
import type { StoredReview } from "../../domain/types.ts"

function scores(score: number) {
  return officialCriteria.criteria.map((criterion) => ({ criterionId: criterion.id, score }))
}

function payload(overall: number, recommendation: string, extra: Record<string, unknown> = {}) {
  return {
    source: WEB_CHAT_SOURCE,
    tier: UNCALIBRATED_WEB_CHAT_TIER,
    paper: { title: "A public note", doi: "10.5281/zenodo.18916931", url: "https://zenodo.org/records/18916931" },
    site: "Grok",
    model: "Grok on grok.com (web chat, uncalibrated)",
    criteriaVersion: "0.2.0",
    scores: scores(70),
    summary: "The record states a narrow claim and shows the weighing steps that support it, with the season limit written in the text.",
    overallScore: overall,
    recommendation,
    createdAt: "2026-11-22T00:00:00.000Z",
    ...extra,
  }
}

describe("web-chat submission", () => {
  it("posts to the production AIR site path", () => {
    expect(WEB_CHAT_SUBMIT_URL).toBe("https://lotswxboafsenmszijpf.supabase.co/functions/v1/submit-web-chat")
  })

  it("accepts a matching score and rejects a mismatch, a private link, and extra fields", () => {
    const good = validateWebChatSubmission(payload(70, "revise"))
    expect(good.ok).toBe(true)
    if (!good.ok) return
    expect(JSON.stringify(good.submission)).not.toContain("instructions")
    expect(JSON.stringify(good.submission)).not.toContain("share.google")
    const clash = validateWebChatSubmission(payload(95, "encourage"))
    expect(clash.ok).toBe(false)
    if (!clash.ok) expect(clash.error).toContain("Scoring mismatch")
    const leaked = validateWebChatSubmission({
      ...payload(70, "revise"),
      summary: "The record states a narrow claim and shows the weighing steps. https://share.google/aimode/SECRET",
    })
    expect(leaked.ok).toBe(true)
    if (leaked.ok) expect(JSON.stringify(leaked.submission)).not.toContain("SECRET")
    const extra = validateWebChatSubmission({ ...payload(70, "revise"), instructions: "the whole prompt" })
    expect(extra.ok).toBe(false)
  })

  it("rate-limits a burst and treats the same paper, site, and model as one row", () => {
    const body = payload(70, "revise")
    const first = decideWebChatSubmission(body, { recentCount: 0, existingIds: [] })
    expect(first.ok && first.duplicate).toBe(false)
    if (!first.ok) return
    const again = decideWebChatSubmission(body, { recentCount: 0, existingIds: [first.row.id] })
    expect(again.ok && again.duplicate).toBe(true)
    const limited = decideWebChatSubmission(body, { recentCount: 12, existingIds: [] })
    expect(limited.ok).toBe(false)
    if (!limited.ok) expect(limited.status).toBe(429)
    const otherSite = decideWebChatSubmission({ ...body, site: "Claude" }, { recentCount: 0, existingIds: [first.row.id] })
    expect(otherSite.ok && otherSite.duplicate).toBe(false)
  })

  it("keeps a sent score off the calibrated board and the two-family count", () => {
    const decision = decideWebChatSubmission(payload(70, "revise"), { recentCount: 0, existingIds: [] })
    expect(decision.ok).toBe(true)
    if (!decision.ok) return
    const review = {
      id: decision.row.id,
      sample: false,
      mock: false,
      doi: decision.row.doi,
      recordId: "18916931",
      conceptRecordId: "18916931",
      recordVersion: "web-chat",
      title: "A public note",
      creators: [],
      keywords: [],
      publicationDate: "",
      license: "",
      assessorId: "Grok",
      modelId: decision.row.model,
      provider: "compatible",
      criteriaId: "air",
      criteriaVersion: "0.2.0",
      customCriteria: false,
      tier: "uncalibrated web-chat",
      source: "web-chat extension",
      report: {
        summary: payload(70, "revise").summary,
        scores: scores(70).map((score) => ({ ...score, rationale: "Cited in the record.", citations: [] })),
        overallScore: 70,
        ideaScore: 70,
        recommendation: "revise",
        scale: 100,
        strengths: [],
        majorIssues: [],
        minorIssues: [],
        questionsForAuthors: [],
        suggestedNextSteps: [],
      },
      outputHash: "x",
      createdAt: "2026-11-22T00:00:00.000Z",
    } satisfies StoredReview
    expect(buildRanking({ reviews: [review], nodes: [], issues: [], claims: [] })).toEqual([])
    expect(ladderTier([review], [])).toBe("free-web-chat")
    const blocked = submissionFromReview(
      { ...review, report: { ...review.report, overallScore: 99, recommendation: "encourage" } },
      "Grok",
    )
    expect(blocked.ok).toBe(false)
  })
})

import { describe, expect, it } from "vitest"
import { afterDefenceLine } from "../../domain/criteria.ts"
import { officialCriteria } from "../../domain/officialCriteria.ts"
import { weightedMean } from "../../domain/criteria.ts"
import { buildRanking } from "../../domain/ranking.ts"
import { ladderTier } from "../../domain/fidelity.ts"
import { decideWebChatSubmission, submissionFromReview, submissionToStored, toSubmissionRow, validateWebChatSubmission, WEB_CHAT_SUBMIT_URL } from "./submission.ts"
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
    const decimal = validateWebChatSubmission(payload(70.25, "revise"))
    expect(decimal.ok).toBe(true)
    if (decimal.ok) {
      expect(decimal.submission.overallScore).toBe(70.25)
      expect(toSubmissionRow(decimal.submission).blind_score).toBe(70.25)
    }
    const rounded = validateWebChatSubmission(payload(70.256, "revise"))
    expect(rounded.ok).toBe(true)
    if (rounded.ok) expect(rounded.submission.overallScore).toBe(70.26)
    const defended = validateWebChatSubmission(payload(70, "revise", {
      defended: {
        label: "after author defence",
        overallScore: 70.5,
        recommendation: "revise",
        summary: payload(70, "revise").summary,
        scores: scores(70),
      },
    }))
    expect(defended.ok).toBe(true)
    if (defended.ok) {
      expect(defended.submission.defended?.overallScore).toBe(70.5)
      expect(toSubmissionRow(defended.submission).defended_score).toBe(70.5)
    }
    const fraction = validateWebChatSubmission({
      ...payload(70, "revise"),
      scores: scores(70).map((item, index) => (index === 0 ? { ...item, score: 70.5 } : item)),
    })
    expect(fraction.ok).toBe(false)
    const huge = validateWebChatSubmission(payload(140.2, "accept"))
    expect(huge.ok).toBe(false)
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
    const otherModel = decideWebChatSubmission(
      { ...body, model: "Grok on grok.com · Expert (web chat, uncalibrated)" },
      { recentCount: 0, existingIds: [first.row.id] },
    )
    expect(otherModel.ok && otherModel.duplicate).toBe(false)
    if (otherModel.ok && first.ok) expect(otherModel.row.id).not.toBe(first.row.id)
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

  it("posts uncited scores and an optional global-goals bonus that the server accepts", () => {
    const uncitedIds = new Set(["impact", "world-class", "testability", "estimated-value"])
    const reportScores = officialCriteria.criteria.flatMap((criterion) => {
      if (criterion.id === "global-goals") return []
      return [{
        criterionId: criterion.id,
        score: uncitedIds.has(criterion.id) ? 0 : 100,
        rationale: `${criterion.name} is supported by a passage a reader can find, with the remaining gap named.`,
        citations: [] as { quote: string; location: string }[],
        ...(uncitedIds.has(criterion.id) ? { uncited: true } : {}),
      }]
    })
    const overall = weightedMean(reportScores, officialCriteria)
    expect(overall).not.toBeNull()
    const review = {
      ...({
        id: "web-uncited",
        sample: false,
        mock: false,
        doi: "10.5281/zenodo.18916931",
        recordId: "18916931",
        conceptRecordId: "18916931",
        recordVersion: "web-chat",
        title: "A public note",
        creators: [],
        keywords: [],
        publicationDate: "",
        license: "",
        assessorId: "Grok",
        modelId: "Grok on grok.com (web chat, uncalibrated)",
        provider: "compatible",
        criteriaId: "air",
        criteriaVersion: "0.2.0",
        customCriteria: false,
        tier: "uncalibrated web-chat",
        source: "web-chat extension",
        paperUrl: "https://zenodo.org/records/18916931",
        report: {
          summary: payload(80, "encourage").summary,
          scores: reportScores,
          overallScore: overall ?? 0,
          ideaScore: overall ?? 0,
          recommendation: "encourage",
          scale: 100,
          strengths: [],
          majorIssues: [],
          minorIssues: [],
          questionsForAuthors: [],
          suggestedNextSteps: [],
        },
        outputHash: "x",
        createdAt: "2026-11-22T00:00:00.000Z",
      } satisfies StoredReview),
    }
    const client = submissionFromReview(review, "Grok")
    expect(client.ok).toBe(true)
    if (!client.ok) return
    expect(client.submission.scores.some((score) => score.criterionId === "global-goals")).toBe(false)
    expect(client.submission.scores.find((score) => score.criterionId === "estimated-value")?.uncited).toBe(true)
    expect(client.submission.overallScore).toBe(overall)
    const server = validateWebChatSubmission(client.submission)
    expect(server.ok).toBe(true)
    if (!server.ok) return
    expect(server.submission.overallScore).toBe(client.submission.overallScore)
    expect(server.submission.scores.find((score) => score.criterionId === "estimated-value")?.uncited).toBe(true)
    const row = toSubmissionRow(server.submission)
    expect(row.payload.scores.find((score) => score.criterionId === "estimated-value")?.uncited).toBe(true)
    expect(row.blind_score).toBe(overall)
    const fullWeight = validateWebChatSubmission({
      ...client.submission,
      scores: client.submission.scores.map(({ uncited: dropped, ...score }) => {
        void dropped
        return score
      }),
    })
    expect(fullWeight.ok).toBe(false)
    if (!fullWeight.ok) expect(fullWeight.error).toContain("Scoring mismatch")
  })

  it("keeps an after-defence overall when the sheet is incomplete or disagrees with its own weights", () => {
    const near = validateWebChatSubmission(payload(65.02, "encourage", {
      defended: {
        label: "after author defence",
        overallScore: 65,
        recommendation: "encourage",
        summary: payload(65, "encourage").summary,
        scores: scores(80),
      },
    }))
    expect(near.ok).toBe(true)
    if (!near.ok) return
    expect(near.submission.overallScore).toBe(65.02)
    expect(near.submission.defended?.overallScore).toBe(65)
    expect(toSubmissionRow(near.submission).defended_score).toBe(65)
    const stored = submissionToStored(near.submission)
    expect(afterDefenceLine(stored.defended?.overallScore)).toBe(" · after author defence 65.00")
    expect(afterDefenceLine(stored.report.overallScore)).toBe(" · after author defence 65.02")
    expect(afterDefenceLine(0)).toBe(" · after author defence 0.00")
    expect(afterDefenceLine(undefined)).toBe("")
    const review = {
      id: "web-defended",
      sample: false,
      mock: false,
      doi: "10.5281/zenodo.18706746",
      recordId: "18706746",
      conceptRecordId: "18706746",
      recordVersion: "web-chat",
      title: "Quantized Inertia",
      creators: [],
      keywords: [],
      publicationDate: "",
      license: "",
      assessorId: "Grok",
      modelId: "Grok on grok.com · Auto (web chat, uncalibrated)",
      provider: "compatible",
      criteriaId: "air",
      criteriaVersion: "0.2.0",
      customCriteria: false,
      tier: "uncalibrated web-chat",
      source: "web-chat extension",
      paperUrl: "https://zenodo.org/records/18706746",
      report: {
        summary: payload(70, "encourage").summary,
        scores: scores(70).map((score) => ({ ...score, rationale: "Cited in the record.", citations: [] as { quote: string; location: string }[] })),
        overallScore: 70,
        ideaScore: 70,
        recommendation: "encourage",
        scale: 100,
        strengths: [],
        majorIssues: [],
        minorIssues: [],
        questionsForAuthors: [],
        suggestedNextSteps: [],
      },
      defended: {
        label: "after author defence" as const,
        overallScore: 65,
        recommendation: "encourage",
        summary: "short",
        scores: [{ criterionId: "clarity", score: 70, uncited: true }],
      },
      outputHash: "x",
      createdAt: "2026-11-25T00:47:32.000Z",
    } satisfies StoredReview
    const client = submissionFromReview(review, review.modelId)
    expect(client.ok).toBe(true)
    if (!client.ok) return
    expect(client.submission.defended?.overallScore).toBe(65)
    expect(client.submission.defended?.scores.find((score) => score.criterionId === "clarity")?.uncited).toBe(true)
    const server = validateWebChatSubmission(client.submission)
    expect(server.ok).toBe(true)
    if (!server.ok) return
    expect(toSubmissionRow(server.submission).defended_score).toBe(65)
    expect(server.submission.defended?.scores).toEqual([{ criterionId: "clarity", score: 70, uncited: true }])
  })
})

import { describe, expect, it } from "vitest"
import { airCriteriaV01, officialCriteria } from "./officialCriteria.ts"
import { impactFeasibilityQuadrant } from "./criteria.ts"
import { globalGoals } from "./goals.ts"
import { capWeights, computeReputations, consensusOf, fidelityFor } from "./fidelity.ts"
import { canAppendRound, issuePenalty, latestAuthorClaim, newerVersion, statusFromCheck, ROUND_LIMIT } from "./issues.ts"
import { ladderTier } from "./fidelity.ts"
import { buildRanking, median, normalizeToTen, shrink, sortRows, listRankingMethods } from "./ranking.ts"
import { builtinAssessors } from "./assessors.ts"
import { sampleDatabase } from "./samples.ts"
import { rateLimitDecision } from "../services/rateLimit.ts"
import type { AirDatabase, IssueThread, NodeSubmission, StoredReview } from "./types.ts"

function review(partial: Partial<StoredReview> & { id: string; assessorId: string; overall: number; idea?: number }): StoredReview {
  return {
    id: partial.id,
    sample: false,
    mock: false,
    doi: partial.doi ?? "10.5281/zenodo.1",
    recordId: partial.recordId ?? "1",
    conceptRecordId: "1",
    recordVersion: partial.recordVersion ?? "v1",
    title: partial.title ?? "Work",
    creators: ["A"],
    keywords: ["field"],
    publicationDate: "2026-01-01",
    license: "cc-by-4.0",
    assessorId: partial.assessorId,
    modelId: "m",
    provider: "xai",
    criteriaId: officialCriteria.id,
    criteriaVersion: officialCriteria.version,
    customCriteria: partial.customCriteria ?? false,
    report: {
      summary: "A summary long enough to stand as a reading of the work.",
      scores: [],
      overallScore: partial.overall,
      ideaScore: partial.idea ?? partial.overall,
      recommendation: "revise",
      strengths: [],
      majorIssues: [],
      minorIssues: [],
      questionsForAuthors: [],
      suggestedNextSteps: [],
    },
    outputHash: partial.id,
    createdAt: "2026-10-01T00:00:00.000Z",
  }
}

function node(partial: Partial<NodeSubmission> & Pick<NodeSubmission, "id" | "reviewId" | "nodeId" | "verdict">): NodeSubmission {
  return {
    id: partial.id,
    reviewId: partial.reviewId,
    doi: "10.5281/zenodo.1",
    recordVersion: "v1",
    nodeId: partial.nodeId,
    nodeName: partial.nodeId,
    assessorId: "gpt",
    modelId: "m",
    criteriaVersion: officialCriteria.version,
    customCriteria: partial.customCriteria ?? false,
    verdict: partial.verdict,
    summary: "check",
    judgements: [],
    errorsFound: [],
    failureModes: [],
    createdAt: partial.createdAt ?? "2026-10-02T00:00:00.000Z",
    mock: false,
  }
}

describe("ranking", () => {
  it("uses the median and drops custom criteria", () => {
    expect(median([2, 5])).toBe(3.5)
    expect(median([2, 4, 5])).toBe(4)
    const db: AirDatabase = {
      reviews: [
        review({ id: "a", assessorId: "grok", overall: 2, doi: "10.5281/zenodo.9", recordId: "9", title: "Low" }),
        review({ id: "b", assessorId: "gpt", overall: 4, doi: "10.5281/zenodo.9", recordId: "9", title: "Low" }),
        review({ id: "c", assessorId: "claude", overall: 5, customCriteria: true, doi: "10.5281/zenodo.9", recordId: "9", title: "Low" }),
        ...Array.from({ length: 6 }, (_, index) =>
          review({
            id: `many-${index}`,
            assessorId: ["grok", "gpt", "claude", "gemini", "deepseek", "mistral"][index] ?? "llama",
            overall: 4.2,
            doi: "10.5281/zenodo.8",
            recordId: "8",
            title: "Many",
          }),
        ),
      ],
      nodes: [],
      issues: [],
      claims: [],
    }
    const rows = buildRanking(db)
    const low = rows.find((row) => row.recordId === "9")
    const many = rows.find((row) => row.recordId === "8")
    expect(low?.panelMedian).toBe(3)
    expect(low?.reviewCount).toBe(2)
    expect(many?.panelMedian).toBe(4.2)
    const method = listRankingMethods(builtinAssessors).find((item) => item.id === "panel")
    expect(method).toBeTruthy()
    if (!method || !low || !many) return
    const ordered = sortRows([low, many], method)
    expect(ordered[0]?.recordId).toBe("8")
    expect(shrink(5, 1)).toBeLessThan(shrink(4.2, 6))
  })

  it("penalises unresolved issues and not addressed ones", () => {
    const open: IssueThread = {
      id: "i1",
      doi: "10.5281/zenodo.1",
      recordVersion: "v1",
      source: "review-major",
      sourceId: "r",
      criterionId: "ethics",
      claim: "Safety is unnamed.",
      quotedPassage: "",
      reason: "High stakes.",
      status: "unresolved",
      rounds: [],
      createdAt: "2026-10-01T00:00:00.000Z",
      updatedAt: "2026-10-01T00:00:00.000Z",
    }
    const addressed = { ...open, id: "i2", doi: "10.5281/zenodo.2", status: "addressed-in-publication" as const }
    const base = review({ id: "r1", assessorId: "grok", overall: 4 })
    const db: AirDatabase = {
      reviews: [base, { ...base, id: "r2", doi: "10.5281/zenodo.2", recordId: "2", title: "Clean" }],
      nodes: [],
      issues: [open, addressed],
      claims: [],
    }
    const rows = buildRanking(db)
    const penalised = rows.find((row) => row.doi === "10.5281/zenodo.1")
    const clean = rows.find((row) => row.doi === "10.5281/zenodo.2")
    expect(penalised && clean && penalised.panelRankScore !== null && clean.panelRankScore !== null).toBe(true)
    expect((penalised?.panelRankScore ?? 0) < (clean?.panelRankScore ?? 0)).toBe(true)
    expect(issuePenalty([addressed])).toBe(0)
  })
})

describe("fidelity", () => {
  it("caps a single heavy node and marks a failing majority disputed", () => {
    const weights = capWeights([100, 10, 10])
    const total = weights.reduce((sum, value) => sum + value, 0)
    expect(Math.max(...weights) / total).toBeLessThanOrEqual(0.41)
    const nodes = ["a", "b", "c"].map((id, index) => node({ id: `n${index}`, reviewId: "r", nodeId: id, verdict: "fail" }))
    const summary = fidelityFor(nodes, computeReputations(nodes), Date.parse("2026-10-03T00:00:00.000Z"))
    expect(summary.disputed).toBe(true)
    expect(summary.label).toContain("Disputed")
    expect(summary.passRate).toBe(0)
  })

  it("ignores custom criteria and keeps one verdict per node", () => {
    const nodes = [
      node({ id: "old", reviewId: "r", nodeId: "same", verdict: "fail", createdAt: "2026-01-01T00:00:00.000Z" }),
      node({ id: "new", reviewId: "r", nodeId: "same", verdict: "pass", createdAt: "2026-02-01T00:00:00.000Z" }),
      node({ id: "custom", reviewId: "r", nodeId: "other", verdict: "fail", customCriteria: true }),
    ]
    const summary = fidelityFor(nodes, new Map(), Date.parse("2026-03-01T00:00:00.000Z"))
    expect(summary.nodes).toBe(1)
    expect(summary.passRate).toBe(1)
  })

  it("moves reputation only after a clear consensus", () => {
    const agreed = ["a", "b", "c", "d"].map((id, index) =>
      node({ id: `p${index}`, reviewId: "r", nodeId: id, verdict: index === 3 ? "fail" : "pass" }),
    )
    expect(consensusOf(agreed)).toBe("pass")
    const reputations = computeReputations(agreed)
    expect(reputations.get("a")).toBeGreaterThan(1)
    expect(reputations.get("d") ?? 1).toBeLessThan(1)
    expect(consensusOf(agreed.slice(0, 3))).toBeNull()
  })
})

describe("issues", () => {
  it("maps source checks onto statuses, including a newer version", () => {
    expect(statusFromCheck("ADDRESSED", 1, "v1", "v1")).toBe("addressed-in-publication")
    expect(statusFromCheck("ADDRESSED", 1, "v1", "v2")).toBe("fixed-in-new-version")
    expect(statusFromCheck("PARTIALLY_ADDRESSED", 0, "v1", "v1")).toBe("partially-addressed")
    expect(statusFromCheck("NOT_ADDRESSED", 0, "v1", "v1")).toBe("open")
    expect(statusFromCheck("NOT_ADDRESSED", 2, "v1", "v1")).toBe("unresolved")
    expect(newerVersion([{ id: "1", publicationDate: "2026-01-01" }, { id: "2", publicationDate: "2026-05-01" }], "1")?.id).toBe("2")
    expect(newerVersion([{ id: "1", publicationDate: "2026-01-01" }], "1")).toBeNull()
    const thread = { rounds: Array.from({ length: ROUND_LIMIT }, () => ({ id: "x" })) } as IssueThread
    expect(canAppendRound(thread)).toBe(false)
    const claims = [
      { id: "old", doi: "10.1/test", displayName: "Old", orcid: "", listedOnRecord: false, selfDeclared: true, createdAt: "2026-01-01T00:00:00.000Z" },
      { id: "new", doi: "10.1/test", displayName: "New", orcid: "", listedOnRecord: true, selfDeclared: false, createdAt: "2026-06-01T00:00:00.000Z" },
    ]
    expect(latestAuthorClaim(claims, "10.1/test")?.displayName).toBe("New")
    expect(latestAuthorClaim(claims, "10.1/other")).toBeUndefined()
  })
})

describe("AIR v0.2", () => {
  it("keeps v0.1 valid and defaults new readings to a 0–10 matrix", () => {
    expect(airCriteriaV01.version).toBe("0.1.0")
    expect(airCriteriaV01.reportSchema).toBe("0.1")
    expect(officialCriteria.version).toBe("0.2.0")
    expect(officialCriteria.scale.max).toBe(10)
    expect(officialCriteria.criteria.find((item) => item.id === "clarity")?.weight).toBeLessThan(1)
    expect(officialCriteria.criteria.find((item) => item.id === "impact")?.weight).toBeGreaterThan(1)
    expect(globalGoals.goals.every((goal) => goal.sourceUrl.startsWith("https://"))).toBe(true)
    expect(globalGoals.goals.some((goal) => goal.id === "methane-pledge")).toBe(true)
    expect(impactFeasibilityQuadrant(8, 8).id).toBe("priority")
    expect(impactFeasibilityQuadrant(8, 2).id).toBe("moonshot")
    expect(normalizeToTen(1, "0.1.0")).toBe(0)
    expect(normalizeToTen(5, "0.1.0")).toBe(10)
    expect(normalizeToTen(7, "0.2.0")).toBe(7)
  })
})

describe("tiers", () => {
  it("keeps a free screening off the ranked board and below corroboration", () => {
    const ranked = review({ id: "ranked", assessorId: "grok", overall: 6, doi: "10.5281/zenodo.2", recordId: "2", title: "Ranked" })
    const free = { ...review({ id: "free", assessorId: "grok", overall: 9, doi: "10.5281/zenodo.3", recordId: "3", title: "Free" }), tier: "free-screening" as const }
    const rows = buildRanking({ reviews: [ranked, free], nodes: [], issues: [], claims: [] })
    expect(rows.map((row) => row.recordId)).toEqual(["2"])
    expect(ladderTier([free], [])).toBe("free-screening")
    expect(ladderTier([ranked], [])).toBe("in-depth")
    expect(
      ladderTier(
        [ranked],
        [
          { id: "n1", reviewId: ranked.id, doi: ranked.doi, recordVersion: ranked.recordVersion, nodeId: "a", nodeName: "a", assessorId: "gpt", modelId: "gpt-a", criteriaVersion: "0.2.0", customCriteria: false, verdict: "pass", summary: "", judgements: [], errorsFound: [], failureModes: [], createdAt: "2026-01-01T00:00:00.000Z", mock: false, trusted: true },
          { id: "n2", reviewId: ranked.id, doi: ranked.doi, recordVersion: ranked.recordVersion, nodeId: "b", nodeName: "b", assessorId: "claude", modelId: "claude-b", criteriaVersion: "0.2.0", customCriteria: false, verdict: "pass", summary: "", judgements: [], errorsFound: [], failureModes: [], createdAt: "2026-01-02T00:00:00.000Z", mock: false, trusted: true },
        ],
      ),
    ).toBe("corroborated")
  })
})

describe("sample board", () => {
  it("ranks the careful sample above the unsupported one", () => {
    const rows = buildRanking(sampleDatabase())
    const method = listRankingMethods(builtinAssessors).find((item) => item.id === "panel")
    if (!method) throw new Error("missing panel method")
    const ordered = sortRows(rows, method)
    const fog = ordered.findIndex((row) => row.recordId === "sample-fog")
    const wire = ordered.findIndex((row) => row.recordId === "sample-wire")
    expect(fog).toBeGreaterThanOrEqual(0)
    expect(wire).toBeGreaterThan(fog)
    expect(ordered.find((row) => row.recordId === "sample-wire")?.fidelity.disputed).toBe(true)
    expect(ordered.find((row) => row.recordId === "sample-fog")?.fidelity.nodes).toBe(4)
  })
})

describe("rate limit", () => {
  it("allows a burst and then refuses", () => {
    const now = 1_000_000
    let stamps: number[] = []
    for (let index = 0; index < 12; index += 1) {
      const decision = rateLimitDecision(stamps, now + index)
      expect(decision.ok).toBe(true)
      stamps = decision.stamps
    }
    expect(rateLimitDecision(stamps, now + 20).ok).toBe(false)
  })
})

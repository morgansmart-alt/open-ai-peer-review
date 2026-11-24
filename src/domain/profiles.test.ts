import previousMigration from "../../supabase/migrations/20261123120000_fluid_version_rounds.sql?raw"
import nextMigration from "../../supabase/migrations/20261124120000_comment_rounds.sql?raw"
import { describe, expect, it } from "vitest"
import { recommendationFor, weightedMean } from "./criteria.ts"
import { officialCriteria } from "./officialCriteria.ts"
import {
  applyCriterionProfile,
  PROFILE_RANKING_NOTE,
  showsProjectValue,
  suggestCriterionProfile,
} from "./profiles.ts"
import { buildRanking } from "./ranking.ts"
import { criteriaForReview, recommendationMatchesBand } from "./scoring.ts"
import type { AirDatabase, StoredReview } from "./types.ts"

function scored(criteriaIds: string[], score: number) {
  return criteriaIds.map((criterionId) => ({
    criterionId,
    score,
    rationale: "A passage in the record supports this score in plain words.",
    citations: [{ quote: "The record states the claim.", location: "text" }],
    confidence: "medium" as const,
  }))
}

function review(partial: Partial<StoredReview> & { id: string; criterionProfile?: string; score?: number }): StoredReview {
  const criteria = applyCriterionProfile(officialCriteria, partial.criterionProfile)
  const value = partial.score ?? 80
  return {
    id: partial.id,
    sample: false,
    mock: false,
    doi: partial.doi ?? "10.5281/zenodo.1",
    recordId: partial.recordId ?? "1",
    conceptRecordId: "1",
    recordVersion: partial.recordVersion ?? "v1",
    title: partial.title ?? "Work",
    creators: [],
    keywords: [],
    publicationDate: "2026-01-01",
    license: "",
    assessorId: partial.assessorId ?? "gemini",
    modelId: "m",
    provider: "gemini",
    criteriaId: officialCriteria.id,
    criteriaVersion: officialCriteria.version,
    customCriteria: false,
    criterionProfile: partial.criterionProfile,
    origin: partial.origin,
    report: {
      summary: "A summary long enough to stand as a reading of the work on its own terms.",
      scores: scored(criteria.criteria.map((criterion) => criterion.id), value),
      overallScore: value,
      ideaScore: value,
      recommendation: partial.criterionProfile && partial.criterionProfile !== "device" ? "accept" : "encourage",
      scale: 100,
      strengths: ["Public files."],
      majorIssues: [],
      minorIssues: [],
      questionsForAuthors: ["What would change the claim?"],
      suggestedNextSteps: ["Leave the files public."],
    },
    outputHash: partial.id,
    createdAt: "2026-01-01T00:00:00.000Z",
  }
}

describe("criterion profiles", () => {
  it("suggests a profile from resource type and keywords, and stays on the device default otherwise", () => {
    expect(suggestCriterionProfile({ resourceType: "Dataset", keywords: [] })).toBe("data")
    expect(suggestCriterionProfile({ resourceType: "Publication", keywords: ["theorem", "proof"] })).toBe("theory")
    expect(suggestCriterionProfile({ resourceType: "Publication", keywords: ["roadmap"] })).toBe("roadmap")
    expect(suggestCriterionProfile({ resourceType: "Publication", keywords: ["experimental measurement"] })).toBe("empirical")
    expect(suggestCriterionProfile({ resourceType: "Proposal", keywords: ["prototype"] })).toBe("device")
    expect(suggestCriterionProfile({ resourceType: "Publication", keywords: [] })).toBe("device")
  })

  it("keeps the current weights when no profile is stored, hides project value otherwise, and stays on one 0–100 scale", () => {
    const device = applyCriterionProfile(officialCriteria, undefined)
    expect(device.criteria.map((criterion) => [criterion.id, criterion.weight])).toEqual(
      officialCriteria.criteria.map((criterion) => [criterion.id, criterion.weight]),
    )
    expect(showsProjectValue(undefined)).toBe(true)
    expect(showsProjectValue("device")).toBe(true)
    for (const id of ["theory", "data", "roadmap", "empirical"] as const) {
      const applied = applyCriterionProfile(officialCriteria, id)
      expect(applied.criteria.some((criterion) => criterion.id === "estimated-value")).toBe(false)
      expect(applied.scale).toEqual(officialCriteria.scale)
      expect(showsProjectValue(id)).toBe(false)
      expect(recommendationFor(90, applied)).toBe("accept")
    }
    expect(recommendationFor(90, officialCriteria)).toBe("encourage")
    expect(recommendationMatchesBand("accept", 85)).toBe(true)
    expect(recommendationMatchesBand("encourage", 85)).toBe(true)
    expect(recommendationMatchesBand("accept", 50)).toBe(false)
    const old = review({ id: "old", score: 80 })
    const theory = review({ id: "theory", criterionProfile: "theory", recordId: "2", doi: "10.5281/zenodo.2", score: 80, title: "Proof" })
    expect(criteriaForReview(old).criteria).toHaveLength(officialCriteria.criteria.length)
    expect(weightedMean(theory.report.scores, criteriaForReview(theory))).toBe(80)
    const db: AirDatabase = { reviews: [old, theory], nodes: [], issues: [], claims: [] }
    const rows = buildRanking(db)
    expect(rows.find((row) => row.recordId === "1")?.panelMedian).toBe(80)
    expect(rows.find((row) => row.recordId === "2")?.panelMedian).toBe(80)
    const human = review({ id: "human", criterionProfile: "theory", recordId: "2", doi: "10.5281/zenodo.2", assessorId: "human", origin: "human", score: 80, title: "Proof" })
    const withHuman = buildRanking({ reviews: [theory, human], nodes: [], issues: [], claims: [] })
    expect(withHuman[0]?.humanMedian).toBe(withHuman[0]?.panelMedian)
    expect(PROFILE_RANKING_NOTE).toMatch(/0–100/)
    expect(PROFILE_RANKING_NOTE).toMatch(/no profile/)
  })
})

describe("comment rounds need a migration", () => {
  it("documents that the live check rejects comment until the additive migration is applied", () => {
    const previous = previousMigration
    const next = nextMigration
    expect(previous).toContain("'recheck'")
    expect(previous).not.toContain("'comment'")
    expect(next).toContain("'comment'")
    expect(next).toContain("A comment does not change the issue status.")
    expect(next).toMatch(/create or replace function air_append_issue_round/i)
  })
})

import { describe, expect, it } from "vitest"
import type { StoredReview } from "../domain/types.ts"
import { canRetagHumanReview, withCriterionProfile } from "./reviewOwner.ts"

function review(partial: Partial<StoredReview>): StoredReview {
  return {
    id: partial.id ?? "human-1",
    sample: false,
    mock: false,
    doi: "10.5281/zenodo.1",
    recordId: "1",
    conceptRecordId: "1",
    recordVersion: "v1",
    title: "Work",
    creators: [],
    keywords: [],
    publicationDate: "2026-01-01",
    license: "",
    assessorId: partial.assessorId ?? "human",
    modelId: "human-reviewer",
    provider: "compatible",
    criteriaId: "air",
    criteriaVersion: "0.2.0",
    customCriteria: false,
    origin: partial.origin ?? "human",
    criterionProfile: partial.criterionProfile,
    report: {
      summary: "A human reading.",
      scores: [],
      overallScore: 70,
      ideaScore: 70,
      recommendation: "revise",
      strengths: [],
      majorIssues: [],
      minorIssues: [],
      questionsForAuthors: [],
      suggestedNextSteps: [],
    },
    outputHash: "hash",
    createdAt: "2026-01-01T00:00:00.000Z",
  }
}

describe("human profile retag", () => {
  it("lets only the owner change a human review, and keeps the legacy label for a null profile", () => {
    const human = review({})
    expect(canRetagHumanReview(human, { hasSecret: true, inLocalDatabase: false })).toBe(true)
    expect(canRetagHumanReview(human, { hasSecret: false, inLocalDatabase: true })).toBe(true)
    expect(canRetagHumanReview(human, { hasSecret: false, inLocalDatabase: false })).toBe(false)
    expect(canRetagHumanReview(review({ assessorId: "grok", origin: "ai" }), { hasSecret: true, inLocalDatabase: true })).toBe(false)
    const retagged = withCriterionProfile(human, "theory")
    expect(retagged.ok).toBe(true)
    if (retagged.ok) {
      expect(retagged.review.criterionProfile).toBe("theory")
      expect(retagged.review.report).toBe(human.report)
      expect(retagged.review.outputHash).toBe(human.outputHash)
    }
    expect(withCriterionProfile(human, "not-a-profile").ok).toBe(false)
    expect(withCriterionProfile(review({ assessorId: "gemini", origin: "ai" }), "data").ok).toBe(false)
  })
})

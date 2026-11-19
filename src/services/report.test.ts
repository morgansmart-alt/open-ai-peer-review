import { describe, expect, it } from "vitest"
import { airCriteriaV01, airCriteriaV02 } from "../domain/officialCriteria.ts"
import { STORED_REVIEW_KEYS, type StoredReview } from "../domain/types.ts"
import { weightedMean } from "../domain/criteria.ts"
import { sha256Hex } from "./hash.ts"
import { chunkText } from "./textTools.ts"
import { extractJsonValue, validateReport } from "./validateReport.ts"

const good = {
  summary: "The record states a narrow claim and shows the weighing steps that support it, with the season limit written in the text.",
  scores: airCriteriaV01.criteria.map((criterion, index) => ({
    criterionId: criterion.id,
    score: index % 2 === 0 ? 4 : 3,
    rationale: `${criterion.name} is supported by a passage a reader can find, with the remaining gap named.`,
    citations: [{ quote: "Net B collected 1.8 litres.", location: "results" }],
  })),
  recommendation: "Promising, needs revision",
  strengths: ["The files are public."],
  majorIssues: [],
  minorIssues: ["The season is narrow."],
  questionsForAuthors: ["What would a second season change?"],
  suggestedNextSteps: ["Publish the weighing sheet beside the figure."],
}

describe("validateReport", () => {
  it("accepts a complete reading and recomputes the weighted scores", () => {
    const result = validateReport(good, airCriteriaV01)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.report.recommendation).toBe("revise")
    expect(result.report.overallScore).toBe(weightedMean(result.report.scores, airCriteriaV01))
    expect(result.report.ideaScore).toBe(weightedMean(result.report.scores, airCriteriaV01, airCriteriaV01.ideaCriterionIds))
  })

  it("rejects a missing criterion and repairs fenced JSON", () => {
    const broken = validateReport({ ...good, scores: [] }, airCriteriaV01)
    expect(broken.ok).toBe(false)
    const fenced = "Sure:\n```json\n" + JSON.stringify(good) + "\n```"
    const parsed = validateReport(extractJsonValue(fenced), airCriteriaV01)
    expect(parsed.ok).toBe(true)
  })

  it("rejects a score outside the scale", () => {
    const scores = good.scores.map((score, index) => (index === 0 ? { ...score, score: 9 } : score))
    const result = validateReport({ ...good, scores }, airCriteriaV01)
    expect(airCriteriaV02.version).toBe("0.2.0")
    expect(result.ok).toBe(false)
  })
})

describe("chunkText", () => {
  it("keeps a short text whole and caps a long one", () => {
    expect(chunkText("Short note.")).toEqual(["Short note."])
    const long = Array.from({ length: 40 }, (_, index) => `Paragraph ${index}. ${"word ".repeat(80)}`).join("\n\n")
    const chunks = chunkText(long, 3000)
    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks.length).toBeLessThanOrEqual(8)
  })
})

describe("published payload", () => {
  it("has no key field", async () => {
    const review = { id: "r", outputHash: await sha256Hex("demo") }
    for (const key of Object.keys(review)) {
      expect(STORED_REVIEW_KEYS).toContain(key as (typeof STORED_REVIEW_KEYS)[number] | "nope")
    }
    const allowed = new Set<string>(STORED_REVIEW_KEYS)
    const full: StoredReview = {
      id: "r",
      sample: false,
      mock: false,
      doi: "10.5281/zenodo.1",
      recordId: "1",
      conceptRecordId: "1",
      recordVersion: "v1",
      title: "T",
      creators: [],
      keywords: [],
      publicationDate: "2026-01-01",
      license: "",
      assessorId: "grok",
      modelId: "grok-3",
      provider: "xai",
      criteriaId: "air",
      criteriaVersion: "0.1.0",
      customCriteria: false,
      report: {
        summary: "x".repeat(40),
        scores: [],
        overallScore: 3,
        ideaScore: 3,
        recommendation: "revise",
        strengths: [],
        majorIssues: [],
        minorIssues: [],
        questionsForAuthors: [],
        suggestedNextSteps: [],
      },
      outputHash: "abc",
      createdAt: "2026-01-01T00:00:00.000Z",
    }
    expect(Object.keys(full).every((key) => allowed.has(key))).toBe(true)
    expect(JSON.stringify(full).toLowerCase()).not.toContain("api_key")
  })
})

import { describe, expect, it } from "vitest"
import { airCriteriaV01, airCriteriaV02, officialCriteria } from "../domain/officialCriteria.ts"
import { reviewSystemPrompt, reviewUserPrompt } from "./prompts.ts"
import type { ZenodoRecord } from "./zenodo.ts"
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

  it("stores a 0–100 scale and records a scoring mismatch", () => {
    const scores = officialCriteria.criteria.map((criterion) => ({
      criterionId: criterion.id,
      score: 80,
      rationale: `${criterion.name} is supported by a passage a reader can find, with the remaining gap named.`,
      citations: [{ quote: "Net B collected 1.8 litres.", location: "results" }],
      confidence: "medium",
    }))
    const base = {
      summary: "The record states a narrow claim and shows the weighing steps that support it, with the season limit written in the text.",
      scores,
      strengths: ["The files are public."],
      majorIssues: [],
      minorIssues: ["The season is narrow."],
      questionsForAuthors: ["What would a second season change?"],
      suggestedNextSteps: ["Publish the weighing sheet beside the figure."],
      ontologyClass: "physical-testable",
      physics: { classification: "CONSISTENT", laws: ["conservation of mass"], howAddressed: "The mass balance is written out." },
      simulation: { reported: 0, passed: 0, methods: "Simulation does not apply to this record.", inputsAvailable: false },
      valueEstimate: { assumptions: ["The season is one site."], marketDisruption: "Not estimated." },
      goals: [{ goalId: "clean-water", level: "indirect", note: "The record is about collection, not a target." }],
    }
    const matched = validateReport({ ...base, recommendation: "encourage", overallScore: 80 }, officialCriteria)
    expect(matched.ok).toBe(true)
    if (!matched.ok) return
    expect(matched.report.scale).toBe(100)
    expect(matched.report.scoringCheck?.mismatch).toBe(false)
    const drifted = validateReport({ ...base, recommendation: "revise", overallScore: 40 }, officialCriteria)
    expect(drifted.ok).toBe(true)
    if (!drifted.ok) return
    expect(drifted.report.overallScore).toBe(80)
    expect(drifted.report.statedOverall).toBe(40)
    expect(drifted.report.scoringCheck?.mismatch).toBe(true)
    expect(drifted.report.scoringCheck?.reason).toContain("differs from the weighted score")
    expect(drifted.report.scoringCheck?.reason).toContain("Verdict")
    const record = {
      id: "1",
      conceptId: "1",
      doi: "10.5281/zenodo.1",
      conceptDoi: "10.5281/zenodo.1",
      title: "A record",
      creators: [],
      description: "",
      descriptionHtml: "",
      keywords: [],
      version: "1",
      recordVersion: "1",
      license: "",
      publicationDate: "2026-01-01",
      related: [],
      resourceType: "publication",
      access: { record: "open", files: "open" },
      files: [],
      htmlUrl: "https://zenodo.org/records/1",
    } satisfies ZenodoRecord
    const prompt = reviewUserPrompt(record, officialCriteria, "text")
    expect(reviewSystemPrompt(officialCriteria)).toContain("out of 100")
    expect(prompt).toContain("integer 0-100")
    expect(prompt).toContain("0-20")
    expect(prompt).toContain("https://zenodo.org/records/1")
    expect(prompt).toContain("https://doi.org/10.5281/zenodo.1")
    expect(prompt).toContain("Concept record (all versions): https://zenodo.org/records/1")
  })

  it("puts Zenodo, DOI, and concept links in the shared prompt and leaves private chat links out of that block", () => {
    const record = {
      id: "18916931",
      conceptId: "18916930",
      doi: "10.5281/zenodo.18916931",
      conceptDoi: "10.5281/zenodo.18916930",
      title: "A versioned record",
      creators: [],
      description: "",
      descriptionHtml: "",
      keywords: [],
      version: "2",
      recordVersion: "2",
      license: "cc-by-4.0",
      publicationDate: "2026-03-09",
      related: [],
      resourceType: "publication",
      access: { record: "open", files: "open" },
      files: [],
      htmlUrl: "https://zenodo.org/records/18916931",
    } satisfies ZenodoRecord
    const prompt = reviewUserPrompt(record, officialCriteria, "paper text", [
      { url: "https://share.google/aimode/EXAMPLE", provider: "Google AI Mode", note: "method" },
    ])
    const source = prompt.slice(0, prompt.indexOf("Private AI context links"))
    expect(source).toContain("This version: https://zenodo.org/records/18916931")
    expect(source).toContain("DOI: https://doi.org/10.5281/zenodo.18916931")
    expect(source).toContain("Concept record (all versions): https://zenodo.org/records/18916930")
    expect(source).toContain("Concept DOI: https://doi.org/10.5281/zenodo.18916930")
    expect(source).not.toContain("share.google")
    expect(prompt).toContain("https://share.google/aimode/EXAMPLE")
    const local = reviewUserPrompt(
      { ...record, id: "local", conceptId: "local", doi: "local-file", conceptDoi: "local-file", htmlUrl: "" },
      officialCriteria,
      "paper text",
    )
    expect(local).not.toContain("zenodo.org/records/local")
    expect(local).not.toContain("doi.org/local")
  })

  it("rejects a score outside the scale", () => {
    const scores = good.scores.map((score, index) => (index === 0 ? { ...score, score: 9 } : score))
    const result = validateReport({ ...good, scores }, airCriteriaV01)
    expect(airCriteriaV02.version).toBe("0.2.0")
    expect(result.ok).toBe(false)
  })
})

describe("chunkText", () => {
  it("keeps a short text whole and covers a long one from start to end", () => {
    expect(chunkText("Short note.")).toEqual(["Short note."])
    const long = Array.from({ length: 80 }, (_, index) => `Paragraph ${index}. ${"word ".repeat(80)}`).join("\n\n")
    const chunks = chunkText(long, 3000)
    expect(chunks.length).toBeGreaterThan(8)
    expect(chunks[0]).toContain("Paragraph 0")
    expect(chunks[chunks.length - 1]).toContain("Paragraph 79")
    const covered = chunks.join(" ").replace(/\s+/g, " ")
    expect(covered).toContain("Paragraph 20")
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

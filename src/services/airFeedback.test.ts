import { describe, expect, it } from "vitest"
import { officialCriteria } from "../domain/officialCriteria.ts"
import type { StoredReview } from "../domain/types.ts"
import { airFeedbackExport, parseAirFeedback } from "./airFeedback.ts"
import { validateReport } from "./validateReport.ts"
import { submissionFromReview, validateWebChatSubmission } from "./webChat/submission.ts"

function body(extra: Record<string, unknown> = {}) {
  return {
    summary: "The record states a narrow claim and shows the weighing steps that support it, with the season limit written in the text.",
    scores: officialCriteria.criteria.map((criterion) => ({
      criterionId: criterion.id,
      score: 70,
      rationale: `${criterion.name} is supported by a passage a reader can find in the record.`,
      citations: [{ quote: "Net B collected 1.8 litres.", location: "results" }],
      confidence: "medium",
    })),
    recommendation: "revise",
    overallScore: 70,
    strengths: ["The files are public."],
    majorIssues: [],
    minorIssues: ["The season is narrow."],
    questionsForAuthors: ["What would a second season change?"],
    suggestedNextSteps: ["Publish the weighing sheet beside the figure."],
    ontologyClass: "physical-testable",
    physics: { classification: "CONSISTENT", laws: ["conservation of mass"], howAddressed: "The mass balance is written out." },
    simulation: { reported: 0, passed: 0, methods: "Simulation does not apply to this record.", inputsAvailable: false },
    valueEstimate: { assumptions: ["The season is one site."], marketDisruption: "Not estimated." },
    goals: [{ goalId: "sdg-6", level: "indirect", note: "Water collection is named." }],
    ...extra,
  }
}

describe("air feedback", () => {
  it("parses a review that omits air_feedback", () => {
    const plain = validateReport(body(), officialCriteria)
    const empty = validateReport(body({ air_feedback: null }), officialCriteria)
    expect(plain.ok).toBe(true)
    expect(empty.ok).toBe(true)
    if (!plain.ok || !empty.ok) return
    expect(plain.report.airFeedback).toBeUndefined()
    expect(empty.report.airFeedback).toBeUndefined()
    expect(plain.report.overallScore).toBe(empty.report.overallScore)
    expect(plain.report.scores.map((score) => score.score)).toEqual(empty.report.scores.map((score) => score.score))
  })

  it("keeps concrete feedback and does not let it change the score", () => {
    const plain = validateReport(body(), officialCriteria)
    const noted = validateReport(
      body({
        air_feedback: {
          criteria: "Feasibility does not fit a theory paper.",
          missing_context: "The supplement was not attached. https://share.google/aimode/EXAMPLE",
          scoringProcess: "I rounded clarity up. The stored score should stay as written.",
          ignored: "not a field",
          rubric: "",
        },
      }),
      officialCriteria,
    )
    expect(noted.ok).toBe(true)
    if (!plain.ok || !noted.ok) return
    expect(noted.report.overallScore).toBe(plain.report.overallScore)
    expect(noted.report.ideaScore).toBe(plain.report.ideaScore)
    expect(noted.report.recommendation).toBe(plain.report.recommendation)
    expect(noted.report.airFeedback).toEqual({
      criteria: "Feasibility does not fit a theory paper.",
      missingContext: "The supplement was not attached. [private link]",
      scoringProcess: "I rounded clarity up. The stored score should stay as written.",
    })
  })

  it("drops unusable feedback instead of failing the review", () => {
    expect(parseAirFeedback(undefined)).toBeUndefined()
    expect(parseAirFeedback(4)).toBeUndefined()
    expect(parseAirFeedback([])).toBeUndefined()
    expect(parseAirFeedback({ criteria: "  " })).toBeUndefined()
    const odd = validateReport(body({ air_feedback: ["not an object"] }), officialCriteria)
    expect(odd.ok).toBe(true)
    if (odd.ok) expect(odd.report.airFeedback).toBeUndefined()
    const sentence = validateReport(body({ air_feedback: "The prompt never named the profile." }), officialCriteria)
    expect(sentence.ok).toBe(true)
    if (sentence.ok) expect(sentence.report.airFeedback?.scoringProcess).toContain("never named the profile")
  })

  it("exports collected feedback and sends it with a web-chat score without rescoring", () => {
    const parsed = validateReport(body({ air_feedback: { prompt: "The version link was easy to miss." } }), officialCriteria)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    const review = {
      id: "r1",
      sample: false,
      mock: false,
      doi: "10.5281/zenodo.1",
      recordId: "1",
      conceptRecordId: "1",
      recordVersion: "1",
      title: "A record",
      creators: [],
      keywords: [],
      publicationDate: "2026-01-01",
      license: "",
      assessorId: "grok",
      modelId: "grok",
      provider: "xai",
      criteriaId: "air",
      criteriaVersion: "0.2.0",
      customCriteria: false,
      report: parsed.report,
      outputHash: "abc",
      createdAt: "2026-11-24T00:00:00.000Z",
    } satisfies StoredReview
    const silent = { ...review, id: "r2", report: { ...parsed.report, airFeedback: undefined } }
    const exported = JSON.parse(airFeedbackExport([review, silent], "2026-11-24T00:00:00.000Z")) as { items: { reviewId: string }[] }
    expect(exported.items.map((item) => item.reviewId)).toEqual(["r1"])
    expect(JSON.stringify(exported)).not.toContain("overallScore")
    const sent = submissionFromReview(review, "Grok on grok.com")
    expect(sent.ok).toBe(true)
    if (!sent.ok) return
    expect(sent.submission.airFeedback?.prompt).toContain("version link")
    expect(sent.submission.overallScore).toBe(parsed.report.overallScore)
    const again = validateWebChatSubmission(sent.submission)
    expect(again.ok).toBe(true)
    if (again.ok) expect(again.submission.overallScore).toBe(sent.submission.overallScore)
  })
})

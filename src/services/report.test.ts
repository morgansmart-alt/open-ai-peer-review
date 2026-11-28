import { describe, expect, it } from "vitest"
import { airCriteriaV01, airCriteriaV02, officialCriteria } from "../domain/officialCriteria.ts"
import { reviewSystemPrompt, reviewUserPrompt } from "./prompts.ts"
import type { ZenodoRecord } from "./zenodo.ts"
import { STORED_REVIEW_KEYS, type StoredReview } from "../domain/types.ts"
import { weightedMean } from "../domain/criteria.ts"
import { sha256Hex } from "./hash.ts"
import { chunkText } from "./textTools.ts"
import { extractJsonValue, validateReport } from "./validateReport.ts"
import { describeCriterionGather, mergeReviewFields, parseModelJson, reaskJsonPrompt, reviewAnalysis, settleChatJson } from "./jsonText.ts"
import { CAREFUL_REVIEW_ENDING } from "./prompts.ts"

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
    expect(drifted.report.scoringCheck?.reason ?? "").not.toContain("Verdict")
    expect(drifted.report.scoringCheck?.verdictNote).toContain("The model said revise")
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
    expect(prompt).toContain("<0-100>")
    expect(prompt).toContain("0-20")
    expect(prompt).toContain("https://zenodo.org/records/1")
    expect(prompt).toContain("https://doi.org/10.5281/zenodo.1")
    expect(prompt).toContain("Concept record (all versions): https://zenodo.org/records/1")
    expect(prompt).toContain("as long as it needs to be")
    expect(prompt).not.toContain("80-180")
  })

  it("does not block on a missing global-goals citation or score, and accepts a scores object", () => {
    const scores = officialCriteria.criteria.map((criterion) => ({
      criterionId: criterion.id,
      score: 80,
      rationale: `${criterion.name} is supported by a passage a reader can find, with the remaining gap named.`,
      citations: [{ quote: "Net B collected 1.8 litres.", location: "results" }],
      confidence: "medium" as const,
    }))
    const base = {
      summary: "The record states a narrow claim and shows the weighing steps that support it, with the season limit written in the text.",
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
      recommendation: "encourage",
      overallScore: 80,
    }
    const bareBonus = validateReport({
      ...base,
      scores: scores.map((score) => (score.criterionId === "global-goals" ? { ...score, citations: [] } : score)),
    }, officialCriteria)
    expect(bareBonus.ok).toBe(true)
    const omitted = validateReport({ ...base, scores: scores.filter((score) => score.criterionId !== "global-goals") }, officialCriteria)
    expect(omitted.ok).toBe(true)
    if (omitted.ok) expect(omitted.report.scores.some((score) => score.criterionId === "global-goals")).toBe(false)
    const keyed = parseModelJson(JSON.stringify({ ...base, scores: Object.fromEntries(scores.map((score) => [score.criterionId, score])) }))
    expect(keyed.ok).toBe(true)
    if (keyed.ok) expect(validateReport(keyed.value, officialCriteria).ok).toBe(true)
    const { scores: dropped, ...rest } = { ...base, scores }
    void dropped
    const top = { ...rest } as Record<string, unknown>
    for (const score of scores) top[score.criterionId] = score
    const lifted = parseModelJson(JSON.stringify(top))
    expect(lifted.ok).toBe(true)
    if (lifted.ok) {
      const scoresOut = (lifted.value as { scores?: { criterionId?: string; score?: number }[] }).scores ?? []
      expect(scoresOut.find((score) => score.criterionId === "impact")?.score).toBe(80)
      expect(scoresOut.find((score) => score.criterionId === "physics")?.score).toBe(80)
    }
    const prompt = reaskJsonPrompt("summary must be at least 40 characters. Missing score for impact.", ["impact", "clarity"])
    expect(prompt).toContain("scores must be an array")
    expect(prompt).toContain("at least 40 characters")
    expect(prompt).toContain("impact, clarity")
    expect(prompt).toContain('"criterionId":"impact"')
    expect(prompt).toContain("```json")
    expect(prompt).toContain("prose")
    expect(prompt).not.toContain("nothing else")
    expect(reviewSystemPrompt(officialCriteria)).toContain("Take your time")
    expect(reviewSystemPrompt(officialCriteria)).toContain("```json")
    expect(reviewSystemPrompt(officialCriteria)).toContain("Do not invent data")
    expect(reviewSystemPrompt(officialCriteria)).toContain("Do not ask for an attachment")
    expect(reviewSystemPrompt(officialCriteria)).not.toContain("nothing else")
    expect(CAREFUL_REVIEW_ENDING).toContain("fenced block")
    expect(prompt).toContain("Never nest a citation")
  })

  it("keeps the prose and reads the last fenced score sheet", async () => {
    const sheet = (score: number) => ({
      summary: "The record states a narrow claim and shows the weighing steps that support it, with the season limit written in the text.",
      scores: officialCriteria.criteria.flatMap((criterion) => criterion.id === "global-goals" ? [] : [{
        criterionId: criterion.id,
        score,
        rationale: "The text states this in a sentence a reader can find.",
        citations: [{ quote: "Net B collected 1.8 litres.", location: "results" }],
        confidence: "medium" as const,
      }]),
      overallScore: score,
      recommendation: "encourage",
      strengths: ["The files are public."],
      questionsForAuthors: ["Which table changed?"],
      suggestedNextSteps: ["Publish the table beside the text."],
      ontologyClass: "physical-testable",
      physics: { classification: "CONSISTENT", laws: ["conservation of mass"], howAddressed: "The mass balance is written out." },
      simulation: { reported: 0, passed: 0, methods: "Simulation does not apply to this record.", inputsAvailable: false },
      valueEstimate: { assumptions: ["The season is one site."], marketDisruption: "Not estimated." },
      goals: [{ goalId: "sdg-9", level: "indirect", note: "Shared measurement standards." }],
    })
    const prose = "I read the whole paper. Impact rests on the measured yield {this brace is not a score sheet. Feasibility follows from the method section."
    const reply = `${prose}\n\`\`\`json\n${JSON.stringify(sheet(10))}\n\`\`\`\nThe limitations are stated in the last section.\n\`\`\`json\n${JSON.stringify(sheet(90))}\n\`\`\``
    expect(reviewAnalysis(reply)).toContain("I read the whole paper")
    expect(reviewAnalysis(reply)).toContain("limitations are stated")
    const parsed = parseModelJson(reply)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    const accepted = validateReport(parsed.value, officialCriteria)
    expect(accepted.ok).toBe(true)
    if (!accepted.ok) expect(accepted.errors).toEqual([])
    if (accepted.ok) expect(accepted.report.scores.find((score) => score.criterionId === "impact")?.score).toBe(90)
    const rendered = `${prose}\n${JSON.stringify(sheet(56))}`
    expect(rendered.includes("```")).toBe(false)
    expect(reviewAnalysis(rendered)).toContain("I read the whole paper")
    expect(reviewAnalysis(rendered)).not.toContain("overallScore")
    const after = `${JSON.stringify(sheet(70))}\nAnalysis. I read the whole paper and the yield is in the results section, with the limit named for a reader.`
    expect(reviewAnalysis(after)).toContain("I read the whole paper")
    expect(reviewAnalysis(after)).not.toContain("overallScore")
    expect(reviewAnalysis("OK\n\nOK\n\nThe paper states the yield and the limit a reader can check in the results.\n" + JSON.stringify(sheet(70)))).toMatch(/^The paper states/)
    const settled = await settleChatJson(`${prose}\n{not json`, async () => JSON.stringify(sheet(70)), () => undefined)
    expect(settled.reasked).toBe(true)
    expect(settled.text).toContain("I read the whole paper")
    expect(settled.text).toContain("70")
  })

  it("keeps an uncited score, maps loose enums, and merges a thinner correction", () => {
    const scores = officialCriteria.criteria.map((criterion) => ({
      criterionId: criterion.id,
      score: criterion.id === "estimated-value" || criterion.id === "simulation" ? 60 : 80,
      rationale: `${criterion.name} is supported by a passage a reader can find, with the remaining gap named.`,
      citations: criterion.id === "estimated-value" || criterion.id === "simulation" ? [] : [{ quote: "Net B collected 1.8 litres.", location: "results" }],
      confidence: "medium" as const,
    }))
    const base = {
      summary: "The record states a narrow claim and shows the weighing steps that support it, with the season limit written in the text.",
      scores,
      strengths: ["The files are public."],
      majorIssues: [],
      minorIssues: ["The season is narrow."],
      questionsForAuthors: ["What would a second season change?"],
      suggestedNextSteps: ["Publish the weighing sheet beside the figure."],
      ontologyClass: "a physical experiment that can be repeated",
      physics: { classification: "consistent with known physics", laws: ["conservation of mass"], howAddressed: "The mass balance is written out." },
      simulation: { reported: 0, passed: 0, methods: "Simulation does not apply to this record.", inputsAvailable: false },
      valueEstimate: { assumptions: ["The season is one site."], marketDisruption: "Not estimated." },
      goals: [{ goalId: "clean-water", level: "indirect", note: "The record is about collection, not a target." }],
      recommendation: "encourage",
      overallScore: 80,
    }
    const accepted = validateReport(base, officialCriteria)
    expect(accepted.ok).toBe(true)
    if (!accepted.ok) return
    expect(accepted.report.scores.find((score) => score.criterionId === "estimated-value")?.uncited).toBe(true)
    expect(accepted.report.scores.find((score) => score.criterionId === "impact")?.uncited).toBeUndefined()
    expect(accepted.report.ontologyClass).toBe("physical-testable")
    expect(accepted.report.physics?.classification).toBe("CONSISTENT")
    expect(accepted.report.fieldNotes ?? []).toEqual([])
    const unknown = validateReport({ ...base, ontologyClass: "banana split" }, officialCriteria)
    expect(unknown.ok).toBe(true)
    if (unknown.ok) expect(unknown.report.fieldNotes?.join(" ")).toContain("logical-mathematical")
    const cited = validateReport({
      ...base,
      scores: scores.map((score) => (score.citations.length === 0 ? { ...score, citations: [{ quote: "Net B collected 1.8 litres.", location: "results" }] } : score)),
    }, officialCriteria)
    expect(cited.ok && accepted.ok).toBe(true)
    if (cited.ok) expect(accepted.report.overallScore).not.toBe(cited.report.overallScore)
    const nested = parseModelJson(JSON.stringify({
      review: {
        ...base,
        criteria: scores.map((score) => ({ name: score.criterionId, score: `${score.score}/100`, rationale: score.rationale, citations: score.citations, confidence: "medium" })),
        scores: undefined,
      },
    }))
    expect(nested.ok).toBe(true)
    if (nested.ok) {
      const shaped = validateReport(nested.value, officialCriteria)
      expect(shaped.ok).toBe(true)
      if (shaped.ok) expect(shaped.report.scores.find((score) => score.criterionId === "impact")?.score).toBe(80)
    }
    const merged = mergeReviewFields(base, { summary: "short", overallScore: 71, strengths: ["Kept."] })
    const mergedReport = validateReport(merged, officialCriteria)
    expect(mergedReport.ok).toBe(true)
    if (mergedReport.ok) {
      expect(mergedReport.report.summary).toContain("narrow claim")
      expect(mergedReport.report.scores.some((score) => score.criterionId === "impact")).toBe(true)
      expect(mergedReport.report.strengths).toContain("Kept.")
    }
  })

  it("rebuilds a review when a citation swallows the rest of the CODATA sheet", () => {
    const summary = "This is the official 2014 CODATA recommendation and it states the uncertainties for the constants."
    const rationale = "The text states this in a sentence a reader can find."
    const cite = [{ quote: "all data available up to 31 December 2014.", location: "abstract" }]
    const swallowedScores = officialCriteria.criteria.flatMap((criterion) => {
      if (criterion.id === "availability") return []
      return [{ criterionId: criterion.id, score: criterion.id === "impact" ? 90 : 80, rationale, citations: cite, confidence: "medium" }]
    })
    const nested = {
      criterionId: "availability",
      score: 98,
      rationale: "The Zenodo record holds the tables and the files are public.",
      citations: [{
        quote: "Zenodo record: 10.5281/zenodo.22826",
        citations: [{ quote: "all data available up to 31 December 2014.", location: "abstract" }],
        confidence: "high",
        summary,
        overallScore: 84,
        recommendation: "encourage",
        strengths: ["The tables are public."],
        questionsForAuthors: ["Which constant moved?"],
        suggestedNextSteps: ["Cite the version DOI beside the table."],
        scores: swallowedScores,
        ontologyClass: "physical-testable",
        physics: { classification: "CONSISTENT", laws: ["conservation of energy"], howAddressed: "The constants are measured." },
        simulation: { reported: 0, passed: 0, methods: "Simulation does not apply to this record.", inputsAvailable: false },
        valueEstimate: { assumptions: ["The tables are the public reference."], marketDisruption: "Not estimated." },
        goals: [{ goalId: "sdg-9", level: "indirect", note: "Shared measurement standards." }],
      }],
      ontologyClass: "physical-testable",
      physics: { classification: "CONSISTENT", laws: ["conservation of energy"], howAddressed: "The constants are measured." },
    }
    const parsed = parseModelJson(JSON.stringify(nested))
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    const value = parsed.value as { summary?: string; scores?: { criterionId?: string; score?: number; citations?: { quote?: string; citations?: unknown }[] }[] }
    expect(value.summary).toContain("2014 CODATA")
    expect(value.scores?.find((score) => score.criterionId === "impact")?.score).toBe(90)
    expect(value.scores?.find((score) => score.criterionId === "availability")?.score).toBe(98)
    expect(value.scores?.find((score) => score.criterionId === "limitations")?.score).toBe(80)
    const availability = value.scores?.find((score) => score.criterionId === "availability")
    expect(availability?.citations?.[0]?.quote).toContain("31 December 2014")
    expect(availability?.citations?.[0]?.citations).toBeUndefined()
    expect(JSON.stringify(availability?.citations)).not.toContain("Zenodo record")
    const accepted = validateReport(parsed.value, officialCriteria)
    expect(accepted.ok).toBe(true)
    if (!accepted.ok) expect(accepted.errors).toEqual([])
    const loose = [
      JSON.stringify({ summary, overallScore: 84, recommendation: "encourage", strengths: ["The tables are public."], questionsForAuthors: ["Which constant moved?"], suggestedNextSteps: ["Cite the version DOI beside the table."], ontologyClass: "physical-testable", physics: nested.physics, simulation: nested.citations[0].simulation, valueEstimate: nested.citations[0].valueEstimate, goals: nested.citations[0].goals }),
      ...officialCriteria.criteria.map((criterion) => JSON.stringify({
        criterionId: criterion.id,
        score: criterion.id === "availability" ? 98 : criterion.id === "impact" ? 90 : 80,
        rationale,
        citations: criterion.id === "availability"
          ? [{ quote: "Zenodo record: 10.5281/zenodo.22826", citations: cite, confidence: "high" }]
          : cite,
        confidence: "medium",
      })),
    ].join("\n")
    const gathered = parseModelJson(loose)
    expect(gathered.ok).toBe(true)
    if (!gathered.ok) return
    const sheet = validateReport(gathered.value, officialCriteria)
    expect(sheet.ok).toBe(true)
    if (sheet.ok) {
      expect(sheet.report.scores.find((score) => score.criterionId === "availability")?.score).toBe(98)
      expect(sheet.report.scores.find((score) => score.criterionId === "impact")?.score).toBe(90)
      expect(sheet.report.summary).toContain("2014 CODATA")
    }
  })

  it("rebuilds Quantized Inertia when criteria use other keys and a long physics block breaks the wrapper", () => {
    const summary = "The record states a boundary correction and shows the weighing steps that support it, with the limit written in the text."
    const rationale = "The text states this in a sentence a reader can find."
    const laws = Array.from({ length: 40 }, (_, index) => `conservation statement ${index} ${"boundary ".repeat(12)}`)
    const physics = {
      classification: "EXTENDS",
      laws,
      howAddressed: "The inertia term extends the thermodynamic argument by a boundary correction that is written out at length.",
    }
    const availability = {
      criterionId: "availability",
      score: 85,
      rationale: "The Zenodo record holds the tables and the files are public.",
      citations: [
        { quote: "The files are in the Zenodo record.", location: "files" },
        { quote: "The tables are complete enough to reuse.", location: "results" },
      ],
      ontologyClass: "physical-testable",
      physics,
    }
    const named = ["clarity", "consistency", "evidence-labelling", "limitations"]
    const keyed = officialCriteria.criteria.flatMap((criterion) => {
      if (criterion.id === "availability" || named.includes(criterion.id)) return []
      return [[criterion.id, { score: criterion.id === "impact" ? "90" : "80/100", rationale, citations: [{ quote: "A cited sentence.", location: "abstract" }] }]]
    })
    const byName = officialCriteria.criteria.filter((criterion) => named.includes(criterion.id)).map((criterion) => ({
      criterion: criterion.name,
      score: "70/100",
      rationale,
      citations: [{ quote: "A cited sentence.", location: "discussion" }],
    }))
    const rest = {
      summary,
      overallScore: 72,
      recommendation: "encourage",
      strengths: ["The files are public."],
      questionsForAuthors: ["Which table changed?"],
      suggestedNextSteps: ["Publish the table beside the text."],
      ontologyClass: "physical-testable",
      physics,
      simulation: { reported: 0, passed: 0, methods: "Simulation does not apply to this record.", inputsAvailable: false },
      valueEstimate: { assumptions: ["The season is one site."], marketDisruption: "Not estimated." },
      goals: [{ goalId: "sdg-9", level: "indirect", note: "Shared measurement standards." }],
      scores: Object.fromEntries(keyed),
      criteria: byName,
    }
    const brokenPhysics = `${JSON.stringify(physics).slice(0, -1)}, "note": "line\nbreak"}`
    const reply = [
      "```json",
      JSON.stringify(availability),
      "```",
      "The physics block below is not valid JSON.",
      brokenPhysics,
      "```json",
      JSON.stringify(rest),
      "```",
    ].join("\n")
    expect(reply.length).toBeGreaterThan(8000)
    expect(reply.slice(0, 600)).toContain('"criterionId":"availability"')
    expect(reply.slice(0, 600)).toContain("EXTENDS")
    const note = describeCriterionGather(reply)
    expect(note).toContain("Criterion-like objects:")
    expect(note).toContain("availability")
    expect(note).toContain("impact")
    expect(note).toMatch(/Keys:.*score/)
    const parsed = parseModelJson(reply)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    const accepted = validateReport(parsed.value, officialCriteria)
    expect(accepted.ok).toBe(true)
    if (!accepted.ok) expect(accepted.errors).toEqual([])
    if (accepted.ok) {
      expect(accepted.report.scores.find((score) => score.criterionId === "availability")?.score).toBe(85)
      expect(accepted.report.scores.find((score) => score.criterionId === "impact")?.score).toBe(90)
      expect(accepted.report.scores.find((score) => score.criterionId === "limitations")?.score).toBe(70)
      expect(accepted.report.summary).toContain("boundary correction")
    }
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

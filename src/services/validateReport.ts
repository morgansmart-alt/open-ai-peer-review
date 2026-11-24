import { categoryLabel, clamp, weightedMean } from "../domain/criteria.ts"
import { describeScoring } from "../domain/scoring.ts"
import { parseAirFeedback } from "./airFeedback.ts"
import type {
  Citation,
  Confidence,
  CriteriaSet,
  GoalAlignment,
  GoalLevel,
  MajorIssue,
  OntologyClass,
  PhysicsCheck,
  ReviewReport,
  SimulationEvidence,
  ValueEstimate,
  ValueRange,
} from "../domain/types.ts"

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

export function extractJsonValue(raw: string): unknown {
  const trimmed = raw.trim()
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const body = (fenced?.[1] ?? trimmed).trim()
  try {
    return JSON.parse(body)
  } catch {
    const start = body.indexOf("{")
    const end = body.lastIndexOf("}")
    if (start >= 0 && end > start) return JSON.parse(body.slice(start, end + 1))
    throw new Error("No JSON object found in the model output.")
  }
}

function clip(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : ""
}

function citationsFrom(value: unknown, errors: string[], path: string): Citation[] {
  if (!Array.isArray(value)) {
    errors.push(`${path} needs a citations array.`)
    return []
  }
  return value.flatMap((item) => {
    if (typeof item === "string") return [{ quote: item.slice(0, 500), location: "Record" }]
    if (!isRecord(item)) return []
    const quote = clip(item.quote ?? item.passage ?? item.text, 500)
    if (!quote) return []
    return [{ quote, location: clip(item.location ?? item.where ?? "Record", 160) || "Record" }]
  })
}

function stringArray(value: unknown, maxItems: number, maxLen: number): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => clip(item, maxLen))
    .filter(Boolean)
    .slice(0, maxItems)
}

export function validateReport(input: unknown, criteria: CriteriaSet): { ok: true; report: ReviewReport } | { ok: false; errors: string[] } {
  const errors: string[] = []
  if (!isRecord(input)) return { ok: false, errors: ["The model output was not a JSON object."] }
  const summary = clip(input.summary, 4000)
  if (summary.length < 40) errors.push("summary must be at least 40 characters.")

  const scoresRaw = Array.isArray(input.scores) ? input.scores : []
  const scores = criteria.criteria.map((criterion) => {
    const found = scoresRaw.find((item) => isRecord(item) && clip(item.criterionId ?? item.id, 80) === criterion.id)
    if (!isRecord(found)) {
      errors.push(`Missing score for ${criterion.id}.`)
      return null
    }
    const score = Number(found.score)
    if (!Number.isInteger(score) || score < criteria.scale.min || score > criteria.scale.max) {
      errors.push(`${criterion.id} score must be an integer from ${criteria.scale.min} to ${criteria.scale.max}.`)
    }
    const rationale = clip(found.rationale ?? found.reason, 2000)
    if (rationale.length < 20) errors.push(`${criterion.id} rationale is too short.`)
    const citations = citationsFrom(found.citations ?? found.quotes, errors, criterion.id)
    if (citations.length === 0) errors.push(`${criterion.id} needs at least one citation.`)
    const confidenceRaw = clip(found.confidence, 16).toLowerCase()
    const confidence = confidenceRaw === "low" || confidenceRaw === "med" || confidenceRaw === "medium" || confidenceRaw === "high" ? confidenceRaw : ""
    if (criteria.reportSchema === "0.2" && !confidence) errors.push(`${criterion.id} needs a confidence of low, medium, or high.`)
    const normalizedConfidence: Confidence | undefined =
      confidence === "high" ? "high" : confidence === "medium" || confidence === "med" ? "medium" : confidence === "low" ? "low" : undefined
    return { criterionId: criterion.id, score, rationale, citations, confidence: normalizedConfidence }
  })

  const recommendationRaw = clip(input.recommendation, 120).toLowerCase()
  const recommendation =
    criteria.recommendationCategories.find(
      (item) => item.id.toLowerCase() === recommendationRaw || item.label.toLowerCase() === recommendationRaw,
    )?.id ?? ""
  if (!recommendation) errors.push("recommendation must be one of the criteria category ids.")

  const strengths = stringArray(input.strengths, 6, 400)
  const questions = stringArray(input.questionsForAuthors ?? input.questions, 6, 400)
  const nextSteps = stringArray(input.suggestedNextSteps ?? input.nextSteps, 6, 400)
  const minorIssues = stringArray(input.minorIssues ?? input.minor_issues, 8, 400)
  if (strengths.length === 0) errors.push("Add at least one strength.")
  if (questions.length === 0) errors.push("Add at least one question for the authors.")
  if (nextSteps.length === 0) errors.push("Add at least one suggested next step.")

  const majorRaw = Array.isArray(input.majorIssues) ? input.majorIssues : Array.isArray(input.major_issues) ? input.major_issues : []
  const known = new Set(criteria.criteria.map((item) => item.id))
  const majorIssues: MajorIssue[] = majorRaw.slice(0, 6).flatMap((item) => {
    if (typeof item === "string") {
      return [{ criterionId: criteria.criteria[0]?.id ?? "clarity", claim: item.slice(0, 500), quotedPassage: "", reason: item.slice(0, 800) }]
    }
    if (!isRecord(item)) return []
    const criterionId = clip(item.criterionId ?? item.criterion, 80)
    if (criterionId && !known.has(criterionId)) errors.push(`Unknown criterion on a major issue: ${criterionId}.`)
    const claim = clip(item.claim ?? item.summary ?? item.issue, 500)
    if (!claim) return []
    return [
      {
        criterionId: known.has(criterionId) ? criterionId : criteria.criteria[0]?.id ?? "clarity",
        claim,
        quotedPassage: clip(item.quotedPassage ?? item.quote ?? "", 500),
        reason: clip(item.reason ?? item.why ?? claim, 800),
      },
    ]
  })

  const includeValue = criteria.criteria.some((criterion) => criterion.id === "estimated-value")
  const v2 = criteria.reportSchema === "0.2" ? readV2(input, errors, includeValue) : {}
  if (errors.length || scores.some((score) => score === null)) return { ok: false, errors }
  const ready = scores.filter((score): score is NonNullable<typeof score> => score !== null)
  const overall = weightedMean(ready, criteria)
  const idea = weightedMean(ready, criteria, criteria.ideaCriterionIds)
  if (overall === null || idea === null) return { ok: false, errors: ["Could not weight the scores."] }
  const statedRaw = Number(input.overallScore)
  const airFeedback = parseAirFeedback(input.air_feedback ?? input.airFeedback)
  const check = describeScoring({
    scores: ready,
    statedOverall: Number.isFinite(statedRaw) ? statedRaw : null,
    recommendation,
    criteria,
  })
  return {
    ok: true,
    report: {
      summary,
      scores: ready.map((score) => ({ ...score, score: clamp(score.score, criteria.scale.min, criteria.scale.max) })),
      overallScore: overall,
      statedOverall: Number.isFinite(statedRaw) ? statedRaw : null,
      ideaScore: idea,
      recommendation,
      scale: check.scale,
      scoringCheck: check.scoringCheck,
      strengths,
      majorIssues,
      minorIssues,
      questionsForAuthors: questions,
      suggestedNextSteps: nextSteps,
      ...(airFeedback ? { airFeedback } : {}),
      ...v2,
    },
  }
}

const ontologyClasses = new Set(["physical-testable", "physical-not-yet-testable", "logical-mathematical", "metaphysical-philosophical"])
const physicsClasses = new Set(["CONSISTENT", "EXTENDS", "CHALLENGES"])
const goalLevels = new Set(["none", "indirect", "partial", "direct"])

function rangeFrom(value: unknown, fallbackUnit: string): ValueRange {
  const record = isRecord(value) ? value : {}
  return {
    low: clip(record.low, 80) || "not estimated",
    central: clip(record.central, 80) || "not estimated",
    high: clip(record.high, 80) || "not estimated",
    unit: clip(record.unit, 40) || fallbackUnit,
  }
}

function readV2(input: Record<string, unknown>, errors: string[], includeValue: boolean): Partial<ReviewReport> {
  const ontologyClass = clip(input.ontologyClass, 80)
  if (!ontologyClasses.has(ontologyClass)) errors.push("ontologyClass must be one of the four AIR classes.")
  const physicsRaw = isRecord(input.physics) ? input.physics : null
  const classification = clip(physicsRaw?.classification, 20).toUpperCase()
  if (!physicsClasses.has(classification)) errors.push("physics.classification must be CONSISTENT, EXTENDS, or CHALLENGES.")
  const physics: PhysicsCheck = {
    classification: (physicsClasses.has(classification) ? classification : "CONSISTENT") as PhysicsCheck["classification"],
    laws: stringArray(physicsRaw?.laws, 8, 120),
    howAddressed: clip(physicsRaw?.howAddressed, 800),
  }
  if (physics.laws.length === 0) errors.push("physics.laws needs at least one named law or an explicit 'none used'.")
  const simulationRaw = isRecord(input.simulation) ? input.simulation : null
  const reported = simulationRaw ? Number(simulationRaw.reported) : NaN
  const passed = simulationRaw ? Number(simulationRaw.passed) : NaN
  const simulation: SimulationEvidence = {
    reported: Number.isInteger(reported) ? reported : null,
    passed: Number.isInteger(passed) ? passed : null,
    methods: clip(simulationRaw?.methods, 400),
    inputsAvailable: Boolean(simulationRaw?.inputsAvailable),
  }
  if (!simulation.methods) errors.push("simulation.methods must say what was run, or that simulation does not apply.")
  const valueRaw = isRecord(input.valueEstimate) ? input.valueEstimate : null
  const valueEstimate: ValueEstimate = {
    confidence: "low",
    assumptions: stringArray(valueRaw?.assumptions, 8, 240),
    marketDisruption: clip(valueRaw?.marketDisruption, 400) || "Not estimated from the record.",
    addressableMarket: rangeFrom(valueRaw?.addressableMarket, "not estimated"),
    units: rangeFrom(valueRaw?.units, "units"),
    valuePerUnit: rangeFrom(valueRaw?.valuePerUnit, "per unit"),
    overallBenefit: rangeFrom(valueRaw?.overallBenefit, "not estimated"),
    disclaimer: "AI estimate. Not a fact and not investment advice.",
  }
  if (includeValue && valueEstimate.assumptions.length === 0) errors.push("valueEstimate.assumptions needs at least one assumption.")
  const goals: GoalAlignment[] = Array.isArray(input.goals)
    ? input.goals.flatMap((item) => {
        if (!isRecord(item)) return []
        const level = clip(item.level, 20)
        if (!goalLevels.has(level)) return []
        const goalId = clip(item.goalId, 80)
        if (!goalId) return []
        return [{ goalId, level: level as GoalLevel, note: clip(item.note, 300) }]
      })
    : []
  if (goals.length === 0) errors.push("goals must list a level for the documented public goals you considered.")
  return {
    ontologyClass: (ontologyClasses.has(ontologyClass) ? ontologyClass : undefined) as OntologyClass | undefined,
    physics,
    simulation,
    ...(includeValue ? { valueEstimate } : {}),
    goals,
  }
}

export function recommendationLine(criteria: CriteriaSet, id: string): string {
  return categoryLabel(criteria, id)
}

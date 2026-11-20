import { assessorById } from "../domain/assessors.ts"
import { clamp, recommendationFor, weightedMean } from "../domain/criteria.ts"
import { describeScoring } from "../domain/scoring.ts"
import { globalGoals, goalLevelForText } from "../domain/goals.ts"
import type {
  AssessorProfile,
  Confidence,
  CriteriaSet,
  CriterionJudgement,
  MajorIssue,
  OntologyClass,
  PhysicsCheck,
  ReviewReport,
  SourceResult,
  Verdict,
} from "../domain/types.ts"
import { pickQuotes, textSignals } from "./textTools.ts"

const BIAS: Record<string, Record<string, number>> = {
  grok: { "evidence-labelling": -0.45, consistency: -0.35, all: -0.15 },
  gpt: { all: 0 },
  claude: { clarity: 0.35, presentation: 0.25 },
  gemini: { methodology: 0.3, availability: 0.15 },
  deepseek: { "potential-impact": -0.25, "novelty-context": -0.15 },
  mistral: { clarity: 0.15 },
  llama: { limitations: -0.2, ethics: -0.1 },
}

function hashString(value: string): number {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function signalSentence(_criterionId: string, amount: number): string {
  if (amount >= 0.5) return "The local notes found supporting signs for this criterion in the supplied text."
  if (amount <= -0.4) return "The local notes found this criterion thin in the supplied text."
  return "The local notes found a mixed picture for this criterion."
}

export function buildDemoReport(options: {
  profile: AssessorProfile
  criteria: CriteriaSet
  text: string
  filenames: string[]
  title: string
}): ReviewReport {
  const { profile, criteria, text, filenames, title } = options
  const signals = textSignals(text, filenames)
  const quotes = pickQuotes(text, criteria.criteria.length + 2)
  const fallback = `The record “${title}” was read from its metadata and files.`
  const midpoint = (criteria.scale.min + criteria.scale.max) / 2
  const spread = Math.max(1, (criteria.scale.max - criteria.scale.min) / 5)
  const confidence: Confidence = text.length > 1000 ? "medium" : "low"
  const scores = criteria.criteria.map((criterion, index) => {
    const bias = BIAS[profile.id]?.[criterion.id] ?? BIAS[profile.id]?.all ?? 0
    const wobble = ((hashString(`${profile.id}:${criterion.id}:${title}`) % 3) - 1) * 0.35
    const score = clamp(
      Math.round(midpoint + ((signals[criterion.id] ?? 0) + bias + wobble) * spread),
      criteria.scale.min,
      criteria.scale.max,
    )
    const quote = quotes[index] || quotes[0] || fallback
    return {
      criterionId: criterion.id,
      score,
      confidence,
      rationale: `Demo reading only — no model was called. ${signalSentence(criterion.id, signals[criterion.id] ?? 0)} Anchored to this passage: “${quote}” Raising it would mean: ${criterion.guidance}`,
      citations: [{ quote, location: filenames[0] ? `${filenames[0]} (extracted text)` : "Record description" }],
    }
  })
  const overall = weightedMean(scores, criteria) ?? 3
  const idea = weightedMean(scores, criteria, criteria.ideaCriterionIds) ?? overall
  const weakest = [...scores].sort((a, b) => a.score - b.score)[0]
  const weakestCriterion = criteria.criteria.find((item) => item.id === weakest?.criterionId)
  const majorIssues: MajorIssue[] = scores
    .filter((score) => score.score <= criteria.scale.max * 0.2)
    .slice(0, 3)
    .map((score) => {
      const criterion = criteria.criteria.find((item) => item.id === score.criterionId)
      return {
        criterionId: score.criterionId,
        claim: `${criterion?.name ?? "This criterion"} is not strong enough yet to carry the record's conclusions.`,
        quotedPassage: score.citations[0]?.quote ?? "",
        reason: signalSentence(score.criterionId, signals[score.criterionId] ?? 0),
      }
    })
  const recommendation = recommendationFor(overall, criteria)
  const check = describeScoring({ scores, statedOverall: overall, recommendation, criteria })
  return {
    summary: `This is a demo reading of “${title}” by the ${profile.name} profile. No API was called. The notes below use a fixed local heuristic so you can walk the whole report, the panel, and the leaderboard before you spend a key. Treat every score as a placeholder a real model would replace.`,
    scores,
    overallScore: overall,
    ideaScore: idea,
    recommendation,
    scale: check.scale,
    scoringCheck: check.scoringCheck,
    strengths: [
      "The record is public on Zenodo, so a reader can open the same files AIR used.",
      text.length > 800 ? "There is enough text in the selected files to anchor comments to passages." : "The metadata already states a subject a later reading can test.",
    ],
    majorIssues,
    minorIssues: weakest
      ? [`${weakestCriterion?.name ?? "The weakest criterion"} is the first place a revision would pay off.`]
      : [],
    questionsForAuthors: [
      "Which sentence is the claim a sceptical reader should test first?",
      "What result, file, or derivation would show that claim to be wrong?",
    ],
    suggestedNextSteps: [
      weakestCriterion ? `Tighten ${weakestCriterion.name.toLowerCase()}: ${weakestCriterion.guidance}` : "Name the central claim in one sentence.",
      "Mark each strong conclusion as measured, derived, or still speculative.",
    ],
    ...demoV2(criteria, text, quotes[0] || fallback),
  }
}

function demoV2(criteria: CriteriaSet, text: string, quote: string): Partial<ReviewReport> {
  if (criteria.reportSchema !== "0.2") return {}
  const lowered = text.toLowerCase()
  const physicalWords = /measured|experiment|dataset|litre|weigh|temperature|energy|watt|voltage|prototype|engine|turbine/.test(lowered)
  const ontologyClass: OntologyClass = /metaphysical|purely philosophical/.test(lowered) && !physicalWords
    ? "metaphysical-philosophical"
    : /theorem|lemma|axiom|q\.e\.d/.test(lowered) && !physicalWords
      ? "logical-mathematical"
      : /measured|experiment|dataset|prototype|bench|weigh/.test(lowered)
        ? "physical-testable"
        : physicalWords
          ? "physical-not-yet-testable"
          : "physical-not-yet-testable"
  const physics: PhysicsCheck = /no loss|lossless|perpetual|might conduct perfectly|zero resistance/.test(lowered)
    ? {
        classification: "CHALLENGES",
        laws: ["conservation of energy"],
        howAddressed: "The record does not show an energy source that would keep the books balanced. Untested is not the same as wrong, and a challenge still has to be addressed in the text.",
      }
    : /conservation|thermodynamic|joule|carnot|efficiency/.test(lowered)
      ? { classification: "CONSISTENT", laws: ["thermodynamics"], howAddressed: "The text names a physical limit a reader can check." }
      : {
          classification: "EXTENDS",
          laws: ["none beyond ordinary mechanics are named"],
          howAddressed: "No clash with a named law is written down. Treat the claim as an extension until a measurement exists.",
        }
  const reported = (lowered.match(/simulation/g) ?? []).length
  return {
    ontologyClass,
    physics,
    simulation: {
      reported: reported > 0 ? reported : null,
      passed: null,
      methods: reported > 0 ? "The word simulation appears. The demo did not invent a tool name." : "No simulation count is reported in the text used here.",
      inputsAvailable: /code|script|\.py|dataset/.test(lowered),
    },
    valueEstimate: {
      confidence: "low",
      assumptions: [
        "No market filing or price list was in the text used for this demo.",
        "Ranges below are placeholders, not a forecast.",
      ],
      marketDisruption: "Not estimated. The demo will not invent a market size.",
      addressableMarket: { low: "not estimated", central: "not estimated", high: "not estimated", unit: "not estimated" },
      units: { low: "not estimated", central: "not estimated", high: "not estimated", unit: "units" },
      valuePerUnit: { low: "not estimated", central: "not estimated", high: "not estimated", unit: "per unit" },
      overallBenefit: { low: "not estimated", central: "not estimated", high: "not estimated", unit: "not estimated" },
      disclaimer: "AI estimate. Not a fact and not investment advice.",
    },
    goals: globalGoals.goals.map((goal) => ({
      goalId: goal.id,
      level: goalLevelForText(goal, text),
      note: goalLevelForText(goal, text) === "none" ? "No direct wording in the text used here." : `Demo keyword match only. Passage: “${quote.slice(0, 140)}”`,
    })),
  }
}

export function buildDemoVerdict(options: {
  profile: AssessorProfile
  criteria: CriteriaSet
  originalScores: { criterionId: string; score: number }[]
  text: string
  title: string
}): {
  verdict: Verdict
  summary: string
  judgements: CriterionJudgement[]
  errorsFound: string[]
  failureModes: MajorIssue[]
} {
  const demo = buildDemoReport({ ...options, filenames: [] })
  const judgements: CriterionJudgement[] = options.criteria.criteria.map((criterion) => {
    const original = options.originalScores.find((score) => score.criterionId === criterion.id)?.score ?? 3
    const theirs = demo.scores.find((score) => score.criterionId === criterion.id)?.score ?? 3
    const agree = Math.abs(original - theirs) <= Math.max(1, Math.round((options.criteria.scale.max - options.criteria.scale.min) / 5))
    return {
      criterionId: criterion.id,
      agree,
      theirScore: theirs,
      note: agree ? "Within a point of the original reading." : `Demo check would score this ${theirs}, against ${original}.`,
    }
  })
  const disagreements = judgements.filter((item) => !item.agree)
  const verdict: Verdict = disagreements.length >= 3 ? "fail" : "pass"
  const failureModes: MajorIssue[] = disagreements.slice(0, 2).map((item) => {
    const criterion = options.criteria.criteria.find((criterion) => criterion.id === item.criterionId)
    return {
      criterionId: item.criterionId,
      claim: `${criterion?.name ?? item.criterionId} does not match a second pass.`,
      quotedPassage: pickQuotes(options.text, 1)[0] ?? "",
      reason: item.note,
    }
  })
  return {
    verdict,
    summary:
      verdict === "pass"
        ? `Demo check of “${options.title}”: the second pass stays close to the original reading. No model was called.`
        : `Demo check of “${options.title}”: the second pass parts company on ${disagreements.length} criteria. No model was called. Edit the verdict before you submit it.`,
    judgements,
    errorsFound: failureModes.map((item) => item.claim),
    failureModes,
  }
}

export function buildDemoSourceCheck(claim: string, text: string, checkedVersion: string): {
  result: SourceResult
  explanation: string
  citations: { quote: string; location: string }[]
} {
  const words = claim
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 4)
    .slice(0, 8)
  const sentences = text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 30)
  const ranked = sentences
    .map((sentence) => ({
      sentence,
      hits: words.filter((word) => sentence.toLowerCase().includes(word)).length,
    }))
    .sort((a, b) => b.hits - a.hits)
  const best = ranked[0]
  const hits = best?.hits ?? 0
  const result: SourceResult = hits >= 3 ? "ADDRESSED" : hits >= 1 ? "PARTIALLY_ADDRESSED" : "NOT_ADDRESSED"
  const quote = best?.sentence ?? ""
  return {
    result,
    explanation:
      result === "NOT_ADDRESSED"
        ? "The local overlap check did not find a passage that takes up this failure. A model, or a person, should still look."
        : `The local overlap check found language that touches the failure (${hits} shared words). This is a demo match, not a judgement that the failure is resolved.`,
    citations: quote ? [{ quote: quote.slice(0, 400), location: `Checked against ${checkedVersion}` }] : [],
  }
}

export function profileOrFallback(id: string): AssessorProfile {
  return (
    assessorById(id) ?? {
      id,
      name: id,
      shortName: id,
      provider: "compatible",
      defaultModel: "custom",
      defaultBaseUrl: "",
      blurb: "",
      builtin: false,
    }
  )
}

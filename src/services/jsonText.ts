import { jsonrepair } from "jsonrepair"

export interface ParsedModelJson {
  ok: true
  value: unknown
  text: string
  repaired: boolean
}

function fenced(raw: string): string {
  const trimmed = raw.trim()
  const match = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  return (match?.[1] ?? trimmed).trim()
}

function matchingBrace(text: string, start: number): number {
  let depth = 0
  let inString = false
  let escaped = false
  for (let index = start; index < text.length; index += 1) {
    const char = text[index]
    if (inString) {
      if (escaped) escaped = false
      else if (char === "\\") escaped = true
      else if (char === "\"") inString = false
      continue
    }
    if (char === "\"") inString = true
    else if (char === "{") depth += 1
    else if (char === "}") {
      depth -= 1
      if (depth === 0) return index
    }
  }
  return -1
}

function parseSlice(slice: string): { value: unknown; text: string; repaired: boolean } | null {
  try {
    return { value: JSON.parse(slice), text: slice, repaired: false }
  } catch {
    try {
      const repaired = jsonrepair(slice)
      return { value: JSON.parse(repaired), text: repaired, repaired: true }
    } catch {
      return null
    }
  }
}

function numericScore(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string") {
    const trimmed = value.trim()
    if (trimmed.startsWith("<")) return null
    if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed)
  }
  return null
}

function hasNumericScore(value: unknown): boolean {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false
  const row = value as { overallScore?: unknown; recommendation?: unknown; questionsForAuthors?: unknown; scores?: unknown }
  const score = numericScore(row.overallScore)
  if (score === null) return false
  row.overallScore = score
  if (Array.isArray(row.scores)) {
    for (const item of row.scores) {
      if (!item || typeof item !== "object") continue
      const field = item as { score?: unknown }
      const next = numericScore(field.score)
      if (next !== null) field.score = next
    }
  }
  if (typeof row.recommendation === "string" && (row.recommendation.includes("<") || row.recommendation.includes("|"))) return false
  const questions = row.questionsForAuthors
  if (Array.isArray(questions) && questions.length === 1 && (questions[0] === "string" || questions[0] === "<question>")) return false
  return true
}

/**
 * The last object whose overallScore is a number.
 * The prompt schema keeps overallScore as a description string, so it is skipped.
 */
export function lastScoreJson(raw: string): { value: unknown; text: string; repaired: boolean } | null {
  const windowText = raw.length > 400_000 ? raw.slice(-200_000) : raw
  let last: { value: unknown; text: string; repaired: boolean } | null = null
  for (let index = 0; index < windowText.length; index += 1) {
    if (windowText[index] !== "{") continue
    const end = matchingBrace(windowText, index)
    if (end < 0) continue
    const slice = windowText.slice(index, end + 1)
    if (/"overallScore"\s*:/.test(slice)) {
      const parsed = parseSlice(slice)
      if (parsed && hasNumericScore(parsed.value)) last = parsed
    }
    index = end
  }
  return last
}

const SCORE_KEY_SKIP = new Set([
  "summary",
  "overallscore",
  "recommendation",
  "strengths",
  "scores",
  "questions",
  "questionsforauthors",
  "suggestednextsteps",
  "nextsteps",
  "minorissues",
  "majorissues",
  "ontologyclass",
  "valueestimate",
  "goals",
  "air_feedback",
  "airfeedback",
  "reading",
  "scale",
  "ideascore",
  "statedoverall",
  "scoringcheck",
  "confidence",
])

function scoreEntry(key: string, field: unknown): Record<string, unknown> | null {
  if (SCORE_KEY_SKIP.has(key.toLowerCase().replace(/[_-]/g, ""))) return null
  if (typeof field === "number" && Number.isFinite(field)) return { criterionId: key, score: field }
  if (field && typeof field === "object" && !Array.isArray(field) && "score" in field) return { criterionId: key, ...(field as Record<string, unknown>) }
  return null
}

/** Turn a scores object, or top-level criterion fields, into the scores array the validator expects. */
export function normaliseScoreShape(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value
  const row = { ...(value as Record<string, unknown>) }
  if (row.scores && typeof row.scores === "object" && !Array.isArray(row.scores)) {
    row.scores = Object.entries(row.scores as Record<string, unknown>).flatMap(([key, field]) => {
      const entry = scoreEntry(key, field) ?? (typeof field === "number" ? { criterionId: key, score: field } : null)
      return entry ? [entry] : []
    })
  }
  if (!Array.isArray(row.scores)) {
    const lifted = Object.entries(row).flatMap(([key, field]) => {
      const entry = scoreEntry(key, field)
      return entry ? [entry] : []
    })
    if (lifted.length > 0) row.scores = lifted
  }
  return row
}

/** Strict JSON first. A repair pass covers trailing commas, missing commas, and similar damage. */
export function parseModelJson(raw: string): ParsedModelJson | { ok: false; error: string } {
  const scored = lastScoreJson(raw)
  if (scored) return { ok: true, value: normaliseScoreShape(scored.value), text: scored.text, repaired: scored.repaired }
  const slice = fenced(raw)
  const parsed = slice.includes("{") ? parseSlice(slice) : null
  if (parsed) return { ok: true, value: normaliseScoreShape(parsed.value), text: parsed.text, repaired: parsed.repaired }
  return { ok: false, error: "No JSON object found in the model output." }
}

export function reaskJsonPrompt(problem: string, criterionIds: readonly string[] = []): string {
  const detail = problem.replace(/\s+/g, " ").trim().slice(0, 500)
  const ids = criterionIds.length > 0 ? criterionIds.join(", ") : "every criterion id from the rubric"
  const exampleId = criterionIds[0] ?? "impact"
  return [
    `Your JSON did not validate (${detail}).`,
    "Reply with one JSON object and nothing else.",
    "summary must be a string of at least 40 characters.",
    "scores must be an array with one object for each criterion id.",
    "Each scores object needs criterionId, score (integer 0-100), rationale (at least 20 characters), citations (an array of {quote, location}), and confidence (low, medium, or high).",
    `Criterion ids: ${ids}.`,
    "Also include overallScore (number 0-100), recommendation (accept, encourage, revise, major-revision, or not-ready), strengths (array of strings), questionsForAuthors (array of strings), and suggestedNextSteps (array of strings).",
    `Example: {"summary":"The paper states its claim and the limit of that claim in the text.","scores":[{"criterionId":"${exampleId}","score":70,"rationale":"The text states this in a sentence a reader can find.","citations":[{"quote":"a sentence from the paper","location":"abstract"}],"confidence":"medium"}],"overallScore":70,"recommendation":"revise","strengths":["The files are public."],"questionsForAuthors":["Which table changed?"],"suggestedNextSteps":["Publish the table beside the text."]}.`,
    "Repeat the scores object for every criterion id. global-goals may be omitted.",
  ].join(" ")
}

export const FILL_REVIEW_PROMPT =
  "Fill in the review now. Return one completed JSON object for this paper. Do not repeat the rubric template or the instructions."

/** A reply that echoes the rubric schema instead of a completed review. */
export function rubricTemplateProblem(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const row = value as Record<string, unknown>
  const scoreText = typeof row.overallScore === "string" ? row.overallScore.trim() : ""
  const scoreIsPlaceholder = scoreText.length > 0 && !/^-?\d+(\.\d+)?$/.test(scoreText)
  const recommendationIsSchema = typeof row.recommendation === "string" && (row.recommendation.includes("|") || row.recommendation.includes("<"))
  const strengthsPlaceholder = Array.isArray(row.strengths) && row.strengths.length > 0 && row.strengths.every((item) => item === "string" || item === "<strength>")
  const scoreFieldsAreStrings =
    Array.isArray(row.scores) &&
    row.scores.some((item) => item && typeof item === "object" && typeof (item as { score?: unknown }).score === "string" && !/^-?\d+(\.\d+)?$/.test(String((item as { score?: unknown }).score).trim()))
  if (scoreIsPlaceholder || recommendationIsSchema || strengthsPlaceholder || scoreFieldsAreStrings) {
    return "The reply repeated the rubric template instead of a completed review."
  }
  return null
}

/** Repair when possible. A parse or schema failure asks the chat once, naming the problem. */
function rejectionNote(problem: string, raw: string): string {
  const chosen = raw.replace(/\s+/g, " ").trim().slice(0, 200)
  return `Rejected the reply. ${problem} Chosen JSON: ${chosen}`
}

export async function settleChatJson(
  raw: string,
  ask: (prompt: string) => Promise<string>,
  log: (message: string) => void,
  validate?: (text: string) => { ok: true } | { ok: false; errors: string[] },
  criterionIds: readonly string[] = [],
): Promise<{ text: string; repaired: boolean; reasked: boolean }> {
  const ready = (parsed: ParsedModelJson) => {
    if (!validate) return { ok: true as const }
    return validate(parsed.text)
  }
  const first = parseModelJson(raw)
  if (first.ok) {
    const template = rubricTemplateProblem(first.value)
    const checked = template ? { ok: false as const, errors: [template] } : ready(first)
    if (checked.ok) {
      if (first.repaired) log("Repaired the chat's JSON before scoring.")
      return { text: first.repaired ? first.text : raw, repaired: first.repaired, reasked: false }
    }
    const problem = checked.errors.join(" ")
    log(rejectionNote(problem, first.text))
    const follow = await ask(template ? FILL_REVIEW_PROMPT : reaskJsonPrompt(problem, criterionIds))
    const second = parseModelJson(follow)
    if (second.ok && second.repaired) log("Repaired the corrected JSON.")
    return { text: second.ok ? (second.repaired ? second.text : follow) : follow, repaired: Boolean(second.ok && second.repaired), reasked: true }
  }
  log(rejectionNote(first.error, raw))
  const follow = await ask(reaskJsonPrompt(first.error, criterionIds))
  const second = parseModelJson(follow)
  if (second.ok && second.repaired) log("Repaired the corrected JSON.")
  return { text: second.ok ? (second.repaired ? second.text : follow) : follow, repaired: Boolean(second.ok && second.repaired), reasked: true }
}

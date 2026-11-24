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

function hasNumericScore(value: unknown): boolean {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false
  const row = value as { overallScore?: unknown; recommendation?: unknown; questionsForAuthors?: unknown }
  if (typeof row.overallScore !== "number" || !Number.isFinite(row.overallScore)) return false
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

/** Strict JSON first. A repair pass covers trailing commas, missing commas, and similar damage. */
export function parseModelJson(raw: string): ParsedModelJson | { ok: false; error: string } {
  const scored = lastScoreJson(raw)
  if (scored) return { ok: true, value: scored.value, text: scored.text, repaired: scored.repaired }
  const slice = fenced(raw)
  const parsed = slice.includes("{") ? parseSlice(slice) : null
  if (parsed) return { ok: true, ...parsed }
  return { ok: false, error: "No JSON object found in the model output." }
}

export function reaskJsonPrompt(problem: string): string {
  const detail = problem.replace(/\s+/g, " ").trim().slice(0, 500)
  return `Your JSON did not validate (${detail}). Reply again with only the corrected JSON object.`
}

export const FILL_REVIEW_PROMPT =
  "Fill in the review now. Return one completed JSON object for this paper. Do not repeat the rubric template or the instructions."

/** A reply that echoes the rubric schema instead of a completed review. */
export function rubricTemplateProblem(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const row = value as Record<string, unknown>
  const scoreIsPlaceholder = typeof row.overallScore === "string"
  const recommendationIsSchema = typeof row.recommendation === "string" && row.recommendation.includes("|")
  const strengthsPlaceholder = Array.isArray(row.strengths) && row.strengths.length > 0 && row.strengths.every((item) => item === "string")
  const scoreFieldsAreStrings =
    Array.isArray(row.scores) &&
    row.scores.some((item) => item && typeof item === "object" && typeof (item as { score?: unknown }).score === "string")
  if (scoreIsPlaceholder || recommendationIsSchema || strengthsPlaceholder || scoreFieldsAreStrings) {
    return "The reply repeated the rubric template instead of a completed review."
  }
  return null
}

/** Repair when possible. A parse or schema failure asks the chat once, naming the problem. */
export async function settleChatJson(
  raw: string,
  ask: (prompt: string) => Promise<string>,
  log: (message: string) => void,
  validate?: (text: string) => { ok: true } | { ok: false; errors: string[] },
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
    log(template ? `Asked once to fill in the review. ${problem}` : `Asked once for corrected JSON. ${problem}`)
    const follow = await ask(template ? FILL_REVIEW_PROMPT : reaskJsonPrompt(problem))
    const second = parseModelJson(follow)
    if (second.ok && second.repaired) log("Repaired the corrected JSON.")
    return { text: second.ok ? (second.repaired ? second.text : follow) : follow, repaired: Boolean(second.ok && second.repaired), reasked: true }
  }
  log(`Asked once for corrected JSON. ${first.error}`)
  const follow = await ask(reaskJsonPrompt(first.error))
  const second = parseModelJson(follow)
  if (second.ok && second.repaired) log("Repaired the corrected JSON.")
  return { text: second.ok ? (second.repaired ? second.text : follow) : follow, repaired: Boolean(second.ok && second.repaired), reasked: true }
}

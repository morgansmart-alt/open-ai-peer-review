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

function prepareJsonSource(raw: string): string {
  const quotes = raw.replace(/[\u201c\u201d\u2033]/g, "\"").replace(/[\u2018\u2019\u2032]/g, "'")
  let out = ""
  let inString = false
  let escaped = false
  for (const char of quotes) {
    if (inString) {
      if (escaped) {
        out += char
        escaped = false
        continue
      }
      if (char === "\\") {
        out += char
        escaped = true
        continue
      }
      if (char === "\"") {
        inString = false
        out += char
        continue
      }
      if (char === "\n") {
        out += "\\n"
        continue
      }
      if (char === "\r") continue
      out += char
      continue
    }
    if (char === "\"") inString = true
    out += char
  }
  return out
}

function closeTruncated(slice: string): string {
  const stack: string[] = []
  let inString = false
  let escaped = false
  for (const char of slice) {
    if (inString) {
      if (escaped) escaped = false
      else if (char === "\\") escaped = true
      else if (char === "\"") inString = false
      continue
    }
    if (char === "\"") inString = true
    else if (char === "{" || char === "[") stack.push(char)
    else if ((char === "}" || char === "]") && stack.length > 0) stack.pop()
  }
  let closed = slice
  if (inString) closed += "\""
  for (let index = stack.length - 1; index >= 0; index -= 1) closed += stack[index] === "{" ? "}" : "]"
  return closed
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

function criterionKeyCount(value: Record<string, unknown>): number {
  if (Array.isArray(value.scores)) return value.scores.length
  if (isRecord(value.scores)) return Object.keys(value.scores).length
  return Object.keys(value).filter((key) => {
    const norm = key.toLowerCase().replace(/[_-]/g, "")
    if (SCORE_KEY_SKIP.has(norm) || norm === "criterionid" || norm === "score") return false
    const field = value[key]
    return typeof field === "number" || (isRecord(field) && "score" in field)
  }).length
}

function reviewRank(value: unknown): number {
  if (!isRecord(value)) return 0
  if (rubricTemplateProblem(value)) return 0
  const summary = typeof value.summary === "string" && value.summary.trim().length > 0
  const keys = criterionKeyCount(value)
  if (summary && keys > 0) return 2
  if (keys > 0) return 1
  return 0
}

/**
 * The largest balanced object that looks like a review.
 * A small criterion fragment loses to an object that has summary and scores.
 * A truncated tail is closed, then repaired.
 */
export function chooseReviewJson(raw: string): { value: unknown; text: string; repaired: boolean } | null {
  const prepared = prepareJsonSource(raw.length > 400_000 ? raw.slice(-200_000) : raw)
  let best: { value: unknown; text: string; repaired: boolean; rank: number; keys: number } | null = null
  for (let index = 0; index < prepared.length; index += 1) {
    if (prepared[index] !== "{") continue
    const end = matchingBrace(prepared, index)
    const balanced = end >= 0
    const slice = balanced ? prepared.slice(index, end + 1) : closeTruncated(prepared.slice(index))
    const parsed = parseSlice(slice)
    if (!parsed) {
      if (balanced) index = end
      continue
    }
    const rank = reviewRank(parsed.value)
    const keys = isRecord(parsed.value) ? criterionKeyCount(parsed.value) : 0
    const repaired = parsed.repaired || !balanced
    if (rank > 0 && (!best || rank > best.rank || (rank === best.rank && (keys > best.keys || (keys === best.keys && slice.length > best.text.length))))) {
      best = { value: parsed.value, text: parsed.text, repaired, rank, keys }
    }
    if (balanced) index = end
  }
  return best ? { value: best.value, text: best.text, repaired: best.repaired } : null
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function parseScoreValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value)
  if (typeof value !== "string") return null
  const match = value.trim().match(/^(\d+(?:\.\d+)?)\s*(?:\/\s*100)?$/)
  if (!match) return null
  return Math.round(Number(match[1]))
}

function scoreEntry(key: string, field: unknown): Record<string, unknown> | null {
  if (SCORE_KEY_SKIP.has(key.toLowerCase().replace(/[_-]/g, ""))) return null
  const direct = parseScoreValue(field)
  if (direct != null && (typeof field === "number" || typeof field === "string")) return { criterionId: key, score: direct }
  if (!isRecord(field)) return null
  const score = parseScoreValue(field.score)
  if (score == null && !("score" in field)) return null
  const id = field.criterionId ?? field.id ?? field.name ?? field.label ?? key
  return { ...field, criterionId: String(id), ...(score != null ? { score } : {}) }
}

function scoreRows(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (!isRecord(item)) return []
    const id = item.criterionId ?? item.id ?? item.name ?? item.label
    const score = parseScoreValue(item.score)
    return [{ ...item, ...(id ? { criterionId: String(id) } : {}), ...(score != null ? { score } : {}) }]
  })
}

/** Turn nested reviews, criterion-name lists, score objects, and "71/100" strings into the scores array. */
export function normaliseScoreShape(value: unknown): unknown {
  if (!isRecord(value)) return value
  let row = { ...value }
  for (const key of ["review", "result", "assessment", "report"]) {
    const inner = row[key]
    if (isRecord(inner) && (inner.scores || inner.summary || inner.overallScore || inner.criteria)) row = { ...row, ...inner }
  }
  if (!Array.isArray(row.scores) && Array.isArray(row.criteria)) row.scores = row.criteria
  if (row.scores && isRecord(row.scores)) {
    row.scores = Object.entries(row.scores).flatMap(([key, field]) => {
      const entry = scoreEntry(key, field)
      return entry ? [entry] : []
    })
  }
  if (Array.isArray(row.scores)) row.scores = scoreRows(row.scores)
  if (!Array.isArray(row.scores)) {
    const lifted = Object.entries(row).flatMap(([key, field]) => {
      const entry = scoreEntry(key, field)
      return entry ? [entry] : []
    })
    if (lifted.length > 0) row.scores = lifted
  }
  return row
}

function mergeScoreLists(base: unknown, patch: unknown[]): Record<string, unknown>[] {
  const map = new Map<string, Record<string, unknown>>()
  for (const item of scoreRows(base)) {
    const id = String(item.criterionId ?? "")
    if (id) map.set(id, item)
  }
  for (const item of scoreRows(patch)) {
    const id = String(item.criterionId ?? "")
    if (!id) continue
    const previous = map.get(id)
    if (!previous) {
      map.set(id, item)
      continue
    }
    const citations = Array.isArray(item.citations) && item.citations.length === 0 && Array.isArray(previous.citations) && previous.citations.length > 0
      ? previous.citations
      : item.citations
    map.set(id, { ...previous, ...item, criterionId: id, ...(citations ? { citations } : {}) })
  }
  return [...map.values()]
}

/** Keep valid fields from the first reply when a correction is only a patch. */
export function mergeReviewFields(base: unknown, patch: unknown): unknown {
  const left = isRecord(base) ? { ...base } : {}
  const right = isRecord(patch) ? patch : {}
  for (const [key, value] of Object.entries(right)) {
    if (value == null) continue
    if (typeof value === "string" && !value.trim()) continue
    if (Array.isArray(value) && value.length === 0) continue
    if (key === "summary" && typeof value === "string" && value.trim().length < 40 && typeof left.summary === "string" && left.summary.trim().length >= 40) continue
    if (key === "scores" && Array.isArray(value)) {
      left.scores = mergeScoreLists(left.scores, value)
      continue
    }
    left[key] = value
  }
  return normaliseScoreShape(left)
}

/** Strict JSON first. A repair pass covers trailing commas, missing commas, and similar damage. */
export function parseModelJson(raw: string): ParsedModelJson | { ok: false; error: string } {
  const review = chooseReviewJson(raw)
  if (review) return { ok: true, value: normaliseScoreShape(review.value), text: review.text, repaired: review.repaired }
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
    "Return the FULL corrected JSON object, not a patch. Repeat every field that was already valid.",
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
  const chosen = raw.replace(/\s+/g, " ").trim().slice(0, 600)
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
    log(rejectionNote(problem, first.text || raw))
    const follow = await ask(template ? FILL_REVIEW_PROMPT : reaskJsonPrompt(problem, criterionIds))
    const second = parseModelJson(follow)
    const merged = mergeReviewFields(first.value, second.ok ? second.value : {})
    const mergedText = JSON.stringify(merged)
    const mergedCheck = validate ? validate(mergedText) : { ok: true as const }
    if (mergedCheck.ok) {
      if (second.ok && second.repaired) log("Repaired the corrected JSON.")
      return { text: mergedText, repaired: true, reasked: true }
    }
    const firstText = JSON.stringify(first.value)
    const firstCheck = validate ? validate(firstText) : { ok: false as const, errors: ["The first reply was not usable."] }
    if (firstCheck.ok) {
      log("The correction was less complete than the first reply. Kept the first reply.")
      return { text: firstText, repaired: true, reasked: true }
    }
    log(rejectionNote("errors" in mergedCheck ? mergedCheck.errors.join(" ") : "The corrected JSON was not usable.", mergedText))
    return { text: mergedText, repaired: true, reasked: true }
  }
  log(rejectionNote(first.error, raw))
  const follow = await ask(reaskJsonPrompt(first.error, criterionIds))
  const second = parseModelJson(follow)
  if (second.ok && second.repaired) log("Repaired the corrected JSON.")
  return { text: second.ok ? (second.repaired ? second.text : follow) : follow, repaired: Boolean(second.ok && second.repaired), reasked: true }
}

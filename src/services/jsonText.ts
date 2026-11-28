import { jsonrepair } from "jsonrepair"
import { isBonusCriterion } from "../domain/criteria.ts"
import { officialCriteria } from "../domain/officialCriteria.ts"

export interface ParsedModelJson {
  ok: true
  value: unknown
  text: string
  repaired: boolean
}

function fenced(raw: string): string {
  const blocks = fencedBlocks(raw)
  if (blocks.length > 0) return blocks[blocks.length - 1] ?? raw.trim()
  return raw.trim()
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

function matchCriterionId(raw: string): string {
  const compact = raw.toLowerCase().replace(/[_/]+/g, " ").replace(/[\s_]+/g, "-").replace(/[^a-z0-9-]/g, "").replace(/-+/g, "-")
  const found = officialCriteria.criteria.find((item) => {
    const id = item.id.toLowerCase()
    const name = item.name.toLowerCase().replace(/[\s_]+/g, "-")
    return id === compact || id.replace(/-/g, "") === compact.replace(/-/g, "") || name === compact
  })
  return found?.id ?? ""
}

function criterionIdFrom(row: Record<string, unknown>): string {
  for (const key of ["criterionId", "criterion", "id", "name", "label"] as const) {
    if (typeof row[key] !== "string" || !row[key].trim()) continue
    const known = matchCriterionId(row[key])
    if (known) return known
  }
  return typeof row.criterionId === "string" ? row.criterionId.trim() : ""
}

function scoreOf(row: Record<string, unknown>): number | null {
  return parseScoreValue(row.score ?? row.value ?? row.points ?? row.rating)
}

function isCriterionRow(value: Record<string, unknown>): boolean {
  return criterionIdFrom(value) !== "" && scoreOf(value) != null
}

function criterionOnly(value: Record<string, unknown>, id = criterionIdFrom(value), score = scoreOf(value)): Record<string, unknown> {
  const row: Record<string, unknown> = {
    criterionId: id,
    ...(score != null ? { score } : {}),
  }
  const rationale = typeof value.rationale === "string" ? value.rationale : typeof value.reason === "string" ? value.reason : ""
  if (rationale) row.rationale = rationale
  if (Array.isArray(value.citations)) row.citations = value.citations
  if (typeof value.confidence === "string" && value.confidence.trim()) row.confidence = value.confidence.trim()
  if (value.uncited === true) row.uncited = true
  return row
}

/** A citation that itself contains citations is closed. Inner citations stay. Swallowed fields move up. */
function flattenCitations(value: unknown): { value: unknown; changed: boolean } {
  if (Array.isArray(value)) {
    let changed = false
    const next = value.map((item) => {
      const flat = flattenCitations(item)
      changed = changed || flat.changed
      return flat.value
    })
    return { value: next, changed }
  }
  if (!isRecord(value)) return { value, changed: false }
  let changed = false
  const next: Record<string, unknown> = {}
  for (const [key, child] of Object.entries(value)) {
    const flat = flattenCitations(child)
    changed = changed || flat.changed
    next[key] = flat.value
  }
  if (!Array.isArray(next.citations)) return { value: next, changed }
  const citations: unknown[] = []
  const spilledScores: Record<string, unknown>[] = []
  const spilled: Record<string, unknown> = {}
  let nested = false
  const parentId = String(next.criterionId ?? next.id ?? "")
  for (const entry of next.citations as unknown[]) {
    if (!isRecord(entry)) {
      citations.push(entry)
      continue
    }
    if (Array.isArray(entry.citations)) {
      nested = true
      for (const inner of entry.citations) citations.push(inner)
      const extra: Record<string, unknown> = {}
      for (const [key, child] of Object.entries(entry)) {
        if (key === "citations" || key === "quote" || key === "location") continue
        extra[key] = child
      }
      const extraId = String(extra.criterionId ?? extra.id ?? "")
      if (isCriterionRow(extra) && extraId && extraId !== parentId) {
        spilledScores.push(criterionOnly(extra))
        if (Array.isArray(extra.scores)) {
          const list = Array.isArray(spilled.scores) ? spilled.scores as unknown[] : []
          spilled.scores = [...list, ...extra.scores]
        }
        for (const [key, child] of Object.entries(extra)) {
          if (["criterionId", "id", "score", "rationale", "reason", "citations", "confidence", "uncited", "scores"].includes(key)) continue
          if (spilled[key] == null) spilled[key] = child
        }
        continue
      }
      for (const [key, child] of Object.entries(extra)) {
        if (key === "scores" && Array.isArray(child)) {
          const list = Array.isArray(spilled.scores) ? spilled.scores as unknown[] : []
          spilled.scores = [...list, ...child]
          continue
        }
        if (spilled[key] == null) spilled[key] = child
      }
      continue
    }
    if (isCriterionRow(entry)) {
      nested = true
      spilledScores.push(criterionOnly(entry))
      continue
    }
    citations.push(entry)
  }
  if (!nested) return { value: next, changed }
  next.citations = citations
  const carried = [...(Array.isArray(next.scores) ? next.scores : []), ...(Array.isArray(spilled.scores) ? spilled.scores as unknown[] : []), ...spilledScores]
  if (carried.length > 0) next.scores = carried
  delete spilled.scores
  for (const [key, child] of Object.entries(spilled)) {
    if (next[key] == null) next[key] = child
  }
  return { value: next, changed: true }
}

/** The object that held the unclosed citation is itself a criterion. Keep it in the scores array. */
function attachRootCriterion(value: unknown): { value: unknown; changed: boolean } {
  if (!isRecord(value) || !isCriterionRow(value)) return { value, changed: false }
  const id = criterionIdFrom(value)
  const scores = Array.isArray(value.scores) ? [...value.scores] : []
  if (scores.some((item) => isRecord(item) && String(item.criterionId ?? item.id ?? "") === id)) return { value, changed: false }
  scores.push(criterionOnly(value))
  return { value: { ...value, scores }, changed: true }
}

function prepareCandidate(value: unknown): { value: unknown; changed: boolean } {
  const flat = flattenCitations(value)
  const rooted = attachRootCriterion(flat.value)
  return { value: rooted.value, changed: flat.changed || rooted.changed }
}

function requiredCriterionIds(ids?: readonly string[]): string[] {
  const source = ids && ids.length > 0 ? ids : officialCriteria.criteria.map((item) => item.id)
  return source.filter((id) => !isBonusCriterion(id))
}

function coversCriteria(value: unknown, required: readonly string[]): boolean {
  if (!isRecord(value) || !Array.isArray(value.scores)) return false
  const ids = new Set(value.scores.flatMap((item) => (isRecord(item) && typeof (item.criterionId ?? item.id) === "string" ? [String(item.criterionId ?? item.id)] : [])))
  return required.every((id) => ids.has(id))
}

function rememberField(fields: Record<string, unknown>, row: Record<string, unknown>): void {
  if (typeof row.summary === "string" && row.summary.trim().length > String(fields.summary ?? "").trim().length) fields.summary = row.summary.trim()
  const overall = numericScore(row.overallScore)
  if (overall != null) fields.overallScore = overall
  if (typeof row.recommendation === "string" && row.recommendation.trim()) fields.recommendation = row.recommendation.trim()
  if (typeof row.ontologyClass === "string" && row.ontologyClass.trim()) fields.ontologyClass = row.ontologyClass.trim()
  for (const key of ["questionsForAuthors", "questions", "strengths", "suggestedNextSteps", "nextSteps", "minorIssues"] as const) {
    if (Array.isArray(row[key]) && (row[key] as unknown[]).length > 0) fields[key] = row[key]
  }
  if (isRecord(row.physics) && !isCriterionRow(row.physics) && (row.physics.classification || row.physics.laws)) fields.physics = row.physics
  if (isRecord(row.simulation) && !isCriterionRow(row.simulation) && (row.simulation.methods || "reported" in row.simulation)) fields.simulation = row.simulation
  if (isRecord(row.valueEstimate) && !isCriterionRow(row.valueEstimate)) fields.valueEstimate = row.valueEstimate
  if (Array.isArray(row.goals)) fields.goals = row.goals
  if (Array.isArray(row.majorIssues)) fields.majorIssues = row.majorIssues
  if (isRecord(row.airFeedback)) fields.airFeedback = row.airFeedback
  if (isRecord(row.air_feedback)) fields.air_feedback = row.air_feedback
}

function walkRecords(value: unknown, visit: (row: Record<string, unknown>) => void): void {
  if (Array.isArray(value)) {
    for (const item of value) walkRecords(item, visit)
    return
  }
  if (!isRecord(value)) return
  visit(value)
  for (const child of Object.values(value)) walkRecords(child, visit)
}

function absorbKeyedScores(row: Record<string, unknown>, scores: Map<string, Record<string, unknown>>, samples: { id: string; keys: string[] }[]): void {
  for (const [key, field] of Object.entries(row)) {
    const id = matchCriterionId(key)
    if (!id) continue
    if (isRecord(field)) {
      const score = scoreOf(field)
      if (score == null) continue
      scores.set(id, criterionOnly({ ...field, criterionId: id }, id, score))
      samples.push({ id, keys: Object.keys(field) })
      continue
    }
    const score = parseScoreValue(field)
    if (score == null) continue
    scores.set(id, { criterionId: id, score })
    samples.push({ id, keys: [key] })
  }
}

interface CriterionGather {
  scores: Map<string, Record<string, unknown>>
  fields: Record<string, unknown>
  samples: { id: string; keys: string[] }[]
}

function fencedBlocks(raw: string): string[] {
  return [...raw.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)].map((match) => match[1] ?? "").filter((block) => block.includes("{"))
}

function scanJsonText(text: string, take: (value: unknown) => void): void {
  const prepared = prepareJsonSource(text.length > 400_000 ? text.slice(-200_000) : text)
  for (let index = 0; index < prepared.length; index += 1) {
    if (prepared[index] !== "{") continue
    const end = matchingBrace(prepared, index)
    const balanced = end >= 0
    const slice = balanced ? prepared.slice(index, end + 1) : closeTruncated(prepared.slice(index))
    const parsed = parseSlice(slice)
    if (!parsed) continue
    take(parsed.value)
    if (balanced && isRecord(parsed.value) && coversCriteria(parsed.value, officialCriteria.criteria.map((item) => item.id).filter((id) => !isBonusCriterion(id)))) index = end
  }
}

function gatherCriteria(raw: string): CriterionGather {
  const scores = new Map<string, Record<string, unknown>>()
  const fields: Record<string, unknown> = {}
  const samples: { id: string; keys: string[] }[] = []
  const take = (value: unknown) => {
    const preparedValue = prepareCandidate(value).value
    walkRecords(preparedValue, (row) => {
      rememberField(fields, row)
      const lists = [row.scores, row.criteria].filter(Array.isArray)
      for (const list of lists) {
        for (const item of list as unknown[]) {
          if (!isRecord(item) || !isCriterionRow(item)) continue
          const id = criterionIdFrom(item)
          scores.set(id, criterionOnly(item, id, scoreOf(item)))
          samples.push({ id, keys: Object.keys(item) })
        }
      }
      if (isCriterionRow(row)) {
        const id = criterionIdFrom(row)
        scores.set(id, criterionOnly(row, id, scoreOf(row)))
        samples.push({ id, keys: Object.keys(row) })
      }
      absorbKeyedScores(row, scores, samples)
    })
  }
  const blocks = fencedBlocks(raw)
  for (const text of [raw, ...blocks]) scanJsonText(text, take)
  return { scores, fields, samples }
}

/** How many criterion-like objects the reconstruction saw, and which keys they used. */
export function describeCriterionGather(raw: string): string {
  const gathered = gatherCriteria(raw)
  const ids = [...new Set(gathered.samples.map((sample) => sample.id))]
  const keys = gathered.samples.slice(0, 8).map((sample) => `${sample.id} [${sample.keys.slice(0, 8).join(", ")}]`).join("; ")
  return `Criterion-like objects: ${gathered.samples.length}. Ids: ${ids.join(", ") || "none"}. Keys: ${keys || "none"}.`
}

/**
 * No parsed object had every required criterion.
 * Gather criterion rows at any depth, including criterion/name keys, "85/100" strings, and keyed {impact:{score}}.
 * Last one wins. Summary and question strings are taken from anywhere. Each fenced block is scanned on its own.
 */
function assembleReview(raw: string, required: readonly string[]): { value: Record<string, unknown> } | null {
  if (required.length === 0) return null
  const gathered = gatherCriteria(raw)
  if (!required.every((id) => gathered.scores.has(id))) return null
  return { value: { ...gathered.fields, scores: [...gathered.scores.values()] } }
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
    const preparedValue = prepareCandidate(parsed.value)
    const rank = reviewRank(preparedValue.value)
    const keys = isRecord(preparedValue.value) ? criterionKeyCount(preparedValue.value) : 0
    const text = preparedValue.changed ? JSON.stringify(preparedValue.value) : parsed.text
    const repaired = parsed.repaired || !balanced || preparedValue.changed
    if (rank > 0 && (!best || rank > best.rank || (rank === best.rank && (keys > best.keys || (keys === best.keys && text.length > best.text.length))))) {
      best = { value: preparedValue.value, text, repaired, rank, keys }
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
  const keyed = matchCriterionId(key)
  if (direct != null && (typeof field === "number" || typeof field === "string")) {
    return keyed ? { criterionId: keyed, score: direct } : { criterionId: key, score: direct }
  }
  if (!isRecord(field)) return null
  const score = scoreOf(field)
  if (score == null && !("score" in field) && !("value" in field)) return null
  const id = criterionIdFrom(field) || keyed
  if (!id) return null
  return { ...field, criterionId: id, ...(score != null ? { score } : {}) }
}

function scoreRows(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (!isRecord(item) || !isCriterionRow(item)) return []
    const id = criterionIdFrom(item)
    const score = scoreOf(item)
    return [{ ...item, criterionId: id, ...(score != null ? { score } : {}) }]
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
  if (!Array.isArray(row.scores) && !isRecord(row.scores) && Array.isArray(row.criteria)) row.scores = row.criteria
  if (row.scores && isRecord(row.scores)) {
    row.scores = Object.entries(row.scores).flatMap(([key, field]) => {
      const entry = scoreEntry(key, field)
      return entry ? [entry] : []
    })
  }
  if (Array.isArray(row.scores)) row.scores = scoreRows(row.scores)
  if (Array.isArray(row.criteria)) {
    const extra = scoreRows(row.criteria)
    const current = Array.isArray(row.scores) ? row.scores as Record<string, unknown>[] : []
    const map = new Map<string, Record<string, unknown>>()
    for (const item of current) {
      const id = String(item.criterionId ?? "")
      if (id) map.set(id, item)
    }
    for (const item of extra) {
      const id = String(item.criterionId ?? "")
      if (id && !map.has(id)) map.set(id, item)
    }
    if (map.size > 0) row.scores = [...map.values()]
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

function looksLikeSheet(value: Record<string, unknown>): boolean {
  const summary = typeof value.summary === "string" && value.summary.trim().length >= 40
  const scores = Array.isArray(value.scores) && value.scores.length > 0
  const overall = numericScore(value.overallScore) != null
  return (summary && scores) || (overall && scores) || (summary && overall)
}

/** Start of the last score sheet, including one whose markdown fences were rendered away. */
function lastSheetStart(raw: string): number {
  let best = -1
  for (let index = 0; index < raw.length; index += 1) {
    if (raw[index] !== "{") continue
    const end = matchingBrace(raw, index)
    if (end < 0) continue
    const parsed = parseSlice(raw.slice(index, end + 1))
    if (parsed && isRecord(parsed.value) && looksLikeSheet(parsed.value)) best = index
    index = end
  }
  return best
}

/**
 * Prose written before the score sheet.
 * A rendered chat has no ``` markers: the sheet is the last JSON object, and the words before it are the analysis.
 */
export function reviewAnalysis(raw: string): string {
  const marks = [...raw.matchAll(/```(?:json)?\s*[\s\S]*?```/gi)]
  const last = marks[marks.length - 1]
  const fenceAt = last?.index ?? -1
  const sheetAt = lastSheetStart(raw)
  const cut = fenceAt >= 0 && (sheetAt < 0 || fenceAt <= sheetAt) ? fenceAt : sheetAt
  if (cut <= 0) return ""
  return raw.slice(0, cut).replace(/\s+$/g, "").trim()
}

export function parseModelJson(raw: string, criterionIds?: readonly string[]): ParsedModelJson | { ok: false; error: string } {
  if (raw.includes("```")) {
    const required = requiredCriterionIds(criterionIds)
    const blocks = fencedBlocks(raw)
    for (let index = blocks.length - 1; index >= 0; index -= 1) {
      const block = blocks[index]
      if (!block || block.includes("```")) continue
      const fenced = parseModelJson(block, criterionIds)
      if (fenced.ok && coversCriteria(fenced.value, required)) return fenced
    }
  }
  const required = requiredCriterionIds(criterionIds)
  const review = chooseReviewJson(raw)
  const shaped = review ? normaliseScoreShape(review.value) : null
  if (review && coversCriteria(shaped, required)) {
    return { ok: true, value: shaped, text: review.text, repaired: review.repaired }
  }
  const assembled = assembleReview(raw, required)
  if (assembled) {
    const value = normaliseScoreShape(assembled.value)
    return { ok: true, value, text: JSON.stringify(value), repaired: true }
  }
  if (review && shaped) return { ok: true, value: shaped, text: review.text, repaired: review.repaired }
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
    "You may explain the correction in prose. There is no length limit. End with the full corrected score sheet as one JSON object inside a ```json fenced block.",
    "Repeat every field that was already valid. Do not send only one criterion.",
    "summary must be a string of at least 40 characters.",
    "scores must be an array with one object for each criterion id.",
    "Each scores object needs criterionId, score (integer 0-100), rationale (at least 20 characters), citations, and confidence (low, medium, or high).",
    "citations must be an array of {quote, location} only. Never nest a citation inside another citation, and never put other fields inside a citation.",
    `Criterion ids: ${ids}.`,
    "Also include overallScore (number 0-100), recommendation (accept, encourage, revise, major-revision, or not-ready), strengths (array of strings), questionsForAuthors (array of strings), and suggestedNextSteps (array of strings).",
    `Example: {"summary":"The paper states its claim and the limit of that claim in the text.","scores":[{"criterionId":"${exampleId}","score":70,"rationale":"The text states this in a sentence a reader can find.","citations":[{"quote":"a sentence from the paper","location":"abstract"}],"confidence":"medium"}],"overallScore":70,"recommendation":"revise","strengths":["The files are public."],"questionsForAuthors":["Which table changed?"],"suggestedNextSteps":["Publish the table beside the text."]}.`,
    "Repeat the scores object for every criterion id. global-goals may be omitted.",
  ].join(" ")
}

export const FILL_REVIEW_PROMPT =
  "Fill in the review now. Write the analysis in prose, then end with one completed JSON object for this paper inside a ```json fenced block. Do not repeat the rubric template or the instructions."

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
function rejectionNote(problem: string, raw: string, diagnostic = ""): string {
  const chosen = raw.replace(/\s+/g, " ").trim().slice(0, 600)
  const found = diagnostic ? `${diagnostic} ` : ""
  return `Rejected the reply. ${problem} ${found}Chosen JSON: ${chosen}`
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
  const first = parseModelJson(raw, criterionIds)
  if (first.ok) {
    const template = rubricTemplateProblem(first.value)
    const checked = template ? { ok: false as const, errors: [template] } : ready(first)
    if (checked.ok) {
      const analysis = reviewAnalysis(raw)
      if (analysis.length >= 40) log(`Peer analysis (${analysis.length} characters): ${analysis.slice(0, 2000)}`)
      if (first.repaired) log("Repaired the chat's JSON before scoring.")
      const whole = parseModelJson(raw, criterionIds).ok ? raw : first.text
      return { text: whole, repaired: first.repaired, reasked: false }
    }
    const problem = checked.errors.join(" ")
    log(rejectionNote(problem, first.text || raw, describeCriterionGather(raw)))
    const follow = await ask(template ? FILL_REVIEW_PROMPT : reaskJsonPrompt(problem, criterionIds))
    const second = parseModelJson(follow, criterionIds)
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
    log(rejectionNote("errors" in mergedCheck ? mergedCheck.errors.join(" ") : "The corrected JSON was not usable.", mergedText, describeCriterionGather(follow)))
    return { text: mergedText, repaired: true, reasked: true }
  }
  log(rejectionNote(first.error, raw, describeCriterionGather(raw)))
  const follow = await ask(reaskJsonPrompt(first.error, criterionIds))
  const second = parseModelJson(follow, criterionIds)
  if (second.ok && second.repaired) log("Repaired the corrected JSON.")
  return { text: second.ok ? (second.repaired ? second.text : follow) : follow, repaired: Boolean(second.ok && second.repaired), reasked: true }
}

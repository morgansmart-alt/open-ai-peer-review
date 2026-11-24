import type { CriteriaSet, Criterion } from "./types.ts"

export function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/** Show a stored score at two decimal places. Does not change the stored value. */
export function formatScore(value: number): string {
  return value.toFixed(2)
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function stringList(value: unknown, errors: string[], path: string): string[] | null {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || !item.trim())) {
    errors.push(`${path} must be a list of non-empty strings.`)
    return null
  }
  return value
}

export function parseCriteria(input: unknown): { ok: true; criteria: CriteriaSet } | { ok: false; errors: string[] } {
  const errors: string[] = []
  if (!isRecord(input)) return { ok: false, errors: ["Criteria must be a JSON object."] }

  const id = typeof input.id === "string" ? input.id.trim() : ""
  const version = typeof input.version === "string" ? input.version.trim() : ""
  const name = typeof input.name === "string" ? input.name.trim() : ""
  if (!id) errors.push("id is required.")
  if (!version) errors.push("version is required.")
  if (!name) errors.push("name is required.")

  const principles = stringList(input.principles, errors, "principles") ?? []
  if (principles.length === 0) errors.push("Add at least one principle.")

  if (!isRecord(input.scale)) {
    errors.push("scale must be an object.")
  }
  const scaleMin = isRecord(input.scale) ? Number(input.scale.min) : NaN
  const scaleMax = isRecord(input.scale) ? Number(input.scale.max) : NaN
  if (!Number.isInteger(scaleMin) || !Number.isInteger(scaleMax) || scaleMax <= scaleMin) {
    errors.push("scale.min and scale.max must be integers with max greater than min.")
  }
  const labels =
    isRecord(input.scale) && isRecord(input.scale.labels)
      ? Object.fromEntries(
          Object.entries(input.scale.labels).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
        )
      : {}

  const categoriesRaw = Array.isArray(input.recommendationCategories) ? input.recommendationCategories : []
  const recommendationCategories = categoriesRaw.flatMap((item) => {
    if (!isRecord(item) || typeof item.id !== "string" || typeof item.label !== "string") {
      errors.push("Each recommendation category needs an id and a label.")
      return []
    }
    return [{ id: item.id.trim(), label: item.label.trim(), meaning: typeof item.meaning === "string" ? item.meaning : "" }]
  })
  if (recommendationCategories.length === 0) errors.push("Add at least one recommendation category.")

  const ideaCriterionIds = stringList(input.ideaCriterionIds, errors, "ideaCriterionIds") ?? []
  const criteriaRaw = Array.isArray(input.criteria) ? input.criteria : []
  const criteria: Criterion[] = []
  const seen = new Set<string>()
  for (const item of criteriaRaw) {
    if (!isRecord(item)) {
      errors.push("Each criterion must be an object.")
      continue
    }
    const cid = typeof item.id === "string" ? item.id.trim() : ""
    const cname = typeof item.name === "string" ? item.name.trim() : ""
    const description = typeof item.description === "string" ? item.description.trim() : ""
    const guidance = typeof item.guidance === "string" ? item.guidance.trim() : ""
    const weight = Number(item.weight)
    if (!cid || !cname || !description || !guidance) errors.push(`Criterion ${cid || "(missing id)"} needs id, name, description, and guidance.`)
    if (!Number.isFinite(weight) || weight <= 0) errors.push(`Criterion ${cid || cname} needs a weight above 0.`)
    if (cid && seen.has(cid)) errors.push(`Duplicate criterion id ${cid}.`)
    seen.add(cid)
    const bands = Array.isArray(item.bands)
      ? item.bands.flatMap((band) => {
          if (!isRecord(band) || typeof band.label !== "string") return []
          const min = Number(band.min)
          const max = Number(band.max)
          if (!Number.isFinite(min) || !Number.isFinite(max)) return []
          return [{ min, max, label: band.label.trim() }]
        })
      : undefined
    criteria.push({ id: cid, name: cname, description, weight, guidance, bands })
  }
  if (criteria.length === 0) errors.push("Add at least one criterion.")
  for (const ideaId of ideaCriterionIds) {
    if (!seen.has(ideaId)) errors.push(`ideaCriterionIds refers to unknown criterion ${ideaId}.`)
  }

  const schemaRaw = typeof input.reportSchema === "string" ? input.reportSchema : "0.1"
  if (schemaRaw !== "0.1" && schemaRaw !== "0.2") errors.push("reportSchema must be 0.1 or 0.2.")

  if (errors.length) return { ok: false, errors }
  return {
    ok: true,
    criteria: {
      id,
      version,
      name,
      principles,
      scale: { min: scaleMin, max: scaleMax, labels },
      recommendationCategories,
      ideaCriterionIds,
      criteria,
      reportSchema: schemaRaw === "0.2" ? "0.2" : "0.1",
    },
  }
}

/** Optional recognition. Scored and shown, and left out of every overall average. */
export const BONUS_CRITERION_ID = "global-goals"

export function isBonusCriterion(criterionId: string): boolean {
  return criterionId === BONUS_CRITERION_ID
}

export function globalGoalsBadge(score: number): string {
  return `Global goals: ${Math.round(score)} (bonus, not counted in overall)`
}

export function weightLabel(criterion: { id: string; name: string; weight: number }): string {
  if (isBonusCriterion(criterion.id)) return `${criterion.name} · bonus, not counted in the overall`
  return `${criterion.name} · weight ${criterion.weight}`
}

export function weightedMean(
  scores: { criterionId: string; score: number }[],
  criteria: CriteriaSet,
  ids?: string[],
): number | null {
  const wanted = new Set(ids ?? criteria.criteria.map((item) => item.id))
  let weight = 0
  let total = 0
  for (const criterion of criteria.criteria) {
    if (!wanted.has(criterion.id)) continue
    // The overall average skips the bonus. A missing bonus never blocks an explicit list either.
    if (!ids && isBonusCriterion(criterion.id)) continue
    const found = scores.find((item) => item.criterionId === criterion.id)
    if (!found) {
      if (isBonusCriterion(criterion.id)) continue
      return null
    }
    weight += criterion.weight
    total += criterion.weight * found.score
  }
  if (weight <= 0) return null
  return round2(total / weight)
}

/** Map any AIR scale onto the 1–5 thresholds used since v0.1. */
export function onFivePointScale(score: number, criteria: CriteriaSet): number {
  const span = criteria.scale.max - criteria.scale.min
  if (span <= 0) return score
  return 1 + ((score - criteria.scale.min) / span) * 4
}

export function recommendationFor(score: number, criteria: CriteriaSet): string {
  const ids = criteria.recommendationCategories.map((item) => item.id)
  const scaled = onFivePointScale(score, criteria)
  const proposal = criteria.criteria.some((item) => item.id === "estimated-value")
  const top = !proposal && ids.includes("accept") ? "accept" : "encourage"
  const preferred = scaled >= 4.2 ? [top, "encourage", "accept"] : scaled >= 3.4 ? ["revise"] : scaled >= 2.6 ? ["major-revision"] : ["not-ready"]
  for (const id of preferred) {
    if (ids.includes(id)) return id
  }
  const index = scaled >= 4.2 ? 0 : scaled >= 3.4 ? Math.min(1, ids.length - 1) : scaled >= 2.6 ? Math.min(2, ids.length - 1) : ids.length - 1
  return ids[Math.max(0, index)] ?? "revise"
}

export type QuadrantId = "priority" | "moonshot" | "incremental" | "reconsider" | "mixed"

export function impactFeasibilityQuadrant(impact: number, feasibility: number): { id: QuadrantId; label: string; meaning: string } {
  const highImpact = impact >= 70
  const lowImpact = impact <= 40
  const highFeasibility = feasibility >= 70
  const lowFeasibility = feasibility <= 40
  if (highImpact && highFeasibility) {
    return { id: "priority", label: "High impact / high feasibility", meaning: "Priority. The benefit is wide and a path to test or build is written down." }
  }
  if (highImpact && lowFeasibility) {
    return { id: "moonshot", label: "High impact / low feasibility", meaning: "Moonshot. The benefit would be large, and the work still needs a proof." }
  }
  if (lowImpact && highFeasibility) {
    return { id: "incremental", label: "Low impact / high feasibility", meaning: "Incremental. A path exists, and the stated benefit is narrower." }
  }
  if (lowImpact && lowFeasibility) {
    return { id: "reconsider", label: "Low impact / low feasibility", meaning: "Reconsider. The stated benefit is limited and the path to a proof is thin." }
  }
  return { id: "mixed", label: "Mixed", meaning: "Between the four poles. Read the two scores rather than a slogan." }
}

export function categoryLabel(criteria: CriteriaSet, id: string): string {
  return criteria.recommendationCategories.find((item) => item.id === id)?.label ?? id
}

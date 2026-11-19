import raw from "../../criteria/global-goals.json" with { type: "json" }
import type { GoalLevel } from "./types.ts"

export interface GlobalGoal {
  id: string
  framework: string
  name: string
  statement: string
  sourceUrl: string
  keywords: string[]
}

export interface GlobalGoalsFile {
  id: string
  version: string
  name: string
  updated: string
  note: string
  goals: GlobalGoal[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

export function parseGlobalGoals(input: unknown): { ok: true; file: GlobalGoalsFile } | { ok: false; errors: string[] } {
  const errors: string[] = []
  if (!isRecord(input)) return { ok: false, errors: ["Goals file must be a JSON object."] }
  const version = typeof input.version === "string" ? input.version.trim() : ""
  if (!version) errors.push("version is required.")
  const goalsRaw = Array.isArray(input.goals) ? input.goals : []
  const goals: GlobalGoal[] = []
  const seen = new Set<string>()
  for (const item of goalsRaw) {
    if (!isRecord(item)) continue
    const id = typeof item.id === "string" ? item.id.trim() : ""
    const name = typeof item.name === "string" ? item.name.trim() : ""
    const statement = typeof item.statement === "string" ? item.statement.trim() : ""
    const sourceUrl = typeof item.sourceUrl === "string" ? item.sourceUrl.trim() : ""
    if (!id || !name || !statement || !sourceUrl.startsWith("https://")) {
      errors.push(`Goal ${id || name || "(missing)"} needs an id, name, statement, and https source.`)
      continue
    }
    if (seen.has(id)) errors.push(`Duplicate goal id ${id}.`)
    seen.add(id)
    goals.push({
      id,
      framework: typeof item.framework === "string" ? item.framework : "",
      name,
      statement,
      sourceUrl,
      keywords: Array.isArray(item.keywords) ? item.keywords.filter((word): word is string => typeof word === "string") : [],
    })
  }
  if (goals.length === 0) errors.push("Add at least one goal.")
  if (errors.length) return { ok: false, errors }
  return {
    ok: true,
    file: {
      id: typeof input.id === "string" ? input.id : "global-goals",
      version,
      name: typeof input.name === "string" ? input.name : "Global goals",
      updated: typeof input.updated === "string" ? input.updated : "",
      note: typeof input.note === "string" ? input.note : "",
      goals,
    },
  }
}

const parsed = parseGlobalGoals(raw)
if (!parsed.ok) throw new Error(parsed.errors.join("\n"))

export const globalGoals: GlobalGoalsFile = parsed.file

const rank: Record<GoalLevel, number> = { none: 0, indirect: 1, partial: 2, direct: 3 }

export function goalLevelForText(goal: GlobalGoal, text: string): GoalLevel {
  const lowered = text.toLowerCase()
  const hits = goal.keywords.filter((word) => lowered.includes(word.toLowerCase())).length
  if (hits >= 2) return "direct"
  if (hits === 1) return "partial"
  return "none"
}

export function strongerLevel(levels: GoalLevel[]): GoalLevel {
  return levels.sort((a, b) => rank[b] - rank[a])[0] ?? "none"
}

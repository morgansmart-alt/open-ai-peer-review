import rawV01 from "../../criteria/air-v0.1.json" with { type: "json" }
import rawV02 from "../../criteria/air-v0.2.json" with { type: "json" }
import { parseCriteria } from "./criteria.ts"
import type { CriteriaSet } from "./types.ts"

function load(raw: unknown, label: string): CriteriaSet {
  const parsed = parseCriteria(raw)
  if (!parsed.ok) throw new Error(`${label} is invalid:\n${parsed.errors.join("\n")}`)
  return parsed.criteria
}

/** AIR v0.1 stays valid for readings already stored. */
export const airCriteriaV01: CriteriaSet = load(rawV01, "AIR v0.1")
/** Default for new readings. */
export const airCriteriaV02: CriteriaSet = load(rawV02, "AIR v0.2")
export const officialCriteria: CriteriaSet = airCriteriaV02

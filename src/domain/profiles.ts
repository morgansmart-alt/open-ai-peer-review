import type { CriteriaSet, Criterion } from "./types.ts"

/**
 * Human reviews and AI readings use the same 0–100 scale. The board score is the
 * weighted mean of the criteria in that reading's profile, then shown out of 100.
 * A reading with no profile uses the device or engineering weights, which are the
 * AIR v0.2 weights, so older readings rank as they did. A different profile changes
 * which criteria enter the mean. It does not change the scale, so a 70 on a theory
 * paper and a 70 on a device proposal sit the same distance from the board's prior
 * of 50. Sub-scores that a profile does not use are left blank.
 * Global goals is optional recognition and is left out of that mean for every profile.
 */
export const PROFILE_RANKING_NOTE =
  "Human reviews and AI readings use the same 0–100 scale. The board score is the weighted mean of the criteria in that reading's profile, then shown out of 100. Global goals is optional recognition. It is shown as a bonus and left out of that mean for every profile. A reading with no profile uses the device or engineering weights, which are the AIR v0.2 weights, so older readings rank as they did. A different profile changes which criteria enter the mean. It does not change the scale, so a 70 on a theory paper and a 70 on a device proposal sit the same distance from the board's prior of 50. Sub-scores that a profile does not use are left blank."

export const CRITERION_PROFILE_IDS = ["device", "theory", "data", "roadmap", "empirical"] as const

export type CriterionProfileId = (typeof CRITERION_PROFILE_IDS)[number]

export interface CriterionProfile {
  id: CriterionProfileId
  label: string
  summary: string
  /** Device and funding proposals score estimated project value. Other profiles do not. */
  proposal: boolean
  /** Omitted on the device profile, which keeps the published AIR v0.2 weights. */
  weights?: Record<string, number>
  ideaCriterionIds?: string[]
  guidance?: Record<string, string>
}

export const NO_PROJECT_VALUE_PRINCIPLE =
  "Estimated project value is not scored for this profile. Do not invent a market figure. Accept means the work is sound as it stands."

export const CRITERION_PROFILES: CriterionProfile[] = [
  {
    id: "device",
    label: "Device or engineering",
    summary: "A device, prototype, or funding proposal. Estimated project value is scored. This is the historical default when a reading has no profile.",
    proposal: true,
  },
  {
    id: "theory",
    label: "Theory",
    summary: "A proof, derivation, or theoretical argument. Soundness is the reasoning, not a build path or a market.",
    proposal: false,
    weights: {
      clarity: 1.4,
      "world-class": 1.3,
      testability: 1.3,
      consistency: 1.2,
      "evidence-labelling": 1,
      limitations: 0.9,
      physics: 0.8,
      impact: 0.7,
    },
    ideaCriterionIds: ["clarity", "world-class"],
    guidance: {
      impact: "Score the intellectual consequence if the argument holds, not a market. Quote the sentence that says what changes.",
      testability: "A theory is testable by derivation, counterexample, or a stated observation. Score that check, not a laboratory the claim does not need.",
      physics: "If the claim is not physical, say so and score how clearly the text stays inside its class. Do not mark a proof down for lacking a device.",
    },
  },
  {
    id: "data",
    label: "Data or reference paper",
    summary: "A dataset, corpus, catalogue, or reference work. The question is whether someone else can find and check the artefact.",
    proposal: false,
    weights: {
      availability: 1.5,
      clarity: 1.3,
      consistency: 1.1,
      "evidence-labelling": 1.1,
      limitations: 1,
      testability: 0.8,
      impact: 0.6,
      "global-goals": 0.4,
    },
    ideaCriterionIds: ["availability", "clarity"],
    guidance: {
      availability:
        "Score whether the data, code, or reference file is public and matches the claim. Figures that were not read are not missing data unless the claim depends on the image itself.",
      impact: "Score who can use the dataset or reference, not a product market.",
      "global-goals":
        "Optional recognition. Score the enabling value when the dataset or reference helps a documented public goal. This score is a bonus and is not part of the overall.",
    },
  },
  {
    id: "roadmap",
    label: "Roadmap or report",
    summary: "A roadmap, survey, or report. Judge the map that is written, not a device that has not been proposed.",
    proposal: false,
    weights: {
      clarity: 1.3,
      impact: 1.2,
      limitations: 1.1,
      "evidence-labelling": 1,
      feasibility: 0.9,
      consistency: 0.8,
      testability: 0.7,
      "global-goals": 0.8,
      availability: 0.5,
    },
    ideaCriterionIds: ["impact", "clarity"],
    guidance: {
      feasibility: "Score whether a reader can follow the path the report describes. A missing prototype is not a fail when the work is a map, not a build.",
      impact: "Score the benefit the report itself traces, not an estimated sale price.",
      "global-goals":
        "Optional recognition. Score a documented public goal the report helps, including by enabling other work. This score is a bonus and is not part of the overall.",
    },
  },
  {
    id: "empirical",
    label: "Empirical study",
    summary: "A measurement, experiment, or observational study. The question is the check that was run and what it can show.",
    proposal: false,
    weights: {
      testability: 1.4,
      "evidence-labelling": 1.3,
      consistency: 1.1,
      clarity: 1.1,
      limitations: 1,
      availability: 1,
      physics: 0.7,
      simulation: 0.5,
      impact: 0.6,
      "world-class": 0.6,
    },
    ideaCriterionIds: ["testability", "evidence-labelling"],
    guidance: {
      testability:
        "Score the measurement, stopping rule, and what would count as a failed check. Untested is not the same as wrong, but a result claim needs the check that was run.",
      impact: "Score what the study changes for a reader, not a funding total.",
    },
  },
]

const PROFILE_BY_ID = new Map(CRITERION_PROFILES.map((profile) => [profile.id, profile]))

export function isCriterionProfileId(value: string | null | undefined): value is CriterionProfileId {
  return Boolean(value && PROFILE_BY_ID.has(value as CriterionProfileId))
}

/** Missing or unknown ids use the device profile, which is the current AIR v0.2 set. */
export function profileById(id: string | null | undefined): CriterionProfile {
  if (id && PROFILE_BY_ID.has(id as CriterionProfileId)) return PROFILE_BY_ID.get(id as CriterionProfileId) as CriterionProfile
  return CRITERION_PROFILES[0] as CriterionProfile
}

export function showsProjectValue(profileId: string | null | undefined): boolean {
  return profileById(profileId).proposal
}

export function profileLabel(profileId: string | null | undefined): string {
  return profileById(profileId).label
}

/** A stored reading with no profile id still uses the device weights. The card says so. */
export const LEGACY_DEVICE_PROFILE_LABEL = "device (legacy v0.2)"

export function storedProfileLabel(profileId: string | null | undefined): string {
  if (!profileId?.trim() || !isCriterionProfileId(profileId)) return LEGACY_DEVICE_PROFILE_LABEL
  return profileLabel(profileId)
}

const PROFILE_SIGNALS: Record<CriterionProfileId, RegExp> = {
  data: /\b(datasets?|databases?|corp(?:us|ora)|catalogues?|catalogs?|reference data|data papers?|recommended values|conversion factors|fundamental physical constants|codata|reference values)\b/i,
  theory: /\b(theor(?:y|etical)|theorems?|proofs?|lemma|derivation|axiomatic|axioms?|philosoph(?:y|ical)|formalism)\b/i,
  roadmap: /\b(roadmaps?|white papers?|whitepapers?|surveys?|scoping reviews?|policy briefs?|technical reports?)\b/i,
  empirical: /\b(empirical|experiments?|experimental|measurements?|trials?|clinical|observational|field stud(?:y|ies)|gravitational[- ]wave echoes|ligo)\b/i,
  device: /\b(devices?|prototypes?|prototyping|hardware|apparatus|instruments?|engineering|funding|proposals?|inventions?|technology readiness|generators?|star-?ships?|rotors?|stators?|heat-?engines?|nozzles?)\b/i,
}

function signalHit(id: CriterionProfileId, text: string): boolean {
  return PROFILE_SIGNALS[id].test(text)
}

/**
 * Suggest a profile from the title, description, keywords, and resource type.
 * The title outweighs a weak resource-type hint such as "working paper".
 * No signal stays on device or engineering, the historical default.
 */
export function suggestCriterionProfile(input: {
  resourceType?: string
  keywords?: readonly string[]
  title?: string
  description?: string
}): CriterionProfileId {
  const resource = (input.resourceType ?? "").toLowerCase()
  const title = input.title ?? ""
  const description = input.description ?? ""
  const keywords = (input.keywords ?? []).join(" ")
  const scores: Record<CriterionProfileId, number> = { device: 0, theory: 0, data: 0, roadmap: 0, empirical: 0 }
  if (/dataset|data paper|datapaper|software/.test(resource)) scores.data += 5
  if (/\breport\b/.test(resource)) scores.roadmap += 3
  if (/\bproposal\b/.test(resource)) scores.device += 3
  if (/working paper|technical note/.test(resource)) scores.roadmap += 1
  for (const id of CRITERION_PROFILE_IDS) {
    if (signalHit(id, title)) scores[id] += 4
    if (signalHit(id, keywords)) scores[id] += 3
    if (signalHit(id, description)) scores[id] += 2
    if (signalHit(id, resource)) scores[id] += 2
  }
  let best: CriterionProfileId = "device"
  let bestScore = 0
  for (const id of ["empirical", "data", "theory", "roadmap", "device"] as const) {
    if (scores[id] > bestScore) {
      best = id
      bestScore = scores[id]
    }
  }
  return best
}

function withGuidance(criterion: Criterion, guidance: string | undefined): Criterion {
  if (!guidance) return { ...criterion }
  return { ...criterion, guidance }
}

/**
 * A device profile, a missing profile, and custom criteria callers that skip this
 * helper keep the base set. Other profiles keep the same 0–100 scale and drop
 * estimated project value.
 */
export function applyCriterionProfile(base: CriteriaSet, profileId: string | null | undefined): CriteriaSet {
  const profile = profileById(profileId)
  if (profile.proposal || !profile.weights) return base
  const weights = profile.weights
  const criteria = base.criteria.flatMap((criterion) => {
    const weight = weights[criterion.id]
    if (weight === undefined) return []
    return [withGuidance({ ...criterion, weight }, profile.guidance?.[criterion.id])]
  })
  const ideaCriterionIds = (profile.ideaCriterionIds ?? base.ideaCriterionIds).filter((id) => criteria.some((criterion) => criterion.id === id))
  return {
    ...base,
    criteria,
    ideaCriterionIds,
    principles: base.principles.includes(NO_PROJECT_VALUE_PRINCIPLE) ? base.principles : [...base.principles, NO_PROJECT_VALUE_PRINCIPLE],
  }
}

export function readingCriteria(base: CriteriaSet, profileId: string | null | undefined, custom: boolean): CriteriaSet {
  if (custom) return base
  return applyCriterionProfile(base, profileId)
}

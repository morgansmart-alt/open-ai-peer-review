import previousMigration from "../../supabase/migrations/20261123120000_fluid_version_rounds.sql?raw"
import nextMigration from "../../supabase/migrations/20261124120000_comment_rounds.sql?raw"
import profileMigration from "../../supabase/migrations/20261124150000_recheck_profile_and_comment_cap.sql?raw"
import { describe, expect, it } from "vitest"
import { recommendationFor, weightedMean } from "./criteria.ts"
import { officialCriteria } from "./officialCriteria.ts"
import {
  applyCriterionProfile,
  PROFILE_RANKING_NOTE,
  showsProjectValue,
  LEGACY_DEVICE_PROFILE_LABEL,
  storedProfileLabel,
  suggestCriterionProfile,
} from "./profiles.ts"
import { buildRanking } from "./ranking.ts"
import { criteriaForReview, recommendationMatchesBand } from "./scoring.ts"
import type { AirDatabase, StoredReview } from "./types.ts"

function scored(criteriaIds: string[], score: number) {
  return criteriaIds.map((criterionId) => ({
    criterionId,
    score,
    rationale: "A passage in the record supports this score in plain words.",
    citations: [{ quote: "The record states the claim.", location: "text" }],
    confidence: "medium" as const,
  }))
}

function review(partial: Partial<StoredReview> & { id: string; criterionProfile?: string; score?: number }): StoredReview {
  const criteria = applyCriterionProfile(officialCriteria, partial.criterionProfile)
  const value = partial.score ?? 80
  return {
    id: partial.id,
    sample: false,
    mock: false,
    doi: partial.doi ?? "10.5281/zenodo.1",
    recordId: partial.recordId ?? "1",
    conceptRecordId: "1",
    recordVersion: partial.recordVersion ?? "v1",
    title: partial.title ?? "Work",
    creators: [],
    keywords: [],
    publicationDate: "2026-01-01",
    license: "",
    assessorId: partial.assessorId ?? "gemini",
    modelId: "m",
    provider: "gemini",
    criteriaId: officialCriteria.id,
    criteriaVersion: officialCriteria.version,
    customCriteria: false,
    criterionProfile: partial.criterionProfile,
    origin: partial.origin,
    report: {
      summary: "A summary long enough to stand as a reading of the work on its own terms.",
      scores: scored(criteria.criteria.map((criterion) => criterion.id), value),
      overallScore: value,
      ideaScore: value,
      recommendation: partial.criterionProfile && partial.criterionProfile !== "device" ? "accept" : "encourage",
      scale: 100,
      strengths: ["Public files."],
      majorIssues: [],
      minorIssues: [],
      questionsForAuthors: ["What would change the claim?"],
      suggestedNextSteps: ["Leave the files public."],
    },
    outputHash: partial.id,
    createdAt: "2026-01-01T00:00:00.000Z",
  }
}

describe("criterion profiles", () => {
  it("suggests a profile from resource type and keywords, and stays on the device default otherwise", () => {
    expect(suggestCriterionProfile({ resourceType: "Dataset", keywords: [] })).toBe("data")
    expect(suggestCriterionProfile({ resourceType: "Publication", keywords: ["theorem", "proof"] })).toBe("theory")
    expect(suggestCriterionProfile({ resourceType: "Publication", keywords: ["roadmap"] })).toBe("roadmap")
    expect(suggestCriterionProfile({ resourceType: "Publication", keywords: ["experimental measurement"] })).toBe("empirical")
    expect(suggestCriterionProfile({ resourceType: "Proposal", keywords: ["prototype"] })).toBe("device")
    expect(suggestCriterionProfile({ resourceType: "Publication", keywords: [] })).toBe("device")
  })

  it("uses the title and description, including the live-test papers", () => {
    expect(
      suggestCriterionProfile({
        resourceType: "Other",
        title: "Codata Recommended Values Of The Fundamental Physical Constants: 2014",
        keywords: ["CODATA", "Fundamental Physical Constants", "Planck constant", "Avogadro constant"],
        description:
          "This document gives the 2014 self-consistent set of values of the constants and conversion factors of physics and chemistry recommended by the Committee on Data for Science and Technology (CODATA).",
      }),
    ).toBe("data")
    expect(
      suggestCriterionProfile({
        resourceType: "Working paper",
        title: "SCG-HMH Generator and TITAN Star-ship Design consolidated concepts",
        keywords: [],
        description:
          "This master publication consolidates the SCG-HMH generator into a ready-for-prototyping reference, with a vertical rotor, ReBCO stators, and TITAN spherical starship integration.",
      }),
    ).toBe("device")
    expect(
      suggestCriterionProfile({
        resourceType: "Preprint",
        title: "Gravitational Wave Echoes Detected? Quantum Mesh Gravity Templates Match Real LIGO Data in GW150914 and GW170104",
        keywords: [],
        description:
          "We report the first detection of gravitational wave echoes using a template applied to real LIGO data. The matched filter analysis reveals a peak signal-to-noise ratio at the same echo delay, supporting an observational signal.",
      }),
    ).toBe("empirical")
    expect(
      suggestCriterionProfile({
        resourceType: "Report",
        title: "CERN Quantum Technology Initiative Strategy and Roadmap",
        keywords: ["Quantum Technologies", "Quantum Computing", "High Energy Physics"],
        description: "The Quantum Technology Initiative sets out how CERN can engage with quantum technologies over the next five to ten years.",
      }),
    ).toBe("roadmap")
    expect(
      suggestCriterionProfile({
        resourceType: "Journal article",
        title: "Universe as Quantum Discrete Cellular Automaton: Axiomatic Characterization",
        keywords: ["physics", "mathematics", "theoretical physics", "general relativity"],
        description:
          "Within Quantum Cellular Automata we construct an axiomatic system. We prove that under these axioms the event set constitutes a locally finite partial order.",
      }),
    ).toBe("theory")
    expect(
      suggestCriterionProfile({
        resourceType: "Publication",
        title: "SCG-HMH Hybrid Heat-Engine / Induction / MHD Generator: Whole-System Lowering of the Ionisation Threshold",
        keywords: [],
        description:
          "SCG-HMH is a hybrid generator. One free heat input drives a heat engine, induction in the ReBCO stators, and MHD in the rotor gap. The bench validates the sustain rates.",
      }),
    ).toBe("device")
    expect(storedProfileLabel(undefined)).toBe(LEGACY_DEVICE_PROFILE_LABEL)
    expect(storedProfileLabel(null)).toBe("device (legacy v0.2)")
    expect(storedProfileLabel("device")).toBe("Device or engineering")
    expect(storedProfileLabel("theory")).toBe("Theory")
  })

  it("keeps the current weights when no profile is stored, hides project value otherwise, and stays on one 0–100 scale", () => {
    const device = applyCriterionProfile(officialCriteria, undefined)
    expect(device.criteria.map((criterion) => [criterion.id, criterion.weight])).toEqual(
      officialCriteria.criteria.map((criterion) => [criterion.id, criterion.weight]),
    )
    expect(showsProjectValue(undefined)).toBe(true)
    expect(showsProjectValue("device")).toBe(true)
    for (const id of ["theory", "data", "roadmap", "empirical"] as const) {
      const applied = applyCriterionProfile(officialCriteria, id)
      expect(applied.criteria.some((criterion) => criterion.id === "estimated-value")).toBe(false)
      expect(applied.scale).toEqual(officialCriteria.scale)
      expect(showsProjectValue(id)).toBe(false)
      expect(recommendationFor(90, applied)).toBe("accept")
    }
    expect(recommendationFor(90, officialCriteria)).toBe("encourage")
    expect(recommendationMatchesBand("accept", 85)).toBe(true)
    expect(recommendationMatchesBand("encourage", 85)).toBe(true)
    expect(recommendationMatchesBand("accept", 50)).toBe(false)
    expect(recommendationMatchesBand("accept", 79.74)).toBe(true)
    expect(recommendationMatchesBand("revise", 79.74)).toBe(false)
    expect(recommendationMatchesBand("accept", 79.4)).toBe(false)
    expect(recommendationMatchesBand("accept", 70)).toBe(false)
    const old = review({ id: "old", score: 80 })
    const theory = review({ id: "theory", criterionProfile: "theory", recordId: "2", doi: "10.5281/zenodo.2", score: 80, title: "Proof" })
    expect(criteriaForReview(old).criteria).toHaveLength(officialCriteria.criteria.length)
    expect(weightedMean(theory.report.scores, criteriaForReview(theory))).toBe(80)
    const db: AirDatabase = { reviews: [old, theory], nodes: [], issues: [], claims: [] }
    const rows = buildRanking(db)
    expect(rows.find((row) => row.recordId === "1")?.panelMedian).toBe(80)
    expect(rows.find((row) => row.recordId === "2")?.panelMedian).toBe(80)
    const human = review({ id: "human", criterionProfile: "theory", recordId: "2", doi: "10.5281/zenodo.2", assessorId: "human", origin: "human", score: 80, title: "Proof" })
    const withHuman = buildRanking({ reviews: [theory, human], nodes: [], issues: [], claims: [] })
    expect(withHuman[0]?.humanMedian).toBe(withHuman[0]?.panelMedian)
    expect(PROFILE_RANKING_NOTE).toMatch(/0–100/)
    expect(PROFILE_RANKING_NOTE).toMatch(/no profile/)
  })
})

describe("global goals bonus", () => {
  it("leaves global-goals out of the overall for every profile", () => {
    for (const id of [undefined, "device", "theory", "data", "roadmap", "empirical"] as const) {
      const criteria = applyCriterionProfile(officialCriteria, id)
      const scores = criteria.criteria.map((criterion) => ({
        criterionId: criterion.id,
        score: criterion.id === "global-goals" ? 25 : 80,
      }))
      expect(weightedMean(scores, criteria)).toBe(80)
      if (criteria.ideaCriterionIds.includes("global-goals")) {
        expect(weightedMean(scores, criteria, criteria.ideaCriterionIds)).not.toBe(80)
      }
    }
    const stored = review({ id: "bonus", score: 80 })
    const goals = stored.report.scores.find((score) => score.criterionId === "global-goals")
    if (!goals) throw new Error("device profile still scores global goals")
    goals.score = 25
    expect(stored.report.overallScore).toBe(80)
    expect(criteriaForReview(stored).criteria.some((criterion) => criterion.id === "global-goals")).toBe(true)
    expect(weightedMean(stored.report.scores, criteriaForReview(stored))).toBe(80)
    expect(PROFILE_RANKING_NOTE).toMatch(/left out of that mean/)
  })
})

describe("comment rounds need a migration", () => {
  it("documents that the live check rejects comment until the additive migration is applied", () => {
    const previous = previousMigration
    const next = nextMigration
    expect(previous).toContain("'recheck'")
    expect(previous).not.toContain("'comment'")
    expect(next).toContain("'comment'")
    expect(next).toContain("A comment does not change the issue status.")
    expect(next).toMatch(/create or replace function air_append_issue_round/i)
    expect(profileMigration).toContain("is distinct from 'comment'")
    expect(profileMigration).toContain("air_retag_human_profile")
    expect(profileMigration).toContain("owner_hash")
    expect(profileMigration).toContain("Only the criterion profile can change.")
  })
})

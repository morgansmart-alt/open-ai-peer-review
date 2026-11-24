import { describe, expect, it } from "vitest"
import { officialCriteria } from "./officialCriteria.ts"
import { buildHumanReport, emptyHumanDrafts } from "./humanReview.ts"
import { commentStatus, humanQuoteCheck, issuePenalty, statusFromCheck } from "./issues.ts"
import { buildRanking } from "./ranking.ts"
import type { AirDatabase, IssueRound, IssueThread, StoredReview } from "./types.ts"
import {
  canAppendRound,
  carryForwardWorkList,
  documentsForRecheck,
  fluidRoundPastLegacyCap,
  quoteInPublication,
  ROUND_LIMIT,
  samePublication,
  scoreLineage,
  settleCheckResult,
  stableVersionId,
} from "./versions.ts"

function round(partial: Partial<IssueRound> & Pick<IssueRound, "id" | "kind">): IssueRound {
  return {
    authorLabel: "Reader",
    authorRole: "reader",
    citations: [],
    body: "note",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...partial,
  }
}

function thread(rounds: IssueRound[], recordVersion = "v1"): IssueThread {
  return {
    id: "issue-1",
    doi: "10.5281/zenodo.1",
    recordVersion,
    source: "review-major",
    sourceId: "r",
    criterionId: "testability",
    claim: "The check is missing.",
    quotedPassage: "",
    reason: "Name it.",
    status: "open",
    rounds,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  }
}

function review(partial: Partial<StoredReview> & { id: string; recordId: string; doi: string; recordVersion: string; overall: number }): StoredReview {
  return {
    id: partial.id,
    sample: false,
    mock: false,
    doi: partial.doi,
    recordId: partial.recordId,
    conceptRecordId: partial.conceptRecordId ?? "concept",
    recordVersion: partial.recordVersion,
    title: partial.title ?? "Work",
    creators: ["A"],
    keywords: [],
    publicationDate: partial.publicationDate ?? "2026-01-01",
    license: "",
    assessorId: partial.assessorId ?? "grok",
    modelId: "m",
    provider: "xai",
    criteriaId: officialCriteria.id,
    criteriaVersion: officialCriteria.version,
    customCriteria: false,
    origin: partial.origin,
    report: {
      summary: "A summary long enough to stand as a reading of the work.",
      scores: [],
      overallScore: partial.overall,
      ideaScore: partial.overall,
      recommendation: "revise",
      scale: 100,
      strengths: [],
      majorIssues: [],
      minorIssues: [],
      questionsForAuthors: [],
      suggestedNextSteps: [],
    },
    outputHash: partial.id,
    createdAt: partial.createdAt ?? "2026-01-01T00:00:00.000Z",
  }
}

describe("version identity", () => {
  it("uses the version DOI and treats a date stamp as the same record id", () => {
    expect(stableVersionId({ id: "18916932", doi: "10.5281/zenodo.18916932" })).toBe("10.5281/zenodo.18916932")
    expect(stableVersionId({ id: "18916932", doi: "10.5281/zenodo.18916932" })).not.toBe("18916932@2026-05-01")
    expect(samePublication("18916932@2026-05-01", "10.5281/zenodo.18916932")).toBe(true)
    expect(samePublication("3", "10.5281/zenodo.3")).toBe(false)
    expect(samePublication("v1", "v2")).toBe(false)
    expect(samePublication("v1", "10.5281/zenodo.2")).toBe(false)
  })
})

describe("carry-forward work list", () => {
  it("keeps outstanding earlier issues, drops closed ones, and dedupes the same claim", () => {
    const open = thread([round({ id: "c", kind: "claim" })])
    const duplicate = { ...open, id: "dup", createdAt: "2026-02-01T00:00:00.000Z" }
    const partial = { ...open, id: "p", claim: "Units are missing.", status: "partially-addressed" as const }
    const unresolved = { ...open, id: "u", doi: "10.5281/zenodo.9", claim: "Outside the concept", status: "unresolved" as const }
    const fixed = { ...open, id: "f", claim: "Already fixed.", status: "fixed-in-new-version" as const }
    const current = { ...open, id: "now", doi: "10.5281/zenodo.2", recordVersion: "v2", claim: "Units are missing." }
    const listed = carryForwardWorkList({
      issues: [open, duplicate, partial, unresolved, fixed, current],
      current: { doi: "10.5281/zenodo.2", recordVersion: "v2" },
      conceptDois: ["10.5281/zenodo.1", "10.5281/zenodo.2"],
    })
    expect(listed.outstanding.map((issue) => issue.id)).toEqual(["issue-1"])
    expect(listed.closed.map((issue) => issue.id)).toEqual(["f"])
    expect(listed.outstanding.some((issue) => issue.claim === "Units are missing.")).toBe(false)
  })
})

describe("fluid rounds", () => {
  it("starts a fresh window on a later version and keeps the cap on the current one", () => {
    const full = thread(Array.from({ length: ROUND_LIMIT }, (_, index) => round({ id: `r${index}`, kind: index === 0 ? "claim" : "rebuttal" })))
    expect(canAppendRound(full)).toBe(false)
    expect(canAppendRound(full, { kind: "rebuttal" })).toBe(false)
    expect(canAppendRound(full, { kind: "recheck", recordVersionChecked: "10.5281/zenodo.2" })).toBe(true)
    const withRecheck = thread([
      ...full.rounds,
      round({ id: "check", kind: "recheck", recordVersionChecked: "10.5281/zenodo.2" }),
      ...Array.from({ length: 5 }, (_, index) => round({ id: `n${index}`, kind: "rebuttal" })),
    ])
    expect(canAppendRound(withRecheck, { kind: "rebuttal" })).toBe(false)
    expect(canAppendRound(withRecheck, { kind: "recheck", recordVersionChecked: "10.5281/zenodo.3" })).toBe(true)
    expect(fluidRoundPastLegacyCap(thread([...full.rounds, round({ id: "check", kind: "recheck", recordVersionChecked: "10.5281/zenodo.2" })]))).toBe(true)
    expect(fluidRoundPastLegacyCap(thread([...full.rounds, round({ id: "again", kind: "rebuttal" })]))).toBe(false)
  })

  it("keeps the first re-check on v2 open when v1 already has several rounds", () => {
    const v1 = [
      round({ id: "c", kind: "claim" }),
      round({ id: "s", kind: "source-check", recordVersionChecked: "v1" }),
      round({ id: "b", kind: "rebuttal" }),
      round({ id: "k", kind: "counter" }),
    ]
    expect(statusFromCheck("NOT_ADDRESSED", v1, "v1", "10.5281/zenodo.2")).toBe("open")
    expect(statusFromCheck("ADDRESSED", v1, "v1", "10.5281/zenodo.2")).toBe("fixed-in-new-version")
    expect(statusFromCheck("PARTIALLY_ADDRESSED", v1, "v1", "10.5281/zenodo.2")).toBe("partially-addressed")
    const afterFirst = [...v1, round({ id: "r", kind: "recheck", recordVersionChecked: "10.5281/zenodo.2" })]
    expect(statusFromCheck("NOT_ADDRESSED", afterFirst, "v1", "10.5281/zenodo.2")).toBe("open")
    const closing = [...afterFirst, round({ id: "reply", kind: "rebuttal" })]
    expect(statusFromCheck("NOT_ADDRESSED", closing, "v1", "10.5281/zenodo.2")).toBe("unresolved")
    expect(statusFromCheck("NOT_ADDRESSED", v1, "v1", "v1")).toBe("unresolved")
  })
})

describe("newer-version re-check text", () => {
  const oldText = "The old publication says the yield was estimated only."
  const newText = "The new publication measures the nightly yield in litres."

  it("searches the target version and ignores the text already loaded", () => {
    const searched = documentsForRecheck(
      { id: "1", documents: [{ filename: "old.txt", text: oldText }] },
      { id: "2", documents: [{ filename: "new.txt", text: newText }] },
    )
    expect(searched.map((document) => document.text).join("\n")).toBe(newText)
    expect(searched.some((document) => document.text.includes("old publication"))).toBe(false)
    expect(() => documentsForRecheck({ id: "1", documents: [{ filename: "old.txt", text: oldText }] }, { id: "2", documents: [] })).toThrow(/newer version/)
  })

  it("accepts an addressed result only when the quotation is in the new text", () => {
    const quote = "measures the nightly yield"
    expect(quoteInPublication(quote, newText)).toBe(true)
    expect(quoteInPublication(quote, oldText)).toBe(false)
    const verified = settleCheckResult("ADDRESSED", [{ quote, location: "new.txt" }], newText)
    expect(verified.result).toBe("ADDRESSED")
    expect(verified.citations).toHaveLength(1)
    const missed = settleCheckResult("ADDRESSED", [{ quote: "The old publication says the yield was estimated only.", location: "old.txt" }], newText)
    expect(missed.result).toBe("NOT_ADDRESSED")
    expect(missed.citations).toHaveLength(0)
    expect(statusFromCheck(verified.result, 1, "v1", stableVersionId({ id: "2", doi: "10.5281/zenodo.2" }))).toBe("fixed-in-new-version")
    expect(statusFromCheck("NOT_ADDRESSED", 1, "v1", "10.5281/zenodo.2")).toBe("open")
    expect(statusFromCheck("ADDRESSED", 1, "18916931@2026-03-09", "10.5281/zenodo.18916931")).toBe("addressed-in-publication")
  })
})

describe("score history and human reviews", () => {
  it("keeps each version's score and leaves the human review out of the AI median", () => {
    const first = review({ id: "v1", recordId: "1", doi: "10.5281/zenodo.1", recordVersion: "v1", overall: 40, publicationDate: "2026-01-01" })
    const second = review({ id: "v2", recordId: "2", doi: "10.5281/zenodo.2", recordVersion: "v2", overall: 80, publicationDate: "2026-06-01", assessorId: "gpt" })
    const human = review({
      id: "human",
      recordId: "2",
      doi: "10.5281/zenodo.2",
      recordVersion: "v2",
      overall: 95,
      origin: "human",
      assessorId: "human",
      publicationDate: "2026-06-01",
    })
    const openIssue: IssueThread = {
      ...thread([round({ id: "c", kind: "claim" })]),
      status: "open",
    }
    const fixedIssue: IssueThread = {
      ...thread([round({ id: "c2", kind: "claim" })]),
      id: "fixed",
      doi: "10.5281/zenodo.2",
      recordVersion: "v2",
      status: "fixed-in-new-version",
      claim: "Fixed later.",
    }
    const db: AirDatabase = { reviews: [first, second, human], nodes: [], issues: [openIssue, fixedIssue], claims: [] }
    const rows = buildRanking(db)
    const early = rows.find((row) => row.recordId === "1")
    const next = rows.find((row) => row.recordId === "2")
    expect(early?.panelMedian).toBe(40)
    expect(next?.panelMedian).toBe(80)
    expect(next?.humanMedian).toBe(95)
    expect(next?.byAssessor.human).toBeUndefined()
    expect(early?.panelMedian).not.toBe(next?.panelMedian)
    const lineage = scoreLineage(rows, "concept")
    expect(lineage.map((point) => point.recordId)).toEqual(["1", "2"])
    expect(lineage[0]?.place).toBe("earlier")
    expect(lineage[1]?.place).toBe("latest")
    expect(lineage[0]?.open).toBe(1)
    expect(lineage[0]?.fixed).toBe(0)
    expect(lineage[1]?.fixed).toBe(1)
    expect(lineage[1]?.panelMedian).toBe(80)
    expect(early?.issuePenalty).toBeGreaterThan(0)
    expect(next?.issuePenalty).toBe(0)
  })
})

describe("human review draft", () => {
  it("requires a quotation from this version before a score is marked proven", () => {
    const text = "The notebook reports the weighing protocol in the methods section."
    const drafts = emptyHumanDrafts(officialCriteria).map((draft) => ({
      ...draft,
      score: 70,
      rationale: "The loaded text supports a cautious score.",
      evidence: "possible" as const,
    }))
    const summary = "A human reading of this version. Possible claims stay possible until the publication shows them."
    const proven = buildHumanReport({
      criteria: officialCriteria,
      summary,
      recommendation: "revise",
      statedOverall: 70,
      drafts: drafts.map((draft, index) => (index === 0 ? { ...draft, evidence: "proven" } : draft)),
      strengths: [],
      majorIssues: [],
      publicationText: text,
    })
    expect(proven.ok).toBe(false)
    const quoted = buildHumanReport({
      criteria: officialCriteria,
      summary,
      recommendation: "revise",
      statedOverall: 70,
      drafts: drafts.map((draft, index) =>
        index === 0 ? { ...draft, evidence: "proven", quote: "reports the weighing protocol" } : draft,
      ),
      strengths: ["The files are public."],
      majorIssues: [],
      publicationText: text,
    })
    expect(quoted.ok).toBe(true)
    if (quoted.ok) {
      expect(quoted.report.scores[0]?.evidence).toBe("proven")
      expect(quoted.report.scale).toBe(100)
      expect(quoted.report.scoringCheck?.mismatch).toBe(false)
    }
  })
})

describe("quotes and comments", () => {
  it("matches a quotation after ligatures, smart quotes, dashes, and whitespace are folded", () => {
    const text = "The \uFB01nal ﬂow\u00A0is 582 kg/s on pages 3\u20134."
    expect(quoteInPublication("The final flow is 582 kg/s on pages 3-4.", text)).toBe(true)
    expect(quoteInPublication("the pump was never built", text)).toBe(false)
  })

  it("lets a person quote the new version without a model, and a comment leaves status and score alone", () => {
    const publication = "The revised methods report the weighing protocol in full."
    const checked = humanQuoteCheck({
      quote: "report the weighing protocol",
      note: "The new version states the protocol.",
      result: "ADDRESSED",
      publicationText: publication,
    })
    expect(checked.ok).toBe(true)
    if (!checked.ok) return
    expect(checked.result).toBe("ADDRESSED")
    expect(checked.citations[0]?.quoteVerified).toBe(true)
    const missed = humanQuoteCheck({ quote: "this sentence is not in the file", note: "", result: "ADDRESSED", publicationText: publication })
    expect(missed.ok).toBe(false)
    const open = thread([round({ id: "c", kind: "claim" })])
    const commented: IssueThread = {
      ...open,
      status: commentStatus(open.status),
      rounds: [...open.rounds, round({ id: "note", kind: "comment", body: "A reader asked for the table." })],
    }
    expect(commented.status).toBe("open")
    expect(issuePenalty([commented])).toBe(issuePenalty([open]))
    expect(canAppendRound(open, { kind: "comment" })).toBe(true)
  })

  it("does not let two comments count toward the cap or flip a not-addressed check to unresolved", () => {
    const withComments = [
      round({ id: "c", kind: "claim" }),
      round({ id: "n1", kind: "comment", body: "A reader asked where the table is." }),
      round({ id: "n2", kind: "comment", body: "Another reader asked the same." }),
    ]
    expect(statusFromCheck("NOT_ADDRESSED", withComments, "v1", "v1")).toBe("open")
    expect(statusFromCheck("NOT_ADDRESSED", withComments, "v1", "v1")).not.toBe("unresolved")
    const full = thread([
      round({ id: "c", kind: "claim" }),
      ...Array.from({ length: 5 }, (_, index) => round({ id: `r${index}`, kind: "rebuttal" })),
      round({ id: "n1", kind: "comment" }),
      round({ id: "n2", kind: "comment" }),
    ])
    expect(canAppendRound(full, { kind: "rebuttal" })).toBe(false)
    expect(canAppendRound(full, { kind: "source-check", recordVersionChecked: "v1" })).toBe(false)
    expect(canAppendRound(full, { kind: "comment" })).toBe(true)
    expect(canAppendRound(thread(withComments), { kind: "rebuttal" })).toBe(true)
  })
})

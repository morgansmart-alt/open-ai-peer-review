import { describe, expect, it } from "vitest"
import { officialCriteria } from "../../domain/officialCriteria.ts"
import { critiquesFromReport, defenceFailureNotice, rebuttalPrompt, rescorePrompt, runDefenceLoop, defendedFromReply, DEFENCE_PAUSE_MS } from "./defence.ts"
import { validateWebChatSubmission, WEB_CHAT_SUBMIT_URL } from "./submission.ts"
import { WEB_CHAT_SOURCE, UNCALIBRATED_WEB_CHAT_TIER } from "./protocol.ts"

function scores(score: number) {
  return officialCriteria.criteria.map((criterion) => ({
    criterionId: criterion.id,
    score,
    rationale: `${criterion.name} is supported by a passage a reader can find in the record.`,
    citations: [{ quote: "Net B collected 1.8 litres.", location: "results" }],
    confidence: "medium" as const,
  }))
}

function reviewJson(score: number, overall: number, recommendation: string) {
  return JSON.stringify({
    summary: "The record states a narrow claim and shows the weighing steps that support it, with the season limit written in the text.",
    scores: scores(score),
    overallScore: overall,
    recommendation,
    strengths: ["The files are public."],
    majorIssues: [{ criterionId: "testability", claim: "The stopping rule is not written down.", quotedPassage: "Net B collected 1.8 litres.", reason: "A reader cannot repeat the check." }],
    minorIssues: ["The season is narrow."],
    questionsForAuthors: ["What would a second season change?"],
    suggestedNextSteps: ["Publish the weighing sheet beside the figure."],
    ontologyClass: "physical-testable",
    physics: { classification: "CONSISTENT", laws: ["conservation of mass"], howAddressed: "The mass balance is written out." },
    simulation: { reported: 0, passed: 0, methods: "Simulation does not apply to this record.", inputsAvailable: false },
    valueEstimate: { assumptions: ["The season is one site."], marketDisruption: "Not estimated." },
    goals: [{ goalId: "sdg-6", level: "indirect", note: "Water collection is named." }],
  })
}

describe("defend my paper", () => {
  it("answers each critique from the paper, then asks for a second score, and stops when asked", async () => {
    const sent: string[] = []
    const critiques = critiquesFromReport({
      summary: "A short summary that is long enough to stand as the only criticism.",
      majorIssues: [{ criterionId: "testability", claim: "The stopping rule is missing.", quotedPassage: "Net B collected 1.8 litres.", reason: "The check cannot be repeated." }],
    })
    const prompt = rebuttalPrompt({ round: 1, rounds: 2, critiques, paperText: "Section 2. Net B collected 1.8 litres." })
    const long = rebuttalPrompt({
      round: 1,
      rounds: 1,
      critiques: [{ criterionId: "limitations", claim: `Boltzmann ${"uncertainty ".repeat(80)}`, reason: "x".repeat(500), quotedPassage: "y".repeat(400) }],
      paperText: "",
      includeExcerpt: false,
    })
    expect(long.length).toBeLessThan(2500)
    expect(long).toContain("Boltzmann")
    expect(long).not.toContain("uncertainty ".repeat(40))
    expect(defenceFailureNotice("The message box cut the text off.")).toBe("Defence step failed: The message box cut the text off. Blind score saved.")
    expect(prompt).toContain("Do not invent data")
    expect(prompt).toContain("Section 2")
    const linked = rebuttalPrompt({ round: 1, rounds: 2, critiques, paperText: "UNIQUEPDF excerpt that must stay out.", includeExcerpt: false })
    expect(linked).not.toContain("UNIQUEPDF")
    expect(linked).not.toContain("Paper excerpt")
    expect(linked).toContain("already in this chat")
    expect(prompt).toContain("The stopping rule is missing.")
    expect(rescorePrompt()).toContain("after author defence")
    const finished = await runDefenceLoop({
      rounds: 2,
      critiques,
      paperText: "Section 2. Net B collected 1.8 litres.",
      aborted: () => false,
      pause: async () => undefined,
      send: async (text) => {
        sent.push(text)
        return sent.length < 3 ? "I concede the stopping rule is thin. Section 2 only reports 1.8 litres." : reviewJson(80, 80, "encourage")
      },
    })
    expect(finished.stopped).toBe(false)
    expect(finished.transcript.filter((turn) => turn.kind === "rebuttal")).toHaveLength(2)
    expect(finished.transcript.some((turn) => turn.kind === "rescore")).toBe(true)
    expect(finished.defendedText).toContain("overallScore")
    const parsed = defendedFromReply(finished.defendedText ?? "")
    expect(parsed.ok).toBe(true)
    if (parsed.ok) expect(parsed.defended.label).toBe("after author defence")
    let calls = 0
    const stopped = await runDefenceLoop({
      rounds: 3,
      critiques,
      paperText: "Section 2.",
      aborted: () => calls > 0,
      pause: async () => undefined,
      send: async () => {
        calls += 1
        return "Reply"
      },
    })
    expect(stopped.stopped).toBe(true)
    expect(stopped.defendedText).toBeNull()
    expect(DEFENCE_PAUSE_MS).toBeGreaterThan(0)
  })

  it("sends the blind score as the ranking value and the defended score beside it", () => {
    const scoresOnly = officialCriteria.criteria.map((criterion) => ({ criterionId: criterion.id, score: 70 }))
    const defendedScores = officialCriteria.criteria.map((criterion) => ({ criterionId: criterion.id, score: 80 }))
    const body = {
      source: WEB_CHAT_SOURCE,
      tier: UNCALIBRATED_WEB_CHAT_TIER,
      paper: { title: "A public note", doi: "10.5281/zenodo.18916931", url: "https://zenodo.org/records/18916931" },
      site: "Grok on X",
      model: "Grok on x.com (web chat, uncalibrated)",
      criteriaVersion: "0.2.0",
      scores: scoresOnly,
      summary: "The record states a narrow claim and shows the weighing steps that support it, with the season limit written in the text.",
      overallScore: 70,
      recommendation: "revise",
      createdAt: "2026-11-22T00:00:00.000Z",
      defended: {
        label: "after author defence",
        overallScore: 80,
        recommendation: "encourage",
        summary: "After the defence the stopping rule is still thin, and the rest of the record remains specific enough to encourage another look.",
        scores: defendedScores,
      },
      instructions: "must not travel",
    }
    const rejected = validateWebChatSubmission(body)
    expect(rejected.ok).toBe(false)
    const { instructions: dropped, ...clean } = body
    void dropped
    const accepted = validateWebChatSubmission(clean)
    expect(accepted.ok).toBe(true)
    if (!accepted.ok) return
    expect(accepted.submission.overallScore).toBe(70)
    expect(accepted.submission.defended?.label).toBe("after author defence")
    expect(accepted.submission.defended?.overallScore).toBe(80)
    expect(JSON.stringify(accepted.submission)).not.toContain("instructions")
    expect(WEB_CHAT_SUBMIT_URL).toBe("https://lotswxboafsenmszijpf.supabase.co/functions/v1/submit-web-chat")
  })
})

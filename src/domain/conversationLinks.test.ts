import { describe, expect, it } from "vitest"
import { buildRanking } from "./ranking.ts"
import type { AirDatabase, StoredReview } from "./types.ts"
import {
  EXAMPLE_GOOGLE_AI_MODE_URL,
  collectConversationLinks,
  conversationPromptBlock,
  providerFromUrl,
  publicContextCount,
} from "./conversationLinks.ts"
import { officialCriteria } from "./officialCriteria.ts"

describe("private AI context links", () => {
  it("labels a share.google/aimode link as Google AI Mode", () => {
    expect(providerFromUrl(EXAMPLE_GOOGLE_AI_MODE_URL)).toBe("Google AI Mode")
    expect(providerFromUrl("https://chatgpt.com/share/example")).toBe("ChatGPT")
    expect(providerFromUrl("https://claude.ai/share/example")).toBe("Claude")
    expect(providerFromUrl("https://gemini.google.com/share/example")).toBe("Gemini")
    expect(providerFromUrl("https://grok.com/share/example")).toBe("Grok")
    expect(providerFromUrl("https://www.perplexity.ai/search/example")).toBe("Perplexity")
    expect(providerFromUrl("https://example.com/notes")).toBe("Other")
  })

  it("accepts only https and at most ten links", () => {
    expect(collectConversationLinks([{ url: "http://share.google/aimode/EXAMPLE", note: "" }]).ok).toBe(false)
    const tooMany = Array.from({ length: 11 }, () => ({ url: EXAMPLE_GOOGLE_AI_MODE_URL, note: "" }))
    expect(collectConversationLinks(tooMany).ok).toBe(false)
    const parsed = collectConversationLinks([{ url: EXAMPLE_GOOGLE_AI_MODE_URL, note: " covers the method " }])
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.links[0]?.provider).toBe("Google AI Mode")
    expect(parsed.links[0]?.note).toBe("covers the method")
  })

  it("tells the model not to invent a chat it cannot open", () => {
    const block = conversationPromptBlock([{ url: EXAMPLE_GOOGLE_AI_MODE_URL, provider: "Google AI Mode", note: "method" }])
    expect(block).toContain("not fetched")
    expect(block).toContain("Never invent")
    expect(block).toContain(EXAMPLE_GOOGLE_AI_MODE_URL)
    expect(block).toContain("publication")
  })

  it("publishes a count and not the address", () => {
    expect(publicContextCount(1)).toBe("Author supplied 1 private AI context link")
    expect(JSON.stringify({ privateContextCount: 1 })).not.toContain("share.google")
  })

  it("does not change the rank when only the private count differs", () => {
    const base = (count: number): StoredReview => ({
      id: `r-${count}`,
      sample: false,
      mock: false,
      doi: "10.5281/zenodo.1",
      recordId: "1",
      conceptRecordId: "1",
      recordVersion: "v1",
      title: count === 0 ? "Plain" : "With context",
      creators: ["A"],
      keywords: [],
      publicationDate: "2026-01-01",
      license: "",
      assessorId: "grok",
      modelId: "m",
      provider: "xai",
      criteriaId: officialCriteria.id,
      criteriaVersion: officialCriteria.version,
      customCriteria: false,
      report: {
        summary: "A summary long enough to stand as a reading of the work.",
        scores: [],
        overallScore: 6,
        ideaScore: 6,
        recommendation: "revise",
        strengths: [],
        majorIssues: [],
        minorIssues: [],
        questionsForAuthors: [],
        suggestedNextSteps: [],
      },
      outputHash: `h-${count}`,
      createdAt: "2026-10-01T00:00:00.000Z",
      privateContextCount: count,
    })
    const db: AirDatabase = { reviews: [base(0), base(3)], nodes: [], issues: [], claims: [] }
    const rows = buildRanking(db)
    expect(rows.every((row) => row.panelMedian === 6)).toBe(true)
  })
})

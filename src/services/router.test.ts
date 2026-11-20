import { describe, expect, it } from "vitest"
import { isCalibratedForFullReview, passesReferenceBand } from "../domain/calibration.ts"
import { estimateTokens } from "../domain/freeModels.ts"
import { emptyHealth, isDailyQuota, nextDailyReset, nextOverloadBackoff, normalizeHealth, rankCandidates, recordProcessQuality, routeComplete } from "./router.ts"
import { publicPayload } from "./backend.ts"
import { AIR_SITE_URL } from "./keyProbe.ts"
import { quoteMatchesCorpus } from "./textTools.ts"

describe("free provider router", () => {
  it("falls through a cooled-down model and does not rank by a score", async () => {
    const now = Date.UTC(2026, 10, 20, 18, 0, 0)
    const ranked = rankCandidates({
      tokens: 269_000,
      job: "review-full",
      providersWithKeys: ["gemini", "openrouter"],
      health: {},
      now,
      privateMaterial: false,
    })
    expect(ranked[0]?.model).toBe("gemini-3.8-flash")
    expect(ranked.some((model) => model.model.includes("lite"))).toBe(false)
    const liteSuccess = recordProcessQuality({ ...emptyHealth(), successes: 1, attempts: 1 }, { schemaValid: true, quotesVerified: true, scoresAgree: true })
    const sticky = rankCandidates({
      tokens: 269_000,
      job: "review-full",
      providersWithKeys: ["gemini"],
      health: { "gemini:gemini-3.1-flash-lite": liteSuccess },
      now,
      privateMaterial: false,
    })
    expect(sticky[0]?.model).toBe("gemini-3.8-flash")
    expect(sticky.some((model) => model.model.includes("lite"))).toBe(false)

    const calls: string[] = []
    const secret = "sk-test-secret-should-not-leak"
    const routed = await routeComplete({
      tokens: 300_000,
      job: "review-full",
      providersWithKeys: ["gemini", "openrouter"],
      health: {},
      now: 5_000,
      privateMaterial: false,
      call: async (model) => {
        calls.push(model.model)
        if (model.provider === "gemini") return { status: 429, body: "You exceeded your requests per day", headers: {} }
        return { status: 200, body: "ok", content: "scored", servedModel: model.model }
      },
    })
    expect(routed.ok).toBe(true)
    if (!routed.ok) return
    expect(routed.family).not.toBe("gemini")
    expect(calls.some((model) => model.startsWith("gemini"))).toBe(true)
    expect(JSON.stringify(routed.health)).not.toContain(secret)
    expect(nextOverloadBackoff(0)).toBe(30_000)
    expect(nextOverloadBackoff(30_000)).toBe(120_000)
    expect(nextOverloadBackoff(120_000)).toBe(600_000)
  })

  it("cools a model down after 503 and skips it on the next choice", async () => {
    const first = await routeComplete({
      tokens: 1_000,
      job: "chat",
      providersWithKeys: ["groq"],
      health: {},
      now: 10_000,
      budgetMs: 0,
      privateMaterial: false,
      call: async () => ({ status: 503, body: "high demand" }),
    })
    expect(first.ok).toBe(false)
    const again = rankCandidates({
      tokens: 1_000,
      job: "chat",
      providersWithKeys: ["groq"],
      health: first.health,
      now: 10_100,
      privateMaterial: false,
    })
    expect(again).toHaveLength(0)
  })

  it("treats a per-minute Gemini 429 as a short wait, then retries", async () => {
    let now = Date.UTC(2026, 10, 20, 18, 34, 0)
    const sleeps: number[] = []
    let calls = 0
    const routed = await routeComplete({
      tokens: 269_000,
      job: "review-full",
      providersWithKeys: ["gemini"],
      health: {},
      now,
      budgetMs: 3 * 60 * 1000,
      clock: () => now,
      sleep: async (ms) => {
        sleeps.push(ms)
        now += ms
      },
      privateMaterial: false,
      maxAttempts: 1,
      call: async (model) => {
        calls += 1
        if (calls === 1) {
          return { status: 429, body: 'GenerateContentInputTokensPerModelPerMinute-FreeTier "quotaValue": 250000 "retryDelay": "20s"' }
        }
        now += 5_000
        return { status: 200, body: "", content: "ok", servedModel: model.model }
      },
    })
    expect(isDailyQuota('GenerateContentInputTokensPerModelPerMinute-FreeTier "quotaValue": 250000')).toBe(false)
    expect(isDailyQuota("GenerateRequestsPerDayPerProjectPerModel-FreeTier")).toBe(true)
    expect(routed.ok).toBe(true)
    expect(sleeps[0]).toBe(20_000)
    if (!routed.ok) return
    expect(routed.model.model).toBe("gemini-3.8-flash")
    expect(routed.health["gemini:gemini-3.8-flash"]?.dailyCount).toBe(1)
    expect(routed.health["gemini:gemini-3.8-flash"]?.latencyMs[0]).toBeGreaterThan(1)
  })

  it("records real latency and resets the daily counter", async () => {
    let now = 1_000
    const routed = await routeComplete({
      tokens: 100,
      job: "chat",
      providersWithKeys: ["groq"],
      health: { "groq:openai/gpt-oss-120b": { ...emptyHealth(), dailyCount: 40, dailyResetAt: 500 } },
      now,
      budgetMs: 0,
      clock: () => now,
      privateMaterial: false,
      call: async () => {
        now += 4_200
        return { status: 200, body: "", content: "ok", servedModel: "openai/gpt-oss-120b" }
      },
    })
    expect(routed.ok).toBe(true)
    if (!routed.ok) return
    expect(routed.health["groq:openai/gpt-oss-120b"]?.latencyMs[0]).toBe(4_200)
    expect(routed.health["groq:openai/gpt-oss-120b"]?.dailyCount).toBe(1)
    const later = Date.UTC(2026, 6, 20, 10, 0, 0)
    const winter = Date.UTC(2026, 10, 20, 10, 0, 0)
    expect(new Date(nextDailyReset("gemini", later)).toISOString().slice(11, 13)).toBe("07")
    expect(new Date(nextDailyReset("gemini", winter)).toISOString().slice(11, 13)).toBe("08")
    expect(normalizeHealth({ ...emptyHealth(), dailyCount: 27, dailyResetAt: winter }, "gemini", winter + 60_000).dailyCount).toBe(0)
  })

  it("estimates the v8 packet near the measured token count and checks calibration", () => {
    expect(estimateTokens(720_898)).toBeGreaterThan(250_000)
    expect(estimateTokens(720_898)).toBeLessThan(290_000)
    expect(isCalibratedForFullReview("gemini-3.8-flash")).toBe(true)
    expect(isCalibratedForFullReview("gemini-3.6-flash")).toBe(false)
    expect(isCalibratedForFullReview("gemini-3.1-flash-lite")).toBe(false)
    expect(passesReferenceBand(72.5, "revise", "revise")).toBe(true)
    expect(passesReferenceBand(83.18, "encourage", "revise")).toBe(false)
    expect(quoteMatchesCorpus("the pump is 582 kg/s … on page 94", "the pump is 582 kg/s in section 6.6 and again on page 94")).toBe(true)
  })

  it("keeps keys out of a published payload and names the real site", () => {
    const payload = publicPayload({
      doi: "10.5281/zenodo.1",
      apiKey: "sk-live-secret",
      authorization: "Bearer sk-live-secret",
      report: { summary: "A public summary." },
    })
    expect(JSON.stringify(payload)).not.toContain("sk-live-secret")
    expect(JSON.stringify(payload)).toContain("A public summary.")
    expect(AIR_SITE_URL).toBe("https://morgansmart-alt.github.io/open-ai-peer-review/")
  })
})

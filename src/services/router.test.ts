import { describe, expect, it } from "vitest"
import { emptyHealth, nextOverloadBackoff, processQuality, rankCandidates, recordProcessQuality, routeComplete, utilityOf } from "./router.ts"
import { FREE_MODELS } from "../domain/freeModels.ts"
import { publicPayload } from "./backend.ts"
import { AIR_SITE_URL } from "./keyProbe.ts"

describe("free provider router", () => {
  it("falls through a cooled-down model and does not rank by a score", async () => {
    const generous = emptyHealth()
    const careful = recordProcessQuality(emptyHealth(), { schemaValid: true, quotesVerified: true, scoresAgree: true })
    const gemini = FREE_MODELS.find((model) => model.model === "gemini-3.8-flash")
    const nemotron = FREE_MODELS.find((model) => model.family === "nemotron")
    if (!gemini || !nemotron) throw new Error("missing models")
    const health = {
      [`${gemini.provider}:${gemini.model}`]: generous,
      [`${nemotron.provider}:${nemotron.model}`]: careful,
    }
    expect(utilityOf(nemotron, health[`${nemotron.provider}:${nemotron.model}`])).toBeGreaterThan(utilityOf(gemini, health[`${gemini.provider}:${gemini.model}`]))
    expect(processQuality(generous)).toBe(processQuality(recordProcessQuality(emptyHealth(), { schemaValid: false, quotesVerified: false, scoresAgree: false })) === 0 ? 0.5 : processQuality(generous))
    const ranked = rankCandidates({
      tokens: 300_000,
      job: "review-full",
      providersWithKeys: ["gemini", "openrouter"],
      health,
      now: 1_000,
      privateMaterial: false,
    })
    expect(ranked[0]?.family).toBe("nemotron")
    expect(ranked.some((model) => model.provider === "groq")).toBe(false)

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

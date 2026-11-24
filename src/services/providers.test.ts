import { afterEach, describe, expect, it, vi } from "vitest"
import { builtinAssessors } from "../domain/assessors.ts"
import {
  completeChat,
  isDailyQuota,
  isModelBusy,
  planProviderFailure,
  providerErrorMessage,
  providerRetryDelayMs,
  quotaResetPhrase,
} from "./providers.ts"

const gemini = builtinAssessors.find((profile) => profile.id === "gemini")
if (!gemini) throw new Error("gemini profile missing")

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe("free-tier provider failures", () => {
  it("distinguishes a busy model from a used-up daily quota and honours Retry-After", () => {
    expect(isModelBusy(503, "The model is overloaded due to high demand.")).toBe(true)
    expect(isDailyQuota(429, "Daily rate limit exceeded")).toBe(true)
    expect(isDailyQuota(429, "Too many requests")).toBe(false)
    const busy = providerErrorMessage(503, "high demand")
    expect(busy).toMatch(/model is busy with high demand/i)
    expect(busy).toMatch(/OpenRouter/)
    expect(busy).toMatch(/web-chat/)
    const quota = providerErrorMessage(429, '{"error":{"status":"RESOURCE_EXHAUSTED","message":"You exceeded your current quota","details":[{"retryDelay":"43200s"}]}}')
    expect(quota).toMatch(/daily free quota is used up/)
    expect(quota).toMatch(/resets in about 12 hours/)
    expect(quota).toMatch(/Failed calls count/)
    expect(quotaResetPhrase(null, "Please retry in 30 minutes.")).toBe("resets in about 30 minutes")
    expect(providerRetryDelayMs(0, 5_000, 0)).toBeGreaterThanOrEqual(5_000)
    expect(providerRetryDelayMs(0, null, 0)).toBe(400)
    expect(providerRetryDelayMs(1, null, 0)).toBe(800)
    const firstBusy = planProviderFailure({ status: 503, body: "high demand", attempt: 0, random: 0 })
    expect(firstBusy.retry).toBe(true)
    const exhausted = planProviderFailure({ status: 503, body: "high demand", attempt: 2, random: 0 })
    expect(exhausted.retry).toBe(false)
    const daily = planProviderFailure({ status: 429, body: "GenerateRequestsPerDayPerProjectPerModel-FreeTier", attempt: 0, random: 0 })
    expect(daily.retry).toBe(false)
    expect(daily.message).toMatch(/daily free quota/)
    const longWait = planProviderFailure({ status: 503, body: "high demand", retryAfter: "120", attempt: 0, random: 0 })
    expect(longWait.retry).toBe(false)
  })

  it("retries a 503 and does not retry a daily quota", async () => {
    let calls = 0
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        calls += 1
        if (calls === 1) {
          return new Response("The model is overloaded. Please try again later.", { status: 503, headers: { "retry-after": "0" } })
        }
        return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "ok" }] } }] }), { status: 200 })
      }),
    )
    const settings = { keys: { gemini: "test-key" }, baseUrls: {}, models: {}, remember: false }
    const answer = await completeChat(gemini, settings, { model: gemini.defaultModel, system: "sys", user: "user", json: true })
    expect(answer.content).toBe("ok")
    expect(calls).toBe(2)

    calls = 0
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        calls += 1
        return new Response('{"error":{"message":"You exceeded your current quota, please retry in 12 hours."}}', { status: 429 })
      }),
    )
    await expect(completeChat(gemini, settings, { model: gemini.defaultModel, system: "sys", user: "user", json: true })).rejects.toThrow(/daily free quota/)
    expect(calls).toBe(1)
  })
})

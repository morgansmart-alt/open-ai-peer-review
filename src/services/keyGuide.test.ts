import { describe, expect, it } from "vitest"
import { FREE_KEY_GUIDE_TITLE, GEMINI_KEY_STEPS, GEMINI_KEY_URL, KEY_STAYS_LOCAL_NOTE, OPENROUTER_KEY_NOTE, WEBGPU_NOTE } from "../content/freeKeyGuide.ts"
import { keyCheckRequest, plainKeyCheckMessage } from "./providers.ts"

describe("free key guide", () => {
  it("walks through Google AI Studio without putting a real key in the copy", () => {
    expect(FREE_KEY_GUIDE_TITLE).toMatch(/2 minutes/i)
    expect(GEMINI_KEY_URL).toBe("https://aistudio.google.com")
    expect(GEMINI_KEY_STEPS.map((step) => step.title)).toEqual([
      "Open Google AI Studio",
      "Sign in",
      "Get API key",
      "Create API key",
      "Copy the key",
      "Paste it into AIR",
    ])
    const copy = [...GEMINI_KEY_STEPS.map((step) => step.body), OPENROUTER_KEY_NOTE, WEBGPU_NOTE, KEY_STAYS_LOCAL_NOTE].join(" ")
    expect(copy).toMatch(/free tier/i)
    expect(copy).toMatch(/does not ask for a card|does not need a card/)
    expect(copy).toMatch(/OpenRouter/)
    expect(copy).toMatch(/WebGPU/)
    expect(copy).toMatch(/not sent to AIR/)
    expect(copy).not.toMatch(/AIza[0-9A-Za-z_-]{10,}/)
    expect(copy).not.toMatch(/sk-[A-Za-z0-9]{8,}/)
  })
})

describe("key check", () => {
  it("uses one cheap provider call and speaks in plain language", () => {
    expect(keyCheckRequest({ provider: "gemini", baseUrl: "https://generativelanguage.googleapis.com/v1beta", key: "paste-me" }).url).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models",
    )
    expect(keyCheckRequest({ provider: "xai", baseUrl: "https://api.x.ai/v1/", key: "paste-me" }).url).toBe("https://api.x.ai/v1/models")
    expect(keyCheckRequest({ provider: "openrouter", baseUrl: "https://openrouter.ai/api/v1", key: "paste-me" }).url).toBe(
      "https://openrouter.ai/api/v1/key",
    )
    expect(plainKeyCheckMessage(200, "{}")).toEqual({ ok: true, message: "Key accepted. It stays in this browser." })
    expect(plainKeyCheckMessage(400, "API key not valid. Please pass a valid API key.").message).toMatch(/not accepted/)
    expect(plainKeyCheckMessage(429, "Quota exceeded for quota metric").message).toMatch(/quota/)
    expect(plainKeyCheckMessage(429, "Rate limit reached").message).toMatch(/rate-limiting/)
    expect(plainKeyCheckMessage(400, "API key not valid. Please pass a valid API key. The key was sk-secretvalue").message).not.toMatch(/sk-secret/)
  })
})

import { describe, expect, it } from "vitest"
import { builtinAssessors } from "../domain/assessors.ts"
import { chooseRecheckProvider, NO_RECHECK_PROVIDER } from "./recheckRoute.ts"

const profiles = builtinAssessors
const chats = ["grok", "gemini", "claude"]

describe("re-check provider choice", () => {
  it("uses the last-used keyed provider, including Gemini and OpenRouter, and never a silent demo", () => {
    const gemini = chooseRecheckProvider({
      profiles,
      keys: { gemini: "g-key" },
      lastRoute: null,
      webGpuReady: true,
      webChatConnected: true,
      webChatProviderIds: chats,
    })
    expect(gemini).toMatchObject({ ok: true, kind: "assessor", profile: { id: "gemini" } })

    const openrouter = chooseRecheckProvider({
      profiles,
      keys: { openrouter: "or-key" },
      lastRoute: { kind: "assessor", id: "llama" },
      webGpuReady: false,
      webChatConnected: false,
      webChatProviderIds: chats,
    })
    expect(openrouter).toMatchObject({ ok: true, kind: "assessor", profile: { id: "llama" } })

    const lastGrok = chooseRecheckProvider({
      profiles,
      keys: { xai: "x-key", gemini: "g-key" },
      lastRoute: { kind: "assessor", id: "grok" },
      webGpuReady: false,
      webChatConnected: false,
      webChatProviderIds: chats,
    })
    expect(lastGrok).toMatchObject({ ok: true, kind: "assessor", profile: { id: "grok" } })
    expect(lastGrok).not.toMatchObject({ profile: { id: "gemini" } })
  })

  it("falls through to WebGPU or the web-chat extension, and says so when nothing is usable", () => {
    const webgpu = chooseRecheckProvider({
      profiles,
      keys: {},
      lastRoute: { kind: "webgpu", id: "webgpu" },
      webGpuReady: true,
      webChatConnected: true,
      webChatProviderIds: chats,
    })
    expect(webgpu.ok && webgpu.kind).toBe("webgpu")
    expect(
      chooseRecheckProvider({
        profiles,
        keys: {},
        lastRoute: { kind: "web-chat", id: "claude" },
        webGpuReady: false,
        webChatConnected: true,
        webChatProviderIds: chats,
      }),
    ).toMatchObject({ ok: true, kind: "web-chat", providerId: "claude" })
    expect(
      chooseRecheckProvider({
        profiles,
        keys: {},
        lastRoute: null,
        webGpuReady: false,
        webChatConnected: true,
        webChatProviderIds: chats,
      }),
    ).toMatchObject({ ok: true, kind: "web-chat", providerId: "gemini" })
    const none = chooseRecheckProvider({
      profiles,
      keys: {},
      lastRoute: null,
      webGpuReady: false,
      webChatConnected: false,
      webChatProviderIds: chats,
    })
    expect(none).toEqual({ ok: false, message: NO_RECHECK_PROVIDER })
    expect(none.ok === false && none.message.toLowerCase()).not.toContain("demo reading")
    expect(NO_RECHECK_PROVIDER).toMatch(/will not substitute a demo/i)
  })
})

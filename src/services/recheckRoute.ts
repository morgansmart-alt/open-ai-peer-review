import { keySlot } from "../domain/assessors.ts"
import type { AssessorProfile } from "../domain/types.ts"
import { webGpuStatus } from "./freeReview.ts"
import { pingWebChatExtension } from "./webChat/client.ts"

export interface LastRoute {
  kind: "assessor" | "webgpu" | "web-chat"
  id: string
}

export const NO_RECHECK_PROVIDER =
  "No usable AI provider is ready for this re-check. AIR will not substitute a demo. Add a key for Gemini, OpenRouter, or another provider you use, or connect WebGPU or the web-chat extension."

export type RecheckChoice =
  | { ok: true; kind: "assessor"; profile: AssessorProfile }
  | { ok: true; kind: "webgpu" }
  | { ok: true; kind: "web-chat"; providerId: string }
  | { ok: false; message: string }

export interface RecheckRouteInput {
  profiles: readonly AssessorProfile[]
  keys: Record<string, string>
  lastRoute?: LastRoute | null
  webGpuReady: boolean
  webChatConnected: boolean
  webChatProviderIds: readonly string[]
}

/** When nothing was used last, a free Gemini or OpenRouter key beats a hard-coded Grok default. */
const KEY_PREFERENCE = ["gemini", "llama", "deepseek", "mistral", "gpt", "claude", "grok"]

export function profileHasKey(profile: AssessorProfile, keys: Record<string, string>): boolean {
  const slot = keySlot(profile)
  return Boolean(keys[slot]?.trim() || keys[profile.provider]?.trim())
}

export function chooseRecheckProvider(input: RecheckRouteInput): RecheckChoice {
  const keyed = input.profiles.filter((profile) => profileHasKey(profile, input.keys))
  const last = input.lastRoute
  if (last?.kind === "assessor") {
    const profile = keyed.find((item) => item.id === last.id)
    if (profile) return { ok: true, kind: "assessor", profile }
  }
  if (last?.kind === "webgpu" && input.webGpuReady) return { ok: true, kind: "webgpu" }
  if (last?.kind === "web-chat" && input.webChatConnected && input.webChatProviderIds.includes(last.id)) {
    return { ok: true, kind: "web-chat", providerId: last.id }
  }
  if (keyed.length > 0) {
    const preferred = KEY_PREFERENCE.map((id) => keyed.find((profile) => profile.id === id)).find((profile) => profile)
    const profile = preferred ?? keyed[0]
    if (profile) return { ok: true, kind: "assessor", profile }
  }
  if (input.webGpuReady) return { ok: true, kind: "webgpu" }
  if (input.webChatConnected) {
    const providerId = input.webChatProviderIds.find((id) => id === "gemini") ?? input.webChatProviderIds[0]
    if (providerId) return { ok: true, kind: "web-chat", providerId }
  }
  return { ok: false, message: NO_RECHECK_PROVIDER }
}

/**
 * A keyed last-used assessor does not wait on WebGPU or the extension.
 * WebGPU and the extension are checked when they are the last route, or when no key is usable.
 */
export async function resolveRecheckChoice(
  input: Omit<RecheckRouteInput, "webGpuReady" | "webChatConnected">,
): Promise<RecheckChoice> {
  const last = input.lastRoute
  if (last?.kind !== "webgpu" && last?.kind !== "web-chat") {
    const keyed = chooseRecheckProvider({ ...input, webGpuReady: false, webChatConnected: false })
    if (keyed.ok) return keyed
  }
  const [gpu, connected] = await Promise.all([webGpuStatus(), pingWebChatExtension()])
  return chooseRecheckProvider({ ...input, webGpuReady: gpu === "ready", webChatConnected: connected })
}

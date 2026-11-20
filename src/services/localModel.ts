export type LocalAvailability = "available" | "downloadable" | "downloading" | "unavailable"

export interface PromptSession {
  prompt: (text: string, options?: { signal?: AbortSignal }) => Promise<string>
  contextWindow?: number
  contextUsage?: { tokens: number } | number
  destroy?: () => void
}

export interface PromptApi {
  availability: () => Promise<LocalAvailability | string>
  create: (options?: { monitor?: (monitor: EventTarget) => void; signal?: AbortSignal }) => Promise<PromptSession>
}

export interface LocalAiStatus {
  state: LocalAvailability
  reason: string
  contextTokens: number | null
}

export const LOCAL_REQUIREMENTS = [
  "Chrome 148 or later on Windows, Mac, Linux, or a Chromebook Plus. Not a phone.",
  "A graphics chip with more than 4 GB of memory, or 16 GB of memory and at least 4 processor cores.",
  "About 22 GB free on the drive that holds the Chrome profile. Chrome removes the model if free space falls below 10 GB.",
  "An unmetered connection the first time, while the model downloads.",
]

export function readPromptApi(scope: { LanguageModel?: PromptApi } = globalThis as { LanguageModel?: PromptApi }): PromptApi | null {
  const api = scope.LanguageModel
  if (!api || typeof api.availability !== "function" || typeof api.create !== "function") return null
  return api
}

export function availabilityReason(state: LocalAvailability): string {
  if (state === "available") return "This computer can run the on-device model."
  if (state === "downloadable") return "Chrome can download the on-device model. It stays on this computer."
  if (state === "downloading") return "The on-device model is downloading."
  return "This browser cannot run the on-device model. Use a free key, or copy a prompt into Gemini yourself."
}

export function contextTokensFrom(session: PromptSession): number | null {
  const raw = session.contextWindow
  return typeof raw === "number" && raw > 0 ? raw : null
}

export function downloadRatio(event: { loaded?: number; total?: number }): number | null {
  if (!event.total || event.total <= 0 || event.loaded === undefined) return null
  return Math.max(0, Math.min(1, event.loaded / event.total))
}

export async function detectLocalAi(scope?: { LanguageModel?: PromptApi }): Promise<LocalAiStatus> {
  const api = readPromptApi(scope)
  if (!api) {
    return { state: "unavailable", reason: availabilityReason("unavailable"), contextTokens: null }
  }
  try {
    const reported = await api.availability()
    const state: LocalAvailability = reported === "available" || reported === "downloadable" || reported === "downloading" ? reported : "unavailable"
    return { state, reason: availabilityReason(state), contextTokens: null }
  } catch {
    return { state: "unavailable", reason: "The browser refused the on-device model check.", contextTokens: null }
  }
}

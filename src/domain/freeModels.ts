import type { ProviderId } from "./types.ts"

export type RouterJob = "review-full" | "review-chunk" | "chat" | "extract" | "source-check" | "screen"

export interface FreeModel {
  provider: Extract<ProviderId, "gemini" | "openrouter" | "groq" | "cohere">
  model: string
  family: string
  contextTokens: number
  maxOutput: number
  /** Tokens per minute. Absent means the published limit is not a per-request cap we must preflight. */
  tpm?: number
  rpd: number
  trainsOnFree: boolean
  goodFor: string
  verifiedAt: string
  sourceUrl: string
}

/** Researched 20 Nov 2026. OpenRouter ids were checked against /api/v1/models that day. */
export const FREE_MODELS: FreeModel[] = [
  {
    provider: "gemini",
    model: "gemini-3.8-flash",
    family: "gemini",
    contextTokens: 1_048_576,
    maxOutput: 8192,
    rpd: 27,
    trainsOnFree: true,
    goodFor: "Whole-paper reviews",
    verifiedAt: "2026-11-20",
    sourceUrl: "https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash",
  },
  {
    provider: "gemini",
    model: "gemini-3.6-flash",
    family: "gemini",
    contextTokens: 1_048_576,
    maxOutput: 8192,
    rpd: 27,
    trainsOnFree: true,
    goodFor: "Whole-paper reviews",
    verifiedAt: "2026-11-20",
    sourceUrl: "https://ai.google.dev/gemini-api/docs/pricing",
  },
  {
    provider: "gemini",
    model: "gemini-3.5-flash-lite",
    family: "gemini",
    contextTokens: 1_048_576,
    maxOutput: 8192,
    rpd: 27,
    trainsOnFree: true,
    goodFor: "Whole-paper reviews and short checks",
    verifiedAt: "2026-11-20",
    sourceUrl: "https://ai.google.dev/gemini-api/docs/pricing",
  },
  {
    provider: "gemini",
    model: "gemini-3.1-flash-lite",
    family: "gemini",
    contextTokens: 1_048_576,
    maxOutput: 8192,
    rpd: 27,
    trainsOnFree: true,
    goodFor: "Short checks when the larger Flash models are busy",
    verifiedAt: "2026-11-20",
    sourceUrl: "https://ai.google.dev/gemini-api/docs/pricing",
  },
  {
    provider: "openrouter",
    model: "nvidia/nemotron-3-ultra-550b-a55b:free",
    family: "nemotron",
    contextTokens: 1_000_000,
    maxOutput: 8192,
    rpd: 50,
    trainsOnFree: true,
    goodFor: "A second family for a whole-paper review",
    verifiedAt: "2026-11-20",
    sourceUrl: "https://openrouter.ai/api/v1/models",
  },
  {
    provider: "openrouter",
    model: "inclusionai/ling-3.2-flash:free",
    family: "ling",
    contextTokens: 1_048_576,
    maxOutput: 8192,
    rpd: 50,
    trainsOnFree: true,
    goodFor: "A second family for a whole-paper review",
    verifiedAt: "2026-11-20",
    sourceUrl: "https://openrouter.ai/api/v1/models",
  },
  {
    provider: "openrouter",
    model: "google/gemma-4-31b-it:free",
    family: "gemma",
    contextTokens: 262_144,
    maxOutput: 8192,
    rpd: 50,
    trainsOnFree: true,
    goodFor: "Chat and shorter checks",
    verifiedAt: "2026-11-20",
    sourceUrl: "https://openrouter.ai/api/v1/models",
  },
  {
    provider: "groq",
    model: "openai/gpt-oss-120b",
    family: "gpt-oss",
    contextTokens: 131_072,
    maxOutput: 2048,
    tpm: 8_000,
    rpd: 1_000,
    trainsOnFree: false,
    goodFor: "Fast chat and short extracts, not a whole paper",
    verifiedAt: "2026-11-20",
    sourceUrl: "https://console.groq.com/docs/rate-limits",
  },
  {
    provider: "cohere",
    model: "command-a-03-2025",
    family: "cohere",
    contextTokens: 256_000,
    maxOutput: 4096,
    rpd: 1_000,
    trainsOnFree: false,
    goodFor: "Checks and chat. A whole paper is too long.",
    verifiedAt: "2026-11-20",
    sourceUrl: "https://docs.cohere.com/docs/command-a",
  },
]

export const FREE_PROVIDER_IDS = ["gemini", "openrouter", "groq", "cohere"] as const

/**
 * Measured on the v8 packet: 720,898 characters were 269,611 tokens, about 2.7 characters each.
 * Dividing by 1.4 made the router think the paper was more than twice as long.
 */
export function estimateTokens(chars: number): number {
  return Math.ceil(chars / 2.7)
}

export function tokensForJob(_job: RouterJob, chars: number): number {
  return estimateTokens(chars)
}

const CAPABILITY_PRIOR: Record<string, number> = {
  "gemini-3.8-flash": 0.95,
  "gemini-3.6-flash": 0.72,
  "nvidia/nemotron-3-ultra-550b-a55b:free": 0.7,
  "inclusionai/ling-3.2-flash:free": 0.66,
  "openai/gpt-oss-120b": 0.55,
  "command-a-03-2025": 0.5,
  "google/gemma-4-31b-it:free": 0.4,
  "gemini-3.5-flash-lite": 0.32,
  "gemini-3.1-flash-lite": 0.28,
}

export function capabilityPrior(model: FreeModel): number {
  return CAPABILITY_PRIOR[model.model] ?? 0.45
}

export function isLiteModel(model: Pick<FreeModel, "model">): boolean {
  return /lite/i.test(model.model)
}

/** Gemini's free tier allows about 250,000 input tokens per minute per model. */
export function inputTokensPerMinute(model: FreeModel): number | undefined {
  return model.provider === "gemini" ? 250_000 : undefined
}

export function needsMinuteGap(model: FreeModel, tokens: number): boolean {
  const limit = inputTokensPerMinute(model)
  return Boolean(limit && tokens >= limit * 0.8)
}

export function modelFits(model: FreeModel, tokens: number): boolean {
  if (model.tpm && tokens + Math.min(model.maxOutput, 2048) > model.tpm) return false
  return model.contextTokens >= tokens + Math.min(model.maxOutput, 8192)
}

export function jobForText(chars: number): RouterJob {
  return chars > 100_000 ? "review-full" : "review-chunk"
}

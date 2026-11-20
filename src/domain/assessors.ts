import type { AssessorProfile, ProviderId } from "./types.ts"

/**
 * Built-in assessor profiles. Add another by appending to this list, or register
 * a custom OpenAI-compatible profile at runtime with `registerAssessor`.
 * A profile automatically receives a leaderboard column and a ranking sort.
 */
export const builtinAssessors: AssessorProfile[] = [
  {
    id: "grok",
    name: "Grok",
    shortName: "Grok",
    provider: "xai",
    defaultModel: "grok-4.7",
    defaultBaseUrl: "https://api.x.ai/v1",
    blurb: "xAI's Grok, called through the OpenAI-compatible API at api.x.ai. Browser calls are allowed by xAI today.",
    builtin: true,
  },
  {
    id: "gpt",
    name: "GPT",
    shortName: "GPT",
    provider: "openai",
    defaultModel: "gpt-4.1",
    defaultBaseUrl: "https://api.openai.com/v1",
    blurb: "OpenAI GPT. The model id is yours to change. Direct browser calls depend on OpenAI continuing to echo your site's Origin header.",
    builtin: true,
  },
  {
    id: "claude",
    name: "Claude",
    shortName: "Claude",
    provider: "anthropic",
    defaultModel: "claude-sonnet-4-5",
    defaultBaseUrl: "https://api.anthropic.com",
    blurb: "Anthropic Claude. AIR sends the browser-access header Anthropic requires for a page to call the API directly.",
    builtin: true,
  },
  {
    id: "gemini",
    name: "Gemini",
    shortName: "Gemini",
    provider: "gemini",
    defaultModel: "gemini-3.8-flash",
    defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta",
    blurb: "Google Gemini via the Generative Language API. The key stays in the x-goog-api-key header.",
    builtin: true,
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    shortName: "DeepSeek",
    provider: "openrouter",
    defaultModel: "nvidia/nemotron-3-ultra-550b-a55b:free",
    defaultBaseUrl: "https://openrouter.ai/api/v1",
    blurb: "A free OpenRouter model (Nemotron, 1M context). DeepSeek has no :free id on OpenRouter as of 20 Nov 2026, so this column uses a free long-context model instead of a paid id.",
    builtin: true,
  },
  {
    id: "mistral",
    name: "Mistral",
    shortName: "Mistral",
    provider: "openrouter",
    defaultModel: "google/gemma-4-31b-it:free",
    defaultBaseUrl: "https://openrouter.ai/api/v1",
    blurb: "Gemma 4 31B through OpenRouter’s free tier. Mistral’s own API is not free, and the old default was a paid OpenRouter id.",
    builtin: true,
  },
  {
    id: "llama",
    name: "Llama",
    shortName: "Llama",
    provider: "openrouter",
    defaultModel: "inclusionai/ling-3.2-flash:free",
    defaultBaseUrl: "https://openrouter.ai/api/v1",
    blurb: "Ling 3.2 Flash through OpenRouter’s free tier (1M context). The previous Llama id on OpenRouter was paid.",
    builtin: true,
  },
]

const customAssessors: AssessorProfile[] = []

export function registerAssessor(profile: AssessorProfile): void {
  const index = customAssessors.findIndex((item) => item.id === profile.id)
  if (index >= 0) customAssessors[index] = profile
  else customAssessors.push(profile)
}

export function listAssessors(extra: AssessorProfile[] = []): AssessorProfile[] {
  const merged = new Map<string, AssessorProfile>()
  for (const profile of [...builtinAssessors, ...customAssessors, ...extra]) merged.set(profile.id, profile)
  return [...merged.values()]
}

export function assessorById(id: string, extra: AssessorProfile[] = []): AssessorProfile | undefined {
  return listAssessors(extra).find((item) => item.id === id)
}

export function keySlot(profile: AssessorProfile): string {
  return profile.builtin ? profile.provider : profile.id
}

export function providerLabel(provider: ProviderId): string {
  switch (provider) {
    case "openai":
      return "OpenAI"
    case "xai":
      return "xAI"
    case "anthropic":
      return "Anthropic"
    case "gemini":
      return "Google Gemini"
    case "openrouter":
      return "OpenRouter"
    case "groq":
      return "Groq"
    case "cohere":
      return "Cohere"
    case "compatible":
      return "OpenAI-compatible"
  }
}

export const providerOrder: ProviderId[] = ["gemini", "openrouter", "groq", "cohere", "xai", "openai", "anthropic", "compatible"]

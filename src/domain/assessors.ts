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
    defaultModel: "grok-3",
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
    defaultModel: "gemini-2.5-flash",
    defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta",
    blurb: "Google Gemini via the Generative Language API. The key stays in the x-goog-api-key header.",
    builtin: true,
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    shortName: "DeepSeek",
    provider: "openrouter",
    defaultModel: "deepseek/deepseek-chat",
    defaultBaseUrl: "https://openrouter.ai/api/v1",
    blurb: "DeepSeek through OpenRouter, which allows browser calls. The same OpenRouter key covers Mistral and Llama.",
    builtin: true,
  },
  {
    id: "mistral",
    name: "Mistral",
    shortName: "Mistral",
    provider: "openrouter",
    defaultModel: "mistralai/mistral-large",
    defaultBaseUrl: "https://openrouter.ai/api/v1",
    blurb: "Mistral through OpenRouter. Change the model id if you want a smaller or newer Mistral checkpoint.",
    builtin: true,
  },
  {
    id: "llama",
    name: "Llama",
    shortName: "Llama",
    provider: "openrouter",
    defaultModel: "meta-llama/llama-3.3-70b-instruct",
    defaultBaseUrl: "https://openrouter.ai/api/v1",
    blurb: "Llama through OpenRouter. Any other OpenAI-compatible host can be added as a custom profile.",
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
    case "compatible":
      return "OpenAI-compatible"
  }
}

export const providerOrder: ProviderId[] = ["xai", "openai", "anthropic", "gemini", "openrouter", "compatible"]

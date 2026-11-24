import { keySlot } from "../domain/assessors.ts"
import type { AssessorProfile, ProviderId, ProviderSettings } from "../domain/types.ts"

export interface ChatRequest {
  model: string
  system: string
  user: string
  json: boolean
  signal?: AbortSignal
}

export function resolvedModel(profile: AssessorProfile, settings: ProviderSettings): string {
  return settings.models[profile.id]?.trim() || profile.defaultModel
}

export function resolvedBaseUrl(profile: AssessorProfile, settings: ProviderSettings): string {
  const slot = keySlot(profile)
  return (settings.baseUrls[slot] || settings.baseUrls[profile.provider] || profile.defaultBaseUrl).replace(/\/$/, "")
}

export function resolvedKey(profile: AssessorProfile, settings: ProviderSettings): string {
  return settings.keys[keySlot(profile)]?.trim() || settings.keys[profile.provider]?.trim() || ""
}

export function providerErrorMessage(status: number, body: string): string {
  const cleaned = body.replace(/sk-[a-zA-Z0-9_-]{8,}/g, "[redacted]").replace(/\s+/g, " ").trim().slice(0, 360)
  const lower = cleaned.toLowerCase()
  const credits = /credit|billing|spending|payment|insufficient|balance|quota exceeded|out of credits/.test(lower)
  const rate = /rate limit|too many requests|resource_exhausted|daily|per day|retry/.test(lower)
  if (status === 429) return rate ? `The provider hit a rate limit. ${cleaned}` : `The provider rate-limited this request. ${cleaned}`
  if (status === 401) return `The provider rejected that API key. ${cleaned}`
  if (status === 403) {
    if (credits) return `The provider refused the call because of credits or a spending limit. ${cleaned}`
    if (rate) return `The provider hit a rate limit. ${cleaned}`
    if (/api key|permission denied|unregistered|unauthorized/.test(lower)) return `The provider refused that API key. ${cleaned}`
    return `The provider returned 403. ${cleaned}`
  }
  if (status === 404) return `The provider did not recognise that model or URL. ${cleaned}`
  return `The provider returned ${status}. ${cleaned}`
}

async function postJson(url: string, headers: Record<string, string>, body: unknown, signal?: AbortSignal): Promise<string> {
  let response: Response
  try {
    response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal,
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error
    throw new Error(
      "The browser could not complete this call. If the provider blocks cross-origin requests, point the OpenAI-compatible base URL at a host that allows them (OpenRouter and xAI do).",
    )
  }
  const text = await response.text()
  if (!response.ok) throw new Error(providerErrorMessage(response.status, text))
  return text
}

export const OUTPUT_TOKEN_LIMIT = 16384

export function openAiChatBody(request: ChatRequest, maxTokens?: number): Record<string, unknown> {
  return {
    model: request.model,
    temperature: 0.2,
    ...(maxTokens ? { max_tokens: maxTokens } : {}),
    messages: [
      { role: "system", content: request.system },
      { role: "user", content: request.user },
    ],
    ...(request.json ? { response_format: { type: "json_object" } } : {}),
  }
}

export function geminiChatBody(request: ChatRequest, maxTokens = OUTPUT_TOKEN_LIMIT): Record<string, unknown> {
  return {
    systemInstruction: { parts: [{ text: request.system }] },
    contents: [{ role: "user", parts: [{ text: request.user }] }],
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: maxTokens,
      ...(request.json ? { responseMimeType: "application/json" } : {}),
    },
  }
}

export interface ChatCompletion {
  content: string
  model: string
}

function openAiCompatible(baseUrl: string, key: string, request: ChatRequest, extraHeaders: Record<string, string> = {}, maxTokens?: number): Promise<ChatCompletion> {
  return postJson(
    `${baseUrl}/chat/completions`,
    {
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
      ...extraHeaders,
    },
    openAiChatBody(request, maxTokens),
    request.signal,
  ).then((raw) => {
    const parsed = JSON.parse(raw) as { model?: string; choices?: { message?: { content?: string } }[] }
    const content = parsed.choices?.[0]?.message?.content
    if (!content) throw new Error("The provider returned an empty completion.")
    return { content, model: parsed.model || request.model }
  })
}

async function anthropic(baseUrl: string, key: string, request: ChatRequest): Promise<ChatCompletion> {
  const raw = await postJson(
    `${baseUrl}/v1/messages`,
    {
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
      "content-type": "application/json",
    },
    {
      model: request.model,
      max_tokens: OUTPUT_TOKEN_LIMIT,
      temperature: 0.2,
      system: request.system,
      messages: [{ role: "user", content: request.user }],
    },
    request.signal,
  )
  const parsed = JSON.parse(raw) as { model?: string; content?: { type?: string; text?: string }[] }
  const text = parsed.content?.find((block) => block.type === "text")?.text ?? parsed.content?.[0]?.text
  if (!text) throw new Error("Claude returned an empty message.")
  return { content: text, model: parsed.model || request.model }
}

async function gemini(baseUrl: string, key: string, request: ChatRequest): Promise<ChatCompletion> {
  const raw = await postJson(
    `${baseUrl}/models/${encodeURIComponent(request.model)}:generateContent`,
    {
      "x-goog-api-key": key,
      "content-type": "application/json",
    },
    geminiChatBody(request),
    request.signal,
  )
  const parsed = JSON.parse(raw) as { modelVersion?: string; model?: string; candidates?: { content?: { parts?: { text?: string }[] } }[] }
  const text = parsed.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("")
  if (!text) throw new Error("Gemini returned an empty message.")
  return { content: text, model: parsed.modelVersion || parsed.model || request.model }
}

export async function completeChat(profile: AssessorProfile, settings: ProviderSettings, request: ChatRequest): Promise<ChatCompletion> {
  const key = resolvedKey(profile, settings)
  if (!key) throw new Error(`Add a ${profile.name} API key first, or switch on demo mode.`)
  const baseUrl = resolvedBaseUrl(profile, settings)
  const model = request.model || resolvedModel(profile, settings)
  const ready = { ...request, model }
  if (profile.provider === "anthropic") return anthropic(baseUrl, key, ready)
  if (profile.provider === "gemini") return gemini(baseUrl, key, ready)
  const headers: Record<string, string> =
    profile.provider === "openrouter"
      ? { "HTTP-Referer": "https://air-peer-review.local", "X-Title": "AIR Peer Review" }
      : {}
  return openAiCompatible(baseUrl, key, ready, headers, profile.provider === "xai" ? OUTPUT_TOKEN_LIMIT : undefined)
}

export interface KeyCheckTarget {
  provider: ProviderId
  baseUrl: string
  key: string
}

/**
 * One cheap authenticated request. Gemini, xAI, OpenAI, and Anthropic use the models list.
 * OpenRouter's models list is public, so a bad key would look valid. Its key endpoint is the cheap check and does not generate text.
 */
export function keyCheckRequest(target: KeyCheckTarget): { url: string; headers: Record<string, string> } {
  const base = target.baseUrl.replace(/\/$/, "")
  const key = target.key.trim()
  if (target.provider === "gemini") return { url: `${base}/models`, headers: { "x-goog-api-key": key } }
  if (target.provider === "anthropic") {
    return {
      url: `${base}/v1/models`,
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
    }
  }
  if (target.provider === "openrouter") {
    return {
      url: `${base}/key`,
      headers: {
        authorization: `Bearer ${key}`,
        "HTTP-Referer": "https://air-peer-review.local",
        "X-Title": "AIR Peer Review",
      },
    }
  }
  return { url: `${base}/models`, headers: { authorization: `Bearer ${key}` } }
}

export function plainKeyCheckMessage(status: number, body: string): { ok: true; message: string } | { ok: false; message: string } {
  if (status >= 200 && status < 300) return { ok: true, message: "Key accepted. It stays in this browser." }
  const lower = body.toLowerCase()
  const quota = /quota|resource_exhausted|billing|credit|insufficient|spending limit|exceeded your current quota/.test(lower)
  const rate = status === 429 || /rate limit|too many requests/.test(lower)
  const invalid =
    status === 401 ||
    /api key not valid|invalid api key|incorrect api key|unauthorized|permission denied/.test(lower) ||
    (status === 403 && /api key|unauthor|permission|invalid/.test(lower))
  if (quota) return { ok: false, message: "This key has reached its quota. Try again later, or use the on-device review." }
  if (rate) return { ok: false, message: "The provider is rate-limiting checks right now. Wait a moment and try again." }
  if (invalid) return { ok: false, message: "That key was not accepted. Copy it again, with no extra spaces." }
  return { ok: false, message: "The provider did not accept this check. Wait a moment and try again." }
}

/** Asks the provider whether this key is accepted. Does not run a model. */
export async function validateApiKey(target: KeyCheckTarget): Promise<{ ok: true; message: string } | { ok: false; message: string }> {
  const key = target.key.trim()
  if (!key) return { ok: false, message: "Paste a key first." }
  const request = keyCheckRequest({ ...target, key })
  let response: Response
  try {
    response = await fetch(request.url, { method: "GET", headers: request.headers })
  } catch {
    return { ok: false, message: "The browser could not reach the provider. Check the connection and try again." }
  }
  const body = await response.text()
  return plainKeyCheckMessage(response.status, body)
}

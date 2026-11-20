import type { ProviderId } from "../domain/types.ts"
import { providerErrorMessage } from "./providers.ts"

export type KeyStatus = "works" | "quota" | "rejected" | "credits" | "blocked" | "missing"

export interface KeyTestResult {
  provider: ProviderId
  status: KeyStatus
  detail: string
}

export const AIR_SITE_URL = "https://morgansmart-alt.github.io/open-ai-peer-review/"

const PROBES: Record<string, { url: string; model: string; openai: boolean }> = {
  gemini: {
    url: "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent",
    model: "gemini-3.5-flash-lite",
    openai: false,
  },
  openrouter: {
    url: "https://openrouter.ai/api/v1/chat/completions",
    model: "google/gemma-4-31b-it:free",
    openai: true,
  },
  groq: {
    url: "https://api.groq.com/openai/v1/chat/completions",
    model: "openai/gpt-oss-120b",
    openai: true,
  },
  cohere: {
    url: "https://api.cohere.ai/compatibility/v1/chat/completions",
    model: "command-a-03-2025",
    openai: true,
  },
}

function statusFrom(status: number, body: string): KeyStatus {
  const message = providerErrorMessage(status, body).toLowerCase()
  if (status >= 200 && status < 300) return "works"
  if (message.includes("spending") || message.includes("credit")) return "credits"
  if (message.includes("rate limit") || message.includes("quota")) return "quota"
  if (status === 401 || message.includes("api key")) return "rejected"
  if (status === 0) return "blocked"
  return "blocked"
}

export function describeKeyStatus(result: KeyTestResult): string {
  if (result.status === "works") return "Works"
  if (result.status === "quota") return "Quota used"
  if (result.status === "rejected") return "Key rejected"
  if (result.status === "credits") return "Needs credits"
  if (result.status === "missing") return "No key yet"
  return "Unsupported in this browser"
}

export async function testProviderKey(
  provider: ProviderId,
  key: string,
  fetchImpl: typeof fetch = fetch,
): Promise<KeyTestResult> {
  const probe = PROBES[provider]
  if (!key.trim()) return { provider, status: "missing", detail: "Paste a key first." }
  if (!probe) return { provider, status: "blocked", detail: "This provider is not part of the free router." }
  const headers: Record<string, string> = { "content-type": "application/json" }
  let body: unknown
  if (probe.openai) {
    headers.authorization = `Bearer ${key.trim()}`
    if (provider === "openrouter") {
      headers["HTTP-Referer"] = AIR_SITE_URL
      headers["X-Title"] = "Open AI Peer Review"
    }
    body = {
      model: probe.model,
      max_tokens: 20,
      messages: [{ role: "user", content: 'Reply with {"ok":true} only.' }],
    }
  } else {
    headers["x-goog-api-key"] = key.trim()
    body = {
      contents: [{ role: "user", parts: [{ text: 'Reply with {"ok":true} only.' }] }],
      generationConfig: { maxOutputTokens: 20 },
    }
  }
  try {
    const response = await fetchImpl(probe.url, { method: "POST", headers, body: JSON.stringify(body) })
    const text = await response.text()
    const status = statusFrom(response.status, text)
    return { provider, status, detail: providerErrorMessage(response.status, response.ok ? "ok" : text) }
  } catch {
    return { provider, status: "blocked", detail: "The browser could not reach this provider." }
  }
}

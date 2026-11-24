import { WEB_CHAT_SUBMIT_URL } from "./submission.ts"

/** The anon key is public. The service-role key stays on the server. */
export function webChatSubmitHeaders(): Record<string, string> {
  const anon = import.meta.env.VITE_SUPABASE_ANON_KEY
  const key = typeof anon === "string" ? anon.trim() : ""
  return {
    "content-type": "application/json",
    ...(key ? { apikey: key, authorization: `Bearer ${key}` } : {}),
  }
}

export async function postWebChatSubmission(body: unknown): Promise<{ ok: boolean; status: number; error?: string; duplicate?: boolean }> {
  const response = await fetch(WEB_CHAT_SUBMIT_URL, {
    method: "POST",
    headers: webChatSubmitHeaders(),
    body: JSON.stringify(body),
  })
  const payload = (await response.json().catch(() => null)) as { error?: string; duplicate?: boolean } | null
  return { ok: response.ok, status: response.status, error: payload?.error, duplicate: payload?.duplicate }
}

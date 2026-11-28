import { WEB_CHAT_SUBMIT_URL } from "./submission.ts"

/** The anon key is public. The service-role key stays on the server. */
export function leaderboardRequest(anonKey: string | undefined): { ok: true; headers: Record<string, string> } | { ok: false; error: string } {
  const key = typeof anonKey === "string" ? anonKey.trim() : ""
  if (!key) return { ok: false, error: "This extension build has no leaderboard key, so the score was not sent." }
  return {
    ok: true,
    headers: {
      "content-type": "application/json",
      apikey: key,
      authorization: `Bearer ${key}`,
    },
  }
}

export function webChatSubmitHeaders(): Record<string, string> {
  const ready = leaderboardRequest(import.meta.env.VITE_SUPABASE_ANON_KEY)
  return ready.ok ? ready.headers : { "content-type": "application/json" }
}

export async function postWebChatSubmission(body: unknown): Promise<{ ok: boolean; status: number; error?: string; duplicate?: boolean }> {
  const ready = leaderboardRequest(import.meta.env.VITE_SUPABASE_ANON_KEY)
  if (!ready.ok) return { ok: false, status: 0, error: ready.error }
  const response = await fetch(WEB_CHAT_SUBMIT_URL, {
    method: "POST",
    headers: ready.headers,
    body: JSON.stringify(body),
  })
  const payload = (await response.json().catch(() => null)) as { error?: string; message?: string; duplicate?: boolean } | null
  const error = payload?.error || payload?.message
  return { ok: response.ok, status: response.status, error, duplicate: payload?.duplicate }
}

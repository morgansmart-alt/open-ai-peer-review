// Deploy with: supabase functions deploy submit-web-chat --no-verify-jwt
// Run supabase/migrations/20261122100000_web_chat_submissions.sql first.
// The service role key is injected by Supabase. Do not put it in the extension or the website.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1"
import { decideWebChatSubmission } from "./submission.ts"

const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, content-type, apikey",
  "access-control-allow-methods": "POST, OPTIONS",
  "content-type": "application/json",
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: cors })
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors })
  if (req.method !== "POST") return json(405, { error: "Send a score with POST." })
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return json(400, { error: "The body was not JSON." })
  }
  const url = Deno.env.get("SUPABASE_URL") ?? ""
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  if (!url || !key) return json(500, { error: "The submission service is not configured." })
  const admin = createClient(url, key, { auth: { persistSession: false } })
  const since = new Date(Date.now() - 10 * 60 * 1000).toISOString()
  const recent = await admin.from("air_web_chat").select("id", { count: "exact", head: true }).gte("created_at", since)
  const decision = decideWebChatSubmission(body, { recentCount: recent.count ?? 0, existingIds: [] })
  if (!decision.ok) return json(decision.status, { error: decision.error })
  const found = await admin.from("air_web_chat").select("id").eq("id", decision.row.id).maybeSingle()
  if (found.data) return json(200, { ok: true, duplicate: true, id: decision.row.id })
  const inserted = await admin.from("air_web_chat").insert(decision.row)
  if (inserted.error) {
    if (/duplicate|unique/i.test(inserted.error.message)) return json(200, { ok: true, duplicate: true, id: decision.row.id })
    return json(400, { error: "The board did not store that score." })
  }
  return json(201, { ok: true, id: decision.row.id })
})

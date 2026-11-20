// Archive a private share link into air_private_context.snapshot_text.
// Deploy with the Supabase CLI. Do not call a public archive.
// Required env (injected for a hosted function): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.

const MAX_BYTES = 2_000_000
const TIMEOUT_MS = 10_000
const MAX_HOPS = 3

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Content-Type": "application/json",
}

function allowed(url: URL): boolean {
  if (url.protocol !== "https:" || url.username || url.password) return false
  const host = url.hostname.replace(/^www\./, "").toLowerCase()
  const path = url.pathname.toLowerCase()
  if (host === "share.google") return path.startsWith("/aimode")
  if (host === "chatgpt.com" || host.endsWith(".chatgpt.com") || host === "chat.openai.com") return true
  if (host === "claude.ai" || host.endsWith(".claude.ai")) return true
  if (host === "gemini.google.com" || host === "aistudio.google.com") return true
  if (host === "grok.com" || host.endsWith(".grok.com") || host === "grok.x.ai") return true
  return false
}

function readableText(html: string): string {
  const withoutCode = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
  const decoded = withoutCode
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
  return decoded.replace(/\s+/g, " ").trim().slice(0, 100_000)
}

async function readCapped(response: Response): Promise<string | null> {
  const advertised = Number(response.headers.get("content-length") || "0")
  if (advertised > MAX_BYTES) return null
  const reader = response.body?.getReader()
  if (!reader) return null
  const chunks: Uint8Array[] = []
  let received = 0
  while (true) {
    const step = await reader.read()
    if (step.done) break
    received += step.value.byteLength
    if (received > MAX_BYTES) {
      await reader.cancel()
      return null
    }
    chunks.push(step.value)
  }
  const bytes = new Uint8Array(received)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder().decode(bytes)
}

async function fetchShareText(start: URL): Promise<string | null> {
  let current = start
  for (let hop = 0; hop < MAX_HOPS; hop += 1) {
    const response = await fetch(current, {
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { "user-agent": "AIR-archive/1.0", accept: "text/html, text/plain" },
    })
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location")
      if (!location) return null
      const next = new URL(location, current)
      if (!allowed(next)) return null
      current = next
      continue
    }
    if (!response.ok) return null
    const type = response.headers.get("content-type") || ""
    if (!type.includes("text/html") && !type.includes("text/plain") && type !== "") return null
    const raw = await readCapped(response)
    if (!raw) return null
    const text = readableText(raw)
    return text.length > 0 ? text : null
  }
  return null
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors })
  if (request.method !== "POST") return new Response(JSON.stringify({ error: "POST only" }), { status: 405, headers: cors })
  const supabaseUrl = Deno.env.get("SUPABASE_URL")
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
  if (!supabaseUrl || !serviceKey) {
    return new Response(JSON.stringify({ error: "Archive is not configured." }), { status: 500, headers: cors })
  }
  let id = ""
  try {
    const body = (await request.json()) as { id?: string }
    id = body.id?.trim() || ""
  } catch {
    id = ""
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    return new Response(JSON.stringify({ error: "A row id is required." }), { status: 400, headers: cors })
  }
  const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` }
  const existing = await fetch(`${supabaseUrl}/rest/v1/air_private_context?id=eq.${id}&select=id,link_url,snapshot_status`, { headers })
  if (!existing.ok) return new Response(JSON.stringify({ snapshot_status: "fetch_failed" }), { status: 200, headers: cors })
  const rows = (await existing.json()) as { id: string; link_url: string; snapshot_status: string | null }[]
  const row = rows[0]
  if (!row) return new Response(JSON.stringify({ error: "That archive row was not found." }), { status: 404, headers: cors })
  if (row.snapshot_status === "archived") {
    return new Response(JSON.stringify({ id, snapshot_status: "archived" }), { headers: cors })
  }
  let status: "archived" | "fetch_failed" = "fetch_failed"
  let text: string | null = null
  try {
    const target = new URL(row.link_url)
    if (allowed(target)) {
      text = await fetchShareText(target)
      if (text) status = "archived"
    }
  } catch {
    status = "fetch_failed"
    text = null
  }
  await fetch(`${supabaseUrl}/rest/v1/air_private_context?id=eq.${id}`, {
    method: "PATCH",
    headers: { ...headers, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({ snapshot_text: text, snapshot_status: status }),
  })
  return new Response(JSON.stringify({ id, snapshot_status: status }), { headers: cors })
})

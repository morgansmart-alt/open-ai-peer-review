// Opt-in public review requests for m/air-peer-review.
// MOLTBOOK_API_KEY is read only from the function environment. It is never
// returned, logged, or sent anywhere except https://www.moltbook.com/api/v1/*.
// Deploy: supabase functions deploy moltbook-review
// Secret: Dashboard → Project Settings → Edge Functions → Secrets
//     or: supabase secrets set MOLTBOOK_API_KEY=...

import {
  assertMoltbookPath,
  assertPublicDraft,
  buildPublicPost,
  gatePost,
  moltbookPostRowId,
  MOLTBOOK_SUBMOLT,
  oldestWaiting,
  publishDraft,
  pullPostComments,
  readAgentCreatedAt,
  redactSecrets,
  type HttpClient,
  type PublicPostDraft,
  type QueueRow,
} from "../../../src/domain/moltbook.ts"

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Content-Type": "application/json",
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors })
  if (request.method !== "POST") return json({ ok: false, message: "POST only." }, 405)
  const supabaseUrl = Deno.env.get("SUPABASE_URL")?.trim() ?? ""
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim() ?? ""
  const moltbookKey = Deno.env.get("MOLTBOOK_API_KEY")?.trim() ?? ""
  if (!supabaseUrl || !serviceKey) return json({ ok: false, unavailable: true, message: "The shared board is not configured for Moltbook." }, 503)
  let body: Record<string, unknown> = {}
  try {
    const text = await request.text()
    if (text.length > 20_000) return json({ ok: false, message: "That request is too large." }, 400)
    const parsed = JSON.parse(text) as unknown
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return json({ ok: false, message: "A JSON body is required." }, 400)
    body = parsed as Record<string, unknown>
  } catch {
    return json({ ok: false, message: "A JSON body is required." }, 400)
  }
  const action = body.action
  if (action !== "queue" && action !== "status" && action !== "pull") return json({ ok: false, message: "Unknown action." }, 400)
  try {
    const facts = readFacts(body)
    const draft = buildPublicPost(facts)
    const recordVersion = cleanVersion(body.recordVersion)
    const recordId = facts.versionDoi.match(/(\d+)$/)?.[1] ?? ""
    const rowId = moltbookPostRowId(facts.versionDoi, recordVersion)
    if (action === "status") {
      const post = await selectOne(supabaseUrl, serviceKey, facts.versionDoi, recordVersion)
      const comments = post ? await selectComments(supabaseUrl, serviceKey, post.id) : []
      return json({ ok: true, post: post ? publicPost(post) : null, comments, message: post ? "Status loaded." : "No community request yet." })
    }
    if (!moltbookKey) return json({ ok: false, unavailable: true, message: "Moltbook is not configured on this board yet. Nothing was posted." }, 503)
    const transport = moltbookTransport(moltbookKey)
    if (action === "pull") return json(await pull(supabaseUrl, serviceKey, transport, facts.versionDoi, recordVersion, recordId))
    return json(await queue(supabaseUrl, serviceKey, transport, { rowId, recordId, recordVersion, draft, versionDoi: facts.versionDoi, conceptDoi: facts.conceptDoi, airUrl: facts.airPaperUrl }))
  } catch (error) {
    const message = redactSecrets(error instanceof Error ? error.message : "The community request was refused.")
    if (message === "UNAVAILABLE") {
      return json({ ok: false, unavailable: true, message: "Community review is not on this board yet. Nothing was posted." }, 503)
    }
    return json({ ok: false, message }, 400)
  }
})

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: cors })
}

function readFacts(body: Record<string, unknown>) {
  return {
    title: typeof body.title === "string" ? body.title : "",
    authors: Array.isArray(body.authors) ? body.authors.filter((item): item is string => typeof item === "string") : [],
    versionDoi: typeof body.versionDoi === "string" ? body.versionDoi : "",
    conceptDoi: typeof body.conceptDoi === "string" ? body.conceptDoi : "",
    airPaperUrl: typeof body.airPaperUrl === "string" ? body.airPaperUrl : "",
  }
}

function cleanVersion(value: unknown): string {
  if (typeof value !== "string") throw new Error("A record version is required.")
  const text = value.trim()
  if (!text || text.length > 200 || /moltbook_|bearer\s|api[_ -]?key|chatgpt\.com|claude\.ai/i.test(text)) {
    throw new Error("That record version cannot be posted.")
  }
  return text
}

function moltbookTransport(key: string): HttpClient {
  return {
    async request(url, init) {
      assertMoltbookPath(url)
      const response = await fetch(url, {
        method: init.method,
        redirect: "manual",
        signal: AbortSignal.timeout(15_000),
        headers: {
          Authorization: `Bearer ${key}`,
          Accept: "application/json",
          ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
        },
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
      })
      const headers: Record<string, string> = {}
      for (const name of ["retry-after", "x-ratelimit-limit", "x-ratelimit-remaining", "x-ratelimit-reset"]) {
        const value = response.headers.get(name)
        if (value) headers[name] = value
      }
      const text = (await response.text()).slice(0, 500_000)
      let body: unknown = null
      if (text) {
        try {
          body = JSON.parse(text)
        } catch {
          body = null
        }
      }
      return { status: response.status, headers, body }
    },
  }
}

interface PostRow {
  id: string
  doi: string
  record_id: string
  record_version: string
  concept_doi: string
  title: string
  content: string
  air_url: string
  status: QueueRow["status"]
  moltbook_post_id: string | null
  moltbook_url: string | null
  retry_after: string | null
  last_error: string | null
  last_pulled_at: string | null
  created_at: string
  updated_at: string
  published_at: string | null
}

function publicPost(row: PostRow) {
  return {
    id: row.id,
    doi: row.doi,
    recordId: row.record_id,
    recordVersion: row.record_version,
    conceptDoi: row.concept_doi,
    title: row.title,
    content: row.content,
    airUrl: row.air_url,
    status: row.status,
    moltbookPostId: row.moltbook_post_id,
    moltbookUrl: row.moltbook_url,
    retryAfter: row.retry_after,
    lastError: row.last_error,
    publishedAt: row.published_at,
    submoltUrl: "https://www.moltbook.com/m/air-peer-review",
  }
}

function headers(serviceKey: string, prefer?: string): HeadersInit {
  return {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    "Content-Type": "application/json",
    ...(prefer ? { Prefer: prefer } : {}),
  }
}

async function selectOne(url: string, serviceKey: string, doi: string, recordVersion: string): Promise<PostRow | null> {
  const path = `air_moltbook_posts?doi=eq.${encodeURIComponent(doi)}&record_version=eq.${encodeURIComponent(recordVersion)}&select=*`
  const rows = await restGet<PostRow>(url, serviceKey, path)
  return rows[0] ?? null
}

async function selectComments(url: string, serviceKey: string, postId: string) {
  const path = `air_moltbook_comments?post_id=eq.${encodeURIComponent(postId)}&select=id,agent_name,is_claimed,sanitized_content,flags,cites_publication,criterion_id,discarded,candidate,comment_created_at,moltbook_comment_id&order=ingested_at.asc&limit=80`
  const rows = await restGet<Record<string, unknown>>(url, serviceKey, path)
  return rows.map((row) => ({
    id: typeof row.id === "string" ? row.id : "",
    agentName: typeof row.agent_name === "string" ? row.agent_name : null,
    isClaimed: typeof row.is_claimed === "boolean" ? row.is_claimed : null,
    sanitizedContent: typeof row.sanitized_content === "string" ? row.sanitized_content : "",
    flags: Array.isArray(row.flags) ? row.flags.filter((item): item is string => typeof item === "string") : [],
    citesPublication: row.cites_publication === true,
    criterionId: typeof row.criterion_id === "string" ? row.criterion_id : null,
    discarded: row.discarded === true,
    candidate: row.candidate === true,
    commentCreatedAt: typeof row.comment_created_at === "string" ? row.comment_created_at : null,
    moltbookCommentId: typeof row.moltbook_comment_id === "string" ? row.moltbook_comment_id : null,
  }))
}

async function restGet<T>(url: string, serviceKey: string, path: string): Promise<T[]> {
  const response = await fetch(`${url}/rest/v1/${path}`, { headers: headers(serviceKey) })
  if (response.status === 404) throw new Error("UNAVAILABLE")
  if (!response.ok) throw new Error("The community table could not be read.")
  const data = (await response.json()) as unknown
  return Array.isArray(data) ? (data as T[]) : []
}

async function restSend(url: string, serviceKey: string, path: string, method: "POST" | "PATCH", body: unknown, prefer: string): Promise<void> {
  const response = await fetch(`${url}/rest/v1/${path}`, {
    method,
    headers: headers(serviceKey, prefer),
    body: JSON.stringify(body),
  })
  if (response.status === 404) throw new Error("UNAVAILABLE")
  if (!response.ok) throw new Error("The community request could not be saved.")
}

async function queue(
  url: string,
  serviceKey: string,
  transport: HttpClient,
  input: { rowId: string; recordId: string; recordVersion: string; draft: PublicPostDraft; versionDoi: string; conceptDoi: string; airUrl: string },
): Promise<Record<string, unknown>> {
  assertPublicDraft(input.draft)
  let row = await selectOne(url, serviceKey, input.versionDoi, input.recordVersion)
  if (row?.status === "published" || (row?.status === "verification_pending" && row.moltbook_post_id)) {
    const comments = await selectComments(url, serviceKey, row.id)
    return { ok: true, post: publicPost(row), comments, message: row.status === "published" ? "This version is already on m/air-peer-review." : "Verification is still pending. AIR will not create a second post." }
  }
  if (row?.status === "publishing" && Date.now() - Date.parse(row.updated_at) < 120_000 && !row.moltbook_post_id) {
    return { ok: true, post: publicPost(row), comments: [], message: "A post is already being sent." }
  }
  if (!row) {
    await restSend(url, serviceKey, "air_moltbook_posts", "POST", storedRow(input, "queued", null), "return=minimal")
    row = await selectOne(url, serviceKey, input.versionDoi, input.recordVersion)
  } else {
    await restSend(
      url,
      serviceKey,
      `air_moltbook_posts?id=eq.${encodeURIComponent(row.id)}`,
      "PATCH",
      { title: input.draft.title, content: input.draft.content, air_url: input.airUrl, status: "queued", updated_at: new Date().toISOString(), last_error: null },
      "return=minimal",
    )
    row = { ...row, title: input.draft.title, content: input.draft.content, status: "queued" }
  }
  if (!row) return { ok: false, unavailable: true, message: "The community table is not available yet. Nothing was posted." }
  const agent = await transport.request("https://www.moltbook.com/api/v1/agents/me", { method: "GET" })
  if (agent.status === 401 || agent.status === 403) {
    await mark(url, serviceKey, row.id, { status: "failed", last_error: "Moltbook did not accept the server credential. Nothing was posted." })
    const saved = await selectOne(url, serviceKey, input.versionDoi, input.recordVersion)
    return { ok: false, post: saved ? publicPost(saved) : null, comments: [], message: "Moltbook did not accept the server credential. Nothing was posted." }
  }
  const agentCreatedAt = agent.status >= 200 && agent.status < 300 ? readAgentCreatedAt(agent.body) : null
  const published = await restGet<{ published_at: string | null }>(url, serviceKey, "air_moltbook_posts?status=eq.published&select=published_at&order=published_at.desc&limit=1")
  const lastPublishedAt = published[0]?.published_at ?? null
  const waitingRows = await restGet<PostRow>(url, serviceKey, "air_moltbook_posts?status=in.(queued,cooldown,failed)&select=id,created_at,status&order=created_at.asc&limit=20")
  const waiting: QueueRow[] = waitingRows.map((item) => ({ id: item.id, createdAt: item.created_at, status: item.status }))
  if (!waiting.some((item) => item.id === row?.id)) waiting.push({ id: row.id, createdAt: row.created_at, status: "queued" })
  const next = oldestWaiting(waiting)
  const retryAfterSeconds = row.retry_after ? Math.max(0, Math.ceil((Date.parse(row.retry_after) - Date.now()) / 1000)) : null
  const now = Date.now()
  const gate = gatePost({
    now,
    lastPublishedAt,
    agentCreatedAt,
    retryAfterSeconds: retryAfterSeconds && retryAfterSeconds > 0 ? retryAfterSeconds : null,
    rateLimitRemaining: null,
    rateLimitResetAt: null,
  })
  if (!gate.publish || !next) {
    await mark(url, serviceKey, row.id, { status: "cooldown", retry_after: gate.notBefore, last_error: gate.reason })
    const saved = await selectOne(url, serviceKey, input.versionDoi, input.recordVersion)
    return { ok: true, post: saved ? publicPost(saved) : null, comments: [], message: gate.reason }
  }
  if (next.id !== row.id) {
    await mark(url, serviceKey, row.id, { status: "queued", retry_after: gate.notBefore, last_error: "An earlier community request is ahead of this one." })
    const ahead = waitingRows.find((item) => item.id === next.id)
    if (ahead) await publishStored(url, serviceKey, transport, ahead.id, now, lastPublishedAt, agentCreatedAt)
    const saved = await selectOne(url, serviceKey, input.versionDoi, input.recordVersion)
    return { ok: true, post: saved ? publicPost(saved) : null, comments: [], message: "An earlier community request was sent. This version stays queued." }
  }
  await mark(url, serviceKey, row.id, { status: "publishing", last_error: null })
  const outcome = await publishDraft(transport, {
    now,
    lastPublishedAt,
    agentCreatedAt,
    retryAfterSeconds: null,
    rateLimitRemaining: null,
    rateLimitResetAt: null,
    draft: { submolt_name: MOLTBOOK_SUBMOLT, type: "text", title: row.title, content: row.content },
  })
  const retryAt = outcome.retryAfterSeconds && outcome.retryAfterSeconds > 0 ? new Date(now + outcome.retryAfterSeconds * 1000).toISOString() : outcome.status === "cooldown" ? gate.notBefore : null
  await mark(url, serviceKey, row.id, {
    status: outcome.status === "queued" ? "cooldown" : outcome.status,
    moltbook_post_id: outcome.moltbookPostId,
    moltbook_url: outcome.moltbookUrl,
    retry_after: retryAt,
    last_error: outcome.status === "published" ? null : outcome.message,
    published_at: outcome.status === "published" ? new Date(now).toISOString() : null,
  })
  const saved = await selectOne(url, serviceKey, input.versionDoi, input.recordVersion)
  return { ok: true, post: saved ? publicPost(saved) : null, comments: [], message: outcome.message }
}

async function publishStored(url: string, serviceKey: string, transport: HttpClient, id: string, now: number, lastPublishedAt: string | null, agentCreatedAt: string | null): Promise<void> {
  const rows = await restGet<PostRow>(url, serviceKey, `air_moltbook_posts?id=eq.${encodeURIComponent(id)}&select=*`)
  const row = rows[0]
  if (!row || row.moltbook_post_id) return
  const draft: PublicPostDraft = { submolt_name: MOLTBOOK_SUBMOLT, type: "text", title: row.title, content: row.content }
  try {
    assertPublicDraft(draft)
  } catch {
    await mark(url, serviceKey, row.id, { status: "failed", last_error: "The stored post was not public-only, so it was not sent." })
    return
  }
  const outcome = await publishDraft(transport, {
    now,
    lastPublishedAt,
    agentCreatedAt,
    retryAfterSeconds: null,
    rateLimitRemaining: null,
    rateLimitResetAt: null,
    draft,
  })
  await mark(url, serviceKey, row.id, {
    status: outcome.status === "queued" ? "cooldown" : outcome.status,
    moltbook_post_id: outcome.moltbookPostId,
    moltbook_url: outcome.moltbookUrl,
    last_error: outcome.status === "published" ? null : outcome.message,
    published_at: outcome.status === "published" ? new Date(now).toISOString() : row.published_at,
  })
}

async function pull(url: string, serviceKey: string, transport: HttpClient, doi: string, recordVersion: string, recordId: string): Promise<Record<string, unknown>> {
  const post = await selectOne(url, serviceKey, doi, recordVersion)
  if (!post?.moltbook_post_id || post.status !== "published") {
    return { ok: true, post: post ? publicPost(post) : null, comments: post ? await selectComments(url, serviceKey, post.id) : [], message: "Replies can be read after the post is live." }
  }
  const recent = await restGet<{ last_pulled_at: string | null }>(url, serviceKey, "air_moltbook_posts?select=last_pulled_at&order=last_pulled_at.desc.nullslast&limit=1")
  const outcome = await pullPostComments(transport, {
    now: Date.now(),
    postId: post.moltbook_post_id,
    lastPulledAt: post.last_pulled_at,
    agentLastPulledAt: recent[0]?.last_pulled_at ?? null,
    versionDoi: doi,
    conceptDoi: post.concept_doi,
    recordId,
  })
  if (outcome.called) {
    await mark(url, serviceKey, post.id, { last_pulled_at: new Date().toISOString(), retry_after: outcome.retryAfterSeconds ? new Date(Date.now() + outcome.retryAfterSeconds * 1000).toISOString() : post.retry_after })
  }
  if (outcome.pulled && outcome.comments.length > 0) {
    await restSend(
      url,
      serviceKey,
      "air_moltbook_comments?on_conflict=id",
      "POST",
      outcome.comments.map((comment) => ({
        id: comment.rowId,
        post_id: post.id,
        moltbook_post_id: post.moltbook_post_id,
        moltbook_comment_id: comment.moltbookCommentId,
        agent_name: comment.agentName,
        is_claimed: comment.isClaimed,
        sanitized_content: comment.displayContent,
        flags: comment.flags,
        cites_publication: comment.citesPublication,
        criterion_id: comment.criterionId,
        discarded: comment.discarded,
        candidate: comment.candidate,
        comment_created_at: comment.createdAt,
      })),
      "resolution=merge-duplicates,return=minimal",
    )
  }
  const comments = await selectComments(url, serviceKey, post.id)
  const saved = await selectOne(url, serviceKey, doi, recordVersion)
  return { ok: true, post: saved ? publicPost(saved) : publicPost(post), comments, message: outcome.message }
}

function storedRow(input: { rowId: string; recordId: string; recordVersion: string; draft: PublicPostDraft; versionDoi: string; conceptDoi: string; airUrl: string }, status: string, lastError: string | null) {
  return {
    id: input.rowId,
    doi: input.versionDoi,
    record_id: input.recordId,
    record_version: input.recordVersion,
    concept_doi: input.conceptDoi,
    title: input.draft.title,
    content: input.draft.content,
    air_url: input.airUrl,
    status,
    last_error: lastError,
  }
}

async function mark(url: string, serviceKey: string, id: string, patch: Record<string, unknown>): Promise<void> {
  const safe: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const [key, value] of Object.entries(patch)) {
    safe[key] = key === "last_error" && typeof value === "string" ? redactSecrets(value) : value
  }
  await restSend(url, serviceKey, `air_moltbook_posts?id=eq.${encodeURIComponent(id)}`, "PATCH", safe, "return=minimal")
}

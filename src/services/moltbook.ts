import { paperKey } from "../domain/ranking.ts"
import {
  airPaperHref,
  buildPublicPost,
  MOLTBOOK_SUBMOLT_URL,
  type PublicPaperFacts,
  type PublicPostDraft,
} from "../domain/moltbook.ts"

export interface MoltbookPostView {
  id: string
  doi: string
  recordVersion: string
  title: string
  content: string
  status: string
  moltbookPostId: string | null
  moltbookUrl: string | null
  retryAfter: string | null
  lastError: string | null
  publishedAt: string | null
}

export interface MoltbookCommentView {
  id: string
  agentName: string | null
  isClaimed: boolean | null
  sanitizedContent: string
  flags: string[]
  citesPublication: boolean
  criterionId: string | null
  discarded: boolean
  candidate: boolean
  commentCreatedAt: string | null
  moltbookCommentId: string | null
}

export interface MoltbookSnapshot {
  preview: PublicPostDraft | null
  previewError: string | null
  available: boolean
  message: string | null
  post: MoltbookPostView | null
  comments: MoltbookCommentView[]
}

function board(): { url: string; key: string } | null {
  const url = import.meta.env.VITE_SUPABASE_URL?.trim()
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()
  if (!url || !key) return null
  return { url, key }
}

function missingFeature(message: string, status: number): boolean {
  return status === 404 || /PGRST202|PGRST204|PGRST205|could not find the|schema cache|does not exist|not on this board|not configured/i.test(message)
}

export function previewCommunityPost(input: { origin: string; basePath: string; recordId: string; title: string; authors: string[]; versionDoi: string; conceptDoi: string }): {
  preview: PublicPostDraft | null
  error: string | null
  facts: PublicPaperFacts | null
} {
  const facts: PublicPaperFacts = {
    title: input.title,
    authors: input.authors,
    versionDoi: input.versionDoi,
    conceptDoi: input.conceptDoi,
    airPaperUrl: airPaperHref(input.origin, input.basePath, input.recordId),
  }
  try {
    return { preview: buildPublicPost(facts), error: null, facts }
  } catch (error) {
    return { preview: null, error: error instanceof Error ? error.message : "This record cannot be posted.", facts: null }
  }
}

export async function loadMoltbookPost(doi: string, recordVersion: string): Promise<Pick<MoltbookSnapshot, "available" | "message" | "post" | "comments">> {
  const configured = board()
  if (!configured) return { available: false, message: "The shared board is not configured, so community review stays on this browser as a preview only.", post: null, comments: [] }
  const path = `air_moltbook_posts?doi=eq.${encodeURIComponent(doi)}&record_version=eq.${encodeURIComponent(recordVersion)}&select=*`
  const response = await fetch(`${configured.url}/rest/v1/${path}`, { headers: restHeaders(configured.key) }).catch(() => null)
  if (!response) return { available: false, message: "The community table could not be reached. Nothing was posted.", post: null, comments: [] }
  if (!response.ok) {
    const text = await response.text()
    if (missingFeature(text, response.status)) return { available: false, message: "Community review is not on this board yet. Nothing was posted.", post: null, comments: [] }
    return { available: true, message: text.slice(0, 240), post: null, comments: [] }
  }
  const rows = (await response.json()) as unknown
  const post = Array.isArray(rows) ? asPost(rows[0]) : null
  if (!post) return { available: true, message: null, post: null, comments: [] }
  const comments = await loadComments(configured, post.id)
  return { available: true, message: null, post, comments }
}

export async function queueMoltbook(facts: PublicPaperFacts, recordVersion: string): Promise<Pick<MoltbookSnapshot, "available" | "message" | "post" | "comments">> {
  return callFunction({ action: "queue", ...facts, recordVersion })
}

export async function pullMoltbook(facts: PublicPaperFacts, recordVersion: string): Promise<Pick<MoltbookSnapshot, "available" | "message" | "post" | "comments">> {
  return callFunction({ action: "pull", ...facts, recordVersion })
}

export async function loadCommunityReplyCounts(): Promise<Record<string, number> | null> {
  try {
    return await communityReplyCounts()
  } catch {
    return null
  }
}

async function communityReplyCounts(): Promise<Record<string, number> | null> {
  const configured = board()
  if (!configured) return null
  const [posts, comments] = await Promise.all([
    fetch(`${configured.url}/rest/v1/air_moltbook_posts?select=id,doi,record_version&limit=1000`, { headers: restHeaders(configured.key) }).catch(() => null),
    fetch(`${configured.url}/rest/v1/air_moltbook_comments?select=post_id,candidate,discarded&limit=2000`, { headers: restHeaders(configured.key) }).catch(() => null),
  ])
  if (!posts || !comments || !posts.ok || !comments.ok) return null
  const postRows = (await posts.json()) as { id?: string; doi?: string; record_version?: string }[]
  const commentRows = (await comments.json()) as { post_id?: string; candidate?: boolean; discarded?: boolean }[]
  if (!Array.isArray(postRows) || !Array.isArray(commentRows)) return null
  const keys = new Map(postRows.flatMap((row) => (row.id && row.doi && row.record_version ? [[row.id, paperKey(row.doi, row.record_version)] as const] : [])))
  const counts: Record<string, number> = {}
  for (const comment of commentRows) {
    if (!comment.candidate || comment.discarded || !comment.post_id) continue
    const key = keys.get(comment.post_id)
    if (!key) continue
    counts[key] = (counts[key] ?? 0) + 1
  }
  return counts
}

export { MOLTBOOK_SUBMOLT_URL }

async function callFunction(body: Record<string, unknown>): Promise<Pick<MoltbookSnapshot, "available" | "message" | "post" | "comments">> {
  const configured = board()
  if (!configured) return { available: false, message: "The shared board is not configured, so community review stays on this browser as a preview only.", post: null, comments: [] }
  const response = await fetch(`${configured.url}/functions/v1/moltbook-review`, {
    method: "POST",
    headers: { ...restHeaders(configured.key), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).catch(() => null)
  if (!response) return { available: false, message: "The Moltbook function could not be reached. Nothing was posted.", post: null, comments: [] }
  const payload = (await response.json().catch(() => null)) as { unavailable?: boolean; message?: string; post?: unknown; comments?: unknown } | null
  if (!payload) return { available: false, message: "The Moltbook function did not answer. Nothing was posted.", post: null, comments: [] }
  if (payload.unavailable || missingFeature(payload.message ?? "", response.status)) {
    return { available: false, message: payload.message ?? "Community review is not on this board yet. Nothing was posted.", post: null, comments: [] }
  }
  return {
    available: true,
    message: payload.message ?? null,
    post: asPost(payload.post),
    comments: asComments(payload.comments),
  }
}

async function loadComments(configured: { url: string; key: string }, postId: string): Promise<MoltbookCommentView[]> {
  const response = await fetch(
    `${configured.url}/rest/v1/air_moltbook_comments?post_id=eq.${encodeURIComponent(postId)}&select=id,agent_name,is_claimed,sanitized_content,flags,cites_publication,criterion_id,discarded,candidate,comment_created_at,moltbook_comment_id&order=ingested_at.asc&limit=80`,
    { headers: restHeaders(configured.key) },
  ).catch(() => null)
  if (!response?.ok) return []
  return asComments(await response.json().catch(() => []))
}

function restHeaders(key: string): HeadersInit {
  return { apikey: key, Authorization: `Bearer ${key}` }
}

function asPost(value: unknown): MoltbookPostView | null {
  if (!value || typeof value !== "object") return null
  const row = value as Record<string, unknown>
  const doi = stringField(row, "doi")
  const recordVersion = stringField(row, "recordVersion") ?? stringField(row, "record_version")
  const title = stringField(row, "title")
  const content = stringField(row, "content")
  const status = stringField(row, "status")
  const id = stringField(row, "id")
  if (!doi || !recordVersion || !title || !content || !status || !id) return null
  return {
    id,
    doi,
    recordVersion,
    title,
    content,
    status,
    moltbookPostId: stringField(row, "moltbookPostId") ?? stringField(row, "moltbook_post_id"),
    moltbookUrl: stringField(row, "moltbookUrl") ?? stringField(row, "moltbook_url"),
    retryAfter: stringField(row, "retryAfter") ?? stringField(row, "retry_after"),
    lastError: stringField(row, "lastError") ?? stringField(row, "last_error"),
    publishedAt: stringField(row, "publishedAt") ?? stringField(row, "published_at"),
  }
}

function asComments(value: unknown): MoltbookCommentView[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return []
    const row = item as Record<string, unknown>
    const id = stringField(row, "id")
    const sanitizedContent = stringField(row, "sanitizedContent") ?? stringField(row, "sanitized_content")
    if (!id || !sanitizedContent) return []
    return [
      {
        id,
        agentName: stringField(row, "agentName") ?? stringField(row, "agent_name"),
        isClaimed: booleanField(row, "isClaimed") ?? booleanField(row, "is_claimed"),
        sanitizedContent,
        flags: Array.isArray(row.flags) ? row.flags.filter((flag): flag is string => typeof flag === "string") : [],
        citesPublication: row.citesPublication === true || row.cites_publication === true,
        criterionId: stringField(row, "criterionId") ?? stringField(row, "criterion_id"),
        discarded: row.discarded === true,
        candidate: row.candidate === true,
        commentCreatedAt: stringField(row, "commentCreatedAt") ?? stringField(row, "comment_created_at"),
        moltbookCommentId: stringField(row, "moltbookCommentId") ?? stringField(row, "moltbook_comment_id"),
      },
    ]
  })
}

function stringField(row: Record<string, unknown>, key: string): string | null {
  const value = row[key]
  return typeof value === "string" && value.trim() ? value : null
}

function booleanField(row: Record<string, unknown>, key: string): boolean | null {
  const value = row[key]
  return typeof value === "boolean" ? value : null
}

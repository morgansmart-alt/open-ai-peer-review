import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { emptyDatabase, type AirDatabase, type AuthorClaim, type IssueRound, type IssueStatus, type IssueThread, type NodeSubmission, type StoredReview } from "../domain/types.ts"
import { loadLocalDatabase, loadOverlay, loadRateStamps, saveLocalDatabase, saveOverlay, saveRateStamps } from "./storage.ts"
import { rateLimitDecision } from "./rateLimit.ts"

export type BackendMode = "local" | "supabase"

function client(): SupabaseClient | null {
  const url = import.meta.env.VITE_SUPABASE_URL?.trim()
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()
  if (!url || !key) return null
  return createClient(url, key)
}

function payloads<T>(rows: { payload: T }[] | null): T[] {
  return (rows ?? []).map((row) => row.payload)
}

async function loadRemote(sb: SupabaseClient): Promise<AirDatabase> {
  const [reviews, nodes, issues, claims] = await Promise.all([
    sb.from("air_reviews").select("payload").limit(1000),
    sb.from("air_nodes").select("payload").limit(2000),
    sb.from("air_issues").select("payload").limit(2000),
    sb.from("air_claims").select("payload").limit(1000),
  ])
  const error = reviews.error || nodes.error || issues.error || claims.error
  if (error) throw new Error(error.message)
  return {
    reviews: payloads<StoredReview>(reviews.data as { payload: StoredReview }[] | null),
    nodes: payloads<NodeSubmission>(nodes.data as { payload: NodeSubmission }[] | null),
    issues: payloads<IssueThread>(issues.data as { payload: IssueThread }[] | null),
    claims: payloads<AuthorClaim>(claims.data as { payload: AuthorClaim }[] | null),
  }
}

export async function openBackend(): Promise<{ mode: BackendMode; db: AirDatabase; error: string | null }> {
  const sb = client()
  if (!sb) return { mode: "local", db: loadLocalDatabase(), error: null }
  try {
    return { mode: "supabase", db: await loadRemote(sb), error: null }
  } catch (error) {
    const message = error instanceof Error ? error.message : "The shared board could not be opened."
    return { mode: "local", db: loadLocalDatabase(), error: message }
  }
}

function spend(): string | null {
  const decision = rateLimitDecision(loadRateStamps(), Date.now())
  if (!decision.ok) return "This browser has sent several items in a short time. Wait a few minutes and try again."
  saveRateStamps(decision.stamps)
  return null
}

const PRIVATE_PAYLOAD_KEYS = new Set(["conversationLinks", "privateLinks", "chatUrl", "chatNote", "apiKey", "authorization"])

/** Drop private chat addresses before a row is stored. The count stays. */
export function publicPayload<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value, (key, item) => (PRIVATE_PAYLOAD_KEYS.has(key) ? undefined : item)),
  ) as T
}

function upsertLocal(review: StoredReview): void {
  const db = loadLocalDatabase()
  db.reviews = [...db.reviews.filter((item) => item.id !== review.id), review]
  saveLocalDatabase(db)
}

export async function publishReview(mode: BackendMode, review: StoredReview): Promise<string | null> {
  const limited = spend()
  if (limited) return limited
  if (mode === "local" || review.mock || review.sample || review.tier === "provisional" || review.tier === "local-screening") {
    if (mode === "supabase" && review.mock) {
      const overlay = loadOverlay()
      overlay.reviews = [...overlay.reviews.filter((item) => item.id !== review.id), review]
      saveOverlay(overlay)
      return null
    }
    upsertLocal(review)
    return null
  }
  const sb = client()
  if (!sb) {
    upsertLocal(review)
    return null
  }
  const row = {
    id: review.id,
    doi: review.doi,
    record_version: review.recordVersion,
    assessor_id: review.assessorId,
    model_id: review.modelId,
    criteria_version: review.criteriaVersion,
    custom_criteria: review.customCriteria,
    output_hash: review.outputHash,
    private_context_count: review.privateContextCount ?? 0,
    payload: publicPayload(review),
  }
  const { error } = await sb.from("air_reviews").insert(row)
  if (error && /private_context_count/i.test(error.message)) {
    const { private_context_count: dropped, ...withoutCount } = row
    void dropped
    const retry = await sb.from("air_reviews").insert(withoutCount)
    return retry.error ? retry.error.message : null
  }
  if (error) return error.message
  return null
}

export async function publishNode(mode: BackendMode, node: NodeSubmission): Promise<string | null> {
  const limited = spend()
  if (limited) return limited
  const writeLocal = () => {
    const db = mode === "supabase" ? loadOverlay() : loadLocalDatabase()
    if (db.nodes.some((item) => item.reviewId === node.reviewId && item.nodeId === node.nodeId)) {
      return "This node already checked that reading."
    }
    db.nodes = [...db.nodes, node]
    if (mode === "supabase") saveOverlay(db)
    else saveLocalDatabase(db)
    return null
  }
  if (mode === "local" || node.mock) return writeLocal()
  const sb = client()
  if (!sb) return writeLocal()
  const row = {
    id: node.id,
    review_id: node.reviewId,
    node_id: node.nodeId,
    private_context_count: node.privateContextCount ?? 0,
    payload: publicPayload(node),
  }
  const { error } = await sb.from("air_nodes").insert(row)
  if (error && /private_context_count/i.test(error.message)) {
    const { private_context_count: dropped, ...withoutCount } = row
    void dropped
    const retry = await sb.from("air_nodes").insert(withoutCount)
    if (retry.error && /duplicate|unique/i.test(retry.error.message)) return "This node already checked that reading."
    return retry.error ? retry.error.message : null
  }
  if (error) {
    if (/duplicate|unique/i.test(error.message)) return "This node already checked that reading."
    return error.message
  }
  return null
}

export async function publishIssues(mode: BackendMode, issues: IssueThread[], mock: boolean): Promise<string | null> {
  if (issues.length === 0) return null
  const writeLocal = () => {
    const db = mode === "supabase" && mock ? loadOverlay() : loadLocalDatabase()
    const known = new Set(db.issues.map((issue) => issue.id))
    db.issues = [...db.issues, ...issues.filter((issue) => !known.has(issue.id))]
    if (mode === "supabase" && mock) saveOverlay(db)
    else if (mode === "local" || mock) saveLocalDatabase(db)
    return null
  }
  if (mode === "local" || mock) return writeLocal()
  const sb = client()
  if (!sb) return writeLocal()
  const { error } = await sb.from("air_issues").upsert(
    issues.map((issue) => ({
      id: issue.id,
      doi: issue.doi,
      record_version: issue.recordVersion,
      payload: publicPayload(issue),
      updated_at: issue.updatedAt,
    })),
  )
  if (error) return error.message
  return null
}

export async function saveIssue(mode: BackendMode, issue: IssueThread): Promise<string | null> {
  const limited = spend()
  if (limited) return limited
  if (mode === "local") {
    const db = loadLocalDatabase()
    const index = db.issues.findIndex((item) => item.id === issue.id)
    if (index >= 0) db.issues[index] = issue
    else db.issues.push(issue)
    saveLocalDatabase(db)
    return null
  }
  const sb = client()
  if (!sb) return "The shared board is not configured."
  const payload = publicPayload(issue)
  const rpc = await sb.rpc("air_append_issue_round", { p_issue_id: issue.id, p_payload: payload })
  if (!rpc.error) return null
  if (!missingAppendFunction(rpc.error)) return rpc.error.message
  const { error } = await sb.from("air_issues").update({ payload, updated_at: issue.updatedAt }).eq("id", issue.id)
  if (error) {
    const overlay = loadOverlay()
    const index = overlay.issues.findIndex((item) => item.id === issue.id)
    if (index >= 0) {
      overlay.issues[index] = issue
      saveOverlay(overlay)
      return null
    }
    return error.message
  }
  return null
}

export async function publishClaim(mode: BackendMode, claim: AuthorClaim): Promise<string | null> {
  const limited = spend()
  if (limited) return limited
  if (mode === "local") {
    const db = loadLocalDatabase()
    db.claims = [...db.claims.filter((item) => item.doi !== claim.doi), claim]
    saveLocalDatabase(db)
    return null
  }
  const sb = client()
  if (!sb) return "The shared board is not configured."
  const row = { id: claim.id, doi: claim.doi, payload: publicPayload(claim) }
  const inserted = await sb.from("air_claims").insert(row)
  if (!inserted.error) return null
  if (!/duplicate|unique/i.test(inserted.error.message)) return inserted.error.message
  const updated = await sb.from("air_claims").update({ doi: row.doi, payload: row.payload }).eq("id", claim.id)
  return updated.error ? updated.error.message : null
}

function missingAppendFunction(error: { code?: string; message?: string }): boolean {
  const text = `${error.code ?? ""} ${error.message ?? ""}`
  return /PGRST202|PGRST204|could not find the function|schema cache/i.test(text)
}

export function appendRound(issue: IssueThread, round: IssueRound, status: IssueStatus): IssueThread {
  return {
    ...issue,
    status,
    rounds: [...issue.rounds, round],
    updatedAt: round.createdAt,
  }
}

export { emptyDatabase }

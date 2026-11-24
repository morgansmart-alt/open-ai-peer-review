import type { AuthorRole, IssueStatus, IssueThread, NodeSubmission, StoredReview } from "./types.ts"
import { isHumanReview } from "./versions.ts"

/** Documented API host. Requests without `www` can redirect and drop Authorization. */
export const MOLTBOOK_API_BASE = "https://www.moltbook.com/api/v1"
export const MOLTBOOK_SUBMOLT = "air-peer-review"
export const MOLTBOOK_SUBMOLT_URL = "https://www.moltbook.com/m/air-peer-review"
export const MOLTBOOK_AGENT_NAME = "open-ai-peer-review"

export const ESTABLISHED_POST_COOLDOWN_MS = 30 * 60 * 1000
export const NEW_AGENT_POST_COOLDOWN_MS = 2 * 60 * 60 * 1000
export const NEW_AGENT_WINDOW_MS = 24 * 60 * 60 * 1000
export const COMMENT_PULL_PER_POST_MS = 60 * 1000
export const COMMENT_PULL_PER_AGENT_MS = 20 * 1000

export const AIR_CRITERIA_SUMMARY =
  "AIR scores a public Zenodo record on impact, feasibility, testability, physics, global goals, clarity, consistency, evidence labelling, availability, and limitations. Possible is not proven."

export const UNCALIBRATED_DISCLAIMER =
  "Community replies on this thread are uncalibrated. They are not an AIR score, they do not enter the ranked median, they do not count as independent corroboration, and they cannot close an issue on their own."

export const AIR_CRITERIA: readonly { id: string; name: string }[] = [
  { id: "impact", name: "Impact" },
  { id: "feasibility", name: "Feasibility" },
  { id: "world-class", name: "Physical or metaphysical class" },
  { id: "testability", name: "Objective viability and testability" },
  { id: "simulation", name: "Simulation evidence" },
  { id: "physics", name: "Physics consistency" },
  { id: "estimated-value", name: "Estimated project value" },
  { id: "global-goals", name: "Global goals alignment" },
  { id: "clarity", name: "Clarity of claims" },
  { id: "consistency", name: "Internal consistency" },
  { id: "evidence-labelling", name: "Evidence and speculation" },
  { id: "availability", name: "Data and code availability" },
  { id: "limitations", name: "Limitations" },
]

const ZENODO_DOI = /^10\.5281\/zenodo\.\d+$/
const PUBLIC_FACT_KEYS = new Set(["title", "authors", "versionDoi", "conceptDoi", "airPaperUrl"])
const LEAK =
  /chatgpt\.com|claude\.ai|share\.google|chat\.openai|gemini\.google|aistudio\.google|grok\.com|conversationlinks|privatelinks|chaturl|chatnote|private[_ -]?context|moltbook_[a-z0-9]|bearer\s+\S|api[_ -]?key|sk-[a-z0-9]|@[a-z0-9.-]+\.[a-z]{2,}/i

const ONES: Record<string, number> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
}
const TEENS: Record<string, number> = {
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
}
const TENS: Record<string, number> = {
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
}

const OPERATOR_PHRASES: { words: string[]; op: "+" | "-" | "*" | "/" }[] = [
  { words: ["divided", "by"], op: "/" },
  { words: ["multiplied", "by"], op: "*" },
  { words: ["slows", "by"], op: "-" },
  { words: ["slowed", "by"], op: "-" },
  { words: ["drops", "by"], op: "-" },
  { words: ["dropped", "by"], op: "-" },
  { words: ["decreases", "by"], op: "-" },
  { words: ["decreased", "by"], op: "-" },
  { words: ["increases", "by"], op: "+" },
  { words: ["increased", "by"], op: "+" },
  { words: ["gains"], op: "+" },
  { words: ["gained"], op: "+" },
  { words: ["loses"], op: "-" },
  { words: ["lost"], op: "-" },
  { words: ["plus"], op: "+" },
  { words: ["minus"], op: "-" },
  { words: ["times"], op: "*" },
  { words: ["multiplies"], op: "*" },
  { words: ["multiply"], op: "*" },
  { words: ["adds"], op: "+" },
  { words: ["added"], op: "+" },
  { words: ["subtracts"], op: "-" },
  { words: ["subtract"], op: "-" },
]

export interface PublicPaperFacts {
  title: string
  authors: string[]
  versionDoi: string
  conceptDoi: string
  airPaperUrl: string
}

export interface PublicPostDraft {
  submolt_name: typeof MOLTBOOK_SUBMOLT
  type: "text"
  title: string
  content: string
}

export function isCommunityAiRecord(review: { tier?: string; origin?: string; assessorId?: string }): boolean {
  return review.tier === "community-ai" || review.origin === "community-ai" || review.assessorId === "community-ai" || review.assessorId === "moltbook"
}

export function redactSecrets(text: string): string {
  return text
    .replace(/moltbook_[a-z0-9_-]+/gi, "[redacted]")
    .replace(/bearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/sk-[a-z0-9_-]+/gi, "[redacted]")
    .slice(0, 300)
}

export function moltbookUrl(path: string): string {
  const suffix = path.startsWith("/") ? path : `/${path}`
  return `${MOLTBOOK_API_BASE}${suffix}`
}

/** AIR never calls a non-www host, and never calls DMs, votes, follows, home, or search. */
export function assertMoltbookPath(url: string): void {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new Error("AIR calls only https://www.moltbook.com.")
  }
  if (parsed.protocol !== "https:" || parsed.hostname !== "www.moltbook.com" || parsed.username || parsed.password) {
    throw new Error("AIR calls only https://www.moltbook.com.")
  }
  const path = parsed.pathname
  const allowed =
    path === "/api/v1/posts" ||
    path === "/api/v1/verify" ||
    path === "/api/v1/agents/me" ||
    /^\/api\/v1\/posts\/[A-Za-z0-9_-]+\/comments$/.test(path)
  if (!allowed) throw new Error("That Moltbook endpoint is not used by AIR.")
}

export function moltbookPostRowId(doi: string, recordVersion: string): string {
  return `mb_${`${doi}__${recordVersion}`.replace(/[^a-zA-Z0-9]+/g, "_").replace(/_+/g, "_").slice(0, 140)}`
}

const CANONICAL_ORIGIN = "https://morgansmart-alt.github.io"
const CANONICAL_BASE = "/open-ai-peer-review/"

/** A public post must link to an https AIR page. Local http dev uses the public site. */
export function publicAirLocation(origin: string, basePath: string): { origin: string; basePath: string } {
  try {
    const url = new URL(origin)
    const local = url.hostname === "localhost" || url.hostname === "127.0.0.1"
    if (url.protocol === "https:" && !local) return { origin: url.origin, basePath }
  } catch {
    /* Fall through to the public site. */
  }
  return { origin: CANONICAL_ORIGIN, basePath: CANONICAL_BASE }
}

export function airPaperHref(origin: string, basePath: string, recordId: string): string {
  const base = basePath.endsWith("/") ? basePath : `${basePath}/`
  const url = new URL(base, origin)
  url.search = ""
  url.hash = `#/paper/${encodeURIComponent(recordId)}`
  return url.href
}

export function buildPublicPost(input: PublicPaperFacts): PublicPostDraft {
  const extra = Object.keys(input).filter((key) => !PUBLIC_FACT_KEYS.has(key))
  if (extra.length > 0) throw new Error(`Refusing private or unknown fields: ${extra.join(", ")}`)
  const titleText = cleanPublicText(input.title, 180, "title")
  const authors = cleanAuthors(input.authors)
  const versionDoi = cleanDoi(input.versionDoi, "version DOI")
  const conceptDoi = cleanDoi(input.conceptDoi, "concept DOI")
  const airPaperUrl = cleanAirUrl(input.airPaperUrl)
  const versionId = versionDoi.match(/(\d+)$/)?.[1] ?? ""
  const hashId = decodeURIComponent(new URL(airPaperUrl).hash.replace(/^#\/paper\//, ""))
  if (!versionId || hashId !== versionId) throw new Error("The AIR page does not match this version DOI.")
  const title = `AIR review request: ${titleText}`.slice(0, 300)
  const authorLine = authors.length > 0 ? authors.join(", ") : "Creator unlisted on the Zenodo record"
  const content = [
    "Open Iterative AI Peer Review (AIR) is requesting an uncalibrated community reading of one public Zenodo version.",
    "",
    `Title: ${titleText}`,
    `Authors: ${authorLine}`,
    `Version DOI: ${versionDoi}`,
    `Concept DOI: ${conceptDoi}`,
    `AIR page: ${airPaperUrl}`,
    "",
    `Criteria: ${AIR_CRITERIA_SUMMARY}`,
    "",
    UNCALIBRATED_DISCLAIMER,
    "",
    "Reply with a quotation from the public record or a named AIR criterion. Do not ask for private links, keys, or unpublished drafts. This agent does not vote, follow, or send messages from this post.",
  ].join("\n")
  const draft: PublicPostDraft = {
    submolt_name: MOLTBOOK_SUBMOLT,
    type: "text",
    title,
    content,
  }
  assertPublicDraft(draft)
  return draft
}

export function assertPublicDraft(draft: PublicPostDraft): void {
  const blob = JSON.stringify(draft)
  if (LEAK.test(blob)) throw new Error("The public post would include a private link, address, or key.")
  if (draft.submolt_name !== MOLTBOOK_SUBMOLT || draft.type !== "text") throw new Error("The public post must stay on m/air-peer-review.")
  const keys = Object.keys(draft)
  if (keys.some((key) => !["submolt_name", "type", "title", "content"].includes(key))) {
    throw new Error("The public post has an unexpected field.")
  }
}

function cleanPublicText(value: unknown, max: number, label: string): string {
  if (typeof value !== "string") throw new Error(`A public ${label} is required.`)
  const text = value.replace(/\s+/g, " ").trim()
  if (!text) throw new Error(`A public ${label} is required.`)
  if (LEAK.test(text)) throw new Error(`The ${label} contains a private link, address, or key.`)
  return text.slice(0, max)
}

function cleanAuthors(value: unknown): string[] {
  if (!Array.isArray(value)) throw new Error("Authors must be the Zenodo creator names.")
  const names: string[] = []
  for (const item of value) {
    if (typeof item !== "string") continue
    const name = item.replace(/\s+/g, " ").trim()
    if (!name) continue
    if (LEAK.test(name) || name.length > 120) throw new Error("An author name contains a private link, address, or key.")
    names.push(name)
    if (names.length === 20) break
  }
  return names
}

function cleanDoi(value: unknown, label: string): string {
  if (typeof value !== "string" || !ZENODO_DOI.test(value.trim())) {
    throw new Error(`The ${label} must be a public Zenodo DOI.`)
  }
  return value.trim()
}

function cleanAirUrl(value: unknown): string {
  if (typeof value !== "string") throw new Error("An AIR page URL is required.")
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error("The AIR page URL is not valid.")
  }
  if (url.protocol !== "https:" || url.username || url.password || url.search) throw new Error("The AIR page URL is not a public paper link.")
  if (!url.hash.startsWith("#/paper/")) throw new Error("The AIR page URL is not a public paper link.")
  if (LEAK.test(url.href)) throw new Error("The AIR page URL contains a private link, address, or key.")
  return url.href
}

export interface QueueRow {
  id: string
  createdAt: string
  status: "queued" | "cooldown" | "publishing" | "published" | "verification_pending" | "failed"
}

export function postCooldownMs(agentCreatedAt: string | null, now: number): number {
  if (!agentCreatedAt) return ESTABLISHED_POST_COOLDOWN_MS
  const created = Date.parse(agentCreatedAt)
  if (!Number.isFinite(created)) return ESTABLISHED_POST_COOLDOWN_MS
  const age = now - created
  if (age >= 0 && age < NEW_AGENT_WINDOW_MS) return NEW_AGENT_POST_COOLDOWN_MS
  return ESTABLISHED_POST_COOLDOWN_MS
}

export interface PostGateInput {
  now: number
  lastPublishedAt: string | null
  agentCreatedAt: string | null
  retryAfterSeconds: number | null
  rateLimitRemaining: number | null
  rateLimitResetAt: string | null
}

export interface PostGate {
  publish: boolean
  notBefore: string
  reason: string
}

export function gatePost(input: PostGateInput): PostGate {
  const waits: { at: number; reason: string }[] = []
  if (input.retryAfterSeconds != null && input.retryAfterSeconds > 0) {
    waits.push({ at: input.now + input.retryAfterSeconds * 1000, reason: "Moltbook asked for a wait (Retry-After)." })
  }
  if (input.rateLimitRemaining === 0 && input.rateLimitResetAt) {
    const reset = parseTime(input.rateLimitResetAt)
    if (reset != null && reset > input.now) waits.push({ at: reset, reason: "The Moltbook rate-limit window is exhausted." })
  }
  if (input.lastPublishedAt) {
    const last = Date.parse(input.lastPublishedAt)
    if (Number.isFinite(last)) {
      const cooldown = postCooldownMs(input.agentCreatedAt, input.now)
      const next = last + cooldown
      if (next > input.now) {
        waits.push({
          at: next,
          reason:
            cooldown === NEW_AGENT_POST_COOLDOWN_MS
              ? "A new Moltbook agent can post once every two hours."
              : "An established Moltbook agent can post once every 30 minutes.",
        })
      }
    }
  }
  if (waits.length === 0) return { publish: true, notBefore: new Date(input.now).toISOString(), reason: "Ready to post." }
  const latest = waits.reduce((best, item) => (item.at > best.at ? item : best))
  return { publish: false, notBefore: new Date(latest.at).toISOString(), reason: latest.reason }
}

export function oldestWaiting(rows: QueueRow[]): QueueRow | null {
  const waiting = rows.filter((row) => row.status === "queued" || row.status === "cooldown" || row.status === "failed")
  waiting.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
  return waiting[0] ?? null
}

export function planBurst(input: { now: number; lastPublishedAt: string | null; agentCreatedAt: string | null; waiting: QueueRow[] }): {
  publishId: string | null
  waitingIds: string[]
  reason: string
  notBefore: string
} {
  const gate = gatePost({
    now: input.now,
    lastPublishedAt: input.lastPublishedAt,
    agentCreatedAt: input.agentCreatedAt,
    retryAfterSeconds: null,
    rateLimitRemaining: null,
    rateLimitResetAt: null,
  })
  const ordered = [...input.waiting].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
  const ids = ordered.map((row) => row.id)
  if (!gate.publish || ids.length === 0) return { publishId: null, waitingIds: ids, reason: gate.reason, notBefore: gate.notBefore }
  return { publishId: ids[0] ?? null, waitingIds: ids.slice(1), reason: gate.reason, notBefore: gate.notBefore }
}

export function readRateLimit(headers: Record<string, string>, body: unknown, now: number): {
  remaining: number | null
  resetAt: string | null
  retryAfterSeconds: number | null
} {
  const lower = new Map(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]))
  const remaining = readNumber(lower.get("x-ratelimit-remaining"))
  const resetRaw = lower.get("x-ratelimit-reset")
  const resetAt = resetRaw ? timeToIso(resetRaw) : null
  let retryAfterSeconds = retryAfterToSeconds(lower.get("retry-after") ?? null, now)
  if (body && typeof body === "object") {
    const record = body as Record<string, unknown>
    const fromBody = readNumber(record.retry_after_seconds)
    const minutes = readNumber(record.retry_after_minutes)
    const bodyRetry = fromBody ?? (minutes != null ? minutes * 60 : null)
    if (bodyRetry != null && (retryAfterSeconds == null || bodyRetry > retryAfterSeconds)) retryAfterSeconds = bodyRetry
  }
  return { remaining, resetAt, retryAfterSeconds }
}

function readNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value)
  return null
}

function parseTime(value: string): number | null {
  const numeric = Number(value)
  if (Number.isFinite(numeric) && numeric > 1_000_000_000) return numeric > 10_000_000_000 ? numeric : numeric * 1000
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : null
}

function timeToIso(value: string): string | null {
  const parsed = parseTime(value)
  return parsed == null ? null : new Date(parsed).toISOString()
}

function retryAfterToSeconds(value: string | null, now: number): number | null {
  if (!value) return null
  const numeric = Number(value)
  if (Number.isFinite(numeric)) return Math.max(0, numeric)
  const parsed = Date.parse(value)
  if (!Number.isFinite(parsed)) return null
  return Math.max(0, Math.ceil((parsed - now) / 1000))
}

export function readAgentCreatedAt(body: unknown): string | null {
  if (!body || typeof body !== "object") return null
  const record = body as Record<string, unknown>
  const agent = record.agent && typeof record.agent === "object" ? (record.agent as Record<string, unknown>) : record
  const value = agent.created_at ?? agent.createdAt
  if (typeof value !== "string") return null
  return Number.isFinite(Date.parse(value)) ? value : null
}

export interface VerificationChallenge {
  verificationCode: string
  challengeText: string
}

export function readVerificationChallenge(body: unknown): VerificationChallenge | null {
  if (!body || typeof body !== "object") return null
  const record = body as Record<string, unknown>
  const post = record.post && typeof record.post === "object" ? (record.post as Record<string, unknown>) : null
  const comment = record.comment && typeof record.comment === "object" ? (record.comment as Record<string, unknown>) : null
  const verification =
    (post?.verification && typeof post.verification === "object" ? post.verification : null) ??
    (comment?.verification && typeof comment.verification === "object" ? comment.verification : null) ??
    (record.verification && typeof record.verification === "object" ? record.verification : null)
  if (!verification || typeof verification !== "object") return null
  const fields = verification as Record<string, unknown>
  const verificationCode = fields.verification_code ?? fields.code
  const challengeText = fields.challenge_text ?? fields.challenge
  if (typeof verificationCode !== "string" || typeof challengeText !== "string") return null
  if (!/^[A-Za-z0-9_-]{4,200}$/.test(verificationCode)) return null
  return { verificationCode, challengeText: challengeText.slice(0, 2000) }
}

export function readCreatedPost(body: unknown): { id: string | null; url: string | null } {
  if (!body || typeof body !== "object") return { id: null, url: null }
  const record = body as Record<string, unknown>
  const post = record.post && typeof record.post === "object" ? (record.post as Record<string, unknown>) : record
  const id = typeof post.id === "string" && /^[A-Za-z0-9_-]{1,80}$/.test(post.id) ? post.id : null
  const url = publicMoltbookUrl(post.url)
  return { id, url }
}

export function publicMoltbookUrl(value: unknown): string | null {
  if (typeof value !== "string") return null
  try {
    const url = new URL(value)
    if (url.protocol !== "https:" || url.hostname !== "www.moltbook.com") return null
    return url.href
  } catch {
    return null
  }
}

export function solveMoltbookChallenge(challengeText: string): string | null {
  const words = challengeText
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter(Boolean)
  const numbers: { start: number; end: number; value: number }[] = []
  for (let index = 0; index < words.length; ) {
    const found = readNumberAt(words, index)
    if (!found) {
      index += 1
      continue
    }
    numbers.push({ start: index, end: found.next, value: found.value })
    index = found.next
  }
  if (numbers.length !== 2) return null
  const left = numbers[0]
  const right = numbers[1]
  if (!left || !right) return null
  const operators: ("+" | "-" | "*" | "/")[] = []
  for (let index = left.end; index < right.start; index += 1) {
    for (const phrase of OPERATOR_PHRASES) {
      if (phrase.words.every((word, offset) => words[index + offset] && sameWord(words[index + offset] ?? "", word))) {
        operators.push(phrase.op)
      }
    }
  }
  const unique = [...new Set(operators)]
  if (unique.length !== 1) return null
  const op = unique[0]
  if (!op || (op === "/" && right.value === 0)) return null
  const value = op === "+" ? left.value + right.value : op === "-" ? left.value - right.value : op === "*" ? left.value * right.value : left.value / right.value
  if (!Number.isFinite(value)) return null
  return (Math.round((value + Number.EPSILON) * 100) / 100).toFixed(2)
}

function sameWord(actual: string, expected: string): boolean {
  return actual === expected || collapse(actual) === expected
}

function collapse(word: string): string {
  return word.replace(/(.)\1+/g, "$1")
}

function readNumberAt(words: string[], index: number): { value: number; next: number } | null {
  const word = words[index]
  if (!word) return null
  if (/^\d+(\.\d+)?$/.test(word)) return { value: Number(word), next: index + 1 }
  const tens = matchLex(word, TENS)
  if (tens != null) {
    const ones = matchLex(words[index + 1] ?? "", ONES)
    if (ones != null && ones > 0) return { value: tens + ones, next: index + 2 }
    return { value: tens, next: index + 1 }
  }
  const teen = matchLex(word, TEENS)
  if (teen != null) return { value: teen, next: index + 1 }
  const ones = matchLex(word, ONES)
  if (ones != null) return { value: ones, next: index + 1 }
  for (const [ten, tenValue] of Object.entries(TENS)) {
    const form = collapse(word)
    if (!form.startsWith(ten) || form.length <= ten.length) continue
    const rest = form.slice(ten.length)
    if (rest in ONES && ONES[rest] !== 0) return { value: tenValue + (ONES[rest] ?? 0), next: index + 1 }
  }
  return null
}

function matchLex(word: string, lex: Record<string, number>): number | null {
  if (!word) return null
  if (word in lex) return lex[word] ?? null
  const folded = collapse(word)
  if (folded in lex) return lex[folded] ?? null
  return null
}

export interface HttpResult {
  status: number
  headers: Record<string, string>
  body: unknown
}

export interface HttpClient {
  request(url: string, init: { method: "GET" | "POST"; body?: unknown }): Promise<HttpResult>
}

export interface PublishOutcome {
  status: "queued" | "cooldown" | "published" | "verification_pending" | "failed"
  moltbookPostId: string | null
  moltbookUrl: string | null
  retryAfterSeconds: number | null
  remaining: number | null
  resetAt: string | null
  message: string
}

export async function publishDraft(
  transport: HttpClient,
  input: PostGateInput & { draft: PublicPostDraft },
): Promise<PublishOutcome> {
  assertPublicDraft(input.draft)
  const gate = gatePost(input)
  if (!gate.publish) {
    return {
      status: "cooldown",
      moltbookPostId: null,
      moltbookUrl: null,
      retryAfterSeconds: null,
      remaining: input.rateLimitRemaining,
      resetAt: input.rateLimitResetAt,
      message: `${gate.reason} Next send ${gate.notBefore}.`,
    }
  }
  const url = moltbookUrl("/posts")
  assertMoltbookPath(url)
  const posted = await transport.request(url, { method: "POST", body: input.draft })
  const limits = readRateLimit(posted.headers, posted.body, input.now)
  if (posted.status >= 300 && posted.status < 400) {
    return failedPublish("Moltbook redirected. AIR did not follow it.", limits)
  }
  if (posted.status === 429) {
    return {
      status: "cooldown",
      moltbookPostId: null,
      moltbookUrl: null,
      retryAfterSeconds: limits.retryAfterSeconds,
      remaining: limits.remaining,
      resetAt: limits.resetAt,
      message: "Moltbook rate limited this post. It stays queued.",
    }
  }
  if (posted.status < 200 || posted.status >= 300) {
    return failedPublish("Moltbook refused the post. Nothing private was sent.", limits)
  }
  const created = readCreatedPost(posted.body)
  const challenge = readVerificationChallenge(posted.body)
  if (!challenge) {
    return {
      status: "published",
      moltbookPostId: created.id,
      moltbookUrl: created.url,
      retryAfterSeconds: limits.retryAfterSeconds,
      remaining: limits.remaining,
      resetAt: limits.resetAt,
      message: "Posted to m/air-peer-review.",
    }
  }
  const answer = solveMoltbookChallenge(challenge.challengeText)
  if (!answer) {
    return {
      status: "verification_pending",
      moltbookPostId: created.id,
      moltbookUrl: created.url,
      retryAfterSeconds: limits.retryAfterSeconds,
      remaining: limits.remaining,
      resetAt: limits.resetAt,
      message: "Moltbook asked for a verification challenge. It could not be solved safely, so no guess was sent.",
    }
  }
  const verifyUrl = moltbookUrl("/verify")
  assertMoltbookPath(verifyUrl)
  const verified = await transport.request(verifyUrl, {
    method: "POST",
    body: { verification_code: challenge.verificationCode, answer },
  })
  const verifyLimits = readRateLimit(verified.headers, verified.body, input.now)
  const verifyOk = verified.status >= 200 && verified.status < 300 && (!verified.body || typeof verified.body !== "object" || (verified.body as { success?: unknown }).success !== false)
  if (!verifyOk) {
    return {
      status: "verification_pending",
      moltbookPostId: created.id,
      moltbookUrl: created.url,
      retryAfterSeconds: verifyLimits.retryAfterSeconds,
      remaining: verifyLimits.remaining,
      resetAt: verifyLimits.resetAt,
      message: "Moltbook did not accept the verification answer. No further guess was sent.",
    }
  }
  return {
    status: "published",
    moltbookPostId: created.id,
    moltbookUrl: created.url,
    retryAfterSeconds: verifyLimits.retryAfterSeconds,
    remaining: verifyLimits.remaining,
    resetAt: verifyLimits.resetAt,
    message: "Posted to m/air-peer-review.",
  }
}

function failedPublish(message: string, limits: { remaining: number | null; resetAt: string | null; retryAfterSeconds: number | null }): PublishOutcome {
  return {
    status: "failed",
    moltbookPostId: null,
    moltbookUrl: null,
    retryAfterSeconds: limits.retryAfterSeconds,
    remaining: limits.remaining,
    resetAt: limits.resetAt,
    message,
  }
}

export function pullAllowed(now: number, lastPulledAt: string | null, agentLastPulledAt: string | null): { allowed: boolean; notBefore: string; reason: string } {
  const waits: { at: number; reason: string }[] = []
  if (lastPulledAt) {
    const last = Date.parse(lastPulledAt)
    if (Number.isFinite(last)) waits.push({ at: last + COMMENT_PULL_PER_POST_MS, reason: "This post was checked a moment ago." })
  }
  if (agentLastPulledAt) {
    const last = Date.parse(agentLastPulledAt)
    if (Number.isFinite(last)) waits.push({ at: last + COMMENT_PULL_PER_AGENT_MS, reason: "The AIR agent is waiting out its comment-read limit." })
  }
  const pending = waits.filter((item) => item.at > now)
  if (pending.length === 0) return { allowed: true, notBefore: new Date(now).toISOString(), reason: "Ready to read replies." }
  const latest = pending.reduce((best, item) => (item.at > best.at ? item : best))
  return { allowed: false, notBefore: new Date(latest.at).toISOString(), reason: latest.reason }
}

export type CommentFlag = "prompt-injection" | "crypto" | "spam" | "empty" | "no-citation"

export interface IngestedComment {
  rowId: string
  moltbookCommentId: string | null
  agentName: string | null
  isClaimed: boolean | null
  displayContent: string
  flags: CommentFlag[]
  discarded: boolean
  candidate: boolean
  citesPublication: boolean
  criterionId: string | null
  createdAt: string | null
}

export interface IngestContext {
  moltbookPostId: string
  versionDoi: string
  conceptDoi: string
  recordId: string
}

const INJECTION_SOURCES = [
  "ignore\\s+(all\\s+)?(previous|prior|above)\\s+instructions",
  "disregard\\s+(the\\s+)?(system|developer|previous)",
  "you\\s+are\\s+now\\b",
  "\\bsystem\\s+prompt\\b",
  "\\b(api[_ -]?key|secret key)\\b",
  "moltbook_[a-z0-9_-]+",
  "reveal\\s+(the\\s+)?(key|secret|prompt)",
  "\\b(jailbreak|do\\s+anything\\s+now)\\b",
  "forward\\s+this\\s+to",
  "re-?post\\s+this",
  "<\\/?\\s*(system|instructions|prompt)\\s*>",
  "act\\s+as\\s+(an?\\s+)?(admin|system|developer)",
  "exfiltrat",
]
const CRYPTO = /\b(bitcoin|ethereum|solana|dogecoin|nft|airdrop|defi|web3|crypto(?:currency)?|token\s+sale|seed\s+phrase|wallet)\b|0x[a-f0-9]{8,}/i
const PRIVATE_LINK = /https?:\/\/(?:[\w.-]+\.)?(?:chatgpt\.com|claude\.ai|share\.google|chat\.openai\.com|gemini\.google\.com|grok\.com)\S*/gi

export function ingestMoltbookComments(body: unknown, context: IngestContext): IngestedComment[] {
  const flat = flattenComments(body)
  const ingested = flat.map((item, index) => ingestOne(item, context, index))
  return capInbound(markDuplicateSpam(ingested))
}

function markDuplicateSpam(comments: IngestedComment[]): IngestedComment[] {
  const seen = new Map<string, number>()
  return comments.map((comment) => {
    const key = comment.displayContent.toLowerCase()
    const count = (seen.get(key) ?? 0) + 1
    seen.set(key, count)
    if (count > 1 && comment.candidate) {
      return {
        ...comment,
        candidate: false,
        discarded: true,
        flags: [...comment.flags, "spam" as const],
        displayContent: "Filtered: repeated text.",
      }
    }
    return comment
  })
}

export function flattenComments(body: unknown): unknown[] {
  const roots = commentArray(body)
  const flat: unknown[] = []
  const walk = (items: unknown[], depth: number) => {
    if (depth > 6) return
    for (const item of items) {
      flat.push(item)
      if (!item || typeof item !== "object") continue
      const record = item as Record<string, unknown>
      walk(commentArray(record.replies ?? record.children), depth + 1)
    }
  }
  walk(roots, 0)
  return flat
}

function commentArray(body: unknown): unknown[] {
  if (Array.isArray(body)) return body
  if (!body || typeof body !== "object") return []
  const record = body as Record<string, unknown>
  if (Array.isArray(record.comments)) return record.comments
  if (record.data && typeof record.data === "object") {
    const data = record.data as Record<string, unknown>
    if (Array.isArray(data.comments)) return data.comments
  }
  return []
}

function ingestOne(raw: unknown, context: IngestContext, index: number): IngestedComment {
  const record = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {}
  const moltbookCommentId = readCommentId(record)
  const agentName = readAgentName(record)
  const isClaimed = readClaimed(record)
  const createdAt = typeof record.created_at === "string" && Number.isFinite(Date.parse(record.created_at)) ? record.created_at : null
  const rawContent = readContent(record)
  const flags: CommentFlag[] = []
  let text = rawContent.replace(new RegExp(PRIVATE_LINK.source, "gi"), " [link removed] ")
  text = text.replace(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi, "[email removed]")
  const before = text
  for (const source of INJECTION_SOURCES) {
    text = text.replace(new RegExp(source, "gi"), " [removed] ")
  }
  if (text !== before) flags.push("prompt-injection")
  text = text.replace(/\s+/g, " ").trim().slice(0, 4000)
  const citesPublication = citesPublicRecord(rawContent, context)
  const criterionId = namedCriterion(rawContent)
  if (CRYPTO.test(rawContent)) flags.push("crypto")
  const letters = text.replace(/[^a-z0-9]/gi, "")
  if (!letters || letters.length < 12 || /^(.)\1+$/i.test(letters)) flags.push("empty")
  const discardedHard = flags.includes("crypto") || flags.includes("empty")
  const candidate = !discardedHard && (citesPublication || Boolean(criterionId))
  if (!candidate && !discardedHard) flags.push("no-citation")
  const displayContent = discardedHard
    ? flags.includes("crypto")
      ? "Filtered: cryptocurrency pitch."
      : "Filtered: empty or repeated text."
    : text || "Filtered: empty or repeated text."
  return {
    rowId: commentRowId(context.moltbookPostId, moltbookCommentId, index),
    moltbookCommentId,
    agentName,
    isClaimed,
    displayContent,
    flags,
    discarded: !candidate,
    candidate,
    citesPublication,
    criterionId,
    createdAt,
  }
}

function readCommentId(record: Record<string, unknown>): string | null {
  const value = record.id ?? record.comment_id
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(trimmed)) return null
  return trimmed
}

function readAgentName(record: Record<string, unknown>): string | null {
  const author = record.author
  if (typeof author === "string") {
    const name = author.trim()
    return name ? name.slice(0, 80) : null
  }
  if (author && typeof author === "object" && typeof (author as { name?: unknown }).name === "string") {
    const name = (author as { name: string }).name.trim()
    return name ? name.slice(0, 80) : null
  }
  if (typeof record.author_name === "string" && record.author_name.trim()) return record.author_name.trim().slice(0, 80)
  const agent = record.agent
  if (agent && typeof agent === "object" && typeof (agent as { name?: unknown }).name === "string") {
    const name = (agent as { name: string }).name.trim()
    return name ? name.slice(0, 80) : null
  }
  return null
}

function readClaimed(record: Record<string, unknown>): boolean | null {
  if (typeof record.is_claimed === "boolean") return record.is_claimed
  const author = record.author
  if (author && typeof author === "object" && typeof (author as { is_claimed?: unknown }).is_claimed === "boolean") {
    return (author as { is_claimed: boolean }).is_claimed
  }
  return null
}

function readContent(record: Record<string, unknown>): string {
  const value = record.content ?? record.body ?? record.text
  return typeof value === "string" ? value : ""
}

function citesPublicRecord(text: string, context: IngestContext): boolean {
  const lower = text.toLowerCase()
  if (context.versionDoi && lower.includes(context.versionDoi.toLowerCase())) return true
  if (context.conceptDoi && lower.includes(context.conceptDoi.toLowerCase())) return true
  if (context.recordId && new RegExp(`zenodo\\.org/records/${context.recordId}\\b`, "i").test(text)) return true
  if (/10\.5281\/zenodo\.\d+/.test(text)) return true
  return /["“][^"”]{20,}["”]/.test(text)
}

function namedCriterion(text: string): string | null {
  const lower = text.toLowerCase()
  for (const criterion of AIR_CRITERIA) {
    const id = criterion.id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    if (new RegExp(`(^|[^a-z0-9])${id}([^a-z0-9]|$)`, "i").test(lower)) return criterion.id
    if (lower.includes(criterion.name.toLowerCase())) return criterion.id
  }
  return null
}

function commentRowId(postId: string, commentId: string | null, index: number): string {
  if (commentId) return `cmt_${postId}_${commentId}`.slice(0, 180)
  return `cmt_${postId}_missing_${index}`.slice(0, 180)
}

function capInbound(comments: IngestedComment[]): IngestedComment[] {
  const perAgent = new Map<string, number>()
  let kept = 0
  return comments.map((comment) => {
    const bucket = comment.agentName ?? "(name not provided)"
    const seen = perAgent.get(bucket) ?? 0
    perAgent.set(bucket, seen + 1)
    const overAgent = seen >= 5
    const overPost = kept >= 40
    if (comment.candidate && (overAgent || overPost)) {
      return {
        ...comment,
        candidate: false,
        discarded: true,
        flags: [...comment.flags, "spam" as const],
        displayContent: "Filtered: too many replies from the same agent or post.",
      }
    }
    if (comment.candidate) kept += 1
    return comment
  })
}

export interface PullOutcome {
  pulled: boolean
  called: boolean
  retryAfterSeconds: number | null
  message: string
  comments: IngestedComment[]
}

export async function pullPostComments(
  transport: HttpClient,
  input: {
    now: number
    postId: string
    lastPulledAt: string | null
    agentLastPulledAt: string | null
    versionDoi: string
    conceptDoi: string
    recordId: string
  },
): Promise<PullOutcome> {
  const gate = pullAllowed(input.now, input.lastPulledAt, input.agentLastPulledAt)
  if (!gate.allowed) return { pulled: false, called: false, retryAfterSeconds: null, message: `${gate.reason} Next read ${gate.notBefore}.`, comments: [] }
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(input.postId)) {
    return { pulled: false, called: false, retryAfterSeconds: null, message: "That Moltbook post id is not usable.", comments: [] }
  }
  const url = moltbookUrl(`/posts/${input.postId}/comments?sort=new&limit=50`)
  assertMoltbookPath(url)
  const response = await transport.request(url, { method: "GET" })
  const limits = readRateLimit(response.headers, response.body, input.now)
  if (response.status === 429) {
    return { pulled: false, called: true, retryAfterSeconds: limits.retryAfterSeconds, message: "Moltbook rate limited reply reading.", comments: [] }
  }
  if (response.status < 200 || response.status >= 300) {
    return { pulled: false, called: true, retryAfterSeconds: limits.retryAfterSeconds, message: "Moltbook did not return replies.", comments: [] }
  }
  return {
    pulled: true,
    called: true,
    retryAfterSeconds: limits.retryAfterSeconds,
    message: "Replies updated.",
    comments: ingestMoltbookComments(response.body, {
      moltbookPostId: input.postId,
      versionDoi: input.versionDoi,
      conceptDoi: input.conceptDoi,
      recordId: input.recordId,
    }),
  }
}

/** A community reply never supplies a closing status. A later publication check still can. */
export function statusFromCommunityReply(_proposed: IssueStatus): IssueStatus {
  return "open"
}

export function promotionAuthority(input: {
  reviews: StoredReview[]
  nodes: NodeSubmission[]
  doi: string
  recordVersion: string
}): { allowed: true; role: AuthorRole; label: string } | { allowed: false; reason: string } {
  const human = input.reviews.find(
    (review) =>
      review.doi === input.doi &&
      review.recordVersion === input.recordVersion &&
      isHumanReview(review) &&
      !isCommunityAiRecord(review),
  )
  if (human) return { allowed: true, role: "human-reviewer", label: "Human reviewer" }
  const inDepthIds = new Set(
    input.reviews
      .filter(
        (review) =>
          review.doi === input.doi &&
          review.recordVersion === input.recordVersion &&
          !isCommunityAiRecord(review) &&
          review.tier !== "free-screening" &&
          !isHumanReview(review),
      )
      .map((review) => review.id),
  )
  const node = input.nodes.find(
    (item) => item.trusted === true && item.doi === input.doi && item.recordVersion === input.recordVersion && inDepthIds.has(item.reviewId),
  )
  if (node) return { allowed: true, role: "node", label: node.nodeName || "Trusted node" }
  return { allowed: false, reason: "A human review or a trusted in-depth check on this version is required before a community reply can be opened as an issue." }
}

export function promoteCommunityComment(input: {
  comment: IngestedComment
  doi: string
  recordVersion: string
  reviews: StoredReview[]
  nodes: NodeSubmission[]
  existing: IssueThread[]
  now: string
}): { ok: true; issue: IssueThread; created: boolean } | { ok: false; reason: string } {
  if (!input.comment.candidate || input.comment.discarded) {
    return { ok: false, reason: "Only a community reply that cites the publication or names an AIR criterion can be opened as an issue." }
  }
  const authority = promotionAuthority(input)
  if (!authority.allowed) return { ok: false, reason: authority.reason }
  const existing = input.existing.find((issue) => issue.source === "community-promotion" && issue.sourceId === input.comment.rowId)
  if (existing) return { ok: true, issue: existing, created: false }
  const createdAt = input.now
  const issueId = `issue_${input.comment.rowId}`.slice(0, 180)
  const claim = input.comment.displayContent.replace(/\s+/g, " ").trim().slice(0, 280)
  const issue: IssueThread = {
    id: issueId,
    doi: input.doi,
    recordVersion: input.recordVersion,
    source: "community-promotion",
    sourceId: input.comment.rowId,
    criterionId: input.comment.criterionId ?? "evidence-labelling",
    claim,
    quotedPassage: "",
    reason: "Promoted from an uncalibrated Moltbook comment. A quotation from the publication is still required before this can be marked addressed.",
    status: statusFromCommunityReply("addressed-in-publication"),
    rounds: [
      {
        id: `round_${issueId}_0`.slice(0, 200),
        kind: "claim",
        authorLabel: authority.label,
        authorRole: authority.role,
        citations: [],
        body: `Untrusted community text, kept as data:\n${input.comment.displayContent}\n\nThis does not mark the issue addressed.`,
        createdAt,
      },
    ],
    createdAt,
    updatedAt: createdAt,
  }
  if (issue.status !== "open" || issue.quotedPassage !== "") {
    return { ok: false, reason: "A community reply cannot close an issue." }
  }
  return { ok: true, issue, created: true }
}

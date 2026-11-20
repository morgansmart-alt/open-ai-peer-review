import { createClient } from "@supabase/supabase-js"
import { sha256Hex } from "./hash.ts"

export type PrivateArchive =
  | { state: "saved"; id: string; secret: string; snapshot: "pending" | "archived" | "fetch_failed" }
  | { state: "local-only" }
  | { state: "rejected"; reason: string }

export type ReceiptLookup =
  | { state: "ok"; rows: { id: string; doi: string; provider: string | null; snapshot_status: string | null; created_at: string }[] }
  | { state: "unavailable" }
  | { state: "rejected"; reason: string }

function configured(): { url: string; key: string } | null {
  const url = import.meta.env.VITE_SUPABASE_URL?.trim()
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()
  if (!url || !key) return null
  return { url, key }
}

function missingFeature(message: string): boolean {
  return /PGRST202|PGRST204|PGRST205|could not find the|schema cache|does not exist/i.test(message)
}

function newSecret(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("")
}

export async function savePrivateContext(input: {
  doi: string
  issueId?: string | null
  reviewId?: string | null
  linkUrl: string
  provider: string
}): Promise<PrivateArchive> {
  const board = configured()
  if (!board) return { state: "local-only" }
  const id = crypto.randomUUID()
  const secret = newSecret()
  const receiptHash = await sha256Hex(secret)
  const response = await fetch(`${board.url}/rest/v1/air_private_context`, {
    method: "POST",
    headers: {
      apikey: board.key,
      Authorization: `Bearer ${board.key}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({
      id,
      review_id: input.reviewId ?? null,
      issue_id: input.issueId ?? null,
      doi: input.doi,
      link_url: input.linkUrl,
      provider: input.provider,
      snapshot_text: null,
      snapshot_status: "pending",
      receipt_hash: receiptHash,
    }),
  })
  if (response.status === 404 || response.status === 400) {
    const message = await response.text()
    if (missingFeature(message) || response.status === 404) return { state: "local-only" }
    return { state: "rejected", reason: message.slice(0, 240) || "The private archive refused that link." }
  }
  if (!response.ok) {
    const message = await response.text()
    if (missingFeature(message)) return { state: "local-only" }
    return { state: "rejected", reason: message.slice(0, 240) || "The private archive refused that link." }
  }
  let snapshot: "pending" | "archived" | "fetch_failed" = "pending"
  try {
    const archived = await fetch(`${board.url}/functions/v1/archive-context`, {
      method: "POST",
      headers: {
        apikey: board.key,
        Authorization: `Bearer ${board.key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ id }),
    })
    if (archived.ok) {
      const body = (await archived.json()) as { snapshot_status?: string }
      if (body.snapshot_status === "archived" || body.snapshot_status === "fetch_failed") snapshot = body.snapshot_status
    }
  } catch {
    snapshot = "pending"
  }
  return { state: "saved", id, secret, snapshot }
}

export async function lookupReceipt(secret: string): Promise<ReceiptLookup> {
  const trimmed = secret.trim()
  if (trimmed.length < 16 || trimmed.length > 200) return { state: "rejected", reason: "That receipt does not look complete." }
  const board = configured()
  if (!board) return { state: "unavailable" }
  const sb = createClient(board.url, board.key)
  const { data, error } = await sb.rpc("air_my_context", { p_secret: trimmed })
  if (error) {
    if (missingFeature(error.message)) return { state: "unavailable" }
    return { state: "rejected", reason: error.message }
  }
  const rows = Array.isArray(data) ? data : []
  return {
    state: "ok",
    rows: rows.map((row) => ({
      id: String(row.id),
      doi: String(row.doi),
      provider: row.provider == null ? null : String(row.provider),
      snapshot_status: row.snapshot_status == null ? null : String(row.snapshot_status),
      created_at: String(row.created_at),
    })),
  }
}

export function downloadReceipt(secret: string, doi: string): void {
  const file = new Blob(
    [`AIR private context receipt\nDOI: ${doi}\nSecret: ${secret}\nAIR does not keep this secret. Anyone who has it can read that private archive.\n`],
    { type: "text/plain" },
  )
  const url = URL.createObjectURL(file)
  const link = document.createElement("a")
  link.href = url
  link.download = "air-context-receipt.txt"
  link.click()
  URL.revokeObjectURL(url)
}

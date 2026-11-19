export const MAX_CONVERSATION_LINKS = 10

/** Fake share URL for tests and the demo form. Not a real conversation. */
export const EXAMPLE_GOOGLE_AI_MODE_URL = "https://share.google/aimode/EXAMPLE"

export const PRIVATE_CONTEXT_NOTICE =
  "These links are sent only to the AI provider you pick for this check. They are never published, scored, or used in the ranking. Anyone who already has a share link can still open it, so only add a conversation you are happy for that provider to read. If the model cannot open a link, it must say so and must not invent what the chat said."

const PRIVATE_KEY = "air.private-context.v1"

export interface ConversationLink {
  url: string
  provider: string
  note: string
}

interface PrivateContextStore {
  submissions: Record<string, ConversationLink[]>
  rounds: Record<string, ConversationLink>
  nodes: Record<string, ConversationLink>
}

function emptyStore(): PrivateContextStore {
  return { submissions: {}, rounds: {}, nodes: {} }
}

function submissionKey(doi: string, recordVersion: string): string {
  return `${doi}@@${recordVersion}`
}

function readStore(): PrivateContextStore {
  try {
    if (typeof localStorage === "undefined") return emptyStore()
    const raw = localStorage.getItem(PRIVATE_KEY)
    if (!raw) return emptyStore()
    const parsed = JSON.parse(raw) as Partial<PrivateContextStore>
    return {
      submissions: parsed.submissions ?? {},
      rounds: parsed.rounds ?? {},
      nodes: parsed.nodes ?? {},
    }
  } catch {
    return emptyStore()
  }
}

function writeStore(store: PrivateContextStore): void {
  if (typeof localStorage === "undefined") return
  localStorage.setItem(PRIVATE_KEY, JSON.stringify(store))
}

export function saveSubmissionLinks(doi: string, recordVersion: string, links: ConversationLink[]): void {
  const store = readStore()
  store.submissions[submissionKey(doi, recordVersion)] = links
  writeStore(store)
}

export function loadSubmissionLinks(doi: string, recordVersion: string): ConversationLink[] {
  return readStore().submissions[submissionKey(doi, recordVersion)] ?? []
}

export function saveRoundLink(roundId: string, link: ConversationLink): void {
  const store = readStore()
  store.rounds[roundId] = link
  writeStore(store)
}

export function loadRoundLink(roundId: string): ConversationLink | undefined {
  return readStore().rounds[roundId]
}

export function saveNodeLink(nodeId: string, link: ConversationLink): void {
  const store = readStore()
  store.nodes[nodeId] = link
  writeStore(store)
}

export function providerFromUrl(url: string): string {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return "Other"
  }
  const host = parsed.hostname.replace(/^www\./, "").toLowerCase()
  const path = parsed.pathname.toLowerCase()
  if (host === "share.google" && path.startsWith("/aimode")) return "Google AI Mode"
  if (host === "chatgpt.com" || host.endsWith(".chatgpt.com") || host === "chat.openai.com") return "ChatGPT"
  if (host === "claude.ai" || host.endsWith(".claude.ai")) return "Claude"
  if (host === "gemini.google.com" || host === "aistudio.google.com") return "Gemini"
  if (host === "grok.com" || host.endsWith(".grok.com") || host === "grok.x.ai") return "Grok"
  if (host === "perplexity.ai" || host.endsWith(".perplexity.ai")) return "Perplexity"
  if (host === "x.com" || host === "twitter.com") return "Grok"
  return "Other"
}

export function parseConversationLink(url: string, note: string): { ok: true; link: ConversationLink } | { ok: false; error: string } {
  const trimmed = url.trim()
  if (!trimmed) return { ok: false, error: "Enter a link, or leave the row blank." }
  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    return { ok: false, error: "That is not a valid link." }
  }
  if (parsed.protocol !== "https:") return { ok: false, error: "Only https links can be added." }
  return {
    ok: true,
    link: {
      url: parsed.toString(),
      provider: providerFromUrl(parsed.toString()),
      note: note.trim().slice(0, 240),
    },
  }
}

export function collectConversationLinks(rows: { url: string; note: string }[]): { ok: true; links: ConversationLink[] } | { ok: false; error: string } {
  const filled = rows.filter((row) => row.url.trim() || row.note.trim())
  if (filled.length > MAX_CONVERSATION_LINKS) {
    return { ok: false, error: `Add at most ${MAX_CONVERSATION_LINKS} conversation links.` }
  }
  const links: ConversationLink[] = []
  for (const row of filled) {
    const parsed = parseConversationLink(row.url, row.note)
    if (!parsed.ok) return parsed
    links.push(parsed.link)
  }
  return { ok: true, links }
}

export function conversationPromptBlock(links: ConversationLink[] | undefined): string {
  if (!links || links.length === 0) return "Private AI context links: none."
  return [
    "Private AI context links supplied for this assessment only (unverified, not fetched by AIR).",
    "Do not score them. They do not change the ranking. They are not peer review.",
    "If you cannot open a link, say so. Never invent what a conversation said.",
    "A chat link cannot make an issue ADDRESSED. Only a quotation from the publication itself can do that.",
    ...links.map((link) => `- ${link.provider}: ${link.url}${link.note ? ` — ${link.note}` : ""}`),
  ].join("\n")
}

export function publicContextCount(count: number | undefined): string | null {
  if (!count) return null
  return `Author supplied ${count} private AI context link${count === 1 ? "" : "s"}`
}

export function stripPrivateContext<T extends { conversationLinks?: ConversationLink[]; privateContextCount?: number }>(
  record: T,
): Omit<T, "conversationLinks"> & { privateContextCount: number } {
  const { conversationLinks, ...rest } = record
  return { ...rest, privateContextCount: conversationLinks?.length ?? record.privateContextCount ?? 0 }
}

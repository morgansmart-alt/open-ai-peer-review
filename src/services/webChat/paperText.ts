import { CAREFUL_REVIEW_ENDING } from "../prompts.ts"
import { isOpenFiles, stripHtml, type ZenodoRecord } from "../zenodo.ts"

/** The phrase a metadata-only page and the reviewer prompt share. */
export const FULL_TEXT_UNAVAILABLE = "Full text unavailable"

export const PAPER_TEXT_ORIGIN = "https://morgansmart-alt.github.io/open-ai-peer-review"
/** Plain text a chat can fetch. GitHub Pages serves the app shell with HTTP 404. */
export const PAPER_TEXT_FUNCTION = "https://lotswxboafsenmszijpf.supabase.co/functions/v1/paper-text"

const PRIVATE_CHAT =
  /https?:\/\/(?:www\.)?(?:share\.google\/aimode\/[^\s)"']+|chatgpt\.com\/share\/[^\s)"']+|chat\.openai\.com\/share\/[^\s)"']+|claude\.ai\/share\/[^\s)"']+|grok\.com\/share\/[^\s)"']+)/gi

export const MANUAL_PASTE_SITE = "manual paste"

export function paperTextRecordId(record: { id?: string; doi?: string }): string {
  const id = (record.id ?? "").trim()
  if (/^\d+$/.test(id)) return id
  const doi = (record.doi ?? "").replace(/^https?:\/\/doi\.org\//i, "")
  return doi.match(/zenodo\.(\d+)$/i)?.[1] ?? ""
}

export function paperTextPath(recordId: string): string {
  return `/paper/${encodeURIComponent(recordId)}/text`
}

/** Static file on GitHub Pages. A .txt file is HTTP 200 with content-type text/plain. */
export function paperTextUrl(recordId: string, origin = PAPER_TEXT_ORIGIN): string {
  return `${origin.replace(/\/$/, "")}/paper-text/${encodeURIComponent(recordId)}.txt`
}

/** Secondary plain-text service. Zenodo often refuses this host, so it is tried after the static file. */
export function paperTextFunctionUrl(recordId: string, endpoint = PAPER_TEXT_FUNCTION): string {
  return `${endpoint.replace(/\/$/, "")}?id=${encodeURIComponent(recordId)}`
}

export function paperTextCandidates(recordId: string): string[] {
  return [paperTextUrl(recordId), paperTextFunctionUrl(recordId)]
}

export function recordIdFromPaperTextUrl(url: string): string | null {
  try {
    const parsed = new URL(url)
    const file = parsed.pathname.match(/\/paper-text\/(\d+)\.txt$/)
    if (file?.[1]) return file[1]
    const query = parsed.searchParams.get("id")
    if (query && /^\d+$/.test(query)) return query
    const route = parsed.pathname.match(/\/paper\/(\d+)\/text\/?$/)
    return route?.[1] ?? null
  } catch {
    return null
  }
}

function paperPageRank(page: { url: string; body: string }): number {
  const pdf = pdfBodyChars(page.body)
  const closed = pageSaysFilesClosed(page.body) || (pageSaysFullTextUnavailable(page.body) && pdf === 0)
  const service = page.url.includes("/functions/v1/paper-text") ? 1 : 0
  if (pdf > 0 && !pageSaysFilesClosed(page.body)) return 300 + service
  if (pdf > 0) return 200 + service
  if (!closed && /^##\s+\S+/m.test(page.body)) return 100 + service
  return service
}

export async function choosePaperTextPage(
  recordId: string,
  load: (url: string) => Promise<{ status: number; body: string }>,
): Promise<{ url: string; body: string; unavailable: boolean } | null> {
  const found: { url: string; body: string }[] = []
  for (const url of paperTextCandidates(recordId)) {
    try {
      const loaded = await load(url)
      if (textPageHasPaper(loaded.status, loaded.body)) found.push({ url, body: loaded.body })
    } catch {
      // The next address is tried.
    }
  }
  found.sort((left, right) => paperPageRank(right) - paperPageRank(left))
  const best = found[0]
  if (!best) return null
  const unavailable = fullTextPanelLine(best.body) === "Full text unavailable"
  return { url: best.url, body: best.body, unavailable }
}

export async function choosePaperTextUrl(
  recordId: string,
  load: (url: string) => Promise<{ status: number; body: string }>,
): Promise<string | null> {
  return (await choosePaperTextPage(recordId, load))?.url ?? null
}

export function paperTextRecordIdFromPath(pathname: string): string | null {
  const match = pathname.match(/\/paper\/([^/]+)\/text\/?$/)
  if (!match?.[1]) return null
  try {
    return decodeURIComponent(match[1])
  } catch {
    return match[1]
  }
}

export function isPublicPaperTextUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    if (parsed.origin === "https://lotswxboafsenmszijpf.supabase.co" && parsed.pathname === "/functions/v1/paper-text") {
      return /^\d+$/.test(parsed.searchParams.get("id") ?? "")
    }
    if (parsed.origin === "https://morgansmart-alt.github.io") {
      return /\/open-ai-peer-review\/paper-text\/\d+\.txt$/.test(parsed.pathname) || /\/open-ai-peer-review\/paper\/[^/]+\/text\/?$/.test(parsed.pathname)
    }
    return false
  } catch {
    return false
  }
}

function doiUrl(doi: string | undefined): string {
  const cleaned = (doi ?? "").trim().replace(/^https?:\/\/doi\.org\//i, "")
  if (!/^10\.\S+/.test(cleaned) || cleaned === "local-file") return ""
  return `https://doi.org/${cleaned}`
}

function scrub(text: string): string {
  return text.replace(PRIVATE_CHAT, "[private link]")
}

/**
 * The public text of one record. Restricted files are named, not downloaded.
 * Private chat links are removed.
 */
export function formatPaperText(
  record: ZenodoRecord,
  documents: { filename: string; text: string }[],
  unavailable = "",
): string {
  const authors = record.creators.map((creator) => creator.name.trim()).filter(Boolean)
  const versionId = paperTextRecordId(record)
  const versionUrl = versionId ? `https://zenodo.org/records/${versionId}` : ""
  const filesOpen = isOpenFiles(record.access.files)
  const extracted = filesOpen
    ? documents
        .filter((document) => document.text.trim())
        .map((document) => `## ${document.filename}\n${scrub(document.text.trim())}`)
    : []
  let body = extracted.join("\n\n")
  if (!body) {
    const names = record.files.map((file) => file.key).filter(Boolean)
    const reason = !filesOpen
      ? "The files on this record are not public. This page does not include them."
      : unavailable.trim() || "No file text was copied onto this page."
    body = [
      scrub(stripHtml(record.description)),
      names.length ? `Public file names only: ${names.join(", ")}.` : "",
      `${FULL_TEXT_UNAVAILABLE}. ${reason}`,
    ]
      .filter(Boolean)
      .join("\n\n")
  }
  const header = [record.title.trim() || "Untitled record", `Authors: ${authors.join("; ") || "not listed"}`, ""]
  if (versionUrl) header.push(`Zenodo record: ${versionUrl}`)
  const versionDoi = doiUrl(record.doi)
  const conceptDoi = doiUrl(record.conceptDoi)
  if (versionDoi) header.push(`Version DOI: ${versionDoi}`)
  if (conceptDoi) header.push(`Concept DOI: ${conceptDoi}`)
  header.push("", body)
  return header.join("\n")
}

/** Shown on the saved row when the page the model opens is not the paper. */
export const FULL_TEXT_PANEL_NOTE = "Full text unavailable"

const FILES_CLOSED = /the files on this record are not public/i

export function pageSaysFullTextUnavailable(body: string): boolean {
  return new RegExp(`(?:^|\\n)${FULL_TEXT_UNAVAILABLE}\\.`, "m").test(body)
}

export function pageSaysFilesClosed(body: string): boolean {
  return FILES_CLOSED.test(body)
}

/** Characters under a `## something.pdf` heading. That is the extracted paper, not the record outline. */
export function pdfBodyChars(page: string): number {
  let count = 0
  for (const chunk of page.split(/\n(?=## )/)) {
    const heading = chunk.trimStart().match(/^##\s+(.+)$/m)?.[1]?.trim() ?? ""
    if (!/\.pdf\b/i.test(heading)) continue
    count += chunk.replace(/^##\s+.+\n?/, "").trim().length
  }
  return count
}

/** The panel line for a fetched paper-text page. */
export function fullTextPanelLine(body: string): string {
  const pdf = pdfBodyChars(body)
  const closed = pageSaysFilesClosed(body) || pageSaysFullTextUnavailable(body)
  if (pdf > 0 && !pageSaysFilesClosed(body)) return `Full text included (${pdf} chars from PDF)`
  if (closed) return "Full text unavailable"
  const chars = body.trim().length
  if (chars >= 80) return `Full text included (${chars} chars)`
  return "Full text unavailable"
}

export function withFullTextUnavailable(prompt: string): string {
  return `${FULL_TEXT_PANEL_NOTE}. The public page is record metadata, so this review must not treat it as the paper.\n\n${prompt}`
}

/** Drop the closed-files sentence once a PDF body is present, so the reviewer is not told the paper is missing. */
export function paperForReviewer(body: string): string {
  if (pdfBodyChars(body) === 0) return body.trim()
  return body
    .split("\n")
    .filter((line) => !FILES_CLOSED.test(line) && !new RegExp(`^${FULL_TEXT_UNAVAILABLE}\\.`).test(line.trim()))
    .join("\n")
    .trim()
}

const READ_THE_PAGE = "The paper is on the public text page named above. Read that page. Do not ask for an attachment."
const SCORE_THE_COPY = "The paper text is copied above. Score that text. Do not open the Zenodo record page for the paper. Do not ask for an attachment."

/**
 * The link route. When the service text is known, it is copied into the message.
 * The system prompt is not repeated here. The instructions are the compact rubric.
 */
export function linkReadingPrompt(url: string, instructions: string, paper = ""): string {
  const copied = paper.trim()
  const rubric = copied ? instructions.replaceAll(READ_THE_PAGE, SCORE_THE_COPY) : instructions
  if (!copied) {
    return [
      "Open this public text page and read the full paper. No sign-in is required.",
      url,
      "",
      "Use only the paper text on that page. Do not invent data. Do not ask for an attachment.",
      CAREFUL_REVIEW_ENDING,
      "Score that paper with the instructions below.",
      "",
      rubric,
    ].join("\n")
  }
  return [
    "The paper text is copied below from the public text page. Score only that text.",
    "The Zenodo record link is the citation. It is not the paper. Do not ask for an attachment.",
    `Public text: ${url}`,
    "",
    copied,
    "",
    "Use only the paper text above. Do not invent data.",
    CAREFUL_REVIEW_ENDING,
    "Score that paper with the instructions below.",
    "",
    rubric,
  ].join("\n")
}

const ACCESS_FAILURE =
  /could not (?:access|open|read|fetch|browse|reach)|couldn't (?:access|open|read|fetch|browse)|cannot (?:access|open|read|browse)|can't (?:access|open|read)|unable to (?:access|open|read|fetch|reach)|no access to (?:the |that )?(?:url|page|link)|page not found|sign in to (?:view|read|continue)|login required|failed to (?:load|fetch|open)|403 forbidden|404\b/i

/** True when the chat did not return a score and says it could not open the page. */
export function couldNotReadPaper(reply: string): boolean {
  if (/"overallScore"\s*:\s*-?\d+/.test(reply)) return false
  return ACCESS_FAILURE.test(reply)
}

export const TEXT_PAGE_NOTE = "text page unreachable, model used other sources"

/** A fetched page is usable only when the host returns 200 and the paper text is in the body. */
export function textPageHasPaper(status: number, body: string): boolean {
  if (status !== 200) return false
  if (/<div id=["']root["']>\s*<\/div>/.test(body) && !/Zenodo record:/.test(body)) return false
  const text = body.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
  if (!/Zenodo record:|Version DOI:/.test(text)) return false
  return text.length >= 80
}

function missingContextText(reply: string): string {
  const match = reply.match(/"missingContext"\s*:\s*"((?:\\.|[^"\\])*)"/i)
  if (!match?.[1]) return ""
  return match[1].replace(/\\"/g, '"').replace(/\\n/g, " ")
}

/** A finished score that says the text page failed, including a note buried in air_feedback. */
export function textPageUntrusted(reply: string): boolean {
  const context = missingContextText(reply)
  const failed = /404|could not open|couldn't open|cannot open|can't open|unable to (?:open|access|reach)|page not found|not reachable|failed to (?:open|load|fetch)|returned 404/i
  const aboutPage = /paper\/[^/\s"']+\/text|open-ai-peer-review|text page|github\.io|paper-text|functions\/v1\/paper-text/i
  if (context && failed.test(context) && (aboutPage.test(context) || /url|link|page/i.test(context))) return true
  return aboutPage.test(reply) && failed.test(reply)
}

export function manualPasteModel(typed: string): string {
  const clean = typed.trim()
  return clean || "unknown"
}

import type { ZenodoRecord } from "../zenodo.ts"
import { stripHtml } from "../zenodo.ts"

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

/** Public plain-text endpoint. The id is a query parameter, so a fetch keeps it. */
export function paperTextUrl(recordId: string, endpoint = PAPER_TEXT_FUNCTION): string {
  const base = endpoint.replace(/\/$/, "")
  return `${base}?id=${encodeURIComponent(recordId)}`
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
      return /\/open-ai-peer-review\/paper\/[^/]+\/text\/?$/.test(parsed.pathname)
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
): string {
  const authors = record.creators.map((creator) => creator.name.trim()).filter(Boolean)
  const versionId = paperTextRecordId(record)
  const versionUrl = versionId ? `https://zenodo.org/records/${versionId}` : ""
  const filesOpen = record.access.files === "open" || record.access.files === ""
  const extracted = documents
    .filter((document) => document.text.trim())
    .map((document) => `## ${document.filename}\n${scrub(document.text.trim())}`)
  let body = extracted.join("\n\n")
  if (!body) body = scrub(stripHtml(record.description))
  if (!filesOpen) {
    const names = record.files.map((file) => file.key).filter(Boolean)
    body = [
      scrub(stripHtml(record.description)),
      names.length ? `Public file names only: ${names.join(", ")}.` : "",
      "The files on this record are not public. This page does not include them.",
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

/** Short message. The paper stays on the public page instead of being pasted in parts. */
export function linkReadingPrompt(url: string, system: string, instructions: string): string {
  return [
    "Open this public text page and read the full paper. No sign-in is required.",
    url,
    "",
    "Score that paper with the rubric below. Return one JSON object and nothing else.",
    "",
    system,
    "",
    instructions,
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

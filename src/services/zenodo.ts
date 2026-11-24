import { stableVersionId } from "../domain/versions.ts"

export interface ZenodoCreator {
  name: string
  affiliation?: string
  orcid?: string
}

export interface ZenodoFile {
  key: string
  size: number
  checksum?: string
  downloadUrl: string
  extension: string
}

export interface ZenodoRelated {
  identifier: string
  relation: string
  scheme?: string
}

export interface ZenodoRecord {
  id: string
  conceptId: string
  doi: string
  conceptDoi: string
  title: string
  creators: ZenodoCreator[]
  description: string
  descriptionHtml: string
  keywords: string[]
  version: string
  recordVersion: string
  license: string
  publicationDate: string
  related: ZenodoRelated[]
  resourceType: string
  access: { record: string; files: string }
  files: ZenodoFile[]
  htmlUrl: string
  modified?: string
}

export class ZenodoError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = "ZenodoError"
    this.status = status
  }
}

export function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/(div|li|h[1-6]|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

export function extensionOf(name: string): string {
  const match = name.toLowerCase().match(/\.([a-z0-9]+)$/)
  return match?.[1] ?? ""
}

export interface ParsedRef {
  recordId: string
  doi?: string
}

/** Accept a Zenodo record URL, a doi.org link, or a bare 10.5281/zenodo DOI. */
export function parseRecordRef(input: string): ParsedRef | null {
  const raw = input.trim().replace(/[)>.,]+$/, "")
  if (!raw) return null
  const fromUrl = raw.match(/zenodo\.org\/(?:records|record|doi)\/(\d+)/i)
  if (fromUrl?.[1]) return { recordId: fromUrl[1], doi: `10.5281/zenodo.${fromUrl[1]}` }
  const fromDoi = raw.match(/10\.5281\/zenodo\.(\d+)/i)
  if (fromDoi?.[1]) return { recordId: fromDoi[1], doi: `10.5281/zenodo.${fromDoi[1]}` }
  const short = raw.match(/^zenodo\.(\d+)$/i)
  if (short?.[1]) return { recordId: short[1] }
  if (/^\d{5,}$/.test(raw)) return { recordId: raw }
  return null
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null
}

function text(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) return String(value)
  return typeof value === "string" ? value.trim() : ""
}

function orcidFrom(value: unknown): string | undefined {
  const direct = text(value)
  if (direct) return direct.replace(/^https?:\/\/orcid\.org\//i, "")
  return undefined
}

function creatorFrom(value: unknown): ZenodoCreator | null {
  const record = asRecord(value)
  if (!record) return null
  const person = asRecord(record.person_or_org)
  if (person) {
    const identifiers = [...(Array.isArray(person.identifiers) ? person.identifiers : []), ...(Array.isArray(record.identifiers) ? record.identifiers : [])]
    const orcid = identifiers
      .map((item) => asRecord(item))
      .find((item) => item && text(item.scheme).toLowerCase() === "orcid")
    const affiliations = Array.isArray(record.affiliations)
      ? record.affiliations
          .map((item) => text(asRecord(item)?.name))
          .filter(Boolean)
          .join(", ")
      : ""
    const name = text(person.name) || [text(person.given_name), text(person.family_name)].filter(Boolean).join(" ")
    if (!name) return null
    return { name, affiliation: affiliations || undefined, orcid: orcid ? orcidFrom(orcid.identifier) : undefined }
  }
  const name = text(record.name)
  if (!name) return null
  return {
    name,
    affiliation: text(record.affiliation) || undefined,
    orcid: orcidFrom(record.orcid),
  }
}

function fileFrom(value: unknown, recordId: string): ZenodoFile | null {
  const record = asRecord(value)
  if (!record) return null
  const key = text(record.key) || text(record.filename)
  if (!key) return null
  const links = asRecord(record.links)
  const downloadUrl =
    text(links?.self) ||
    text(links?.content) ||
    `https://zenodo.org/api/records/${encodeURIComponent(recordId)}/files/${encodeURIComponent(key)}/content`
  const size = Number(record.size ?? record.filesize ?? 0)
  return {
    key,
    size: Number.isFinite(size) ? size : 0,
    checksum: text(record.checksum) || undefined,
    downloadUrl,
    extension: extensionOf(key),
  }
}

function filesFrom(data: Record<string, unknown>, recordId: string): ZenodoFile[] {
  const files = data.files
  if (Array.isArray(files)) {
    return files.map((item) => fileFrom(item, recordId)).filter((item): item is ZenodoFile => item !== null)
  }
  const modern = asRecord(files)
  const entries = modern ? asRecord(modern.entries) ?? modern : null
  if (!entries) return []
  return Object.values(entries)
    .map((item) => fileFrom(item, recordId))
    .filter((item): item is ZenodoFile => item !== null)
}

export function normalizeZenodoRecord(input: unknown): ZenodoRecord {
  const data = asRecord(input)
  if (!data) throw new ZenodoError("Zenodo returned a record AIR could not read.", 500)
  const metadata = asRecord(data.metadata) ?? {}
  const id = text(data.id) || text(data.recid)
  if (!id) throw new ZenodoError("Zenodo returned a record without an id.", 500)
  const conceptId = text(data.conceptrecid) || text(asRecord(data.parent)?.id) || id
  const doi = text(data.doi) || text(metadata.doi) || `10.5281/zenodo.${id}`
  const conceptDoi = text(data.conceptdoi) || `10.5281/zenodo.${conceptId}`
  const descriptionHtml = text(metadata.description)
  const creators = (Array.isArray(metadata.creators) ? metadata.creators : [])
    .map(creatorFrom)
    .filter((item): item is ZenodoCreator => item !== null)
  const keywords = [
    ...(Array.isArray(metadata.keywords) ? metadata.keywords.map(text) : []),
    ...(Array.isArray(metadata.subjects)
      ? metadata.subjects.map((item) => text(asRecord(item)?.title) || text(item))
      : []),
  ].filter(Boolean)
  const version = text(metadata.version)
  const publicationDate = text(metadata.publication_date) || text(data.created).slice(0, 10)
  const license =
    text(asRecord(metadata.license)?.id) ||
    text(asRecord(Array.isArray(metadata.rights) ? metadata.rights[0] : undefined)?.id) ||
    text(asRecord(Array.isArray(metadata.rights) ? metadata.rights[0] : undefined)?.title)
  const relatedRaw = Array.isArray(metadata.related_identifiers) ? metadata.related_identifiers : []
  const related = relatedRaw.flatMap((item) => {
    const record = asRecord(item)
    if (!record || !text(record.identifier)) return []
    return [{ identifier: text(record.identifier), relation: text(record.relation) || "related", scheme: text(record.scheme) || undefined }]
  })
  const resource = asRecord(metadata.resource_type)
  const accessModern = asRecord(data.access)
  const accessRight = text(metadata.access_right)
  const access = accessModern
    ? { record: text(accessModern.record) || "public", files: text(accessModern.files) || "public" }
    : { record: accessRight === "closed" ? "restricted" : "public", files: accessRight && accessRight !== "open" ? accessRight : "public" }
  const links = asRecord(data.links)
  const files = filesFrom(data, id).sort((a, b) => a.key.localeCompare(b.key))
  return {
    id,
    conceptId,
    doi,
    conceptDoi,
    title: text(metadata.title) || text(data.title) || "Untitled Zenodo record",
    creators,
    descriptionHtml,
    description: stripHtml(descriptionHtml),
    keywords: [...new Set(keywords)],
    version,
    recordVersion: version || `${id}@${publicationDate || text(data.modified).slice(0, 10) || "undated"}`,
    license,
    publicationDate,
    related,
    resourceType: text(resource?.title) || text(metadata.resource_type) || "Record",
    access,
    files,
    htmlUrl: text(links?.self_html) || text(links?.html) || `https://zenodo.org/records/${id}`,
    modified: text(data.modified) || undefined,
  }
}

export function filesAreRestricted(record: ZenodoRecord): boolean {
  const files = record.access.files.toLowerCase()
  return files !== "public" && files !== "open"
}

export interface ZenodoAccess {
  record: string
  files: string
}

/** Gentle pauses before the second and third try. Tests can shorten these. */
export const zenodoTransport = { delaysMs: [500, 1200] }

function accessWord(value: string): string {
  return value.trim().toLowerCase()
}

export function isOpenFileAccess(access: ZenodoAccess): boolean {
  const open = (value: string) => {
    const word = accessWord(value)
    return word === "public" || word === "open"
  }
  return open(access.record) && open(access.files)
}

export function zenodoHttpMessage(status: number, access?: ZenodoAccess | null, kind: "record" | "file" = "record"): string {
  if (status === 404) return "No Zenodo record matches that id. Check the link or the DOI."
  if (status === 401 || (status === 403 && access && !isOpenFileAccess(access))) {
    return kind === "file"
      ? "This file is restricted or embargoed, so AIR cannot read it."
      : "Zenodo refused this record. It may be restricted or embargoed."
  }
  if (status === 403 || status === 429) {
    const open = Boolean(access && isOpenFileAccess(access))
    const why = open
      ? "The record is open access, so this is likely rate limiting or a temporary block."
      : "If the record is open, this is likely rate limiting or a temporary block."
    return `Zenodo returned ${status}. ${why} Wait a moment and try again.`
  }
  return kind === "file" ? `The file download failed (${status}).` : `Zenodo returned ${status} for that record.`
}

/**
 * Accept is a CORS-safelisted header. User-Agent is forbidden in browser fetch,
 * so it is sent only where the runtime allows it and cannot trigger a preflight.
 */
export function zenodoClientHeaders(kind: "json" | "bytes"): Record<string, string> {
  const headers: Record<string, string> = {}
  if (kind === "json") headers.Accept = "application/json"
  if (typeof window === "undefined") {
    headers["User-Agent"] = "open-ai-peer-review (https://github.com/morgansmart-alt/open-ai-peer-review)"
  }
  return headers
}

function pause(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve()
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function fetchZenodoResponse(url: string, kind: "json" | "bytes", access?: ZenodoAccess | null): Promise<Response> {
  const delays = zenodoTransport.delaysMs
  const attempts = delays.length + 1
  let lastNetworkError = false
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    let response: Response
    try {
      response = await fetch(url, { headers: zenodoClientHeaders(kind) })
      lastNetworkError = false
    } catch {
      lastNetworkError = true
      break
    }
    const restricted = Boolean(access && !isOpenFileAccess(access))
    const retryable = response.status === 429 || response.status === 503 || (response.status === 403 && !restricted)
    if (!retryable || response.ok || attempt === attempts - 1) return response
    await pause(delays[attempt] ?? 0)
  }
  if (lastNetworkError) {
    throw new ZenodoError(
      kind === "bytes"
        ? "The file host blocked the browser (CORS). Drop the PDF or text file beside the DOI and the review can still run."
        : "The browser could not reach Zenodo. Check the connection and try again.",
      0,
    )
  }
  throw new ZenodoError("The browser could not reach Zenodo. Check the connection and try again.", 0)
}

async function readJson(url: string, access?: ZenodoAccess | null): Promise<unknown> {
  const response = await fetchZenodoResponse(url, "json", access)
  if (response.status === 404) throw new ZenodoError(zenodoHttpMessage(404, access), 404)
  if (response.status === 401 || response.status === 403 || response.status === 429) {
    throw new ZenodoError(zenodoHttpMessage(response.status, access), response.status)
  }
  if (!response.ok) throw new ZenodoError(zenodoHttpMessage(response.status, access), response.status)
  return response.json()
}

export async function fetchZenodoRecord(recordId: string): Promise<ZenodoRecord> {
  const data = await readJson(`https://zenodo.org/api/records/${encodeURIComponent(recordId)}`)
  return normalizeZenodoRecord(data)
}

export interface ZenodoVersion {
  id: string
  doi: string
  title: string
  publicationDate: string
  version: string
  /** Version DOI, or the Zenodo record id when the DOI is missing. */
  stableId: string
}

function versionFromSearchHit(item: unknown): ZenodoVersion | null {
  const record = asRecord(item)
  const metadata = asRecord(record?.metadata)
  const id = text(record?.id)
  if (!id) return null
  const doi = text(record?.doi) || text(metadata?.doi) || `10.5281/zenodo.${id}`
  return {
    id,
    doi,
    title: text(metadata?.title) || text(record?.title),
    publicationDate: text(metadata?.publication_date),
    version: text(metadata?.version),
    stableId: stableVersionId({ id, doi }),
  }
}

function nextPageUrl(link: string, base: string): string | null {
  if (!link) return null
  try {
    const url = new URL(link, base)
    if (url.protocol !== "https:" && url.protocol !== "http:") return null
    return url.toString()
  } catch {
    return null
  }
}

const VERSION_PAGE_CAP = 50

export async function fetchRecordVersions(conceptId: string): Promise<ZenodoVersion[]> {
  const versions: ZenodoVersion[] = []
  const seenIds = new Set<string>()
  const seenUrls = new Set<string>()
  let url: string | null = `https://zenodo.org/api/records?q=${encodeURIComponent(`conceptrecid:${conceptId}`)}&all_versions=true&size=100&sort=mostrecent`
  while (url && !seenUrls.has(url) && seenUrls.size < VERSION_PAGE_CAP) {
    seenUrls.add(url)
    const data = asRecord(await readJson(url))
    const hits = asRecord(data?.hits)
    const list = Array.isArray(hits?.hits) ? hits.hits : []
    let added = 0
    for (const item of list) {
      const version = versionFromSearchHit(item)
      if (!version || seenIds.has(version.id)) continue
      seenIds.add(version.id)
      versions.push(version)
      added += 1
    }
    const next = nextPageUrl(text(asRecord(data?.links)?.next), url)
    if (!next || added === 0 || list.length === 0) break
    url = next
  }
  return versions
}

export interface RelatedSnippet {
  id: string
  doi: string
  title: string
  description: string
}

export async function fetchRelatedSnippets(record: ZenodoRecord): Promise<RelatedSnippet[]> {
  const snippets: RelatedSnippet[] = []
  const versions = await fetchRecordVersions(record.conceptId).catch(() => [])
  for (const version of versions) {
    if (version.id === record.id) continue
    snippets.push({ id: version.id, doi: version.doi, title: version.title, description: "" })
    if (snippets.length >= 3) return snippets
  }
  for (const related of record.related) {
    const parsed = parseRecordRef(related.identifier)
    if (!parsed || parsed.recordId === record.id) continue
    try {
      const other = await fetchZenodoRecord(parsed.recordId)
      snippets.push({
        id: other.id,
        doi: other.doi,
        title: other.title,
        description: other.description.slice(0, 2000),
      })
    } catch {
      snippets.push({ id: parsed.recordId, doi: related.identifier, title: related.identifier, description: "" })
    }
    if (snippets.length >= 3) break
  }
  return snippets
}

export const READABLE_EXTENSIONS = new Set([
  "pdf",
  "txt",
  "text",
  "md",
  "markdown",
  "csv",
  "tsv",
  "json",
  "yaml",
  "yml",
  "html",
  "htm",
  "tex",
  "latex",
  "bib",
  "py",
  "js",
  "mjs",
  "cjs",
  "ts",
  "tsx",
  "jsx",
  "r",
  "c",
  "h",
  "cpp",
  "cc",
  "f",
  "f90",
  "f95",
  "for",
  "jl",
  "xml",
  "ipynb",
  "docx",
  "zip",
])

export function isTextualFile(file: Pick<ZenodoFile, "extension">): boolean {
  return READABLE_EXTENSIONS.has(file.extension)
}

const SELECTION_FILE_CAP = 12
const SELECTION_FILE_BYTES = 8_000_000
const SELECTION_TOTAL_BYTES = 8_000_000

function fileBase(key: string): string {
  return (key.split("/").pop() ?? key).toLowerCase()
}

function isReadmeFile(file: ZenodoFile): boolean {
  const base = fileBase(file.key)
  return base === "readme" || base.startsWith("readme.")
}

function isSupplementFile(file: ZenodoFile): boolean {
  return /supplement|errata|appendix|supporting/.test(fileBase(file.key))
}

function leadingIndex(file: ZenodoFile): number | null {
  const match = fileBase(file.key).match(/^(\d+)[_\-\s.]/)
  return match ? Number(match[1]) : null
}

function compareLeading(a: ZenodoFile, b: ZenodoFile): number {
  const aIndex = leadingIndex(a)
  const bIndex = leadingIndex(b)
  if (aIndex !== null && bIndex !== null && aIndex !== bIndex) return aIndex - bIndex
  if ((aIndex === null) !== (bIndex === null)) return aIndex === null ? 1 : -1
  return b.size - a.size || a.key.localeCompare(b.key)
}

export function defaultFileSelection(files: ZenodoFile[]): string[] {
  const seen = new Set<string>()
  const readable = files.filter((file) => {
    if (!isTextualFile(file) || file.extension === "zip") return false
    if (!((file.size > 0 && file.size <= SELECTION_FILE_BYTES) || (file.size === 0 && file.extension === "pdf"))) return false
    const id = file.checksum || file.key
    if (seen.has(id) || seen.has(file.key)) return false
    seen.add(id)
    seen.add(file.key)
    return true
  })
  const supplements = readable.filter(isSupplementFile).sort((a, b) => a.key.localeCompare(b.key))
  const supplementSet = new Set(supplements)
  const manuscripts = readable
    .filter((file) => file.extension === "pdf" && !supplementSet.has(file))
    .sort((a, b) => {
      const aIndex = leadingIndex(a)
      const bIndex = leadingIndex(b)
      const aPrimary = aIndex === 1 ? 0 : 1
      const bPrimary = bIndex === 1 ? 0 : 1
      if (aPrimary !== bPrimary) return aPrimary - bPrimary
      return compareLeading(a, b)
    })
  const primary = manuscripts[0]
  const otherPdfs = manuscripts.filter((file) => file !== primary).sort(compareLeading)
  const texts = readable
    .filter((file) => file.extension !== "pdf" && !supplementSet.has(file))
    .sort((a, b) => {
      const aReadme = isReadmeFile(a) ? 0 : 1
      const bReadme = isReadmeFile(b) ? 0 : 1
      if (aReadme !== bReadme) return aReadme - bReadme
      return a.key.localeCompare(b.key)
    })
  const picked: ZenodoFile[] = []
  let total = 0
  const take = (file: ZenodoFile | undefined) => {
    if (!file || picked.includes(file) || picked.length >= SELECTION_FILE_CAP) return
    if (total + file.size > SELECTION_TOTAL_BYTES) return
    picked.push(file)
    total += file.size
  }
  take(primary)
  for (const file of supplements) take(file)
  for (const file of otherPdfs) take(file)
  for (const file of texts) take(file)
  return picked.map((file) => file.key)
}

/** Readable files from this record whose keys were chosen. Keys from another version do not match. */
export function selectedReadableFiles(files: ZenodoFile[], selectedKeys: readonly string[]): ZenodoFile[] {
  const allowed = new Set(selectedKeys)
  return files.filter((file) => isTextualFile(file) && allowed.has(file.key))
}

export function formatRecordStamp(record: Pick<ZenodoRecord, "version" | "id" | "publicationDate">): string {
  const version = record.version.trim()
  const date = record.publicationDate.trim()
  if (version && version !== date) return date ? `version ${version} · ${date}` : `version ${version}`
  return `Record ${record.id} · ${date || "undated"}`
}

export function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

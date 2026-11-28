import { normalizeZenodoRecord, parseRecordRef, stripHtml, type ZenodoRecord } from "../zenodo.ts"
import { crossrefAuthors, isOpenLicence, openLicenceFromCrossref, pdfLinkFromCrossref, type CrossrefWork } from "./pdfPaper.ts"

export interface PublicationPreview {
  title: string
  authors: string[]
  doi: string
  url: string
  pdfUrl: string
  filename: string
  /** Full public record when the lookup was Zenodo. The prompt uses its ids. */
  source?: ZenodoRecord
  /** Journal XML for an Open Research Europe / F1000 article. Preferred over an opaque download id. */
  xmlUrl?: string
  /** Used when the DOI has no open PDF. The review can still run on this text. */
  abstractText?: string
  /** Shown in the panel. An abstract-only lookup says the full text was not found. */
  note?: string
}

export const FETCHED_TEXT_MISMATCH = "Fetched text did not match the paper title; full text not used."

const TITLE_STOP = new Set(["with", "from", "that", "this", "into", "over", "under", "between", "about", "after", "before", "their", "using", "through"])

function foldMatch(value: string): string {
  return value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase()
}

function matchWords(value: string): string[] {
  return [...new Set(foldMatch(value).split(/[^a-z0-9]+/).filter((word) => word.length >= 4 && !TITLE_STOP.has(word)))]
}

/** True when the fetched text shares the title's words, and the first author's surname when we know it. */
export function textMatchesPaper(text: string, title: string, surname = ""): boolean {
  const titleWords = matchWords(title)
  const hay = new Set(matchWords(text))
  const folded = foldMatch(text)
  const nameParts = foldMatch(surname).split(/[^a-z]+/).filter((part) => part.length >= 4)
  const authorHit = nameParts.length === 0 || nameParts.some((part) => hay.has(part) || folded.includes(part))
  if (titleWords.length === 0) return authorHit
  const overlap = titleWords.filter((word) => hay.has(word)).length / titleWords.length
  if (!authorHit) return false
  return titleWords.length === 1 ? overlap === 1 : overlap >= 0.4
}

/** A short extract is not evidence of the wrong paper. A long one must share the title. */
export function shouldUseFetchedText(text: string, title: string, surname = ""): boolean {
  if (text.trim().length < 1_500) return true
  return textMatchesPaper(text, title, surname)
}

export type PublicationRef =
  | { kind: "zenodo"; recordId: string; url: string }
  | { kind: "doi"; doi: string; url: string }
  | { kind: "arxiv"; id: string; absUrl: string; pdfUrl: string }
  | { kind: "pdf"; pdfUrl: string }
  | { kind: "unknown" }

/** Collapse a doubled scheme from a laggy paste, such as https://https://zenodo.org/… */
export function normalizePublicationLink(value: string): string {
  return value.trim().replace(/^(?:https?:\/\/)+/i, "https://")
}

export function classifyPublication(input: string): PublicationRef {
  const raw = normalizePublicationLink(input)
  if (!raw) return { kind: "unknown" }
  const zenodo = parseRecordRef(raw)
  if (zenodo && /zenodo/i.test(raw)) {
    return { kind: "zenodo", recordId: zenodo.recordId, url: `https://zenodo.org/records/${zenodo.recordId}` }
  }
  const arxiv = raw.match(/arxiv\.org\/(?:abs|pdf)\/([0-9]{4}\.[0-9]{4,5})(?:v\d+)?(?:\.pdf)?/i) || raw.match(/^arxiv:([0-9]{4}\.[0-9]{4,5})(?:v\d+)?$/i)
  if (arxiv?.[1]) {
    const id = arxiv[1]
    return { kind: "arxiv", id, absUrl: `https://arxiv.org/abs/${id}`, pdfUrl: `https://arxiv.org/pdf/${id}.pdf` }
  }
  if (/^https?:\/\/doi\.org\/10\./i.test(raw) || /^10\.\d{4,}\/\S+$/i.test(raw)) {
    const doi = raw.replace(/^https?:\/\/doi\.org\//i, "")
    return { kind: "doi", doi, url: `https://doi.org/${doi}` }
  }
  if (/^https?:\/\/\S+\.pdf(?:\?\S*)?$/i.test(raw)) return { kind: "pdf", pdfUrl: raw }
  return { kind: "unknown" }
}

export function previewFromZenodo(record: ZenodoRecord): PublicationPreview {
  const pdf = record.files.find((file) => file.extension === "pdf") ?? record.files.find((file) => file.downloadUrl)
  const filename = pdf?.key || "paper.pdf"
  return {
    title: record.title,
    authors: record.creators.map((creator) => creator.name).filter(Boolean),
    doi: record.doi,
    url: record.htmlUrl || `https://zenodo.org/records/${record.id}`,
    pdfUrl: pdf?.downloadUrl ?? "",
    filename,
    source: record,
  }
}

function filenameFrom(url: string): string {
  try {
    const name = decodeURIComponent(new URL(url).pathname.split("/").pop() || "")
    return name || "paper.pdf"
  } catch {
    return "paper.pdf"
  }
}

export interface FetchLike {
  (url: string, init?: { redirect?: "follow" | "manual" }): Promise<{
    ok: boolean
    status: number
    url: string
    headers?: { get(name: string): string | null }
    json(): Promise<unknown>
    text(): Promise<string>
  }>
}

async function readJson(fetcher: FetchLike, url: string): Promise<unknown> {
  const response = await fetcher(url)
  if (!response.ok) throw new Error(`Could not open ${url} (${response.status}).`)
  return response.json()
}

function arxivPreview(xml: string, id: string): PublicationPreview {
  const title = xml.match(/<entry>[\s\S]*?<title>([\s\S]*?)<\/title>/i)?.[1]?.replace(/\s+/g, " ").trim() || `arXiv ${id}`
  const authors = [...xml.matchAll(/<author>[\s\S]*?<name>([\s\S]*?)<\/name>/gi)].map((match) => match[1]?.replace(/\s+/g, " ").trim() || "").filter(Boolean)
  return {
    title,
    authors,
    doi: "",
    url: `https://arxiv.org/abs/${id}`,
    pdfUrl: `https://arxiv.org/pdf/${id}.pdf`,
    filename: `${id}.pdf`,
  }
}

/** Follow doi.org, then read Zenodo's public API, an arXiv API record, or a direct PDF address. */
export async function resolvePublication(input: string, fetcher: FetchLike): Promise<PublicationPreview> {
  const ref = classifyPublication(input)
  if (ref.kind === "unknown") throw new Error("Paste a Zenodo link, a DOI, an arXiv link, or a direct PDF link.")
  if (ref.kind === "zenodo") {
    const data = await readJson(fetcher, `https://zenodo.org/api/records/${encodeURIComponent(ref.recordId)}`)
    const preview = previewFromZenodo(normalizeZenodoRecord(data))
    if (!preview.pdfUrl) throw new Error("That Zenodo record has no file to read.")
    return preview
  }
  if (ref.kind === "arxiv") {
    const response = await fetcher(`https://export.arxiv.org/api/query?id_list=${encodeURIComponent(ref.id)}`)
    if (!response.ok) throw new Error(`arXiv returned ${response.status}.`)
    return arxivPreview(await response.text(), ref.id)
  }
  if (ref.kind === "pdf") {
    return { title: filenameFrom(ref.pdfUrl), authors: [], doi: "", url: ref.pdfUrl, pdfUrl: ref.pdfUrl, filename: filenameFrom(ref.pdfUrl) }
  }
  const landed = await fetcher(ref.url, { redirect: "follow" })
  const finalUrl = landed.url || ref.url
  const next = classifyPublication(finalUrl)
  if (next.kind !== "doi" && next.kind !== "unknown" && (landed.ok || landed.status === 302 || landed.status === 301)) {
    return resolvePublication(finalUrl, fetcher)
  }
  return openAccessPreview(ref.doi, fetcher)
}

function officialJournalUrl(url: string): boolean {
  return /open-research-europe\.ec\.europa\.eu/i.test(url)
}

/** Open Research Europe keeps the article XML on its own site. Opaque ore.eu download ids are not used. */
export function openResearchLinks(doi: string, work: CrossrefWork): { xmlUrl: string; pdfUrl: string } | null {
  if (!/openreseurope|10\.12688\//i.test(doi)) return null
  const links = work.link ?? []
  const xml = links.find((item) => officialJournalUrl(item.URL ?? "") && /xml|jats/i.test(item["content-type"] ?? ""))
  const pdf = links.find((item) => officialJournalUrl(item.URL ?? "") && /pdf/i.test(item["content-type"] ?? ""))
  return { xmlUrl: xml?.URL ?? "", pdfUrl: pdf?.URL ?? "" }
}

export function textFromArticleXml(xml: string): string {
  return xml
    .replace(/<back[\s\S]*<\/back>/gi, " ")
    .replace(/<ref-list[\s\S]*<\/ref-list>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
    .replace(/\s+/g, " ")
    .trim()
}

export function previewFromCrossref(doi: string, work: CrossrefWork & { abstract?: string; URL?: string }): PublicationPreview {
  const title = work.title?.[0]?.replace(/\s+/g, " ").trim() || doi
  const authors = crossrefAuthors(work).split("; ").filter(Boolean)
  const licence = openLicenceFromCrossref(work)
  const ore = openResearchLinks(doi, work)
  const pdf = ore ? ore.pdfUrl : isOpenLicence(licence) ? pdfLinkFromCrossref(work) : ""
  const xmlUrl = ore?.xmlUrl ?? ""
  const abstractText = stripHtml(work.abstract ?? "").replace(/\s+/g, " ").trim()
  const url = work.URL || `https://doi.org/${doi}`
  if (!pdf && !xmlUrl && !abstractText) {
    throw new Error("That DOI has no open PDF and no abstract AIR can read.")
  }
  return {
    title,
    authors,
    doi,
    url,
    pdfUrl: pdf,
    ...(xmlUrl ? { xmlUrl } : {}),
    filename: xmlUrl ? "article.xml" : pdf ? "paper.pdf" : "abstract.txt",
    ...(abstractText ? { abstractText } : {}),
    ...(!pdf && !xmlUrl ? { note: "Full text was not found. The review will use the abstract only." } : {}),
  }
}

async function openAccessPreview(doi: string, fetcher: FetchLike): Promise<PublicationPreview> {
  const crossref = await fetcher(`https://api.crossref.org/works/${encodeURIComponent(doi)}`)
  if (crossref.ok) {
    const payload = (await crossref.json()) as { message?: CrossrefWork & { abstract?: string; URL?: string } }
    if (payload.message) {
      try {
        return previewFromCrossref(doi, payload.message)
      } catch {
        // Crossref had no usable text. DataCite is the next source.
      }
    }
  }
  const datacite = await fetcher(`https://api.datacite.org/dois/${encodeURIComponent(doi)}`)
  if (datacite.ok) {
    const payload = (await datacite.json()) as { data?: { attributes?: { titles?: { title?: string }[]; creators?: { name?: string }[]; descriptions?: { description?: string }[]; url?: string } } }
    const attributes = payload.data?.attributes
    const title = attributes?.titles?.[0]?.title || doi
    const authors = (attributes?.creators ?? []).map((creator) => creator.name || "").filter(Boolean)
    const abstractText = (attributes?.descriptions?.[0]?.description || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
    if (abstractText || attributes?.url) {
      return {
        title,
        authors,
        doi,
        url: attributes?.url || `https://doi.org/${doi}`,
        pdfUrl: "",
        filename: "abstract.txt",
        ...(abstractText ? { abstractText } : {}),
        note: "Full text was not found. The review will use the abstract only.",
      }
    }
  }
  throw new Error("That DOI did not lead to a Zenodo record, an arXiv paper, an open PDF, or an abstract.")
}

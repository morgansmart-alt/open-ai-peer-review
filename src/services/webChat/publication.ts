import { normalizeZenodoRecord, parseRecordRef, type ZenodoRecord } from "../zenodo.ts"

export interface PublicationPreview {
  title: string
  authors: string[]
  doi: string
  url: string
  pdfUrl: string
  filename: string
  /** Full public record when the lookup was Zenodo. The prompt uses its ids. */
  source?: ZenodoRecord
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
  if (!landed.ok && landed.status !== 302 && landed.status !== 301) throw new Error(`doi.org returned ${landed.status}.`)
  const finalUrl = landed.url || ref.url
  const next = classifyPublication(finalUrl)
  if (next.kind === "doi") throw new Error("That DOI did not lead to a Zenodo record, an arXiv paper, or a PDF.")
  return resolvePublication(finalUrl, fetcher)
}

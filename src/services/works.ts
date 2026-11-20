import type { ZenodoRecord } from "./zenodo.ts"
import { extensionOf, parseRecordRef } from "./zenodo.ts"

export interface AnyRef {
  kind: "zenodo" | "doi"
  recordId: string
  doi: string
}

const DOI_PATTERN = /10\.\d{4,9}\/[^\s]+/i

export function isPublishedDoi(doi: string): boolean {
  return /^10\.\d{4,9}\/\S+$/.test(doi.trim())
}

/** Zenodo stays first. Any other published DOI, including arXiv, is accepted too. */
export function parseAnyRef(input: string): AnyRef | null {
  const zenodo = parseRecordRef(input)
  if (zenodo?.recordId) {
    return { kind: "zenodo", recordId: zenodo.recordId, doi: zenodo.doi ?? `10.5281/zenodo.${zenodo.recordId}` }
  }
  const raw = input.trim().replace(/[)>.,]+$/, "")
  const arxivUrl = raw.match(/arxiv\.org\/(?:abs|pdf)\/([\w.-]+)/i)
  const arxivBare = raw.match(/^arxiv:([\w./-]+)/i)
  const arxivId = (arxivUrl?.[1] ?? arxivBare?.[1] ?? "").replace(/\.pdf$/i, "").replace(/v\d+$/i, "")
  if (arxivId) return { kind: "doi", recordId: arxivId, doi: `10.48550/arXiv.${arxivId}` }
  const doi = raw.match(DOI_PATTERN)?.[0]?.replace(/[)>.,]+$/, "")
  if (!doi) return null
  return { kind: "doi", recordId: doi.replace(/[^\w.-]+/g, "_").slice(0, 80), doi }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

export function abstractFromInvertedIndex(index: unknown): string {
  const record = asRecord(index)
  if (!record) return ""
  const words: string[] = []
  for (const [word, positions] of Object.entries(record)) {
    if (!Array.isArray(positions)) continue
    for (const position of positions) {
      if (typeof position === "number") words[position] = word
    }
  }
  return words.filter(Boolean).join(" ")
}

function emptyRecord(partial: Pick<ZenodoRecord, "id" | "doi" | "title"> & Partial<ZenodoRecord>): ZenodoRecord {
  return {
    conceptId: partial.conceptId ?? partial.id,
    conceptDoi: partial.conceptDoi ?? partial.doi,
    creators: partial.creators ?? [],
    description: partial.description ?? "",
    descriptionHtml: partial.descriptionHtml ?? "",
    keywords: partial.keywords ?? [],
    version: partial.version ?? "",
    recordVersion: partial.recordVersion ?? partial.version ?? `${partial.id}@${partial.publicationDate ?? "undated"}`,
    license: partial.license ?? "",
    publicationDate: partial.publicationDate ?? "",
    related: partial.related ?? [],
    resourceType: partial.resourceType ?? "Publication",
    access: partial.access ?? { record: "public", files: partial.files?.length ? "public" : "missing" },
    files: partial.files ?? [],
    htmlUrl: partial.htmlUrl ?? `https://doi.org/${partial.doi}`,
    ...partial,
  }
}

function pdfFile(url: string): ZenodoRecord["files"][number] | null {
  const cleaned = url.trim()
  if (!/^https:\/\//i.test(cleaned)) return null
  const name = decodeURIComponent(cleaned.split("/").pop() || "paper.pdf").split("?")[0] || "paper.pdf"
  const key = name.toLowerCase().endsWith(".pdf") ? name : "open-access.pdf"
  return { key, size: 0, downloadUrl: cleaned, extension: extensionOf(key) || "pdf" }
}

export function recordFromOpenAlex(input: unknown): ZenodoRecord | null {
  const data = asRecord(input)
  if (!data || !text(data.display_name)) return null
  const doi = text(data.doi).replace(/^https?:\/\/doi\.org\//i, "")
  if (!isPublishedDoi(doi)) return null
  const location = asRecord(data.best_oa_location) ?? asRecord(data.primary_location)
  const openAccess = asRecord(data.open_access)
  const pdf = pdfFile(text(location?.pdf_url) || text(openAccess?.oa_url))
  const creators = Array.isArray(data.authorships)
    ? data.authorships.flatMap((item) => {
        const name = text(asRecord(asRecord(item)?.author)?.display_name)
        return name ? [{ name }] : []
      })
    : []
  return emptyRecord({
    id: text(data.id).split("/").pop() || doi,
    doi,
    title: text(data.display_name),
    creators,
    description: abstractFromInvertedIndex(data.abstract_inverted_index),
    publicationDate: text(data.publication_date),
    htmlUrl: text(asRecord(data.primary_location)?.landing_page_url) || `https://doi.org/${doi}`,
    files: pdf ? [pdf] : [],
    access: { record: "public", files: pdf ? "public" : "missing" },
  })
}

export function recordFromCrossref(input: unknown): ZenodoRecord | null {
  const message = asRecord(asRecord(input)?.message) ?? asRecord(input)
  if (!message) return null
  const doi = text(message.DOI)
  const title = Array.isArray(message.title) ? text(message.title[0]) : text(message.title)
  if (!isPublishedDoi(doi) || !title) return null
  const creators = Array.isArray(message.author)
    ? message.author.flatMap((item) => {
        const row = asRecord(item)
        const name = [text(row?.given), text(row?.family)].filter(Boolean).join(" ") || text(row?.name)
        return name ? [{ name }] : []
      })
    : []
  const issued = asRecord(message.issued)
  const parts = Array.isArray(issued?.["date-parts"]) ? (issued?.["date-parts"] as unknown[])[0] : null
  const publicationDate = Array.isArray(parts) ? parts.filter((part) => typeof part === "number").join("-") : ""
  const link = Array.isArray(message.link)
    ? message.link.map(asRecord).find((item) => text(item?.["content-type"]).includes("pdf") || text(item?.URL).toLowerCase().includes(".pdf"))
    : null
  const pdf = pdfFile(text(link?.URL))
  return emptyRecord({
    id: doi,
    doi,
    title,
    creators,
    description: text(message.abstract).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
    publicationDate,
    htmlUrl: text(message.URL) || `https://doi.org/${doi}`,
    files: pdf ? [pdf] : [],
    access: { record: "public", files: pdf ? "public" : "missing" },
  })
}

export function recordFromDatacite(input: unknown): ZenodoRecord | null {
  const data = asRecord(asRecord(input)?.data) ?? asRecord(input)
  const attributes = asRecord(data?.attributes) ?? data
  if (!attributes) return null
  const doi = text(attributes.doi) || text(data?.id)
  const titles = Array.isArray(attributes.titles) ? attributes.titles : []
  const title = text(asRecord(titles[0])?.title)
  if (!isPublishedDoi(doi) || !title) return null
  const creators = Array.isArray(attributes.creators)
    ? attributes.creators.flatMap((item) => {
        const name = text(asRecord(item)?.name)
        return name ? [{ name }] : []
      })
    : []
  const descriptions = Array.isArray(attributes.descriptions) ? attributes.descriptions : []
  const pdf = pdfFile(text(attributes.url))
  return emptyRecord({
    id: doi,
    doi,
    title,
    creators,
    description: text(asRecord(descriptions[0])?.description),
    publicationDate: text(attributes.publicationYear),
    htmlUrl: text(attributes.url) || `https://doi.org/${doi}`,
    files: pdf && pdf.key.endsWith(".pdf") ? [pdf] : [],
    access: { record: "public", files: "public" },
  })
}

async function readJson(url: string): Promise<unknown> {
  const response = await fetch(url, { headers: { accept: "application/json", "user-agent": "AIR-peer-review" } })
  if (!response.ok) throw new Error(String(response.status))
  return response.json()
}

export async function resolvePublishedDoi(doi: string): Promise<ZenodoRecord> {
  const encoded = encodeURIComponent(doi)
  const attempts: (() => Promise<ZenodoRecord | null>)[] = [
    async () => recordFromOpenAlex(await readJson(`https://api.openalex.org/works/https://doi.org/${encoded}`)),
    async () => recordFromCrossref(await readJson(`https://api.crossref.org/works/${encoded}`)),
    async () => recordFromDatacite(await readJson(`https://api.datacite.org/dois/${encoded}`)),
  ]
  for (const attempt of attempts) {
    try {
      const record = await attempt()
      if (record) return record
    } catch {
      continue
    }
  }
  throw new Error("AIR could not resolve that DOI. Paste a Zenodo DOI, or drop the file below. A ranked publication still needs a DOI that resolves.")
}

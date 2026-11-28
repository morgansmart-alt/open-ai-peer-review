import { isOpenFiles, type ZenodoFile, type ZenodoRecord } from "../zenodo.ts"
import { FULL_TEXT_UNAVAILABLE } from "./paperText.ts"

export { FULL_TEXT_UNAVAILABLE }

export const PDF_BYTE_CAP = 25 * 1024 * 1024
export const PDF_TEXT_CAP = 1_200_000
export const PDF_PAGE_CAP = 80
export const TRUNCATION_MARK = "[AIR truncated this file.]"

const TEXT_EXTENSIONS = new Set(["txt", "md", "markdown", "csv", "tsv", "html", "htm", "json", "xml", "tex", "rst"])
const TEXT_FILE_CAP = 1_500_000

/**
 * Licences AIR may copy onto the public text page.
 * cc-by* (including sa, nd, and nc) and cc0 / public-domain zero.
 */
export function isOpenLicence(license: string): boolean {
  const value = license.trim().toLowerCase()
  if (!value) return false
  if (value.includes("creativecommons.org/licenses/by")) return true
  if (value.includes("creativecommons.org/publicdomain/zero") || value.includes("/publicdomain/zero")) return true
  const path = value
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//, "")
    .replace(/^https?:\/\/creativecommons\.org\/(?:licenses|publicdomain)\//, "")
    .replace(/\/legalcode(?:\.[a-z0-9]+)?$/, "")
    .replace(/[_\s]+/g, "-")
  if (/^cc-?by(?:-|$)/.test(path)) return true
  if (/^cc-?0(?:-|$)/.test(path) || path.startsWith("cc-zero") || path === "cc0") return true
  if (path === "zero" || path.startsWith("zero/") || path === "public-domain" || path === "pd") return true
  return false
}

/** The largest PDF that fits the byte cap. A missing size is still eligible. */
export function chooseMainPdf(files: readonly ZenodoFile[]): ZenodoFile | null {
  const pdfs = files.filter((file) => file.extension === "pdf" && file.downloadUrl.startsWith("https://"))
  const fits = pdfs.filter((file) => file.size <= 0 || file.size <= PDF_BYTE_CAP)
  fits.sort((left, right) => right.size - left.size)
  return fits[0] ?? null
}

export function pdfExceedsCap(files: readonly ZenodoFile[]): boolean {
  const pdfs = files.filter((file) => file.extension === "pdf")
  return pdfs.length > 0 && pdfs.every((file) => file.size > PDF_BYTE_CAP)
}

export function capExtractedText(text: string, cap = PDF_TEXT_CAP): { text: string; truncated: boolean } {
  const clean = text.replace(/\u0000/g, "").trim()
  if (clean.length <= cap) return { text: clean, truncated: false }
  return { text: `${clean.slice(0, cap).trimEnd()}\n\n${TRUNCATION_MARK}`, truncated: true }
}

export interface PaperRead {
  ok: boolean
  bytes: Uint8Array
  tooLarge?: boolean
}

export async function documentsForPaper(
  record: ZenodoRecord,
  read: (url: string) => Promise<PaperRead | null>,
  extract: (bytes: Uint8Array) => Promise<{ text: string; truncated: boolean }>,
): Promise<{ documents: { filename: string; text: string }[]; unavailable: string }> {
  if (!isOpenFiles(record.access.files)) return { documents: [], unavailable: "" }
  if (!isOpenLicence(record.license)) {
    return { documents: [], unavailable: "The licence is not an open licence AIR copies (cc-by or cc0)." }
  }
  const documents: { filename: string; text: string }[] = []
  const pdf = chooseMainPdf(record.files)
  let unavailable = ""
  if (pdfExceedsCap(record.files) && !pdf) {
    unavailable = "The PDF is larger than 25 MB, so AIR did not copy it."
  } else if (pdf) {
    unavailable = await readPdf(pdf, read, extract, documents)
  }
  for (const file of record.files) {
    if (file.key === pdf?.key) continue
    if (!TEXT_EXTENSIONS.has(file.extension) || !file.downloadUrl.startsWith("https://")) continue
    if (file.size > TEXT_FILE_CAP) continue
    try {
      const response = await read(file.downloadUrl)
      if (!response?.ok) continue
      const text = new TextDecoder().decode(response.bytes).slice(0, TEXT_FILE_CAP).trim()
      if (text) documents.push({ filename: file.key, text })
    } catch {
      // A file the host refused is omitted. The page still lists the public record.
    }
  }
  if (documents.length) return { documents, unavailable: "" }
  if (!unavailable) unavailable = "No file text was copied onto this page."
  return { documents, unavailable }
}

async function readPdf(
  file: ZenodoFile,
  read: (url: string) => Promise<PaperRead | null>,
  extract: (bytes: Uint8Array) => Promise<{ text: string; truncated: boolean }>,
  documents: { filename: string; text: string }[],
): Promise<string> {
  try {
    const response = await read(file.downloadUrl)
    if (response?.tooLarge || (response?.bytes.byteLength ?? 0) > PDF_BYTE_CAP) {
      return "The PDF is larger than 25 MB, so AIR did not copy it."
    }
    if (!response?.ok) return "The PDF could not be downloaded."
    const extracted = await extract(response.bytes)
    if (!extracted.text.trim()) return "The PDF had no extractable text."
    documents.push({ filename: file.key, text: extracted.text })
    return ""
  } catch {
    return "The PDF could not be read."
  }
}

export interface CrossrefWork {
  title?: string[]
  author?: { given?: string; family?: string; name?: string }[]
  license?: { URL?: string }[]
  link?: { URL?: string; "content-type"?: string }[]
}

export function openLicenceFromCrossref(work: CrossrefWork): string {
  for (const item of work.license ?? []) {
    const url = item.URL ?? ""
    if (isOpenLicence(url)) return url
  }
  return ""
}

export function pdfLinkFromCrossref(work: CrossrefWork): string {
  for (const item of work.link ?? []) {
    const type = (item["content-type"] ?? "").toLowerCase()
    const url = item.URL ?? ""
    if (type.includes("pdf") && url.startsWith("https://")) return url
  }
  return ""
}

export function crossrefAuthors(work: CrossrefWork): string {
  return (work.author ?? [])
    .map((person) => person.name || [person.given, person.family].filter(Boolean).join(" "))
    .filter(Boolean)
    .join("; ")
}

export function formatDoiPaper(input: {
  doi: string
  title: string
  authors: string
  licence?: string
  text: string
  unavailable?: string
}): string {
  const doi = input.doi.trim().replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, "")
  const lines = [
    input.title.trim() || "Untitled record",
    `Authors: ${input.authors.trim() || "not listed"}`,
    "",
    `DOI: https://doi.org/${doi}`,
  ]
  if (input.licence?.trim()) lines.push(`Licence: ${input.licence.trim()}`)
  lines.push("")
  if (input.text.trim()) lines.push(input.text.trim())
  else lines.push(`${FULL_TEXT_UNAVAILABLE}. ${input.unavailable?.trim() || "No file text was copied onto this page."}`)
  return lines.join("\n")
}

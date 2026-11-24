import { normaliseQuoteText } from "../domain/quotes.ts"
import { FIGURES_NOT_READ } from "./figures.ts"
import { stripHtml } from "./zenodo.ts"

export function decodeText(data: ArrayBuffer): string {
  return new TextDecoder("utf-8", { fatal: false }).decode(data)
}

export function textFromMarkup(filename: string, raw: string): string {
  const extension = filename.toLowerCase().split(".").pop() ?? ""
  if (extension === "html" || extension === "htm" || raw.trimStart().startsWith("<")) return stripHtml(raw)
  return raw.replace(/^\uFEFF/, "").trim()
}

/** Sections grow past this size only so a very long text still fits in SECTION_CAP pieces. */
export const SECTION_CHARS = 12_000
export const SECTION_CAP = 80

export interface TextSection {
  label: string
  text: string
}

export interface ReadingCoverage {
  pagesRead: number
  pagesTotal: number
  chunksSummarised: number
  coverage: "full" | "partial"
}

/** Split on paragraph and sentence boundaries. The pieces together cover the whole text. */
export function chunkText(text: string, size = SECTION_CHARS): string[] {
  const clean = text.replace(/\r\n/g, "\n").trim()
  if (!clean) return []
  const target = Math.max(size, Math.ceil(clean.length / SECTION_CAP))
  if (clean.length <= target) return [clean]
  const chunks: string[] = []
  let cursor = 0
  while (cursor < clean.length) {
    let end = Math.min(clean.length, cursor + target)
    if (end < clean.length) {
      const paragraph = clean.lastIndexOf("\n\n", end)
      const sentence = clean.lastIndexOf(". ", end)
      const splitAt = paragraph > cursor + target * 0.5 ? paragraph : sentence > cursor + target * 0.5 ? sentence + 1 : end
      end = Math.max(cursor + 1, splitAt)
    }
    const piece = clean.slice(cursor, end).trim()
    if (piece) chunks.push(piece)
    if (end <= cursor) break
    cursor = end
  }
  return chunks
}

/** Share the section budget across files by length, so a long first file cannot crowd out the rest. */
export function sectionsFor(documents: { filename: string; text: string }[], cap = SECTION_CAP): TextSection[] {
  const docs = documents.filter((document) => document.text.trim())
  const total = docs.reduce((sum, document) => sum + document.text.length, 0)
  if (total === 0 || cap <= 0) return []
  const shares = docs.map((document) => Math.max(1, Math.round((cap * document.text.length) / total)))
  let spare = shares.reduce((sum, share) => sum + share, 0) - cap
  while (spare > 0) {
    let index = 0
    for (let cursor = 1; cursor < shares.length; cursor += 1) {
      if ((shares[cursor] ?? 0) > (shares[index] ?? 0)) index = cursor
    }
    if ((shares[index] ?? 1) <= 1) break
    shares[index] = (shares[index] ?? 1) - 1
    spare -= 1
  }
  const sections: TextSection[] = []
  docs.forEach((document, index) => {
    const share = Math.max(1, shares[index] ?? 1)
    const parts = chunkText(document.text, Math.ceil(document.text.length / share))
    parts.forEach((text, partIndex) => {
      const label = parts.length === 1 ? document.filename : `${document.filename} · section ${partIndex + 1} of ${parts.length}`
      sections.push({ label, text })
    })
  })
  return sections
}

export function anchorExcerpts(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim()
  if (!clean) return ""
  if (clean.length <= 2100) return clean
  const take = 700
  const mid = Math.floor(clean.length / 2)
  return [`Beginning: ${clean.slice(0, take)}`, `Middle: ${clean.slice(mid - Math.floor(take / 2), mid + Math.ceil(take / 2))}`, `End: ${clean.slice(-take)}`].join("\n\n")
}

export function coverageAllowsPublish(reading: { coverage?: string; pagesRead?: number; pagesTotal?: number; extractableWords?: number; coverageLabel?: string } | undefined): boolean {
  if (!reading) return false
  if (reading.extractableWords === 0) return false
  if (reading.coverageLabel?.startsWith("not read")) return false
  if (reading.coverage === "full") return true
  const total = Number(reading.pagesTotal ?? 0)
  const read = Number(reading.pagesRead ?? 0)
  if (total <= 0) return false
  return read / total >= 0.9
}

/** Shown instead of "full" when a PDF was opened and had no text layer. */
export const UNREAD_SCAN_COVERAGE = "not read (no extractable text, likely scanned/images)"

export const OCR_OR_TEXT_SUGGESTION = "OCR the scan, or attach a text version, before a full review."

const FIGURE_BOILERPLATE = [
  FIGURES_NOT_READ,
  "No figure caption was found in the text layer.",
  "No alt text was exposed by the PDF.",
  "Figure captions:",
  "Alt text:",
]

/** Words a reviewer could quote. Figure notices are not the paper. */
export function extractableWordCount(text: string): number {
  const stripped = FIGURE_BOILERPLATE.reduce((value, phrase) => value.replaceAll(phrase, " "), text)
  return stripped.match(/[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g)?.length ?? 0
}

export function coveragePhrase(reading: { coverage?: string; coverageLabel?: string } | undefined): string {
  if (!reading) return ""
  return reading.coverageLabel || reading.coverage || ""
}

export function normaliseForQuote(value: string): string {
  return normaliseQuoteText(value)
}

export function quoteMatchesCorpus(quote: string, corpus: string): boolean {
  const needle = normaliseForQuote(quote)
  if (!needle) return false
  return normaliseForQuote(corpus).includes(needle)
}

export function readingCoverage(documents: readonly Record<string, unknown>[], chunksSummarised: number): ReadingCoverage & { extractableWords?: number; coverageLabel?: string } {
  let pagesRead = 0
  let pagesTotal = 0
  let partial = false
  let knowText = false
  let words = 0
  let emptyPdf = false
  for (const document of documents) {
    const total = Number(document.pagesTotal ?? document.pages ?? 0)
    const read = Number(document.pagesRead ?? (total > 0 ? total : 0))
    const hasText = "text" in document && typeof document.text === "string"
    const count = hasText ? extractableWordCount(document.text as string) : null
    const name = typeof document.filename === "string" ? document.filename : ""
    const isPdf = document.kind === "pdf" || /\.pdf$/i.test(name)
    const scanned = Boolean(hasText && isPdf && count === 0 && (total > 0 || (document.text as string).trim() === ""))
    if (hasText && count !== null) {
      knowText = true
      words += count
    }
    if (scanned) {
      emptyPdf = true
      pagesTotal += total
      partial = true
      continue
    }
    pagesRead += read
    pagesTotal += total
    if (total > 0 && read < total) partial = true
  }
  const unread = knowText && words === 0 && (emptyPdf || documents.length > 0)
  if (unread) {
    return {
      pagesRead: 0,
      pagesTotal,
      chunksSummarised,
      coverage: "partial",
      extractableWords: 0,
      coverageLabel: UNREAD_SCAN_COVERAGE,
    }
  }
  const coverage = partial || emptyPdf ? "partial" : "full"
  if (!knowText) return { pagesRead, pagesTotal, chunksSummarised, coverage }
  return { pagesRead, pagesTotal, chunksSummarised, coverage, extractableWords: words }
}

export function bundleItems<T>(items: T[], size: number): T[][] {
  const groups: T[][] = []
  for (let index = 0; index < items.length; index += size) groups.push(items.slice(index, index + size))
  return groups
}

export function pickQuotes(text: string, count: number): string[] {
  const sentences = text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 40 && sentence.length < 320)
  if (sentences.length === 0) {
    const fallback = text.replace(/\s+/g, " ").trim().slice(0, 220)
    return fallback ? [fallback] : []
  }
  const step = Math.max(1, Math.floor(sentences.length / count))
  const quotes: string[] = []
  for (let index = 0; index < count; index += 1) {
    quotes.push(sentences[Math.min(sentences.length - 1, index * step)] ?? sentences[0] ?? "")
  }
  return quotes.filter(Boolean)
}

export interface TextSignals {
  [criterionId: string]: number
}

export function textSignals(text: string, filenames: string[]): TextSignals {
  const lowered = text.toLowerCase()
  const numbers = text.match(/\d[\d.,]*/g)?.length ?? 0
  const speculation = lowered.match(/\b(might|could|envision|hope|possibly|imagine)\b/g)?.length ?? 0
  const evidence = lowered.match(/\b(measured|observed|dataset|figure|table|equation|we find|result)\b/g)?.length ?? 0
  const code = filenames.some((name) => /\.(py|ipynb|r|jl|js|ts|csv|json|zip)$/i.test(name))
  const pdf = filenames.some((name) => /\.pdf$/i.test(name))
  return {
    clarity: text.length > 1200 ? 0.6 : text.length > 400 ? 0.2 : -0.6,
    "novelty-context": /prior work|previous work|et al|literature|compared with|related work/.test(lowered) ? 0.6 : -0.4,
    "potential-impact": text.length > 800 ? 0.3 : 0,
    methodology: /method|protocol|procedure|parameter|assumption|setup/.test(lowered) ? 0.7 : -0.5,
    consistency: numbers > 12 ? 0.5 : numbers > 3 ? 0.1 : -0.3,
    "evidence-labelling": evidence > speculation ? 0.4 : speculation > evidence + 2 ? -0.6 : 0,
    availability: code ? 0.8 : pdf ? 0.2 : -0.3,
    limitations: /limitation|future work|we do not|does not show|caveat|falsif/.test(lowered) ? 0.8 : -0.7,
    ethics: /ethic|safety|harm|consent|risk|dual use|privacy/.test(lowered) ? 0.6 : -0.2,
    presentation: (pdf ? 0.3 : 0) + (text.length > 500 ? 0.2 : -0.3),
  }
}

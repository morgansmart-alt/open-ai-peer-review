import { textFromDocx, textFromZip } from "./zipText.ts"
import { extensionOf, fetchZenodoResponse, READABLE_EXTENSIONS, zenodoHttpMessage, type ZenodoAccess } from "./zenodo.ts"
import { decodeText, textFromMarkup } from "./textTools.ts"

let pdfjsPromise: Promise<typeof import("pdfjs-dist")> | null = null

function loadPdfjs(): Promise<typeof import("pdfjs-dist")> {
  pdfjsPromise ??= import("pdfjs-dist").then(async (pdfjs) => {
    const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url")
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default
    return pdfjs
  })
  return pdfjsPromise
}

export interface ExtractedDocument {
  filename: string
  text: string
  kind: "pdf" | "docx" | "text" | "zip" | "unsupported"
  note?: string
  pages?: number
  pagesRead?: number
  pagesTotal?: number
}

/** Safety ceiling so a huge scan cannot freeze the tab. Shorter PDFs are read in full. */
export const PDF_PAGE_CEILING = 500
const PDF_BATCH = 8

export function pagesToRead(total: number): number {
  return Math.min(Math.max(0, total), PDF_PAGE_CEILING)
}

export function scannedPdfNote(text: string, pagesRead: number): string | undefined {
  if (pagesRead <= 0) return undefined
  const trimmed = text.trim()
  if (trimmed.length >= 80 && trimmed.length / pagesRead >= 40) return undefined
  return "This PDF looks scanned/image-only and has little extractable text."
}

export async function extractPdf(
  data: ArrayBuffer,
  onProgress?: (message: string) => void,
): Promise<{ text: string; pages: number; pagesRead: number; note?: string }> {
  const { getDocument } = await loadPdfjs()
  const pdf = await getDocument({ data: new Uint8Array(data), useSystemFonts: true }).promise
  const pageCount = pdf.numPages
  const limit = pagesToRead(pageCount)
  const parts: string[] = []
  for (let pageNumber = 1; pageNumber <= limit; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber)
    const content = await page.getTextContent()
    const line = content.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ")
      .replace(/[ \t]{2,}/g, " ")
      .trim()
    if (line) parts.push(line)
    if (pageNumber % PDF_BATCH === 0) {
      onProgress?.(`Reading page ${pageNumber} of ${pageCount}…`)
      await new Promise((resolve) => setTimeout(resolve, 0))
    }
  }
  const text = parts.join("\n\n")
  const notes = [
    pageCount > limit ? `Read ${limit} of ${pageCount} pages so the tab stays responsive.` : "",
    scannedPdfNote(text, limit) ?? "",
  ].filter(Boolean)
  return { text, pages: pageCount, pagesRead: limit, note: notes.join(" ") || undefined }
}

export async function extractDocument(filename: string, data: ArrayBuffer, onProgress?: (message: string) => void): Promise<ExtractedDocument> {
  const extension = extensionOf(filename)
  try {
    if (extension === "pdf") {
      const pdf = await extractPdf(data, onProgress)
      const scanned = scannedPdfNote(pdf.text, pdf.pagesRead)
      if (!pdf.text.trim()) {
        return {
          filename,
          text: "",
          kind: "pdf",
          pages: pdf.pages,
          pagesRead: pdf.pagesRead,
          pagesTotal: pdf.pages,
          note: scanned ?? "This PDF has no extractable text.",
        }
      }
      return { filename, text: pdf.text, kind: "pdf", pages: pdf.pages, pagesRead: pdf.pagesRead, pagesTotal: pdf.pages, note: pdf.note }
    }
    if (extension === "docx") {
      const text = await textFromDocx(data)
      return { filename, text, kind: "docx", note: text ? undefined : "The document had no readable text." }
    }
    if (extension === "zip") {
      const text = await textFromZip(data)
      return { filename, text, kind: "zip", note: text ? undefined : "This zip has no readable text or code files." }
    }
    if (READABLE_EXTENSIONS.has(extension)) {
      return { filename, text: textFromMarkup(filename, decodeText(data)), kind: "text" }
    }
    return {
      filename,
      text: "",
      kind: "unsupported",
      note: "AIR could not read this file as text. PDF, Office, source, and data files are supported.",
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not read this file."
    return { filename, text: "", kind: extension === "pdf" ? "pdf" : "text", note: message }
  }
}

export async function downloadArrayBuffer(url: string, access?: ZenodoAccess | null): Promise<ArrayBuffer> {
  let response: Response
  try {
    response = await fetchZenodoResponse(url, "bytes", access)
  } catch (error) {
    const message = error instanceof Error ? error.message : "The file host blocked the browser (CORS). Drop the PDF or text file beside the DOI and the review can still run."
    throw new Error(message)
  }
  if (!response.ok) throw new Error(zenodoHttpMessage(response.status, access, "file"))
  return response.arrayBuffer()
}

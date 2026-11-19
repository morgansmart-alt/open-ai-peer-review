import { getDocument, GlobalWorkerOptions } from "pdfjs-dist"
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url"
import { extensionOf } from "./zenodo.ts"
import { decodeText, textFromMarkup } from "./textTools.ts"

let workerReady = false

function ensureWorker(): void {
  if (workerReady) return
  GlobalWorkerOptions.workerSrc = workerUrl
  workerReady = true
}

export interface ExtractedDocument {
  filename: string
  text: string
  kind: "pdf" | "docx" | "text" | "unsupported"
  note?: string
  pages?: number
}

const PAGE_CAP = 40

export async function extractPdf(data: ArrayBuffer): Promise<{ text: string; pages: number; note?: string }> {
  ensureWorker()
  const pdf = await getDocument({ data: new Uint8Array(data), useSystemFonts: true }).promise
  const pageCount = pdf.numPages
  const limit = Math.min(pageCount, PAGE_CAP)
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
  }
  return {
    text: parts.join("\n\n"),
    pages: pageCount,
    note: pageCount > PAGE_CAP ? `Read the first ${PAGE_CAP} of ${pageCount} pages.` : undefined,
  }
}

export async function extractDocx(data: ArrayBuffer): Promise<string> {
  const mammoth = await import("mammoth")
  const result = await mammoth.extractRawText({ arrayBuffer: data })
  return result.value.trim()
}

export async function extractDocument(filename: string, data: ArrayBuffer): Promise<ExtractedDocument> {
  const extension = extensionOf(filename)
  try {
    if (extension === "pdf") {
      const pdf = await extractPdf(data)
      if (!pdf.text.trim()) {
        return { filename, text: "", kind: "pdf", pages: pdf.pages, note: "This PDF has no extractable text. It may be scanned images." }
      }
      return { filename, text: pdf.text, kind: "pdf", pages: pdf.pages, note: pdf.note }
    }
    if (extension === "docx") {
      const text = await extractDocx(data)
      return { filename, text, kind: "docx", note: text ? undefined : "The document had no readable text." }
    }
    if (["md", "markdown", "txt", "text", "html", "htm", "py", "csv", "json", "r", "ipynb"].includes(extension)) {
      return { filename, text: textFromMarkup(filename, decodeText(data)), kind: "text" }
    }
    return {
      filename,
      text: "",
      kind: "unsupported",
      note: "AIR reads PDF, Markdown, text, HTML, and DOCX. This file was skipped.",
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not read this file."
    return { filename, text: "", kind: extension === "pdf" ? "pdf" : "text", note: message }
  }
}

export async function downloadArrayBuffer(url: string): Promise<ArrayBuffer> {
  let response: Response
  try {
    response = await fetch(url)
  } catch {
    throw new Error("The browser blocked or could not finish this file download. Zenodo's API content links allow cross-origin reads; if a mirror does not, use the link labelled content on the record.")
  }
  if (response.status === 401 || response.status === 403) {
    throw new Error("This file is restricted or embargoed, so AIR cannot read it.")
  }
  if (!response.ok) throw new Error(`The file download failed (${response.status}).`)
  return response.arrayBuffer()
}

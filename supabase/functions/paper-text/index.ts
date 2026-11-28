// Public paper text. Open-licence PDFs are extracted here. No auth and no private notes.
// Deploy: supabase functions deploy paper-text --no-verify-jwt

import { fetchZenodoRecord, fetchZenodoResponse } from "../../../src/services/zenodo.ts"
import { extractPdfText } from "../../../src/services/webChat/pdfExtract.ts"
import { formatPaperText } from "../../../src/services/webChat/paperText.ts"
import {
  crossrefAuthors,
  formatDoiPaper,
  isOpenLicence,
  openLicenceFromCrossref,
  PDF_BYTE_CAP,
  pdfLinkFromCrossref,
  documentsForPaper,
  type CrossrefWork,
  type PaperRead,
} from "../../../src/services/webChat/pdfPaper.ts"

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
  "Content-Type": "text/plain; charset=utf-8",
  "Cache-Control": "public, max-age=300",
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers })
  if (request.method !== "GET") return new Response("GET only.", { status: 405, headers })
  const url = new URL(request.url)
  const recordId = zenodoIdFromQuery(url)
  const doi = doiFromQuery(url)
  try {
    if (recordId) {
      const record = await fetchZenodoRecord(recordId)
      const gathered = await documentsForPaper(record, readOpenFile, extractPdfText)
      return new Response(formatPaperText(record, gathered.documents, gathered.unavailable), { status: 200, headers })
    }
    if (doi) {
      const page = await openDoiPage(doi)
      if (!page) return new Response("That DOI did not resolve to an open paper.", { status: 404, headers })
      return new Response(page, { status: 200, headers })
    }
    return new Response("A public Zenodo record id or an open-licence DOI is required.", { status: 400, headers })
  } catch (error) {
    const message = error instanceof Error ? error.message : "That public record could not be read."
    return new Response(message, { status: 502, headers })
  }
})

function zenodoIdFromQuery(url: URL): string {
  const raw = `${url.searchParams.get("id") ?? ""} ${url.searchParams.get("doi") ?? ""}`
  return raw.match(/10\.5281\/zenodo\.(\d+)/i)?.[1] ?? ((url.searchParams.get("id") ?? "").trim().match(/^\d+$/)?.[0] ?? "")
}

function doiFromQuery(url: URL): string {
  const raw = (url.searchParams.get("doi") ?? "").trim().replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, "")
  if (!/^10\.\S+$/.test(raw) || /zenodo\.\d+$/i.test(raw)) return ""
  return raw
}

async function readOpenFile(url: string): Promise<PaperRead | null> {
  const response = await fetchZenodoResponse(url, "bytes")
  if (!response.ok) return { ok: false, bytes: new Uint8Array() }
  const length = Number(response.headers.get("content-length") ?? "0")
  if (length > PDF_BYTE_CAP) return { ok: false, bytes: new Uint8Array(), tooLarge: true }
  const bytes = new Uint8Array(await response.arrayBuffer())
  if (bytes.byteLength > PDF_BYTE_CAP) return { ok: false, bytes: new Uint8Array(), tooLarge: true }
  return { ok: true, bytes }
}

async function openDoiPage(doi: string): Promise<string> {
  const response = await fetch(`https://api.crossref.org/works/${encodeURIComponent(doi)}`, {
    headers: { Accept: "application/json", "User-Agent": "AIR-paper-text (https://github.com/morgansmart-alt/open-ai-peer-review)" },
  })
  if (!response.ok) return ""
  const payload = (await response.json()) as { message?: CrossrefWork }
  const work = payload.message
  if (!work) return ""
  const licence = openLicenceFromCrossref(work)
  const title = work.title?.[0] ?? ""
  const authors = crossrefAuthors(work)
  if (!licence || !isOpenLicence(licence)) {
    return formatDoiPaper({
      doi,
      title,
      authors,
      unavailable: "The licence is not an open licence AIR copies (cc-by or cc0).",
      text: "",
    })
  }
  const pdfUrl = pdfLinkFromCrossref(work)
  const target = pdfUrl || `https://doi.org/${doi}`
  const downloaded = await readPdf(target)
  return formatDoiPaper({
    doi,
    title,
    authors,
    licence,
    text: downloaded.text,
    unavailable: downloaded.unavailable,
  })
}

async function readPdf(url: string): Promise<{ text: string; unavailable: string }> {
  const response = await fetch(url, {
    headers: { Accept: "application/pdf,*/*;q=0.8", "User-Agent": "AIR-paper-text (https://github.com/morgansmart-alt/open-ai-peer-review)" },
    redirect: "follow",
  })
  if (!response.ok) return { text: "", unavailable: "The PDF could not be downloaded." }
  const length = Number(response.headers.get("content-length") ?? "0")
  if (length > PDF_BYTE_CAP) return { text: "", unavailable: "The PDF is larger than 25 MB, so AIR did not copy it." }
  const bytes = new Uint8Array(await response.arrayBuffer())
  if (bytes.byteLength > PDF_BYTE_CAP) return { text: "", unavailable: "The PDF is larger than 25 MB, so AIR did not copy it." }
  const head = String.fromCharCode(...bytes.slice(0, 5))
  const type = response.headers.get("content-type") ?? ""
  if (!head.startsWith("%PDF") && !type.toLowerCase().includes("pdf")) {
    return { text: "", unavailable: "The DOI did not resolve to a PDF." }
  }
  try {
    const extracted = await extractPdfText(bytes)
    if (!extracted.text.trim()) return { text: "", unavailable: "The PDF had no extractable text." }
    return { text: extracted.text, unavailable: "" }
  } catch {
    return { text: "", unavailable: "The PDF could not be read." }
  }
}

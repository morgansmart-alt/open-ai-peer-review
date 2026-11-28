import { extractText } from "unpdf"
import { capExtractedText, PDF_PAGE_CAP, TRUNCATION_MARK } from "./pdfPaper.ts"

/** Server-side PDF text. unpdf runs in Node and in the Deno edge function. */
export async function extractPdfText(bytes: Uint8Array, cap?: number): Promise<{ text: string; truncated: boolean }> {
  const extracted = await extractText(bytes, { mergePages: false })
  const pages = (Array.isArray(extracted.text) ? extracted.text : [extracted.text]).map((page) => page.trim()).filter(Boolean)
  const kept = pages.slice(0, PDF_PAGE_CAP)
  const capped = capExtractedText(kept.join("\n\n"), cap)
  if (pages.length > PDF_PAGE_CAP && !capped.truncated) {
    return { text: `${capped.text}\n\n${TRUNCATION_MARK}`, truncated: true }
  }
  return capped
}

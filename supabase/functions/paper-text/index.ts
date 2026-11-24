// Public text for one Zenodo record. No auth and no private notes.
// This file is not deployed by the pull request.
// Later: supabase functions deploy paper-text --no-verify-jwt

import { extensionOf, fetchZenodoRecord, fetchZenodoResponse } from "../../../src/services/zenodo.ts"
import { formatPaperText } from "../../../src/services/webChat/paperText.ts"

const TEXT_EXTENSIONS = new Set(["txt", "md", "markdown", "csv", "tsv", "html", "htm", "json", "xml", "tex", "rst"])
const FILE_CAP = 1_500_000

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
  const recordId = (url.searchParams.get("id") || url.searchParams.get("doi") || "").replace(/^10\.5281\/zenodo\./i, "").trim()
  if (!/^\d+$/.test(recordId)) return new Response("A public Zenodo record id is required.", { status: 400, headers })
  try {
    const record = await fetchZenodoRecord(recordId)
    const documents = await publicTextFiles(record)
    return new Response(formatPaperText(record, documents), { status: 200, headers })
  } catch (error) {
    const message = error instanceof Error ? error.message : "That public record could not be read."
    return new Response(message, { status: 502, headers })
  }
})

async function publicTextFiles(record: Awaited<ReturnType<typeof fetchZenodoRecord>>): Promise<{ filename: string; text: string }[]> {
  if (record.access.files !== "open") return []
  const documents: { filename: string; text: string }[] = []
  for (const file of record.files) {
    if (!TEXT_EXTENSIONS.has(extensionOf(file.key)) || !file.downloadUrl.startsWith("https://")) continue
    try {
      const response = await fetchZenodoResponse(file.downloadUrl, "bytes")
      if (!response.ok) continue
      const text = (await response.text()).slice(0, FILE_CAP)
      if (text.trim()) documents.push({ filename: file.key, text })
    } catch {
      // A file the host refused is omitted. The page still lists the public record.
    }
  }
  return documents
}

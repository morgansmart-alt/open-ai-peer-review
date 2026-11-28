import { isOpenFiles } from "../zenodo.ts"

const PRIVATE_CHAT =
  /https?:\/\/(?:www\.)?(?:share\.google\/aimode\/[^\s)"']+|chatgpt\.com\/share\/[^\s)"']+|chat\.openai\.com\/share\/[^\s)"']+|claude\.ai\/share\/[^\s)"']+|grok\.com\/share\/[^\s)"']+)/gi

/** Record ids from the public board and web-chat rows. Sample ids are not Zenodo records. */
export function collectPaperIds(rows: readonly unknown[]): string[] {
  const ids = new Set<string>()
  const add = (value: unknown) => {
    const text = String(value ?? "").trim()
    const doi = text.match(/10\.5281\/zenodo\.(\d+)/i)
    if (doi?.[1]) ids.add(doi[1])
    const page = text.match(/zenodo\.org\/records\/(\d+)/i)
    if (page?.[1]) ids.add(page[1])
    if (/^\d{5,}$/.test(text)) ids.add(text)
  }
  for (const row of rows) {
    if (!row || typeof row !== "object") continue
    const record = row as Record<string, unknown>
    add(record.recordId)
    add(record.doi)
    add(record.paper_url)
    add(record.url)
    add(record.id)
    const paper = record.paper
    if (paper && typeof paper === "object") {
      const fields = paper as Record<string, unknown>
      add(fields.doi)
      add(fields.url)
    }
  }
  return [...ids].sort()
}

/** Board ids plus the curated open-access list. Sample ids never qualify. */
export function mergePaperIds(board: readonly string[], curated: readonly string[]): string[] {
  const ids = new Set<string>()
  for (const value of [...curated, ...board]) {
    const id = String(value ?? "").trim()
    if (/^\d{5,}$/.test(id)) ids.add(id)
  }
  return [...ids].sort()
}

/** Open text and extracted PDF bodies, clipped to the static-file cap. Closed files contribute nothing. */
export function documentsForOpenRecord(
  accessFiles: string,
  files: readonly { key: string; text: string }[],
  cap: number,
): { filename: string; text: string }[] {
  if (!isOpenFiles(accessFiles)) return []
  const documents: { filename: string; text: string }[] = []
  let used = 0
  for (const file of files) {
    const text = file.text.trim()
    if (!text || used >= cap) continue
    const slice = text.slice(0, cap - used)
    used += slice.length
    documents.push({ filename: file.key, text: slice })
  }
  return documents
}

export function renderStaticPaperText(record: {
  id: string
  title?: string
  authors?: string[]
  doi?: string
  conceptDoi?: string
  description?: string
  files?: { filename: string; text: string }[]
}): string {
  const scrub = (text: string) => text.replace(PRIVATE_CHAT, "[private link]")
  const doi = (record.doi ?? "").replace(/^https?:\/\/doi\.org\//i, "")
  const concept = (record.conceptDoi ?? "").replace(/^https?:\/\/doi\.org\//i, "")
  const authors = record.authors?.filter(Boolean) ?? []
  const files = (record.files ?? []).filter((file) => file.text.trim())
  const lines = [
    scrub(record.title ?? "").trim() || "Untitled record",
    `Authors: ${authors.join("; ") || "not listed"}`,
    "",
    `Zenodo record: https://zenodo.org/records/${record.id}`,
    /^10\.\S+/.test(doi) ? `Version DOI: https://doi.org/${doi}` : "",
    /^10\.\S+/.test(concept) ? `Concept DOI: https://doi.org/${concept}` : "",
    "",
    scrub(record.description ?? ""),
    ...files.map((file) => `\n## ${file.filename}\n${scrub(file.text)}`),
  ]
  if (!files.length) lines.push("", "Full text unavailable. No file text was copied onto this page.")
  return `${lines.filter((line) => line !== "").join("\n")}\n`
}

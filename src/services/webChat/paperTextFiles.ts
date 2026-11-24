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
  const files = record.files ?? []
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
  return `${lines.filter((line) => line !== "").join("\n")}\n`
}

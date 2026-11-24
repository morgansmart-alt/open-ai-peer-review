import { mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { collectPaperIds, renderStaticPaperText } from "../src/services/webChat/paperTextFiles.ts"

const TEXT_EXTENSIONS = new Set(["txt", "md", "markdown", "csv", "tsv", "html", "htm", "json", "xml", "tex", "rst"])
const FILE_CAP = 1_500_000
const USER_AGENT = "open-ai-peer-review (https://github.com/morgansmart-alt/open-ai-peer-review)"

function zenodoSources(id: string): string[] {
  return [
    `https://zenodo.org/api/records/${encodeURIComponent(id)}`,
    `https://zenodo.org/records/${encodeURIComponent(id)}/export/json`,
  ]
}

async function readJson(url: string): Promise<Record<string, unknown> | null> {
  const response = await fetch(url, { headers: { Accept: "application/json", "User-Agent": USER_AGENT } })
  if (!response.ok) return null
  return (await response.json()) as Record<string, unknown>
}

function textOf(value: unknown): string {
  return typeof value === "string" ? value : ""
}

function recordFromApi(data: Record<string, unknown>) {
  const metadata = (data.metadata ?? {}) as Record<string, unknown>
  const parent = (data.parent ?? {}) as Record<string, unknown>
  const id = String(data.id ?? data.recid ?? "")
  if (!id) return null
  const creators = Array.isArray(metadata.creators) ? metadata.creators : []
  const authors = creators
    .map((creator) => {
      const row = creator as Record<string, unknown>
      const person = row.person_or_org as Record<string, unknown> | undefined
      return textOf(row.name) || textOf(person?.name)
    })
    .filter(Boolean)
  const files: { key: string; url: string }[] = []
  for (const file of Array.isArray(data.files) ? data.files : []) {
    const row = file as Record<string, unknown>
    const links = row.links as Record<string, unknown> | undefined
    if (typeof row.key === "string") files.push({ key: row.key, url: textOf(links?.self) })
  }
  const fileBag = data.files as Record<string, unknown> | undefined
  const entries = (fileBag?.entries ?? {}) as Record<string, unknown>
  for (const file of Object.values(entries)) {
    const row = file as Record<string, unknown>
    const links = row.links as Record<string, unknown> | undefined
    if (typeof row.key === "string") files.push({ key: row.key, url: textOf(links?.content) || textOf(links?.self) })
  }
  const access = (data.access ?? {}) as Record<string, unknown>
  return {
    id,
    title: textOf(metadata.title) || textOf(data.title),
    authors,
    doi: textOf(data.doi) || textOf(metadata.doi) || `10.5281/zenodo.${id}`,
    conceptDoi: textOf(data.conceptdoi) || `10.5281/zenodo.${textOf(data.conceptrecid) || textOf(parent.id) || id}`,
    description: textOf(metadata.description).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
    accessFiles: textOf(access.files) || textOf(metadata.access_right) || "open",
    files,
  }
}

async function openText(record: NonNullable<ReturnType<typeof recordFromApi>>) {
  const access = record.accessFiles.toLowerCase()
  if (access && access !== "open" && access !== "public") return []
  const documents: { filename: string; text: string }[] = []
  let used = 0
  for (const file of record.files) {
    const extension = file.key.split(".").pop()?.toLowerCase() ?? ""
    if (!TEXT_EXTENSIONS.has(extension) || !file.url.startsWith("https://") || used >= FILE_CAP) continue
    try {
      const response = await fetch(file.url, { headers: { "User-Agent": USER_AGENT, Accept: "text/plain,*/*;q=0.8" } })
      if (!response.ok) continue
      const text = (await response.text()).slice(0, FILE_CAP - used)
      used += text.length
      if (text.trim()) documents.push({ filename: file.key, text })
    } catch {
      // A file the host refused is omitted. The abstract still ships.
    }
  }
  return documents
}

async function loadBoardIds(): Promise<string[]> {
  const url = process.env.VITE_SUPABASE_URL?.replace(/\/$/, "")
  const key = process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !key) {
    console.log("No public board credentials. No paper text files written.")
    return []
  }
  const headers = { apikey: key, authorization: `Bearer ${key}` }
  const reviews = await fetch(`${url}/rest/v1/air_reviews?select=payload&limit=1000`, { headers })
  const chats = await fetch(`${url}/rest/v1/air_web_chat?select=doi,paper_url,payload&limit=1000`, { headers })
  const reviewRows = reviews.ok ? ((await reviews.json()) as { payload?: unknown }[]) : []
  const chatRows = chats.ok ? ((await chats.json()) as { payload?: unknown; doi?: string; paper_url?: string }[]) : []
  return collectPaperIds([
    ...reviewRows.map((row) => row.payload),
    ...chatRows.flatMap((row) => [row, row.payload]),
  ])
}

async function writeOne(id: string, outDir: string): Promise<boolean> {
  let data: Record<string, unknown> | null = null
  for (const url of zenodoSources(id)) {
    data = await readJson(url)
    if (data?.id || data?.metadata) break
    data = null
  }
  if (!data) {
    console.log(`Skipped ${id}: Zenodo did not return the record.`)
    return false
  }
  const record = recordFromApi(data)
  if (!record) return false
  const files = await openText(record)
  const body = renderStaticPaperText({ ...record, files })
  await writeFile(join(outDir, `${id}.txt`), body)
  console.log(`Wrote paper-text/${id}.txt (${body.length} characters)`)
  return true
}

export async function buildPaperTextFiles(outDir = join(process.cwd(), "public", "paper-text")): Promise<number> {
  const ids = await loadBoardIds()
  await mkdir(outDir, { recursive: true })
  let written = 0
  for (const id of ids) {
    if (await writeOne(id, outDir)) written += 1
  }
  console.log(`Paper text files: ${written} of ${ids.length}.`)
  return written
}

const calledDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (calledDirectly) {
  buildPaperTextFiles().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}

import { readFileSync } from "node:fs"
import { mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { extractPdfText } from "../src/services/webChat/pdfExtract.ts"
import { isOpenFiles } from "../src/services/zenodo.ts"
import { isOpenLicence } from "../src/services/webChat/pdfPaper.ts"
import { collectPaperIds, documentsForOpenRecord, mergePaperIds, renderStaticPaperText } from "../src/services/webChat/paperTextFiles.ts"

const TEXT_EXTENSIONS = new Set(["txt", "md", "markdown", "csv", "tsv", "html", "htm", "json", "xml", "tex", "rst"])
const FILE_CAP = 1_500_000
const PDF_BYTE_CAP = 25 * 1024 * 1024
const USER_AGENT = "open-ai-peer-review (https://github.com/morgansmart-alt/open-ai-peer-review)"

function curatedIds(): string[] {
  const file = new URL("../paper-text-ids.json", import.meta.url)
  const parsed = JSON.parse(readFileSync(file, "utf8")) as unknown
  return Array.isArray(parsed) ? parsed.map((id) => String(id)) : []
}

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
  const license = metadata.license
  const licenseId = typeof license === "string" ? license : textOf((license as Record<string, unknown> | undefined)?.id)
  return {
    id,
    title: textOf(metadata.title) || textOf(data.title),
    authors,
    doi: textOf(data.doi) || textOf(metadata.doi) || `10.5281/zenodo.${id}`,
    conceptDoi: textOf(data.conceptdoi) || `10.5281/zenodo.${textOf(data.conceptrecid) || textOf(parent.id) || id}`,
    description: textOf(metadata.description).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
    accessFiles: textOf(access.files) || textOf(metadata.access_right) || "open",
    license: licenseId,
    files,
  }
}

async function pdfText(bytes: Uint8Array, cap: number): Promise<string> {
  const extracted = await extractPdfText(bytes, cap)
  return extracted.text
}

async function fileText(file: { key: string; url: string }, room: number): Promise<string> {
  if (!file.url.startsWith("https://") || room <= 0) return ""
  const extension = file.key.split(".").pop()?.toLowerCase() ?? ""
  const pdf = extension === "pdf"
  if (!pdf && !TEXT_EXTENSIONS.has(extension)) return ""
  try {
    const response = await fetch(file.url, { headers: { "User-Agent": USER_AGENT, Accept: pdf ? "application/pdf,*/*;q=0.8" : "text/plain,*/*;q=0.8" } })
    if (!response.ok) return ""
    const declared = Number(response.headers.get("content-length") ?? "0")
    if (pdf && declared > PDF_BYTE_CAP) return ""
    if (!pdf) return (await response.text()).slice(0, room)
    const bytes = new Uint8Array(await response.arrayBuffer())
    if (bytes.byteLength > PDF_BYTE_CAP) return ""
    return await pdfText(bytes, room)
  } catch {
    return ""
  }
}

async function openText(record: NonNullable<ReturnType<typeof recordFromApi>>) {
  if (!isOpenFiles(record.accessFiles)) return []
  if (record.license && !isOpenLicence(record.license)) return []
  const gathered: { key: string; text: string }[] = []
  let used = 0
  for (const file of record.files) {
    if (used >= FILE_CAP) break
    const text = await fileText(file, FILE_CAP - used)
    if (!text.trim()) continue
    gathered.push({ key: file.key, text })
    used += text.trim().length
  }
  return documentsForOpenRecord(record.accessFiles, gathered, FILE_CAP)
}

async function loadBoardIds(): Promise<string[]> {
  const url = process.env.VITE_SUPABASE_URL?.replace(/\/$/, "")
  const key = process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !key) {
    console.log("No public board credentials. Writing the curated allow list only.")
    return mergePaperIds([], curatedIds())
  }
  const headers = { apikey: key, authorization: `Bearer ${key}` }
  const reviews = await fetch(`${url}/rest/v1/air_reviews?select=payload&limit=1000`, { headers })
  const chats = await fetch(`${url}/rest/v1/air_web_chat?select=doi,paper_url,payload&limit=1000`, { headers })
  const reviewRows = reviews.ok ? ((await reviews.json()) as { payload?: unknown }[]) : []
  const chatRows = chats.ok ? ((await chats.json()) as { payload?: unknown; doi?: string; paper_url?: string }[]) : []
  return mergePaperIds(
    collectPaperIds([
      ...reviewRows.map((row) => row.payload),
      ...chatRows.flatMap((row) => [row, row.payload]),
    ]),
    curatedIds(),
  )
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

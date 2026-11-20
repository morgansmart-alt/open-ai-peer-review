import { extensionOf, stripHtml } from "./zenodo.ts"

export interface ZipEntry {
  name: string
  method: number
  compressedSize: number
  uncompressedSize: number
  localOffset: number
}

const TEXT_INSIDE_ZIP = new Set([
  "txt",
  "text",
  "md",
  "markdown",
  "csv",
  "tsv",
  "json",
  "yaml",
  "yml",
  "html",
  "htm",
  "tex",
  "latex",
  "bib",
  "py",
  "js",
  "mjs",
  "cjs",
  "ts",
  "tsx",
  "jsx",
  "r",
  "c",
  "h",
  "cpp",
  "cc",
  "f",
  "f90",
  "f95",
  "for",
  "jl",
  "xml",
  "ipynb",
])

function findEndOfCentralDirectory(bytes: Uint8Array): number {
  const start = Math.max(0, bytes.length - 22 - 65535)
  for (let offset = bytes.length - 22; offset >= start; offset -= 1) {
    if (bytes[offset] === 0x50 && bytes[offset + 1] === 0x4b && bytes[offset + 2] === 0x05 && bytes[offset + 3] === 0x06) return offset
  }
  return -1
}

export function listZip(data: ArrayBuffer): ZipEntry[] {
  const bytes = new Uint8Array(data)
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const end = findEndOfCentralDirectory(bytes)
  if (end < 0) throw new Error("This zip has no central directory.")
  const count = view.getUint16(end + 10, true)
  let cursor = view.getUint32(end + 16, true)
  const entries: ZipEntry[] = []
  for (let index = 0; index < count; index += 1) {
    if (view.getUint32(cursor, true) !== 0x02014b50) break
    const method = view.getUint16(cursor + 10, true)
    const compressedSize = view.getUint32(cursor + 20, true)
    const uncompressedSize = view.getUint32(cursor + 24, true)
    const nameLength = view.getUint16(cursor + 28, true)
    const extraLength = view.getUint16(cursor + 30, true)
    const commentLength = view.getUint16(cursor + 32, true)
    const localOffset = view.getUint32(cursor + 42, true)
    const name = new TextDecoder("utf-8").decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength))
    entries.push({ name, method, compressedSize, uncompressedSize, localOffset })
    cursor += 46 + nameLength + extraLength + commentLength
  }
  return entries
}

async function inflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  const stream = new Blob([copy]).stream().pipeThrough(new DecompressionStream("deflate-raw"))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

export async function readZipEntry(data: ArrayBuffer, entry: ZipEntry): Promise<Uint8Array> {
  const bytes = new Uint8Array(data)
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (view.getUint32(entry.localOffset, true) !== 0x04034b50) throw new Error(`Missing local header for ${entry.name}.`)
  const nameLength = view.getUint16(entry.localOffset + 26, true)
  const extraLength = view.getUint16(entry.localOffset + 28, true)
  const start = entry.localOffset + 30 + nameLength + extraLength
  const slice = bytes.subarray(start, start + entry.compressedSize)
  if (entry.method === 0) return slice
  if (entry.method === 8) return inflateRaw(slice)
  throw new Error(`${entry.name} uses a compression AIR does not read.`)
}

export function docxXmlToText(xml: string): string {
  return stripHtml(xml.replace(/<w:tab\/>/g, "\t").replace(/<w:br\/>/g, "\n").replace(/<\/w:p>/g, "\n"))
}

export async function textFromDocx(data: ArrayBuffer): Promise<string> {
  const entries = listZip(data)
  const parts: string[] = []
  for (const name of ["word/document.xml", "word/footnotes.xml", "word/endnotes.xml"]) {
    const entry = entries.find((item) => item.name === name)
    if (!entry) continue
    const xml = new TextDecoder("utf-8").decode(await readZipEntry(data, entry))
    const text = docxXmlToText(xml)
    if (text) parts.push(text)
  }
  return parts.join("\n\n").trim()
}

export async function textFromZip(data: ArrayBuffer): Promise<string> {
  const entries = listZip(data).filter((entry) => {
    if (!entry.name || entry.name.endsWith("/")) return false
    if (entry.uncompressedSize > 1_500_000) return false
    return TEXT_INSIDE_ZIP.has(extensionOf(entry.name))
  })
  const parts: string[] = []
  let used = 0
  for (const entry of entries) {
    if (used > 1_500_000) break
    const raw = new TextDecoder("utf-8", { fatal: false }).decode(await readZipEntry(data, entry))
    const text = raw.replace(/^\uFEFF/, "").trim()
    if (!text) continue
    parts.push(`## ${entry.name}\n${text}`)
    used += text.length
  }
  return parts.join("\n\n").trim()
}

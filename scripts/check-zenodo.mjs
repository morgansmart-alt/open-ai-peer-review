// Live check: fetch a public Zenodo record and extract text from one PDF.
// Usage: node scripts/check-zenodo.mjs [record id]
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs"

const recordId = process.argv[2] ?? "18916931"
const headers = { accept: "application/json", "user-agent": "AIR-Peer-Review/0.1" }
const response = await fetch(`https://zenodo.org/api/records/${recordId}`, { headers })
if (!response.ok) {
  console.error(`Zenodo returned ${response.status}`)
  process.exit(1)
}
const data = await response.json()
const files = Array.isArray(data.files) ? data.files : []
const pdf = files.find((file) => String(file.key).toLowerCase().endsWith(".pdf"))
console.log(`title: ${data.metadata?.title}`)
console.log(`doi: ${data.doi}`)
console.log(`files: ${files.length}`)
if (!pdf?.links?.self) {
  console.log("No PDF with a content link on this record.")
  process.exit(0)
}
const download = await fetch(pdf.links.self, { headers })
if (!download.ok) {
  console.error(`File download returned ${download.status}`)
  process.exit(1)
}
const document = await getDocument({ data: new Uint8Array(await download.arrayBuffer()), disableWorker: true }).promise
const page = await document.getPage(1)
const content = await page.getTextContent()
const text = content.items
  .map((item) => ("str" in item ? item.str : ""))
  .join(" ")
  .replace(/\s+/g, " ")
  .trim()
console.log(`pdf: ${pdf.key}`)
console.log(`pages: ${document.numPages}`)
console.log(`page-1 chars: ${text.length}`)
console.log(text.slice(0, 280))

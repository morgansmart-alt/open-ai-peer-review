import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import type { ZenodoRecord } from "../zenodo.ts"
import { extractPdfText } from "./pdfExtract.ts"
import {
  PDF_BYTE_CAP,
  capExtractedText,
  chooseMainPdf,
  crossrefAuthors,
  documentsForPaper,
  formatDoiPaper,
  isOpenLicence,
  openLicenceFromCrossref,
  pdfExceedsCap,
  pdfLinkFromCrossref,
  TRUNCATION_MARK,
} from "./pdfPaper.ts"
import { formatPaperText } from "./paperText.ts"

const fixture = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "fixtures/air-fixture.pdf"))

const record = {
  id: "437445",
  conceptId: "437445",
  doi: "10.5281/zenodo.437445",
  conceptDoi: "10.5281/zenodo.437445",
  title: "HSLU CO2 impact",
  creators: [{ name: "Ada Lovelace" }],
  description: "A public outline of the study.",
  descriptionHtml: "",
  keywords: [],
  version: "1",
  recordVersion: "1",
  license: "cc-by-4.0",
  publicationDate: "2019-01-01",
  related: [],
  resourceType: "publication",
  access: { record: "open", files: "open" },
  files: [
    {
      key: "HSLU-CO2-impact-BIPV-active-interface.pdf",
      size: fixture.byteLength,
      downloadUrl: "https://zenodo.org/records/437445/files/HSLU-CO2-impact-BIPV-active-interface.pdf",
      extension: "pdf",
    },
  ],
  htmlUrl: "https://zenodo.org/records/437445",
} satisfies ZenodoRecord

describe("open-licence PDF text", () => {
  it("reads the fixture PDF and marks a short cap as truncated", async () => {
    const extracted = await extractPdfText(new Uint8Array(fixture))
    expect(extracted.text).toContain("AIR fixture yield 1.8 litres")
    expect(extracted.truncated).toBe(false)
    const short = capExtractedText(`${extracted.text} ${"alpha ".repeat(40)}`, 24)
    expect(short.truncated).toBe(true)
    expect(short.text.startsWith("AIR fixture")).toBe(true)
    expect(short.text.endsWith(TRUNCATION_MARK)).toBe(true)
    expect(short.text.indexOf(TRUNCATION_MARK)).toBeLessThan(40)
  })

  it("copies an open-licence PDF and refuses a closed licence without downloading", async () => {
    const calls: string[] = []
    const open = await documentsForPaper(
      record,
      async (url) => {
        calls.push(url)
        return { ok: true, bytes: new Uint8Array(fixture) }
      },
      extractPdfText,
    )
    expect(calls).toEqual([record.files[0]?.downloadUrl])
    expect(open.unavailable).toBe("")
    expect(open.documents[0]?.text).toContain("AIR fixture yield 1.8 litres")
    const page = formatPaperText(record, open.documents, open.unavailable)
    expect(page).toContain("AIR fixture yield 1.8 litres")
    expect(page).not.toContain("Full text unavailable")

    calls.length = 0
    const closed = await documentsForPaper(
      { ...record, license: "all-rights-reserved" },
      async (url) => {
        calls.push(url)
        return { ok: true, bytes: new Uint8Array(fixture) }
      },
      extractPdfText,
    )
    expect(calls).toEqual([])
    expect(closed.documents).toEqual([])
    expect(closed.unavailable).toContain("not an open licence")
    const metadata = formatPaperText({ ...record, license: "all-rights-reserved" }, closed.documents, closed.unavailable)
    expect(metadata).toContain("Full text unavailable")
    expect(metadata).not.toContain("AIR fixture")
  })

  it("prefers a PDF under 25 MB and skips one that is larger", () => {
    const small = { key: "note.pdf", size: 20, downloadUrl: "https://zenodo.org/records/1/files/note.pdf", extension: "pdf" }
    const main = { key: "paper.pdf", size: 2_000_000, downloadUrl: "https://zenodo.org/records/1/files/paper.pdf", extension: "pdf" }
    const huge = { key: "scan.pdf", size: PDF_BYTE_CAP + 1, downloadUrl: "https://zenodo.org/records/1/files/scan.pdf", extension: "pdf" }
    expect(chooseMainPdf([small, huge, main])?.key).toBe("paper.pdf")
    expect(pdfExceedsCap([huge])).toBe(true)
    expect(chooseMainPdf([huge])).toBeNull()
  })

  it("recognises cc-by and cc0, including a Crossref URL, and a direct PDF link", () => {
    expect(isOpenLicence("cc-by-4.0")).toBe(true)
    expect(isOpenLicence("CC BY 4.0")).toBe(true)
    expect(isOpenLicence("cc0")).toBe(true)
    expect(isOpenLicence("https://creativecommons.org/licenses/by/4.0")).toBe(true)
    expect(isOpenLicence("https://creativecommons.org/publicdomain/zero/1.0/")).toBe(true)
    expect(isOpenLicence("all-rights-reserved")).toBe(false)
    expect(isOpenLicence("")).toBe(false)
    const work = {
      title: ["Open note"],
      author: [{ given: "Ada", family: "Lovelace" }],
      license: [{ URL: "https://creativecommons.org/licenses/by/4.0" }],
      link: [{ URL: "https://publisher.example/paper.pdf", "content-type": "application/pdf" }],
    }
    expect(openLicenceFromCrossref(work)).toContain("licenses/by/4.0")
    expect(openLicenceFromCrossref({ license: [{ URL: "https://publisher.example/proprietary" }] })).toBe("")
    expect(pdfLinkFromCrossref(work)).toBe("https://publisher.example/paper.pdf")
    expect(crossrefAuthors(work)).toBe("Ada Lovelace")
    const missing = formatDoiPaper({ doi: "10.1000/example", title: "Open note", authors: "Ada Lovelace", text: "", unavailable: "The PDF could not be downloaded." })
    expect(missing).toContain("DOI: https://doi.org/10.1000/example")
    expect(missing).toContain("Full text unavailable. The PDF could not be downloaded.")
  })
})

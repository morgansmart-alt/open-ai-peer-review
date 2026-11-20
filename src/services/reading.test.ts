import { describe, expect, it } from "vitest"
import { builtinAssessors } from "../domain/assessors.ts"
import { PDF_PAGE_CEILING, extractDocument, pagesToRead, scannedPdfNote } from "./extractText.ts"
import { geminiChatBody, openAiChatBody, OUTPUT_TOKEN_LIMIT } from "./providers.ts"
import { listZip, textFromDocx, textFromZip } from "./zipText.ts"
import { chunkText, readingCoverage, sectionsFor } from "./textTools.ts"
import { isPublishedDoi, parseAnyRef, recordFromCrossref, recordFromOpenAlex } from "./works.ts"

function u16(value: number): number[] {
  return [value & 255, (value >> 8) & 255]
}

function u32(value: number): number[] {
  return [value & 255, (value >> 8) & 255, (value >> 16) & 255, (value >> 24) & 255]
}

function storedZip(files: { name: string; bytes: Uint8Array }[]): Uint8Array {
  const locals: number[] = []
  const central: number[] = []
  let offset = 0
  for (const file of files) {
    const name = [...new TextEncoder().encode(file.name)]
    const data = [...file.bytes]
    locals.push(
      ...u32(0x04034b50),
      ...u16(20),
      ...u16(0),
      ...u16(0),
      ...u16(0),
      ...u16(0),
      ...u32(0),
      ...u32(data.length),
      ...u32(data.length),
      ...u16(name.length),
      ...u16(0),
      ...name,
      ...data,
    )
    central.push(
      ...u32(0x02014b50),
      ...u16(20),
      ...u16(20),
      ...u16(0),
      ...u16(0),
      ...u16(0),
      ...u16(0),
      ...u32(0),
      ...u32(data.length),
      ...u32(data.length),
      ...u16(name.length),
      ...u16(0),
      ...u16(0),
      ...u16(0),
      ...u16(0),
      ...u32(0),
      ...u32(offset),
      ...name,
    )
    offset += 30 + name.length + data.length
  }
  const end = [
    ...u32(0x06054b50),
    ...u16(0),
    ...u16(0),
    ...u16(files.length),
    ...u16(files.length),
    ...u32(central.length),
    ...u32(offset),
    ...u16(0),
  ]
  return Uint8Array.from([...locals, ...central, ...end])
}

describe("full-length coverage", () => {
  it("reads every page up to the safety ceiling and keeps the back half of a long text", () => {
    expect(pagesToRead(119)).toBe(119)
    expect(pagesToRead(800)).toBe(PDF_PAGE_CEILING)
    const paragraphs = Array.from({ length: 90 }, (_, index) => `Section ${index} claims ${index * 3} units and leaves question ${index} open. ${"detail ".repeat(40)}`)
    const text = paragraphs.join("\n\n")
    const chunks = chunkText(text, 500)
    expect(chunks.length).toBeGreaterThan(8)
    expect(chunks[0]).toContain("Section 0")
    expect(chunks[chunks.length - 1]).toContain("Section 89")
    const sections = sectionsFor([{ filename: "paper.pdf", text }])
    expect(sections.length).toBeGreaterThan(1)
    expect(sections[0]?.text).toContain("Section 0")
    expect(sections[sections.length - 1]?.text).toContain("Section 89")
    expect(readingCoverage([{ pagesRead: 119, pagesTotal: 119 }], sections.length)).toEqual({
      pagesRead: 119,
      pagesTotal: 119,
      chunksSummarised: sections.length,
      coverage: "full",
    })
    expect(readingCoverage([{ pagesRead: 500, pagesTotal: 800 }], 80).coverage).toBe("partial")
  })
})

describe("file types", () => {
  it("warns on a scanned PDF and reads text, docx, and zip contents", async () => {
    expect(scannedPdfNote("x", 4)).toContain("scanned/image-only")
    expect(scannedPdfNote("word ".repeat(80), 2)).toBeUndefined()
    const csv = await extractDocument("table.csv", new TextEncoder().encode("claim,value\nmass,1.8\n").buffer)
    expect(csv.text).toContain("mass,1.8")
    expect(csv.kind).toBe("text")
    const py = await extractDocument("bench.py", new TextEncoder().encode("print(1)\n").buffer)
    expect(py.text).toContain("print(1)")
    const tex = await extractDocument("notes.tex", new TextEncoder().encode("\\section{Limits}\n").buffer)
    expect(tex.kind).toBe("text")
    const asBuffer = (bytes: Uint8Array): ArrayBuffer => {
      const copy = new ArrayBuffer(bytes.byteLength)
      new Uint8Array(copy).set(bytes)
      return copy
    }
    const docx = storedZip([{ name: "word/document.xml", bytes: new TextEncoder().encode("<w:p><w:r><w:t>Closed chain</w:t></w:r></w:p>") }])
    expect(await textFromDocx(asBuffer(docx))).toContain("Closed chain")
    const packed = storedZip([
      { name: "src/run.py", bytes: new TextEncoder().encode("print('repro')\n") },
      { name: "plot.png", bytes: Uint8Array.from([1, 2, 3]) },
    ])
    const packedBuffer = asBuffer(packed)
    expect(listZip(packedBuffer).map((entry) => entry.name)).toEqual(["src/run.py", "plot.png"])
    expect(await textFromZip(packedBuffer)).toContain("print('repro')")
    expect(await textFromZip(packedBuffer)).not.toContain("plot.png")
  })
})

describe("non-Zenodo DOIs", () => {
  it("accepts arXiv and other DOIs without treating them as Zenodo ids", () => {
    expect(parseAnyRef("10.5281/zenodo.23773780")).toMatchObject({ kind: "zenodo", recordId: "23773780" })
    expect(parseAnyRef("https://arxiv.org/abs/1706.03762")?.doi).toBe("10.48550/arXiv.1706.03762")
    expect(parseAnyRef("10.48550/arXiv.1706.03762")).toMatchObject({ kind: "doi" })
    expect(isPublishedDoi("10.48550/arXiv.1706.03762")).toBe(true)
    expect(isPublishedDoi("")).toBe(false)
    const openAlex = recordFromOpenAlex({
      display_name: "Attention Is All You Need",
      doi: "https://doi.org/10.48550/arxiv.1706.03762",
      publication_date: "2017-06-12",
      authorships: [{ author: { display_name: "Ashish Vaswani" } }],
      best_oa_location: { pdf_url: "https://arxiv.org/pdf/1706.03762" },
      primary_location: { landing_page_url: "http://arxiv.org/abs/1706.03762" },
      abstract_inverted_index: { Attention: [0], matters: [1] },
    })
    expect(openAlex?.title).toBe("Attention Is All You Need")
    expect(openAlex?.files[0]?.downloadUrl).toBe("https://arxiv.org/pdf/1706.03762")
    expect(openAlex?.description).toBe("Attention matters")
    const crossref = recordFromCrossref({
      message: {
        DOI: "10.1038/nature12373",
        title: ["A journal paper"],
        author: [{ given: "Ada", family: "Lovelace" }],
        issued: { "date-parts": [[2013, 8, 1]] },
        link: [{ URL: "https://example.org/paper.pdf", "content-type": "application/pdf" }],
      },
    })
    expect(crossref?.creators[0]?.name).toBe("Ada Lovelace")
    expect(crossref?.files[0]?.key).toBe("paper.pdf")
    expect(crossref?.publicationDate).toBe("2013-8-1")
  })
})

describe("provider payloads", () => {
  it("uses current Grok and Gemini models and a generous JSON token ceiling", () => {
    expect(builtinAssessors.find((profile) => profile.id === "grok")?.defaultModel).toBe("grok-4.7")
    expect(builtinAssessors.find((profile) => profile.id === "grok")?.defaultBaseUrl).toBe("https://api.x.ai/v1")
    expect(builtinAssessors.find((profile) => profile.id === "gemini")?.defaultModel).toBe("gemini-3.5-flash")
    expect(builtinAssessors.find((profile) => profile.id === "gemini")?.defaultBaseUrl).toBe("https://generativelanguage.googleapis.com/v1beta")
    const request = { model: "grok-4.7", system: "sys", user: "user", json: true }
    expect(openAiChatBody(request, OUTPUT_TOKEN_LIMIT).max_tokens).toBe(16384)
    expect(openAiChatBody(request, OUTPUT_TOKEN_LIMIT).response_format).toEqual({ type: "json_object" })
    const gemini = geminiChatBody({ ...request, model: "gemini-3.5-flash" })
    const config = gemini.generationConfig as { maxOutputTokens: number; responseMimeType: string }
    expect(config.maxOutputTokens).toBe(16384)
    expect(config.responseMimeType).toBe("application/json")
  })
})

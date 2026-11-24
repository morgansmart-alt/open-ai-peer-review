import { describe, expect, it } from "vitest"
import { classifyPublication, previewFromZenodo, resolvePublication, type FetchLike } from "./publication.ts"
import { normalizeZenodoRecord } from "../zenodo.ts"

const zenodoJson = {
  id: 18916931,
  conceptrecid: "18916930",
  doi: "10.5281/zenodo.18916931",
  metadata: {
    title: "A public note",
    publication_date: "2026-03-09",
    description: "A claim a reader can check.",
    creators: [{ name: "Smart, Morgan" }],
    license: { id: "cc-by-4.0" },
  },
  files: [
    {
      key: "notes.pdf",
      size: 1200,
      links: { self: "https://zenodo.org/api/records/18916931/files/notes.pdf/content" },
    },
  ],
  links: { self_html: "https://zenodo.org/records/18916931" },
}

function jsonResponse(url: string, body: unknown, status = 200): Awaited<ReturnType<FetchLike>> {
  return {
    ok: status >= 200 && status < 300,
    status,
    url,
    headers: { get: () => "application/json" },
    json: async () => body,
    text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
  }
}

describe("publication links", () => {
  it("classifies Zenodo, DOI, arXiv, and PDF links", () => {
    expect(classifyPublication("https://zenodo.org/records/18916931")).toMatchObject({ kind: "zenodo", recordId: "18916931" })
    expect(classifyPublication("https://doi.org/10.5281/zenodo.18916931")).toMatchObject({ kind: "zenodo", recordId: "18916931" })
    expect(classifyPublication("https://doi.org/10.1038/s41586-020-2649-2").kind).toBe("doi")
    expect(classifyPublication("https://arxiv.org/abs/2201.00001")).toMatchObject({ kind: "arxiv", id: "2201.00001" })
    expect(classifyPublication("https://arxiv.org/pdf/2201.00001.pdf").kind).toBe("arxiv")
    expect(classifyPublication("https://example.com/paper.pdf").kind).toBe("pdf")
    expect(classifyPublication("hello").kind).toBe("unknown")
  })

  it("reads title, authors, DOI, and the PDF link from a Zenodo payload", () => {
    const preview = previewFromZenodo(normalizeZenodoRecord(zenodoJson))
    expect(preview.title).toBe("A public note")
    expect(preview.authors).toEqual(["Smart, Morgan"])
    expect(preview.doi).toBe("10.5281/zenodo.18916931")
    expect(preview.pdfUrl).toContain("notes.pdf")
  })

  it("resolves a Zenodo URL, a doi.org redirect, an arXiv id, and a direct PDF", async () => {
    const fetcher: FetchLike = async (url) => {
      if (url.startsWith("https://zenodo.org/api/records/18916931")) return jsonResponse(url, zenodoJson)
      if (url.startsWith("https://doi.org/10.1038/")) return jsonResponse("https://zenodo.org/records/18916931", "")
      if (url.startsWith("https://doi.org/")) return jsonResponse("https://zenodo.org/records/18916931", "")
      if (url.startsWith("https://export.arxiv.org/")) {
        return jsonResponse(url, `<feed><entry><title>A toy paper</title><author><name>Ada Lovelace</name></author></entry></feed>`)
      }
      return jsonResponse(url, "", 404)
    }
    const zenodo = await resolvePublication("https://zenodo.org/records/18916931", fetcher)
    expect(zenodo.title).toBe("A public note")
    expect(zenodo.authors).toEqual(["Smart, Morgan"])
    const viaDoi = await resolvePublication("https://doi.org/10.1038/nature.1", fetcher)
    expect(viaDoi.doi).toBe("10.5281/zenodo.18916931")
    expect(viaDoi.title).toBe("A public note")
    const arxiv = await resolvePublication("https://arxiv.org/abs/2201.00001", fetcher)
    expect(arxiv.title).toBe("A toy paper")
    expect(arxiv.authors).toEqual(["Ada Lovelace"])
    expect(arxiv.pdfUrl).toBe("https://arxiv.org/pdf/2201.00001.pdf")
    const pdf = await resolvePublication("https://example.com/notes.pdf", fetcher)
    expect(pdf.filename).toBe("notes.pdf")
    expect(pdf.pdfUrl).toBe("https://example.com/notes.pdf")
  })
})

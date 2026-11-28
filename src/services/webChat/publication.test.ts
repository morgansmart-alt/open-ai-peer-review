import { describe, expect, it } from "vitest"
import { officialCriteria } from "../../domain/officialCriteria.ts"
import { normalizeZenodoRecord } from "../zenodo.ts"
import { webChatModelId } from "./chatModel.ts"
import { choosePaperTextUrl } from "./paperText.ts"
import { classifyPublication, normalizePublicationLink, previewFromZenodo, resolvePublication, type FetchLike } from "./publication.ts"
import { storedLocalReview } from "./standalone.ts"
import { submissionFromReview, validateWebChatSubmission } from "./submission.ts"

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
    expect(classifyPublication("https://zenodo.org/records/18916931/")).toMatchObject({ kind: "zenodo", recordId: "18916931" })
    expect(classifyPublication("https://zenodo.org/records/18916931?ln=en")).toMatchObject({ kind: "zenodo", recordId: "18916931" })
    expect(classifyPublication("https://zenodo.org/record/18916931")).toMatchObject({ kind: "zenodo", recordId: "18916931" })
    expect(classifyPublication("https://zenodo.org/doi/18916931")).toMatchObject({ kind: "zenodo", recordId: "18916931" })
    expect(classifyPublication("https://zenodo.org/doi/10.5281/zenodo.18916931")).toMatchObject({ kind: "zenodo", recordId: "18916931" })
    expect(classifyPublication("https://doi.org/10.5281/zenodo.18916931")).toMatchObject({ kind: "zenodo", recordId: "18916931" })
    expect(classifyPublication("https://doi.org/10.5281/zenodo.18916931/")).toMatchObject({ kind: "zenodo", recordId: "18916931" })
    expect(classifyPublication("https://doi.org/10.5281/zenodo.18916931?nosplash")).toMatchObject({ kind: "zenodo", recordId: "18916931" })
    expect(classifyPublication("https://doi.org/10.1038/s41586-020-2649-2").kind).toBe("doi")
    expect(classifyPublication("https://arxiv.org/abs/2201.00001")).toMatchObject({ kind: "arxiv", id: "2201.00001" })
    expect(classifyPublication("https://arxiv.org/pdf/2201.00001.pdf").kind).toBe("arxiv")
    expect(classifyPublication("https://example.com/paper.pdf").kind).toBe("pdf")
    expect(classifyPublication("hello").kind).toBe("unknown")
    expect(normalizePublicationLink("https://https://zenodo.org/records/437445")).toBe("https://zenodo.org/records/437445")
    expect(normalizePublicationLink("http://https://zenodo.org/records/437445")).toBe("https://zenodo.org/records/437445")
    expect(classifyPublication("https://https://zenodo.org/records/437445")).toMatchObject({ kind: "zenodo", recordId: "437445" })
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

  it("sends a Grok on X review that started from a Zenodo link, even when the text page is down", async () => {
    const recordId = "424242"
    const record = {
      ...zenodoJson,
      id: Number(recordId),
      doi: `10.5281/zenodo.${recordId}`,
      links: { self_html: `https://zenodo.org/records/${recordId}` },
    }
    const fetcher: FetchLike = async (url) => {
      if (url.startsWith(`https://zenodo.org/api/records/${recordId}`)) return jsonResponse(url, record)
      return jsonResponse(url, "", 404)
    }
    const preview = await resolvePublication(`https://zenodo.org/records/${recordId}/?ln=en`, fetcher)
    expect(preview.doi).toBe(`10.5281/zenodo.${recordId}`)
    expect(preview.url).toBe(`https://zenodo.org/records/${recordId}`)
    const stored = await storedLocalReview({
      providerId: "grok-x",
      criteria: officialCriteria,
      filename: preview.filename,
      report: {
        summary: "The record states a narrow claim and shows the weighing steps that support it, with the season limit written in the text.",
        scores: officialCriteria.criteria.map((criterion) => ({
          criterionId: criterion.id,
          score: 70,
          rationale: "Cited in the record.",
          citations: [{ quote: "A sentence from the record.", location: "results" }],
        })),
        overallScore: 70,
        ideaScore: 70,
        recommendation: "revise",
        scale: 100,
        strengths: [],
        majorIssues: [],
        minorIssues: [],
        questionsForAuthors: [],
        suggestedNextSteps: [],
      },
      publication: { title: preview.title, doi: preview.doi, url: preview.url, authors: preview.authors },
    })
    expect(stored.doi).toBe(`10.5281/zenodo.${recordId}`)
    expect(stored.paperUrl).toBe(`https://zenodo.org/records/${recordId}`)
    const modelId = webChatModelId("Grok on x.com", "Auto")
    stored.modelId = modelId
    const built = submissionFromReview(stored, modelId)
    expect(built.ok).toBe(true)
    if (!built.ok) return
    expect(built.submission.paper.doi).toBe(stored.doi)
    expect(built.submission.paper.url).toBe(stored.paperUrl)
    expect(built.submission.site).toBe(modelId)
    const server = validateWebChatSubmission(built.submission)
    expect(server.ok).toBe(true)
    const missing = await choosePaperTextUrl(recordId, async () => ({ status: 404, body: "<div id=\"root\"></div>" }))
    const down = await choosePaperTextUrl(recordId, async () => ({ status: 502, body: "" }))
    expect(missing).toBeNull()
    expect(down).toBeNull()
    expect(stored.doi).toBe(`10.5281/zenodo.${recordId}`)
    expect(stored.paperUrl).toBe(`https://zenodo.org/records/${recordId}`)
  })
})

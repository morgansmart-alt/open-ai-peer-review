import { describe, expect, it } from "vitest"
import { webChatProvider } from "../../../extension/adapters/index.ts"
import { officialCriteria } from "../../domain/officialCriteria.ts"
import { reviewSystemPrompt } from "../prompts.ts"
import type { ZenodoRecord } from "../zenodo.ts"
import { acceptWebChatResult, draftWebChatReview } from "./accept.ts"
import { planDelivery } from "./deliver.ts"
import { buildWebChatPacket } from "./packet.ts"
import { parseModelJson, settleChatJson } from "../jsonText.ts"
import {
  couldNotReadPaper,
  formatPaperText,
  isPublicPaperTextUrl,
  linkReadingPrompt,
  MANUAL_PASTE_SITE,
  manualPasteModel,
  paperTextRecordIdFromPath,
  paperTextUrl,
  TEXT_PAGE_NOTE,
  textPageHasPaper,
  textPageUntrusted,
} from "./paperText.ts"
import { resultCard } from "./standalone.ts"
import { submissionFromReview } from "./submission.ts"

const record = {
  id: "22826",
  conceptId: "611843",
  doi: "10.5281/zenodo.22826",
  conceptDoi: "10.5281/zenodo.611843",
  title: "CODATA data note",
  creators: [{ name: "Ada Lovelace" }, { name: "Grace Hopper" }],
  description: "A public description.",
  descriptionHtml: "",
  keywords: [],
  version: "1",
  recordVersion: "1",
  license: "cc-by-4.0",
  publicationDate: "2020-01-01",
  related: [],
  resourceType: "publication",
  access: { record: "open", files: "open" },
  files: [],
  htmlUrl: "https://zenodo.org/records/22826",
} satisfies ZenodoRecord

describe("public paper text", () => {
  it("builds a path a chat can fetch and a page with the public links", () => {
    expect(paperTextUrl("22826")).toBe("https://morgansmart-alt.github.io/open-ai-peer-review/paper/22826/text")
    expect(paperTextRecordIdFromPath("/open-ai-peer-review/paper/22826/text")).toBe("22826")
    expect(isPublicPaperTextUrl(paperTextUrl("22826"))).toBe(true)
    expect(isPublicPaperTextUrl("https://share.google/aimode/secret")).toBe(false)
    const page = formatPaperText(record, [
      { filename: "note.txt", text: "The table is in the file. https://chatgpt.com/share/SECRET" },
    ])
    expect(page).toContain("CODATA data note")
    expect(page).toContain("Authors: Ada Lovelace; Grace Hopper")
    expect(page).toContain("Zenodo record: https://zenodo.org/records/22826")
    expect(page).toContain("Version DOI: https://doi.org/10.5281/zenodo.22826")
    expect(page).toContain("Concept DOI: https://doi.org/10.5281/zenodo.611843")
    expect(page).toContain("The table is in the file.")
    expect(page).not.toContain("SECRET")
    expect(page).toContain("[private link]")
  })

  it("does not include restricted files", () => {
    const closed = formatPaperText(
      { ...record, access: { record: "open", files: "restricted" }, files: [{ key: "secret.pdf", size: 10, downloadUrl: "https://zenodo.org/records/22826/files/secret.pdf", extension: "pdf" }] },
      [{ filename: "secret.pdf", text: "do not publish this extract" }],
    )
    expect(closed).not.toContain("do not publish")
    expect(closed).toContain("are not public")
    expect(closed).toContain("secret.pdf")
  })

  it("sends one short link, and keeps the inline paper when the link is refused", () => {
    const provider = webChatProvider("grok-x")
    if (!provider) throw new Error("missing grok-x")
    const packet = buildWebChatPacket({
      requestId: "text-page",
      providerId: "grok-x",
      criteria: officialCriteria,
      record,
      documents: [{ filename: "note.txt", text: "UNIQUEYIELD stays out of the first message." }],
      useTextPage: true,
    })
    const plan = planDelivery(packet, provider)
    expect(plan.steps).toHaveLength(1)
    expect(plan.steps[0]?.link).toBe(true)
    expect(plan.steps[0]?.text).toContain(paperTextUrl("22826"))
    expect(plan.steps[0]?.text).toContain("No sign-in is required")
    expect(plan.steps[0]?.text).not.toContain("UNIQUEYIELD")
    expect(plan.steps[0]?.text.length).toBeLessThan(provider.pasteLimit)
    const inline = planDelivery({ ...packet, textUrl: undefined }, { ...provider, fileUpload: false })
    expect(inline.steps.some((step) => step.text.includes("UNIQUEYIELD"))).toBe(true)
    expect(plan.steps[0]?.text).toContain("https://doi.org/10.5281/zenodo.22826")
    expect(couldNotReadPaper("I could not access the URL.")).toBe(true)
    expect(couldNotReadPaper('{"overallScore":86,"summary":"fine"}')).toBe(false)
    expect(linkReadingPrompt(paperTextUrl("22826"), packet.system, packet.instructions)).toContain("https://doi.org/10.5281/zenodo.22826")
  })

  it("asks for a concrete AIR note instead of an empty string", () => {
    expect(reviewSystemPrompt(officialCriteria)).toContain("Never use an empty string")
    expect(reviewSystemPrompt(officialCriteria)).toContain("at least one concrete")
  })

  it("keeps one Grok on X message when the paper fits, with the links in that message", () => {
    const provider = webChatProvider("grok-x")
    if (!provider) throw new Error("missing grok-x")
    const packet = buildWebChatPacket({
      requestId: "one-message",
      providerId: "grok-x",
      criteria: officialCriteria,
      record,
      documents: [{ filename: "note.txt", text: `Measured yield. ${"alpha ".repeat(2000)}` }],
    })
    const plan = planDelivery(packet, provider)
    expect(plan.steps).toHaveLength(1)
    expect(plan.steps[0]?.text).toContain("https://zenodo.org/records/22826")
    expect(plan.steps[0]?.text).toContain("https://doi.org/10.5281/zenodo.22826")
    expect(plan.steps[0]?.text).toContain("Measured yield")
    expect(plan.steps[0]?.text.length).toBeLessThanOrEqual(provider.pasteLimit)
  })
})

describe("json repair and the text page check", () => {
  it("repairs a missing comma and asks once when repair is not enough", async () => {
    const missingComma = '{"scores":[{"criterionId":"a","score":80} {"criterionId":"b","score":80}],"overallScore":80}'
    const repaired = parseModelJson(missingComma)
    expect(repaired.ok).toBe(true)
    if (!repaired.ok) return
    expect(repaired.repaired).toBe(true)
    expect(repaired.value).toMatchObject({ overallScore: 80 })
    const trailing = parseModelJson('{"overallScore":80,}')
    expect(trailing.ok && trailing.repaired).toBe(true)
    const notes: string[] = []
    const asked: string[] = []
    const settled = await settleChatJson(
      "this is not json",
      async (prompt) => {
        asked.push(prompt)
        return '{"overallScore":84}'
      },
      (note) => notes.push(note),
    )
    expect(asked).toHaveLength(1)
    expect(asked[0]).toContain("Reply again with only the corrected JSON object.")
    expect(notes.join(" ")).toContain("Asked once for corrected JSON.")
    expect(settled.reasked).toBe(true)
    expect(settled.text).toContain("84")
  })

  it("treats a 404 page as down and a scored reply that cites that 404 as untrusted", () => {
    const live = `${"A public paper paragraph. ".repeat(30)}\nZenodo record: https://zenodo.org/records/22826\nVersion DOI: https://doi.org/10.5281/zenodo.22826`
    expect(textPageHasPaper(200, live)).toBe(true)
    expect(textPageHasPaper(404, live)).toBe(false)
    expect(textPageHasPaper(200, '<div id="root"></div>')).toBe(false)
    const silent = '{"overallScore":84,"summary":"https://morgansmart-alt.github.io/open-ai-peer-review/paper/22826/text returned 404, so the arXiv copy was used.","air_feedback":{"missingContext":"The text page URL returned 404.","scoringProcess":"I scored the arXiv text."}}'
    expect(couldNotReadPaper(silent)).toBe(false)
    expect(textPageUntrusted(silent)).toBe(true)
    expect(textPageUntrusted('{"overallScore":84,"summary":"The record is sound."}')).toBe(false)
    expect(TEXT_PAGE_NOTE).toBe("text page unreachable, model used other sources")
  })
})

describe("manual paste", () => {
  it("stores an uncalibrated score for manual paste and a typed or unknown model", () => {
    expect(manualPasteModel("  ")).toBe("unknown")
    expect(manualPasteModel("Expert")).toBe("Expert")
    const packet = buildWebChatPacket({
      requestId: "paste",
      providerId: "grok",
      criteria: officialCriteria,
      record,
      documents: [{ filename: "note.txt", text: "A short public note with a table." }],
    })
    const accepted = acceptWebChatResult(
      JSON.stringify({
        summary: "The record states a narrow claim and shows the weighing steps that support it, with the season limit written in the text.",
        scores: officialCriteria.criteria.map((criterion) => ({
          criterionId: criterion.id,
          score: 80,
          rationale: `${criterion.name} is supported by a passage a reader can find in the record.`,
          citations: [{ quote: "Net B collected 1.8 litres.", location: "results" }],
          confidence: "medium",
        })),
        recommendation: "accept",
        overallScore: 80,
        strengths: ["The files are public."],
        majorIssues: [],
        minorIssues: [],
        questionsForAuthors: ["What would a second season change?"],
        suggestedNextSteps: ["Publish the weighing sheet beside the figure."],
        ontologyClass: "physical-testable",
        physics: { classification: "CONSISTENT", laws: ["conservation of mass"], howAddressed: "The mass balance is written out." },
        simulation: { reported: 0, passed: 0, methods: "Simulation does not apply.", inputsAvailable: false },
        valueEstimate: { assumptions: ["One site."], marketDisruption: "Not estimated." },
        goals: [{ goalId: "sdg-6", level: "indirect", note: "Water collection is named." }],
      }),
      officialCriteria,
    )
    expect(accepted.ok).toBe(true)
    if (!accepted.ok) return
    const stored = draftWebChatReview({
      id: "paste-1",
      packet,
      report: accepted.report,
      record: { ...record, creators: record.creators.map((creator) => creator.name) },
      criteria: officialCriteria,
      customCriteria: false,
      outputHash: "hash",
      createdAt: "2026-11-24T00:00:00.000Z",
      privateUrls: [],
      privateContextCount: 0,
    })
    stored.modelId = manualPasteModel("")
    stored.tier = "uncalibrated web-chat"
    stored.source = "web-chat extension"
    const built = submissionFromReview(stored, MANUAL_PASTE_SITE)
    expect(built.ok).toBe(true)
    if (!built.ok) return
    expect(built.submission.site).toBe("manual paste")
    expect(built.submission.model).toBe("unknown")
    expect(built.submission.tier).toBe("uncalibrated web-chat")
    expect(built.submission.overallScore).toBe(80)
    stored.report.airFeedback = { scoringProcess: "I kept the weighted total." }
    const card = resultCard(stored)
    expect(card.feedback.map((item) => item.label)).toContain("Scoring process")
    expect(card.feedback.find((item) => item.label === "Scoring process")?.text).toContain("weighted total")
    expect(card.feedback.find((item) => item.label === "Criteria")?.text).toBe("none")
  })
})

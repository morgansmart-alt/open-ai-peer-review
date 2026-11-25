import { describe, expect, it } from "vitest"
import { webChatProvider } from "../../../extension/adapters/index.ts"
import { officialCriteria } from "../../domain/officialCriteria.ts"
import { reviewSystemPrompt } from "../prompts.ts"
import type { ZenodoRecord } from "../zenodo.ts"
import { acceptWebChatResult, draftWebChatReview } from "./accept.ts"
import { planDelivery } from "./deliver.ts"
import { buildWebChatPacket } from "./packet.ts"
import { chooseReviewJson, parseModelJson, settleChatJson } from "../jsonText.ts"
import curatedIds from "../../../paper-text-ids.json" with { type: "json" }
import { collectPaperIds, documentsForOpenRecord, isOpenFileAccess, mergePaperIds, renderStaticPaperText } from "./paperTextFiles.ts"
import {
  choosePaperTextUrl,
  couldNotReadPaper,
  formatPaperText,
  isPublicPaperTextUrl,
  linkReadingPrompt,
  MANUAL_PASTE_SITE,
  manualPasteModel,
  paperTextFunctionUrl,
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
    expect(paperTextUrl("22826")).toBe("https://morgansmart-alt.github.io/open-ai-peer-review/paper-text/22826.txt")
    expect(paperTextRecordIdFromPath("/open-ai-peer-review/paper/22826/text")).toBe("22826")
    expect(isPublicPaperTextUrl(paperTextUrl("22826"))).toBe(true)
    expect(isPublicPaperTextUrl(paperTextFunctionUrl("22826"))).toBe(true)
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
    const grok = webChatProvider("grok")
    if (!grok) throw new Error("missing grok")
    expect(planDelivery({ ...packet, providerId: "grok" }, grok).steps[0]?.text).toBe(plan.steps[0]?.text)
    expect(plan.steps[0]?.text).not.toContain("UNIQUEYIELD")
    expect(plan.steps[0]?.text.length).toBeLessThan(provider.pasteLimit)
    const inline = planDelivery({ ...packet, textUrl: undefined }, { ...provider, fileUpload: false })
    expect(inline.steps.some((step) => step.text.includes("UNIQUEYIELD"))).toBe(true)
    expect(plan.steps[0]?.text).toContain("https://doi.org/10.5281/zenodo.22826")
    expect(couldNotReadPaper("I could not access the URL.")).toBe(true)
    expect(couldNotReadPaper('{"overallScore":86,"summary":"fine"}')).toBe(false)
    const linked = linkReadingPrompt(paperTextUrl("22826"), packet.instructions)
    expect(linked).toContain("https://doi.org/10.5281/zenodo.22826")
    expect(linked).toContain("Anchors:")
    expect(linked).toContain("reference, dataset, or standards paper")
    expect(linked).not.toContain("You are an AIR reviewer")
    expect(linked.length).toBeLessThan(packet.system.length + packet.instructions.length)
  })

  it("asks for a concrete AIR note instead of an empty string", () => {
    expect(reviewSystemPrompt(officialCriteria)).toContain("leaves global-goals out of that weighted total")
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
    expect(asked[0]).toContain("scores must be an array")
    expect(asked[0]).toContain("at least 40 characters")
    expect(notes.join(" ")).toContain("Rejected the reply.")
    expect(notes.join(" ")).toContain("Chosen JSON:")
    expect(settled.reasked).toBe(true)
    expect(settled.text).toContain("84")
    const schemaNotes: string[] = []
    const schemaAsked: string[] = []
    await settleChatJson(
      '{"overallScore":88,"recommendation":"banana","strengths":[]}',
      async (prompt) => {
        schemaAsked.push(prompt)
        return '{"overallScore":88}'
      },
      (note) => schemaNotes.push(note),
      () => ({ ok: false, errors: ["recommendation must be one of: accept, encourage, revise, major-revision, not-ready.", "Add at least one strength."] }),
    )
    expect(schemaAsked).toHaveLength(1)
    expect(schemaAsked[0]).toContain("scores must be an array")
    expect(schemaAsked[0]).toContain("Add at least one strength.")
    expect(schemaAsked[0]).not.toContain("criteria category ids")
    expect(schemaNotes.join(" ")).toContain("Rejected the reply.")
    expect(schemaNotes.join(" ")).toContain("Chosen JSON:")
    const templateAsked: string[] = []
    const template = await settleChatJson(
      '{"overallScore":"number","recommendation":"accept | encourage | revise","strengths":["string"],"scores":[{"criterionId":"clarity","score":"number"}]}',
      async (prompt) => {
        templateAsked.push(prompt)
        return '{"overallScore":81,"recommendation":"encourage"}'
      },
      () => undefined,
    )
    expect(templateAsked).toHaveLength(1)
    expect(templateAsked[0]).toContain("Fill in the review now")
    expect(templateAsked[0]).not.toContain("overallScore")
    const summary = "The record states a narrow claim and shows the weighing steps that support it, with the season limit written in the text."
    const review = `{"summary":"${summary}","scores":[{"criterionId":"impact","score":70},{"criterionId":"availability","score":60}],"overallScore":68}`
    const fragment = `{"availability":{"score":40,"rationale":"A short fragment."}}`
    const picked = chooseReviewJson(`${fragment}\n${review}`)
    expect(picked?.text).toContain("narrow claim")
    expect(picked?.text).not.toContain("short fragment")
    const curly = review.replaceAll("\"", "\u201c")
    expect(parseModelJson(curly).ok).toBe(true)
    const broken = `{"summary":"The record states a narrow claim and shows the weighing steps that support it.","scores":[{"criterionId":"impact","score":70},],"overallScore":68,}`
    expect(parseModelJson(broken).ok).toBe(true)
    const newline = "{\"summary\":\"The record states a narrow claim and shows the weighing\nsteps that support it, with the season limit written in the text.\",\"scores\":[{\"criterionId\":\"impact\",\"score\":70}],\"overallScore\":68}"
    expect(parseModelJson(newline).ok).toBe(true)
    const truncated = review.slice(0, -1)
    const recovered = parseModelJson(`${fragment} ${truncated}`)
    expect(recovered.ok).toBe(true)
    if (recovered.ok) expect(JSON.stringify(recovered.value)).toContain("narrow claim")
    expect(template.reasked).toBe(true)
    expect(template.text).toContain("81")
    const both = '{"overallScore":"<0-100>","questionsForAuthors":["<question>"],"recommendation":"<accept|encourage>"} {"overallScore":91,"questionsForAuthors":["What limits the table?"],"recommendation":"accept"}'
    const parsed = parseModelJson(both)
    expect(parsed.ok).toBe(true)
    if (parsed.ok) expect(parsed.value).toMatchObject({ overallScore: 91 })
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

  it("writes static text from board ids and prefers that file over the function", async () => {
    expect(collectPaperIds([
      { recordId: "22826", doi: "10.5281/zenodo.22826" },
      { doi: "10.5281/zenodo.18916931" },
      { recordId: "sample-fog" },
      { paper: { url: "https://zenodo.org/records/611843" } },
    ])).toEqual(["18916931", "22826", "611843"])
    expect(curatedIds).toEqual(["18316375", "3554320", "17651481", "18706746", "19508474"])
    expect(mergePaperIds(["22826", "sample-fog"], curatedIds)).toEqual(["17651481", "18316375", "18706746", "19508474", "22826", "3554320"])
    expect(isOpenFileAccess("open")).toBe(true)
    expect(isOpenFileAccess("restricted")).toBe(false)
    expect(documentsForOpenRecord("open", [{ key: "paper.pdf", text: "extracted page from the open pdf" }], 18)).toEqual([
      { filename: "paper.pdf", text: "extracted page fro" },
    ])
    expect(documentsForOpenRecord("closed", [{ key: "paper.pdf", text: "not public" }], 100)).toEqual([])
    const fallback = renderStaticPaperText({ id: "18316375", title: "Open note", description: "The abstract remains when no file text is extracted." })
    expect(fallback).toContain("The abstract remains")
    expect(fallback).toContain("https://zenodo.org/records/18316375")
    const file = renderStaticPaperText({
      id: "22826",
      title: "CODATA",
      authors: ["Ada Lovelace"],
      doi: "10.5281/zenodo.22826",
      conceptDoi: "10.5281/zenodo.611843",
      description: "A public abstract of the data note.",
      files: [{ filename: "note.txt", text: "measured yield" }],
    })
    expect(file).toContain("Zenodo record: https://zenodo.org/records/22826")
    expect(file).toContain("Version DOI: https://doi.org/10.5281/zenodo.22826")
    expect(file).toContain("measured yield")
    expect(textPageHasPaper(200, file)).toBe(true)
    const staticFile = await choosePaperTextUrl("22826", async (url) => ({ status: url.endsWith(".txt") ? 200 : 404, body: url.endsWith(".txt") ? file : "missing" }))
    expect(staticFile).toBe(paperTextUrl("22826"))
    const service = await choosePaperTextUrl("22826", async (url) => ({ status: url.includes("functions/v1/paper-text") ? 200 : 404, body: url.includes("functions/v1/paper-text") ? file : "missing" }))
    expect(service).toBe(paperTextFunctionUrl("22826"))
    expect(await choosePaperTextUrl("22826", async () => ({ status: 404, body: "missing" }))).toBeNull()
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

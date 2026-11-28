// @vitest-environment happy-dom
/// <reference types="node" />
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { webChatProvider, webChatProviders } from "../../extension/adapters/index.ts"
import { buildRanking } from "../domain/ranking.ts"
import { CORROBORATING_MODEL_COUNT, ladderTier } from "../domain/fidelity.ts"
import { officialCriteria } from "../domain/officialCriteria.ts"
import type { NodeSubmission, StoredReview } from "../domain/types.ts"
import { textSignals } from "./textTools.ts"
import { publicPayload } from "./backend.ts"
import { reviewSystemPrompt } from "./prompts.ts"
import type { ZenodoRecord } from "./zenodo.ts"
import { acceptWebChatResult, draftWebChatReview, scrubPrivateUrls } from "./webChat/accept.ts"
import { planDelivery, splitText } from "./webChat/deliver.ts"
import { diagnose, queryDeep } from "./webChat/dom.ts"
import { buildWebChatPacket, WEB_CHAT_FILE_CHARS } from "./webChat/packet.ts"
import { originAllowed, validatePacket, WEB_CHAT_LABEL } from "./webChat/protocol.ts"
import { formatStepLog, globalGoalsSendNote, recordStep, renderReviewApp, type ReviewActions, type ReviewModel } from "./webChat/reviewView.ts"
import { runTurn } from "./webChat/runTurn.ts"
import { exportBundle, packetForLocalPaper, parseExport, publishedResultKey, rememberedSendState, resultCard, sourceRecordFromText, storedLocalReview, textFromPdfDocument } from "./webChat/standalone.ts"

const record = {
  id: "1",
  conceptId: "1",
  doi: "10.5281/zenodo.1",
  conceptDoi: "10.5281/zenodo.1",
  title: "A long public note",
  creators: [],
  description: "A public description of the work.",
  descriptionHtml: "",
  keywords: [],
  version: "1",
  recordVersion: "1",
  license: "cc-by-4.0",
  publicationDate: "2026-01-01",
  related: [],
  resourceType: "publication",
  access: { record: "open", files: "open" },
  files: [],
  htmlUrl: "https://zenodo.org/records/1",
} satisfies ZenodoRecord

function body(score: number, overall: number, recommendation: string) {
  return {
    summary: "The record states a narrow claim and shows the weighing steps that support it, with the season limit written in the text.",
    scores: officialCriteria.criteria.map((criterion) => ({
      criterionId: criterion.id,
      score,
      rationale: `${criterion.name} is supported by a passage a reader can find in the record.`,
      citations: [{ quote: "Net B collected 1.8 litres.", location: "results" }],
      confidence: "medium",
    })),
    recommendation,
    overallScore: overall,
    strengths: ["The files are public."],
    majorIssues: [],
    minorIssues: ["The season is narrow."],
    questionsForAuthors: ["What would a second season change?"],
    suggestedNextSteps: ["Publish the weighing sheet beside the figure."],
    ontologyClass: "physical-testable",
    physics: { classification: "CONSISTENT", laws: ["conservation of mass"], howAddressed: "The mass balance is written out." },
    simulation: { reported: 0, passed: 0, methods: "Simulation does not apply to this record.", inputsAvailable: false },
    valueEstimate: { assumptions: ["The season is one site."], marketDisruption: "Not estimated." },
    goals: [{ goalId: "sdg-6", level: "indirect", note: "Water collection is named." }],
  }
}

function node(partial: Partial<NodeSubmission> & { id: string; reviewId: string; modelId: string }): NodeSubmission {
  return {
    doi: "10.5281/zenodo.1",
    recordVersion: "1",
    nodeId: partial.id,
    nodeName: partial.id,
    assessorId: partial.assessorId ?? "gpt",
    criteriaVersion: "0.2.0",
    customCriteria: false,
    verdict: "pass",
    summary: "",
    judgements: [],
    errorsFound: [],
    failureModes: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    mock: false,
    trusted: true,
    ...partial,
  }
}

function loadFixture(name: string) {
  const html = readFileSync(join(process.cwd(), "extension/fixtures", `${name}.html`), "utf8")
  const bodyHtml = html.match(/<body>([\s\S]*)<\/body>/i)?.[1] ?? html
  document.body.innerHTML = bodyHtml
}

describe("web chat origins and packet", () => {
  it("accepts the AIR site and localhost, and refuses other origins", () => {
    expect(originAllowed("http://127.0.0.1:43123")).toBe(true)
    expect(originAllowed("http://localhost:5173")).toBe(true)
    expect(originAllowed("https://localhost")).toBe(true)
    expect(originAllowed("https://morgansmart-alt.github.io")).toBe(true)
    expect(originAllowed("https://evil.example")).toBe(false)
    expect(originAllowed("https://morgansmart-alt.github.io.evil.com")).toBe(false)
    expect(originAllowed("http://morgansmart-alt.github.io")).toBe(false)
    expect(originAllowed("https://notmorgansmart-alt.github.io")).toBe(false)
  })

  it("hands the full paper and the criteria schema to the extension", () => {
    const paper = `Measured yield. ${"alpha ".repeat(8_000)}`
    expect(paper.length).toBeGreaterThan(28_000)
    const packet = buildWebChatPacket({
      requestId: "web-1",
      providerId: "grok",
      criteria: officialCriteria,
      record,
      documents: [{ filename: "paper.md", text: paper }],
      conversations: [{ url: "https://share.google/aimode/EXAMPLE", provider: "Google AI Mode", note: "method" }],
    })
    expect(packet.files[0]?.text).toBe(paper)
    expect(packet.instructions).toContain("ontologyClass")
    expect(packet.instructions).toContain("AIR PAPER PART")
    expect(packet.system).toContain("out of 100")
    expect(packet.instructions).toContain("https://share.google/aimode/EXAMPLE")
    expect(packet.instructions).toContain("This version: https://zenodo.org/records/1")
    expect(packet.instructions).toContain("DOI: https://doi.org/10.5281/zenodo.1")
    const source = packet.instructions.slice(0, packet.instructions.indexOf("Private AI context links"))
    expect(source).not.toContain("share.google")
    const validated = validatePacket(packet)
    expect(validated.ok).toBe(true)
    expect(validatePacket({ ...packet, providerId: "nope" }).ok).toBe(false)
  })

  it("marks a file that passes the safety cap", () => {
    const paper = "x".repeat(WEB_CHAT_FILE_CHARS + 20)
    const packet = buildWebChatPacket({
      requestId: "web-2",
      providerId: "gemini",
      criteria: officialCriteria,
      record,
      documents: [{ filename: "huge.txt", text: paper }],
    })
    expect(packet.files[0]?.text.endsWith("characters.]")).toBe(true)
    expect(packet.files[0]?.text.startsWith("x".repeat(100))).toBe(true)
    expect(packet.files[0]?.text.includes("x".repeat(WEB_CHAT_FILE_CHARS + 1))).toBe(false)
  })
})

describe("web chat JSON and the uncalibrated tier", () => {
  it("parses fenced JSON and flags a score that clashes with the weighted total", () => {
    const raw = `Here is the reading:\n\`\`\`json\n${JSON.stringify(body(50, 95, "encourage"))}\n\`\`\`\nDone.`
    const accepted = acceptWebChatResult(raw, officialCriteria)
    expect(accepted.ok).toBe(true)
    if (!accepted.ok) return
    expect(accepted.report.overallScore).toBe(50)
    expect(accepted.report.statedOverall).toBe(95)
    expect(accepted.report.scoringCheck?.mismatch).toBe(true)
    expect(accepted.report.scoringCheck?.reason).toContain("differs from the weighted score")
    expect(accepted.report.scoringCheck?.reason ?? "").not.toContain("Verdict")
    expect(accepted.report.scoringCheck?.verdictNote).toContain("The model said encourage")
    const echoed = scrubPrivateUrls(
      { ...accepted.report, summary: `${accepted.report.summary} See https://share.google/aimode/EXAMPLE` },
      ["https://share.google/aimode/EXAMPLE"],
    )
    expect(echoed.summary).toContain("[private link]")
    expect(echoed.summary).not.toContain("share.google")
    const stored = draftWebChatReview({
      id: "web-review",
      packet: buildWebChatPacket({ requestId: "web-3", providerId: "grok", criteria: officialCriteria, record, documents: [{ filename: "a.txt", text: "Measured yield in the dataset." }] }),
      report: echoed,
      record: { ...record, creators: [] },
      criteria: officialCriteria,
      customCriteria: false,
      outputHash: "hash",
      createdAt: "2026-11-21T00:00:00.000Z",
      privateUrls: [],
      privateContextCount: 1,
    })
    expect(stored.tier).toBe("free-web-chat")
    expect(stored.modelId).toContain("uncalibrated")
    const published = JSON.stringify(publicPayload(stored))
    expect(published).not.toContain("share.google")
    expect(published).not.toContain("EXAMPLE")
    expect(published).toContain("free-web-chat")
    expect(WEB_CHAT_LABEL).toBe("free web-chat, uncalibrated")
    expect(stored.modelId).toContain("uncalibrated")
    const rows = buildRanking({ reviews: [stored], nodes: [], issues: [], claims: [] })
    expect(rows).toEqual([])
    expect(ladderTier([stored], [])).toBe("free-web-chat")
    const trustedOnWebChat = [
      node({ id: "n1", reviewId: stored.id, modelId: "gpt-a", assessorId: "gpt" }),
      node({ id: "n2", reviewId: stored.id, modelId: "claude-b", assessorId: "claude" }),
    ]
    expect(trustedOnWebChat).toHaveLength(CORROBORATING_MODEL_COUNT)
    expect(ladderTier([stored], trustedOnWebChat)).toBe("free-web-chat")
  })

  it("still corroborates two trusted in-depth models", () => {
    const ranked = {
      id: "ranked",
      tier: "in-depth",
      sample: false,
      mock: false,
      doi: record.doi,
      recordId: record.id,
      conceptRecordId: record.conceptId,
      recordVersion: record.recordVersion,
      title: record.title,
      creators: [],
      keywords: [],
      publicationDate: record.publicationDate,
      license: record.license,
      assessorId: "grok",
      modelId: "grok-3",
      provider: "xai",
      criteriaId: officialCriteria.id,
      criteriaVersion: officialCriteria.version,
      customCriteria: false,
      report: {
        summary: "A summary long enough to stand as a reading of the work.",
        scores: [],
        overallScore: 70,
        ideaScore: 70,
        recommendation: "revise",
        strengths: [],
        majorIssues: [],
        minorIssues: [],
        questionsForAuthors: [],
        suggestedNextSteps: [],
      },
      outputHash: "ranked",
      createdAt: "2026-11-21T00:00:00.000Z",
    } satisfies StoredReview
    expect(
      ladderTier(
        [ranked],
        [node({ id: "a", reviewId: ranked.id, modelId: "gpt-a", assessorId: "gpt" }), node({ id: "b", reviewId: ranked.id, modelId: "claude-b", assessorId: "claude" })],
      ),
    ).toBe("corroborated")
  })

  it("keeps possible-versus-proven labelling and the physics rule", () => {
    const evidence = officialCriteria.criteria.find((item) => item.id === "evidence-labelling")
    expect(evidence?.weight).toBe(0.5)
    expect(evidence?.guidance).toMatch(/measurement|hypothesis|speculation/i)
    expect(textSignals("We measured the result in the dataset.", [])["evidence-labelling"]).toBeGreaterThan(
      textSignals("We hope this might possibly work.", [])["evidence-labelling"],
    )
    expect(reviewSystemPrompt(officialCriteria)).toContain("CHALLENGES")
    expect(reviewSystemPrompt(officialCriteria)).toContain("not an automatic fail")
  })
})

describe("delivery and adapters", () => {
  it("keeps every word when a paper is split, and stays within the paste budget", () => {
    const paper = `UNIQUEWORD ${"para. ".repeat(4_000)}`
    const provider = { ...webChatProviders.find((item) => item.id === "copilot")!, fileUpload: false }
    const packet = buildWebChatPacket({
      requestId: "web-4",
      providerId: "copilot",
      criteria: officialCriteria,
      record,
      documents: [{ filename: "paper.md", text: paper }],
    })
    const plan = planDelivery(packet, provider)
    expect(plan.steps.length).toBeGreaterThan(1)
    expect(plan.steps.filter((step) => step.final)).toHaveLength(1)
    expect(plan.steps.at(-1)?.final).toBe(true)
    expect(plan.steps.at(-1)?.text).toContain("JSON")
    const pasted = plan.steps.map((step) => step.text).join("\n")
    expect(pasted).toContain("UNIQUEWORD")
    expect(pasted).toContain("AIR PAPER PART")
    for (const step of plan.steps) expect(step.text.length).toBeLessThanOrEqual(provider.pasteLimit)
    expect(splitText(paper, 500).join("").replace(/\s+/g, "")).toBe(paper.replace(/\s+/g, ""))
  })

  it("attaches a short paper in one turn when the site takes files", () => {
    const provider = webChatProvider("grok")
    if (!provider) throw new Error("missing grok")
    const packet = buildWebChatPacket({
      requestId: "web-5",
      providerId: "grok",
      criteria: officialCriteria,
      record,
      documents: [{ filename: "paper.md", text: "Measured yield in one season." }],
    })
    const plan = planDelivery(packet, provider)
    expect(plan.steps).toHaveLength(1)
    expect(plan.steps[0]?.kind).toBe("upload")
    expect(plan.steps[0]?.files[0]?.filename).toBe("paper.md")
    expect(plan.warning).toBeNull()
  })

  it("reads each adapter's fixture, a sign-in wall, and a broken page", async () => {
    for (const provider of webChatProviders) {
      loadFixture(provider.id)
      expect(diagnose(document, provider)).toBe("ready")
    }
    loadFixture("signed-out")
    expect(diagnose(document, webChatProviders.find((item) => item.id === "chatgpt")!)).toBe("signed-out")
    loadFixture("broken")
    expect(diagnose(document, webChatProviders.find((item) => item.id === "chatgpt")!)).toBe("selector-miss")
    document.body.innerHTML = ""
    const host = document.createElement("div")
    const shadow = host.attachShadow({ mode: "open" })
    shadow.innerHTML = '<div class="ql-editor" contenteditable="true">hello</div>'
    document.body.append(host)
    expect(queryDeep(document, 'div.ql-editor[contenteditable="true"]')?.textContent).toBe("hello")
  })

  it("runs a turn against the ChatGPT fixture and returns the reply", async () => {
    loadFixture("chatgpt")
    const reply = document.querySelector("[data-message-author-role='assistant']")
    const button = document.querySelector("[data-testid='send-button']")
    if (!reply || !button) throw new Error("fixture missing controls")
    document.querySelector("input[type=file]")?.addEventListener("change", () => {
      const chip = document.createElement("div")
      chip.setAttribute("data-attachment-state", "ready")
      chip.textContent = "paper.md"
      document.body.append(chip)
    })
    let turns = 0
    button.addEventListener("click", () => {
      turns += 1
      const composer = document.querySelector("#prompt-textarea") as HTMLTextAreaElement | null
      const text = composer?.value ?? ""
      reply.textContent = text.includes("JSON") ? `\`\`\`json\n${JSON.stringify(body(70, 70, "revise"))}\n\`\`\`` : `RECEIVED ${turns}`
    })
    const provider = webChatProvider("chatgpt")
    if (!provider) throw new Error("missing chatgpt")
    const packet = buildWebChatPacket({
      requestId: "web-6",
      providerId: "chatgpt",
      criteria: officialCriteria,
      record,
      documents: [{ filename: "paper.md", text: "Measured yield in one season." }],
    })
    const result = await runTurn(document, provider, packet, {
      aborted: () => false,
      sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
      pollMs: 5,
      stableMs: 0,
      stepTimeoutMs: 2000,
    })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.text).toContain("summary")
  })

  it("ships every adapter origin in the manifest and the built runner", () => {
    const manifest = JSON.parse(readFileSync(join(process.cwd(), "extension/manifest.json"), "utf8")) as {
      host_permissions: string[]
      externally_connectable: { matches: string[] }
    }
    const runner = readFileSync(join(process.cwd(), "extension/build/runner.js"), "utf8")
    for (const provider of webChatProviders) {
      for (const origin of provider.origins) expect(manifest.host_permissions).toContain(origin)
      expect(runner).toContain(provider.startUrl)
    }
    expect(manifest.externally_connectable.matches).toContain("https://morgansmart-alt.github.io/*")
    expect(manifest.externally_connectable.matches.join(" ")).not.toContain("grok.com")
    expect(manifest.host_permissions).toContain("https://x.com/i/grok*")
    const zip = readFileSync(join(process.cwd(), "release/air-web-chat.zip"))
    const listing = zip.toString("latin1")
    expect(listing).toContain("manifest.json")
    expect(listing).toContain("INSTALL.md")
    expect(listing).toContain("review.html")
  })
})

describe("extension panel", () => {
  function actions(extra: Partial<ReviewActions> = {}): ReviewActions {
    return {
      onDismissOnboarding() {},
      onProvider() {},
      onFile() {},
      onLink() {},
      onLookup() {},
      onDefend() {},
      onRounds() {},
      onStop() {},
      onReview() {},
      onExport() {},
      onToggle() {},
      onSend() {},
      onSendSelected() {},
      ...extra,
    }
  }

  function model(partial: Partial<ReviewModel> = {}): ReviewModel {
    return {
      showOnboarding: false,
      providerId: "grok",
      fileName: "",
      link: "",
      publication: null,
      defend: true,
      defenceRounds: 2,
      status: "",
      error: "",
      busy: false,
      result: null,
      history: [],
      ...partial,
    }
  }

  it("shows sign-in first, then one review button, then a flagged uncalibrated score", async () => {
    document.body.innerHTML = `<main id="app"></main>`
    const app = document.querySelector("#app") as HTMLElement
    let dismissed = false
    let picked = ""
    let reviewed = false
    renderReviewApp(app, model({ showOnboarding: true }), actions({ onDismissOnboarding() { dismissed = true } }))
    expect(app.textContent).toContain("Sign in")
    expect(app.querySelector("a[href='https://x.com/i/grok']")).toBeTruthy()
    expect(app.querySelector("a[href='https://grok.com/']")).toBeTruthy()
    ;(document.getElementById("onboard-done") as HTMLButtonElement).click()
    expect(dismissed).toBe(true)

    renderReviewApp(
      app,
      model(),
      actions({
        onFile(file) { picked = file.name },
        onReview() { reviewed = true },
      }),
    )
    expect((document.getElementById("review") as HTMLButtonElement).disabled).toBe(true)
    const input = document.getElementById("paper") as HTMLInputElement
    const paper = new File(["Measured yield in one season."], "note.txt", { type: "text/plain" })
    const transfer = new DataTransfer()
    transfer.items.add(paper)
    input.files = transfer.files
    input.dispatchEvent(new Event("change", { bubbles: true }))
    expect(picked).toBe("note.txt")

    renderReviewApp(app, model({ fileName: "note.txt", providerId: "grok-x", link: "h" }), actions({ onReview() { reviewed = true } }))
    expect((document.querySelector("#provider") as HTMLSelectElement).value).toBe("grok-x")
    const link = document.getElementById("publication-link") as HTMLInputElement
    expect(link.type).toBe("text")
    expect(link.value).toBe("h")
    ;(document.getElementById("review") as HTMLButtonElement).click()
    expect(reviewed).toBe(true)
    renderReviewApp(
      app,
      model({
        stepLog: [
          { at: "5:21:03 PM", step: "defence round 1 of 2", status: "waiting" },
          { at: "5:21:04 PM", step: "Stop", status: "idle" },
          { at: "5:21:05 PM", step: "defence round 1 of 2", status: "error", detail: "Defence step failed: the composer cut the message. Blind score saved." },
        ],
      }),
      actions(),
    )
    expect(app.querySelector("#step-log")?.textContent).toContain("5:21:03 PM · defence round 1 of 2 · waiting")
    expect(app.querySelector("#step-log")?.textContent).toContain("5:21:04 PM · Stop · idle")
    expect(app.querySelector("#copy-log")?.textContent).toBe("Copy log")
    expect(app.querySelector("#download-log")?.textContent).toBe("Download log")
    expect(formatStepLog([
      { at: "1", step: "public text link", status: "sent", detail: "Method that sent: pointer." },
      { at: "2", step: "public text link", status: "reading", detail: "candidate assistant-message, 10 characters" },
    ])).toBe("1 · public text link · sent · Method that sent: pointer.\n2 · public text link · reading · candidate assistant-message, 10 characters")
    let ordered = recordStep([], { at: "1", step: "public text link", status: "sent", detail: "Method that sent: pointer." })
    ordered = recordStep(ordered, { at: "2", step: "public text link", status: "reading", detail: "candidate assistant-message, 10 characters" })
    ordered = recordStep(ordered, { at: "3", step: "public text link", status: "sent", detail: "Method that sent: pointer." })
    ordered = recordStep(ordered, { at: "4", step: "public text link", status: "reading", detail: "candidate assistant-message, 20 characters" })
    expect(ordered.map((entry) => entry.status)).toEqual(["sent", "reading"])
    expect(ordered[1]?.at).toBe("4")
    expect(ordered[1]?.detail).toContain("20 characters")
    let collapsed = recordStep([], { at: "1", step: "defence round 1 of 2", status: "ready", detail: "Box holds 527 raw, 480 normalised." })
    for (let i = 0; i < 320; i += 1) {
      collapsed = recordStep(collapsed, { at: String(i), step: "defence round 1 of 2", status: "reading", detail: `candidate assistant, ${i} characters` })
    }
    collapsed = recordStep(collapsed, { at: "end", step: "Summary", status: "score", detail: "Rounds 2/2 · blind 84 · after defence 84" })
    expect(collapsed.some((entry) => entry.detail?.includes("527 raw"))).toBe(true)
    expect(collapsed.filter((entry) => entry.status === "reading")).toHaveLength(1)
    expect(collapsed.at(-1)?.detail).toContain("after defence 84")
    renderReviewApp(
      app,
      model({
        fileName: "note.txt",
        status: "Rounds 2/2 · blind 84 · after defence 84",
        result: {
          title: "CODATA",
          overall: 84,
          recommendation: "accept",
          summary: "The constants are tabulated for this version of the record.",
          mismatch: null,
          label: "free web-chat, uncalibrated",
          defendedOverall: 84,
          defendedLabel: "after author defence",
          roundsLabel: "Defence rounds 2/2",
          sheetNote: "The after-defence reply named an overall score without a full score sheet. That number is shown.",
        },
      }),
      actions(),
    )
    expect(app.querySelector("#defence-round-count")?.textContent).toBe("Defence rounds 2/2")
    expect(app.querySelector("#after-defence")?.textContent).toContain("84.00")
    expect(app.textContent).toContain("Blind score 84.00 out of 100")
    expect(app.querySelector("#status")?.textContent).toContain("after defence 84")
    expect(app.querySelector("#defence-sheet")?.textContent).toContain("full score sheet")
    renderReviewApp(
      app,
      model({
        history: [
          { id: "posted", title: "Posted note", overall: 67, sendState: "published" },
          { id: "again", title: "Duplicate note", overall: 68, sendState: "duplicate" },
          { id: "open", title: "Open note", overall: 58, sendState: "sending" },
          { id: "blocked", title: "Local file", overall: 70, sendNote: "Local file has no DOI or paper link, so it was not sent." },
        ],
      }),
      actions(),
    )
    expect((document.getElementById("send-posted") as HTMLButtonElement).textContent).toBe("Published")
    expect((document.getElementById("send-posted") as HTMLButtonElement).disabled).toBe(true)
    expect((document.getElementById("send-again") as HTMLButtonElement).textContent).toBe("Already on board")
    expect((document.getElementById("send-again") as HTMLButtonElement).disabled).toBe(true)
    expect((document.getElementById("send-open") as HTMLButtonElement).disabled).toBe(true)
    expect(app.textContent).toContain("Local file has no DOI or paper link, so it was not sent.")
    expect(globalGoalsSendNote([{ criterionId: "impact" }, { criterionId: "global-goals" }])).toBe("Global goals bonus included")
    expect(globalGoalsSendNote([{ criterionId: "impact" }])).toBe("")
    renderReviewApp(
      app,
      model({
        result: {
          title: "Open note",
          overall: 70,
          recommendation: "encourage",
          summary: "A public note.",
          mismatch: null,
          label: "free web-chat, uncalibrated",
          notice: "Full text included (27,865 of 46,732 chars from PDF, capped)",
        },
        history: [
          {
            id: "sent",
            title: "Open note",
            overall: 70,
            sendState: "published",
            sendNote: "Published: Open note · 10.5281/zenodo.1 · 70.00 · Global goals bonus included",
          },
        ],
      }),
      actions(),
    )
    const included = document.getElementById("text-page-note")
    expect(included?.textContent).toBe("Full text included (27,865 of 46,732 chars from PDF, capped)")
    expect(included?.className).toBe("note")
    expect((document.getElementById("send-sent") as HTMLButtonElement).textContent).toBe("Published")
    expect(app.textContent).toContain("Global goals bonus included")

    const packet = packetForLocalPaper({
      requestId: "web-local",
      providerId: "grok-x",
      criteria: officialCriteria,
      filename: "note.txt",
      text: `Measured yield in one season. ${"alpha ".repeat(30)}`,
    })
    expect(packet.files[0]?.text).toContain("Measured yield")
    const linked = packetForLocalPaper({
      requestId: "web-doi",
      providerId: "grok",
      criteria: officialCriteria,
      filename: "codata.pdf",
      text: "See https://zenodo.org/records/22826 and doi 10.5281/zenodo.22826. conceptrecid: 18916930. A private note https://share.google/aimode/SECRET is not the source.",
    })
    const source = linked.instructions.slice(0, linked.instructions.indexOf("Private AI context links"))
    expect(source).toContain("https://zenodo.org/records/22826")
    expect(source).toContain("https://doi.org/10.5281/zenodo.22826")
    expect(source).toContain("https://zenodo.org/records/18916930")
    expect(source).not.toContain("share.google")
    expect(sourceRecordFromText("note.txt", "no identifiers here")).toBeNull()
    expect(packet.instructions).toContain("ontologyClass")
    const accepted = acceptWebChatResult(
      `\`\`\`json\n${JSON.stringify({ ...body(50, 95, "encourage"), summary: `${body(50, 95, "encourage").summary} https://share.google/aimode/EXAMPLE` })}\n\`\`\``,
      officialCriteria,
    )
    expect(accepted.ok).toBe(true)
    if (!accepted.ok) return
    const stored = await storedLocalReview({
      providerId: "grok-x",
      criteria: officialCriteria,
      filename: "note.txt",
      report: accepted.report,
    })
    expect(stored.tier).toBe("uncalibrated web-chat")
    expect(stored.source).toBe("web-chat extension")
    expect(stored.modelId).toContain("x.com")
    const discovered = await storedLocalReview({
      providerId: "grok-x",
      criteria: officialCriteria,
      filename: "qi.pdf",
      report: accepted.report,
      text: "Zenodo record: https://zenodo.org/records/999001 and 10.5281/zenodo.999001",
    })
    expect(discovered.doi).toBe("10.5281/zenodo.999001")
    expect(discovered.paperUrl).toBe("https://zenodo.org/records/999001")
    const saved = JSON.stringify(stored)
    expect(saved).not.toContain("share.google")
    expect(saved).not.toContain("Measured yield")
    expect(saved).not.toContain("password")
    const card = resultCard(stored)
    expect(card.label).toBe("free web-chat, uncalibrated")
    expect(card.mismatch).toContain("Scoring mismatch")
    renderReviewApp(app, model({ fileName: "note.txt", result: card, history: [{ id: stored.id, title: stored.title, overall: stored.report.overallScore }] }), actions())
    expect(app.textContent).toContain("free web-chat, uncalibrated")
    renderReviewApp(
      app,
      model({
        fileName: "note.txt",
        result: {
          ...card,
          scores: [
            { criterionId: "clarity", score: 80 },
            { criterionId: "global-goals", score: 25 },
          ],
          feedback: [{ label: "Missing context or files", text: "The supplement was not attached." }],
        },
      }),
      actions(),
    )
    expect(app.querySelector("#criterion-scores")?.textContent).toContain("clarity: 80")
    expect(app.querySelector("#criterion-scores")?.textContent).toContain("Global goals: 25 (bonus, not counted in overall)")
    expect(app.querySelector("#air-feedback")?.textContent).toContain("Feedback on AIR")
    expect(app.querySelector("#air-feedback")?.textContent).toContain("supplement was not attached")
    expect(app.textContent).toContain("Scoring mismatch, needs re-check")
    const exported = exportBundle([stored])
    expect(exported).not.toContain("share.google")
    const parsed = parseExport(exported)
    expect(parsed.ok).toBe(true)
    if (parsed.ok) {
      expect(parsed.reviews[0]?.tier).toBe("uncalibrated web-chat")
      expect(buildRanking({ reviews: parsed.reviews, nodes: [], issues: [], claims: [] })).toEqual([])
    }
    const pdf = await textFromPdfDocument(
      {
        numPages: 2,
        getPage: async () => ({ getTextContent: async () => ({ items: [{ str: "Page line" }] }) }),
      },
      1,
    )
    expect(pdf.text).toContain("Page line")
    expect(pdf.note).toContain("first 1 of 2")
    const modelId = "Grok on grok.com · Auto (web chat, uncalibrated)"
    const posted = { doi: "10.5281/zenodo.18706746", paperUrl: "https://zenodo.org/records/18706746", modelId }
    const key = publishedResultKey(posted)
    expect(key).toBe(`${posted.doi.toLowerCase()}|${modelId.toLowerCase()}|${modelId.toLowerCase()}`)
    expect(publishedResultKey({ ...posted, site: "Grok", model: modelId })).toBe(`${posted.doi.toLowerCase()}|grok|${modelId.toLowerCase()}`)
    const keys = { [key]: "published" }
    expect(rememberedSendState(posted, keys)).toBe("published")
    expect(rememberedSendState({ doi: "10.5281/zenodo.1", modelId }, keys)).toBe("")
    renderReviewApp(
      app,
      model({
        history: [
          { id: "qi", title: "Quantized Inertia", overall: 65.02, doi: posted.doi, site: modelId, model: modelId, sendState: rememberedSendState(posted, keys) },
          { id: "codata", title: "CODATA", overall: 84, sendState: rememberedSendState({ doi: "10.5281/zenodo.1", modelId: "other" }, { "10.5281/zenodo.1|other|other": "duplicate" }) },
        ],
      }),
      actions(),
    )
    expect((document.getElementById("send-qi") as HTMLButtonElement).textContent).toBe("Published")
    expect((document.getElementById("send-qi") as HTMLButtonElement).disabled).toBe(true)
    expect((document.getElementById("send-codata") as HTMLButtonElement).textContent).toBe("Already on board")
    expect((document.getElementById("send-codata") as HTMLButtonElement).disabled).toBe(true)
  })
})

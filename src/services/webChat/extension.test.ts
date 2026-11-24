// @vitest-environment happy-dom
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { webChatProvider } from "../../../extension/adapters/index.ts"
import { CRITERION_PROFILES, readingCriteria } from "../../domain/profiles.ts"
import { officialCriteria } from "../../domain/officialCriteria.ts"
import { ackReply, assistantText, attachmentReady, clickElement, describeCandidates, diagnose, findComposer, findSubmit, reviewJsonOnPage, stopControlActive, submitOnce, writeComposer } from "./dom.ts"
import { buildWebChatPacket } from "./packet.ts"
import { runTurn } from "./runTurn.ts"
import { acceptWebChatResult } from "./accept.ts"
import { extensionEnvelope, relayFromProvider, relayTargets, type RelayJob } from "./relay.ts"
import type { ZenodoRecord } from "../zenodo.ts"

const record = {
  id: "1",
  conceptId: "1",
  doi: "10.5281/zenodo.1",
  conceptDoi: "10.5281/zenodo.1",
  title: "A public note",
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

function replyFor(profileId: string, recommendation = "accept") {
  const criteria = readingCriteria(officialCriteria, profileId, false)
  return {
    summary: "The record states a narrow claim and shows the weighing steps that support it, with the limit written in the text.",
    scores: criteria.criteria.map((criterion) => ({
      criterionId: criterion.id,
      score: 82,
      rationale: `${criterion.name} is supported by a passage a reader can find in the record.`,
      citations: [{ quote: "Net B collected 1.8 litres.", location: "results" }],
      confidence: "medium",
    })),
    recommendation,
    overallScore: 82,
    strengths: ["The files are public."],
    majorIssues: [],
    minorIssues: ["The season is narrow."],
    questionsForAuthors: ["What would a second season change?"],
    suggestedNextSteps: ["Publish the weighing sheet beside the figure."],
    ontologyClass: "physical-testable",
    physics: { classification: "CONSISTENT", laws: ["conservation of mass"], howAddressed: "The mass balance is written out." },
    simulation: { reported: 0, passed: 0, methods: "Simulation does not apply to this record.", inputsAvailable: false },
    ...(criteria.criteria.some((criterion) => criterion.id === "estimated-value")
      ? { valueEstimate: { assumptions: ["The season is one site."], marketDisruption: "Not estimated." } }
      : {}),
    goals: [{ goalId: "sdg-6", level: "indirect", note: "Water collection is named." }],
  }
}

describe("web-chat prompts follow the paper-type profiles", () => {
  it.each(CRITERION_PROFILES.map((profile) => [profile.id, profile.proposal] as const))(
    "builds %s with that profile's criteria and the Accept / sound verdict",
    (profileId, proposal) => {
      const criteria = readingCriteria(officialCriteria, profileId, false)
      const packet = buildWebChatPacket({
        requestId: `web-${profileId}`,
        providerId: "grok",
        criteria: officialCriteria,
        criterionProfile: profileId,
        record,
        documents: [{ filename: "paper.md", text: "The record states a claim a reader can check." }],
      })
      expect(packet.criterionProfile).toBe(profileId)
      expect(packet.system).toContain("accept means sound as it stands")
      expect(packet.instructions).toContain("accept")
      for (const criterion of criteria.criteria) expect(packet.instructions).toContain(criterion.id)
      if (proposal) expect(packet.instructions).toContain("estimated-value")
      else {
        expect(packet.instructions).not.toContain("estimated-value")
        expect(packet.system).toContain("does not score estimated project value")
      }
      const parsed = acceptWebChatResult(JSON.stringify(replyFor(profileId)), criteria)
      expect(parsed.ok).toBe(true)
      if (parsed.ok) {
        expect(parsed.report.recommendation).toBe("accept")
        expect(parsed.report.scores.map((score) => score.criterionId).sort()).toEqual(criteria.criteria.map((criterion) => criterion.id).sort())
      }
    },
  )
})

describe("send is clicked once", () => {
  it("fires one click and ignores a second call in the same turn", () => {
    document.body.innerHTML = `<button id="send" type="button">Send</button>`
    const button = document.getElementById("send") as HTMLButtonElement
    let clicks = 0
    button.addEventListener("click", () => {
      clicks += 1
    })
    expect(clickElement(button)).toBe(true)
    expect(clickElement(button)).toBe(false)
    expect(clicks).toBe(1)
  })
})

describe("attachment ready", () => {
  it("waits for a ready chip and does not treat the file input as finished", () => {
    document.body.innerHTML = `<input type="file" /><div id="chip" data-attachment-state="pending">paper.md</div>`
    const files = [{ filename: "paper.md", text: "A short paper." }]
    expect(attachmentReady(document, files)).toBe(false)
    document.getElementById("chip")?.setAttribute("data-attachment-state", "ready")
    expect(attachmentReady(document, files)).toBe(true)
  })
})

describe("site and extension messaging", () => {
  const job: RelayJob = { requestId: "web-1", airTabId: 7, providerTabId: 9 }

  it("forwards progress, a result, and an error to the AIR tab and the panel", () => {
    const progress = relayFromProvider(job, 9, { type: "air-web-chat-progress", requestId: "web-1", message: "Sending part 1 of 1" })
    expect(progress.kind).toBe("progress")
    if (progress.kind === "progress") {
      expect(relayTargets(progress).airTabId).toBe(7)
      expect(extensionEnvelope(progress).type).toBe("air-web-chat-progress")
    }
    const result = relayFromProvider(job, 9, { type: "air-web-chat-done", requestId: "web-1", ok: true, text: "{\"summary\":\"ok\"}" })
    expect(result.kind).toBe("result")
    if (result.kind === "result") {
      expect(relayTargets(result)).toEqual({ panel: true, airTabId: 7 })
      expect(extensionEnvelope(result)).toMatchObject({ type: "air-web-chat-result", requestId: "web-1", source: "air-web-chat-extension" })
    }
    const error = relayFromProvider(job, 9, { type: "air-web-chat-done", requestId: "web-1", ok: false, message: "The chat stopped." })
    expect(error.kind).toBe("error")
    if (error.kind === "error") expect(extensionEnvelope(error).message).toBe("The chat stopped.")
  })

  it("drops a chat event that is not the active job, and keeps a panel-only run off the AIR tab", () => {
    expect(relayFromProvider(job, 3, { type: "air-web-chat-progress", requestId: "web-1", message: "no" }).kind).toBe("ignore")
    expect(relayFromProvider(null, 9, { type: "air-web-chat-done", requestId: "web-1", ok: true, text: "x" }).kind).toBe("ignore")
    const panelOnly = relayFromProvider({ ...job, airTabId: 0 }, 9, { type: "air-web-chat-progress", requestId: "web-1", message: "panel" })
    if (panelOnly.kind === "progress") expect(relayTargets(panelOnly).airTabId).toBeNull()
  })
})

function loadFixture(name: string) {
  document.documentElement.innerHTML = readFileSync(join(process.cwd(), "extension/fixtures", `${name}.html`), "utf8")
}

describe("live chat composers", () => {
  it("finds Grok on X by Ask anything and ignores STL Forge, the banner, and a hidden twin", () => {
    loadFixture("grok-x-live")
    const provider = webChatProvider("grok-x")
    if (!provider) throw new Error("missing grok-x")
    const composer = findComposer(document, provider.selectors.composer)
    expect(composer?.id).toBe("composer")
    expect(diagnose(document, provider)).toBe("ready")
    writeComposer(composer as Element, "Score this paper")
    const send = document.getElementById("send") as HTMLButtonElement
    send.hidden = false
    expect(findSubmit(document, provider.selectors.submit, composer)?.id).toBe("send")
    expect(assistantText(document, provider.selectors.assistant, composer)).toBe("")
    document.getElementById("assistant")!.textContent = "The reply is ready."
    expect(assistantText(document, provider.selectors.assistant, composer)).toContain("reply is ready")
    expect(stopControlActive(document, [])).toBe(false)
    ;(document.getElementById("stop") as HTMLButtonElement).hidden = false
    expect(stopControlActive(document, provider.selectors.stop)).toBe(true)
  })

  it("finds Message Grok, ignores STL Forge's Send, and treats a filename chip as attached", () => {
    loadFixture("grok-live")
    const provider = webChatProvider("grok")
    if (!provider) throw new Error("missing grok")
    const composer = findComposer(document, provider.selectors.composer)
    expect(composer?.id).toBe("composer")
    expect((composer as HTMLTextAreaElement).getAttribute("placeholder")).toBeNull()
    expect(findSubmit(document, provider.selectors.submit, composer)?.id).toBe("send")
    const files = [{ filename: "paper.pdf", text: "extracted" }]
    expect(attachmentReady(document, files)).toBe(false)
    document.getElementById("chip")!.textContent = "paper.pdf.txt"
    expect(attachmentReady(document, files)).toBe(true)
    writeComposer(composer as Element, "Review the attached paper")
    expect((composer as HTMLTextAreaElement).value).toContain("Review the attached paper")
  })

  it("clicks the enabled Grok Send once when the chip never appears", async () => {
    loadFixture("grok-live")
    const provider = webChatProvider("grok")
    if (!provider) throw new Error("missing grok")
    const send = document.getElementById("send") as HTMLButtonElement
    let clicks = 0
    send.addEventListener("click", () => {
      clicks += 1
      ;(document.getElementById("composer") as HTMLTextAreaElement).value = ""
      document.getElementById("assistant")!.textContent = "summary: the record is readable."
    })
    const packet = buildWebChatPacket({
      requestId: "grok-live",
      providerId: "grok",
      criteria: officialCriteria,
      record,
      documents: [{ filename: "paper.pdf", text: "Measured yield in one season." }],
    })
    let enters = 0
    document.getElementById("composer")?.addEventListener("keydown", () => {
      enters += 1
    })
    const result = await runTurn(document, provider, packet, {
      aborted: () => false,
      sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
      pollMs: 5,
      stableMs: 0,
      attachmentChipMs: 15,
      attachmentTimeoutMs: 200,
      replyStartTimeoutMs: 200,
      stepTimeoutMs: 400,
      submitStableMs: 0,
      submitReadyMs: 40,
      sendVerifyMs: 40,
    })
    expect(clicks).toBe(1)
    expect(enters).toBe(0)
    expect(result.ok).toBe(true)
  })

  it("reports the Send step when the enabled button does not start a reply", async () => {
    loadFixture("grok-live")
    const provider = webChatProvider("grok")
    if (!provider) throw new Error("missing grok")
    document.getElementById("chip")!.textContent = "paper.pdf.txt"
    const packet = buildWebChatPacket({
      requestId: "grok-stuck",
      providerId: "grok",
      criteria: officialCriteria,
      record,
      documents: [{ filename: "paper.pdf", text: "Measured yield in one season." }],
    })
    const result = await runTurn(document, provider, packet, {
      aborted: () => false,
      sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
      pollMs: 5,
      stableMs: 0,
      attachmentChipMs: 10,
      attachmentTimeoutMs: 50,
      replyStartTimeoutMs: 30,
      stepTimeoutMs: 80,
      submitStableMs: 0,
      submitReadyMs: 20,
      sendVerifyMs: 20,
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.message).toContain("Send step on Grok")
    expect(result.message).toContain("Enter")
    expect(result.message).toContain("still enabled")
    expect(result.message).toContain("aria-label=Send")
    expect(result.message).toContain("aria-label=Message Grok")
  })

  it("names candidate inputs when no message box appears", async () => {
    document.body.innerHTML = `<main><textarea hidden aria-label="Ask anything" placeholder="Ask anything" role="textbox"></textarea></main>`
    const provider = webChatProvider("grok-x")
    if (!provider) throw new Error("missing grok-x")
    const packet = buildWebChatPacket({
      requestId: "missing-box",
      providerId: "grok-x",
      criteria: officialCriteria,
      criterionProfile: "theory",
      record,
      documents: [{ filename: "note.txt", text: "A short note." }],
    })
    const result = await runTurn(document, { ...provider, fileUpload: false }, packet, {
      aborted: () => false,
      sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
      pollMs: 5,
      composerTimeoutMs: 0,
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.message).toContain("aria-label=Ask anything")
    expect(result.message).toContain("placeholder=Ask anything")
    expect(result.message).toContain("role=textbox")
    expect(describeCandidates(document)).toContain("textarea")
  })

  it("treats a finished RECEIVED line as the end of a turn", () => {
    document.body.innerHTML = `<main><div id="note">RECEIVED 1</div><textarea id="box" aria-label="Ask anything"></textarea></main>`
    const provider = webChatProvider("grok-x")
    if (!provider) throw new Error("missing grok-x")
    const box = document.getElementById("box") as HTMLTextAreaElement
    expect(ackReply(document, box)).toBe("RECEIVED 1")
    expect(findComposer(document, provider.selectors.composer)?.id).toBe("box")
  })

  it("finishes a grok.com reply when the JSON is on the page, and ignores STL Forge", async () => {
    document.body.innerHTML = `
      <main>
        <textarea id="composer" aria-label="Message Grok"></textarea>
        <button id="send" type="submit" aria-label="Send">Send</button>
        <button id="stop" aria-label="Stop">Stop</button>
        <div id="reply" class="assistant-message"></div>
      </main>
      <div id="stl-forge">
        <button type="button">Send</button>
        <button type="button">Auto</button>
        <div>STL Forge overlay {"overallScore": 1}</div>
      </div>
    `
    const provider = webChatProvider("grok")
    if (!provider) throw new Error("missing grok")
    document.getElementById("send")?.addEventListener("click", () => {
      const text = (document.getElementById("composer") as HTMLTextAreaElement).value
      ;(document.getElementById("composer") as HTMLTextAreaElement).value = ""
      document.getElementById("reply")!.textContent = text.includes("Do not review yet.")
        ? "RECEIVED 1"
        : '{"summary":"The record is sound.","overallScore":86}'
    })
    const packet = buildWebChatPacket({
      requestId: "grok-json",
      providerId: "grok",
      criteria: officialCriteria,
      record,
      documents: [{ filename: "paper.md", text: "Measured yield in one season." }],
    })
    const result = await runTurn(document, { ...provider, fileUpload: false, pasteLimit: 200_000 }, packet, {
      aborted: () => false,
      sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
      pollMs: 5,
      stableMs: 0,
      stepTimeoutMs: 1500,
      replyStartTimeoutMs: 400,
      submitStableMs: 0,
      submitReadyMs: 30,
      sendVerifyMs: 30,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.text).toContain('"overallScore":86')
    expect(result.text).not.toContain("STL Forge")
    expect(result.text).not.toContain('"overallScore": 1')
  })

  it("names a short reply timeout and leaves out overlay buttons", async () => {
    document.body.innerHTML = `
      <main>
        <textarea id="composer" aria-label="Message Grok"></textarea>
        <button id="send" type="submit" aria-label="Send">Send</button>
        <div id="reply">The model wrote a paragraph about the record and then stopped without a score.</div>
      </main>
      <div id="stl-forge"><button type="button">Send</button><div>STL Forge overlay controls</div></div>
    `
    const provider = webChatProvider("grok")
    if (!provider) throw new Error("missing grok")
    document.getElementById("send")?.addEventListener("click", () => {
      ;(document.getElementById("composer") as HTMLTextAreaElement).value = ""
      ;(document.getElementById("send") as HTMLButtonElement).disabled = true
    })
    const packet = buildWebChatPacket({
      requestId: "grok-timeout",
      providerId: "grok",
      criteria: officialCriteria,
      record,
      documents: [{ filename: "paper.md", text: "Measured yield in one season." }],
    })
    const hooks = {
      aborted: () => false,
      sleep: (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
      pollMs: 5,
      stableMs: 0,
      stepTimeoutMs: 80,
      replyStartTimeoutMs: 400,
      submitStableMs: 0,
      submitReadyMs: 20,
      sendVerifyMs: 20,
    }
    const seen = await runTurn(document, { ...provider, fileUpload: false }, packet, hooks)
    expect(seen.ok).toBe(false)
    if (seen.ok) return
    expect(seen.message).toContain("reply seen, JSON not parsed")
    expect(seen.message).not.toContain("Buttons:")
    expect(seen.message).not.toContain("STL Forge")
    document.body.innerHTML = `<main><textarea id="composer" aria-label="Message Grok"></textarea><button id="send" type="submit" aria-label="Send">Send</button></main>`
    document.getElementById("send")?.addEventListener("click", () => {
      ;(document.getElementById("composer") as HTMLTextAreaElement).value = ""
      ;(document.getElementById("send") as HTMLButtonElement).disabled = true
    })
    const none = await runTurn(document, { ...provider, fileUpload: false }, packet, hooks)
    expect(none.ok).toBe(false)
    if (!none.ok) expect(none.message).toContain("no reply seen")
  })

  it("sends the next part after RECEIVED and keeps the record links on part 1", async () => {
    document.body.innerHTML = `<main><textarea id="box" aria-label="Ask anything"></textarea><button id="send" type="button" aria-label="Send">Send</button><div id="reply"></div></main>`
    const provider = webChatProvider("grok-x")
    if (!provider) throw new Error("missing grok-x")
    const sent: string[] = []
    document.getElementById("send")?.addEventListener("click", () => {
      const text = (document.getElementById("box") as HTMLTextAreaElement).value
      sent.push(text)
      ;(document.getElementById("box") as HTMLTextAreaElement).value = ""
      document.getElementById("reply")!.textContent = text.includes("Do not review yet.") ? `RECEIVED ${sent.length}` : '{"overallScore":86}'
    })
    const packet = buildWebChatPacket({
      requestId: "x-parts",
      providerId: "grok-x",
      criteria: officialCriteria,
      record,
      documents: [{ filename: "paper.md", text: `UNIQUEWORD ${"alpha ".repeat(3000)}` }],
    })
    const result = await runTurn(document, { ...provider, fileUpload: false, pasteLimit: 4000 }, packet, {
      aborted: () => false,
      sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
      pollMs: 5,
      stableMs: 0,
      stepTimeoutMs: 2000,
      replyStartTimeoutMs: 400,
      submitStableMs: 0,
      submitReadyMs: 20,
      sendVerifyMs: 20,
    })
    expect(sent.length).toBeGreaterThan(1)
    expect(sent[0]).toContain("This version:")
    expect(sent[0]).toContain("https://doi.org/10.5281/zenodo.1")
    expect(sent[0]).toContain("UNIQUEWORD")
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.text).toContain("86")
  })

  it("falls back to the paper text when the chat cannot open the public page", async () => {
    document.body.innerHTML = `<main><textarea id="box" aria-label="Message Grok"></textarea><button id="send" type="submit" aria-label="Send">Send</button><div id="reply" class="assistant-message"></div></main>`
    const provider = webChatProvider("grok")
    if (!provider) throw new Error("missing grok")
    const sent: string[] = []
    document.getElementById("send")?.addEventListener("click", () => {
      const text = (document.getElementById("box") as HTMLTextAreaElement).value
      sent.push(text)
      ;(document.getElementById("box") as HTMLTextAreaElement).value = ""
      document.getElementById("reply")!.textContent = text.includes("public text page")
        ? '{"overallScore":84,"summary":"https://morgansmart-alt.github.io/open-ai-peer-review/paper/1/text returned 404 so another source was used."}'
        : text.includes("Do not review yet.")
          ? `RECEIVED ${sent.length}`
          : '{"overallScore":86}'
    })
    const packet = buildWebChatPacket({
      requestId: "link-fallback",
      providerId: "grok",
      criteria: officialCriteria,
      record,
      documents: [{ filename: "paper.md", text: "UNIQUEYIELD in one season." }],
      useTextPage: true,
    })
    const livePage = `${"The public paper text is long enough to count as the record. ".repeat(12)}\nZenodo record: https://zenodo.org/records/1\nVersion DOI: https://doi.org/10.5281/zenodo.1`
    const result = await runTurn(document, { ...provider, fileUpload: false, pasteLimit: 200_000 }, packet, {
      aborted: () => false,
      sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
      pollMs: 5,
      stableMs: 0,
      stepTimeoutMs: 2000,
      replyStartTimeoutMs: 400,
      submitStableMs: 0,
      submitReadyMs: 20,
      sendVerifyMs: 20,
      loadTextPage: async () => ({ status: 200, body: livePage }),
    })
    expect(sent[0]).toContain("paper-text?id=1")
    expect(sent[0]).not.toContain("UNIQUEYIELD")
    expect(sent[1]).toContain("UNIQUEYIELD")
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.notice).toContain("text page unreachable, model used other sources")
  })

  it("pastes the paper when the public text page is not available", async () => {
    document.body.innerHTML = `<main><textarea id="box" aria-label="Message Grok"></textarea><button id="send" type="submit" aria-label="Send">Send</button><div id="reply" class="assistant-message"></div></main>`
    const provider = webChatProvider("grok")
    if (!provider) throw new Error("missing grok")
    const sent: string[] = []
    document.getElementById("send")?.addEventListener("click", () => {
      const text = (document.getElementById("box") as HTMLTextAreaElement).value
      sent.push(text)
      ;(document.getElementById("box") as HTMLTextAreaElement).value = ""
      document.getElementById("reply")!.textContent = text.includes("Do not review yet.") ? `RECEIVED ${sent.length}` : '{"overallScore":86}'
    })
    const packet = buildWebChatPacket({
      requestId: "link-down",
      providerId: "grok",
      criteria: officialCriteria,
      record,
      documents: [{ filename: "paper.md", text: "UNIQUEYIELD in one season." }],
      useTextPage: true,
    })
    const result = await runTurn(document, { ...provider, fileUpload: false, pasteLimit: 200_000 }, packet, {
      aborted: () => false,
      sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
      pollMs: 5,
      stableMs: 0,
      stepTimeoutMs: 2000,
      replyStartTimeoutMs: 400,
      submitStableMs: 0,
      submitReadyMs: 20,
      sendVerifyMs: 20,
      loadTextPage: async () => ({ status: 404, body: "Not Found" }),
    })
    expect(sent[0]).not.toContain("public text page")
    expect(sent.some((text) => text.includes("UNIQUEYIELD"))).toBe(true)
    expect(result.ok).toBe(true)
  })

  it("reads the last grok.com assistant score, not the prompt schema", () => {
    loadFixture("grok-reply")
    const review = {
      summary: "The record states a narrow claim and shows the weighing steps that support it, with the limit written in the text.",
      scores: officialCriteria.criteria.map((criterion) => ({
        criterionId: criterion.id === "global-goals" ? "Global Goals" : criterion.id,
        score: 88,
        rationale: `${criterion.name} is supported by a passage a reader can find in the record.`,
        citations: [{ quote: "Net B collected 1.8 litres.", location: "results" }],
        confidence: "medium",
      })),
      recommendation: "Accept",
      overallScore: 88,
      strengths: "The tables are public and the weighing steps are written out.",
      majorIssues: [],
      minorIssues: ["The season is narrow."],
      questionsForAuthors: ["What would a second season change?"],
      suggestedNextSteps: ["Publish the weighing sheet beside the figure."],
      ontologyClass: "physical-testable",
      physics: { classification: "CONSISTENT", laws: ["conservation of mass"], howAddressed: "The mass balance is written out." },
      simulation: { reported: 0, passed: 0, methods: "Simulation does not apply to this record.", inputsAvailable: false },
      valueEstimate: { assumptions: ["The season is one site."], marketDisruption: "Not estimated." },
      goals: [{ goalId: "sdg-6", level: "indirect", note: "Water collection is named." }],
      air_feedback: {
        criteria: "none: the criteria fit this data note.",
        profile: "none: the data profile fits.",
        missingContext: "none: the text page was not required for this check.",
        prompt: "none: the instructions were clear.",
        rubric: "none: no rubric change.",
        scoringProcess: "I scored the pasted record, not another source.",
      },
    }
    document.getElementById("assistant")!.textContent = `Here is the review:\n${JSON.stringify(review)}`
    const composer = document.getElementById("composer")
    const picked = reviewJsonOnPage(document, composer)
    expect(picked).toContain('"overallScore":88')
    expect(picked).not.toContain("integer 0-100")
    const accepted = acceptWebChatResult(`${document.body.textContent}`, officialCriteria)
    expect(accepted.ok).toBe(true)
    if (!accepted.ok) return
    expect(accepted.report.recommendation).toBe("accept")
    expect(accepted.report.strengths[0]).toContain("tables are public")
    expect(accepted.report.scores.some((score) => score.criterionId === "global-goals")).toBe(true)
    expect(accepted.report.airFeedback?.scoringProcess).toContain("pasted record")
    const minor = acceptWebChatResult(JSON.stringify({ ...review, recommendation: "minor revision", strengths: review.strengths }), officialCriteria)
    expect(minor.ok).toBe(true)
    if (minor.ok) expect(minor.report.recommendation).toBe("revise")
    const rejected = acceptWebChatResult(JSON.stringify({ ...review, recommendation: "nope" }), officialCriteria)
    expect(rejected.ok).toBe(false)
    if (!rejected.ok) {
      expect(rejected.errors[0]).toContain("recommendation must be one of: accept, encourage, revise, major-revision, not-ready")
      expect(rejected.errors.join(" ")).not.toContain("criteria category ids")
    }
  })

  it("presses Enter once when Send has not been drawn", () => {
    document.body.innerHTML = `<main><div id="box" contenteditable="true" aria-label="Ask anything"></div></main>`
    const box = document.getElementById("box") as HTMLElement
    let keys = 0
    box.addEventListener("keydown", (event) => {
      if ((event as KeyboardEvent).key === "Enter") keys += 1
    })
    writeComposer(box, "Hello paper")
    expect(box.textContent).toContain("Hello paper")
    expect(submitOnce(box, null)).toBe("enter")
    expect(submitOnce(box, null)).toBe("blocked")
    expect(keys).toBe(1)
  })
})

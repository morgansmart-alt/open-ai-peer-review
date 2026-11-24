// @vitest-environment happy-dom
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { webChatProvider } from "../../../extension/adapters/index.ts"
import { CRITERION_PROFILES, readingCriteria } from "../../domain/profiles.ts"
import { officialCriteria } from "../../domain/officialCriteria.ts"
import { ackReply, assistantText, attachmentReady, chooseReplyBlock, clickElement, composerTextMatches, confirmComposerText, describeCandidates, diagnose, fillComposer, findComposer, findSubmit, heldPrefix, messageBlocks, placeComposerText, reviewJsonOnPage, stopControlActive, submitOnce, writeComposer } from "./dom.ts"
import { buildWebChatPacket } from "./packet.ts"
import { runTurn, sendFollowUp } from "./runTurn.ts"
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
      document.getElementById("assistant")!.textContent = '{"overallScore":70,"summary":"the record is readable."}'
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
        <div id="reply" class="assistant-message"></div>
      </main>
      <div id="stl-forge"><button type="button">Send</button><div>STL Forge overlay controls</div></div>
    `
    const provider = webChatProvider("grok")
    if (!provider) throw new Error("missing grok")
    document.getElementById("send")?.addEventListener("click", () => {
      ;(document.getElementById("composer") as HTMLTextAreaElement).value = ""
      ;(document.getElementById("send") as HTMLButtonElement).disabled = true
      document.getElementById("reply")!.textContent = "The model wrote a paragraph about the record and then stopped without a score."
    })
    const packet = buildWebChatPacket({
      requestId: "grok-timeout",
      providerId: "grok",
      criteria: officialCriteria,
      record,
      documents: [{ filename: "paper.md", text: "Measured yield in one season." }],
      useTextPage: true,
    })
    const livePage = `${"The public paper text is long enough to count as the record. ".repeat(12)}\nZenodo record: https://zenodo.org/records/1\nVersion DOI: https://doi.org/10.5281/zenodo.1`
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
      loadTextPage: async () => ({ status: 200, body: livePage }),
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
    document.body.innerHTML = `<main><textarea id="box" aria-label="Ask anything"></textarea><button id="send" type="button" aria-label="Send">Send</button><div id="reply" class="assistant-message"></div></main>`
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
    expect(sent[0]).toContain("paper-text/1.txt")
    expect(sent[0]).not.toContain("UNIQUEYIELD")
    expect(sent[1]).toContain("UNIQUEYIELD")
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.route).toBe("paste")
    expect(result.notice).toContain("text page unreachable, model used other sources")
  })

  it("keeps a live text page as the only route when the model scores it", async () => {
    document.body.innerHTML = `<main><textarea id="box" aria-label="Message Grok"></textarea><button id="send" type="submit" aria-label="Send">Send</button><div id="reply" class="assistant-message"></div></main>`
    const provider = webChatProvider("grok")
    if (!provider) throw new Error("missing grok")
    const sent: string[] = []
    const progress: string[] = []
    document.getElementById("send")?.addEventListener("click", () => {
      const text = (document.getElementById("box") as HTMLTextAreaElement).value
      sent.push(text)
      ;(document.getElementById("box") as HTMLTextAreaElement).value = ""
      document.getElementById("reply")!.textContent = '{"overallScore":86}'
    })
    const packet = buildWebChatPacket({
      requestId: "link-only",
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
      onProgress: (message) => progress.push(message),
    })
    expect(sent).toHaveLength(1)
    expect(sent[0]).toContain("paper-text/1.txt")
    expect(sent.join("\n")).not.toContain("UNIQUEYIELD")
    expect(progress.some((message) => message.startsWith("Review route: public text link."))).toBe(true)
    expect(progress.some((message) => message.includes("Waiting for the reply: public text link."))).toBe(true)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.route).toBe("link")
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
    if (result.ok) expect(result.route).toBe("paste")
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

  it("inserts a contenteditable message once, and keeps only the prefix the box will hold", () => {
    const box = document.createElement("div")
    box.setAttribute("contenteditable", "true")
    document.body.append(box)
    const original = typeof document.execCommand === "function" ? document.execCommand.bind(document) : undefined
    document.execCommand = ((command: string, _show?: boolean, value?: string) => {
      if (command === "insertText" && value) {
        box.textContent = `${box.textContent ?? ""}${value}${value}`
        return true
      }
      if (command === "delete") {
        box.textContent = ""
        return true
      }
      return false
    }) as typeof document.execCommand
    const filled = fillComposer(box, "Author defence, round 1.")
    expect(filled.ok).toBe(true)
    expect(box.textContent).toBe("Author defence, round 1.")
    box.addEventListener("input", () => {
      const value = box.textContent ?? ""
      if (value.length > 24) box.textContent = value.slice(0, 24)
    })
    document.execCommand = ((command: string, _show?: boolean, value?: string) => {
      if (command === "insertText" && value) {
        box.textContent = value.slice(0, 24)
        return true
      }
      if (command === "delete") {
        box.textContent = ""
        return true
      }
      return false
    }) as typeof document.execCommand
    const full = "Author defence, round 1 of 2. The first criticism continues past the limit."
    const placed = placeComposerText(box, full)
    expect(placed.ok).toBe(true)
    if (placed.ok) {
      expect(placed.chunk.length).toBeLessThan(full.length)
      expect(full.startsWith(placed.chunk)).toBe(true)
      expect(box.textContent).toBe(placed.chunk)
    }
    if (original) document.execCommand = original
    else delete (document as { execCommand?: unknown }).execCommand
  })

  it("finishes a defence round on the new prose reply and ignores the earlier score", async () => {
    document.body.innerHTML = `<main>
      <textarea id="box" aria-label="Ask anything"></textarea>
      <button id="send" type="button" aria-label="Send">Send</button>
      <div id="old" class="assistant-message">{"overallScore":86,"summary":"The first score."}</div>
      <div id="next" class="assistant-message"></div>
    </main>`
    const provider = webChatProvider("grok-x")
    if (!provider) throw new Error("missing grok-x")
    document.getElementById("send")?.addEventListener("click", () => {
      const text = (document.getElementById("box") as HTMLTextAreaElement).value
      ;(document.getElementById("box") as HTMLTextAreaElement).value = ""
      document.getElementById("next")!.textContent = text.includes("overallScore")
        ? '{"overallScore":80,"summary":"After defence."}'
        : "The stopping rule is stated in section 2. The criticism is fair."
    })
    const hooks = {
      aborted: () => false,
      sleep: (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
      pollMs: 5,
      stableMs: 0,
      stepTimeoutMs: 800,
      replyStartTimeoutMs: 300,
      submitStableMs: 0,
      submitReadyMs: 20,
      sendVerifyMs: 20,
    }
    const reply = await sendFollowUp(document, provider, "Author defence, round 1 of 2. Answer the criticism about numerical values.", hooks, "defence round 1 of 2", "text")
    expect(reply).toContain("stopping rule")
    expect(reply).not.toContain("overallScore")
    const rescored = await sendFollowUp(document, provider, "Score the paper again. Return JSON with overallScore.", hooks, "score after author defence", "json")
    expect(rescored).toContain('"overallScore":80')
    expect(rescored).not.toContain('"overallScore":86')
  })

  it("accepts a multi-paragraph readback whose blank lines collapsed", () => {
    const intended = "Open this public text page.\n\n\nScore every criterion from 0 to 100.\n\nReturn one JSON object."
    const readback = "Open this public text page.\nScore every criterion from 0 to 100.\nReturn one JSON object."
    expect(composerTextMatches(readback, intended)).toBe(true)
    const box = document.createElement("textarea")
    document.body.append(box)
    box.addEventListener("input", () => {
      box.value = box.value.replace(/\n{2,}/g, "\n")
    })
    const placed = placeComposerText(box, intended)
    expect(placed.ok).toBe(true)
    if (placed.ok) expect(placed.chunk).toBe(intended)
    expect(box.value.replace(/\n{2,}/g, "\n")).toBe(readback)
  })

  it("waits for a late composer paint and does not insert twice", async () => {
    const box = document.createElement("div")
    box.setAttribute("contenteditable", "true")
    document.body.append(box)
    let calls = 0
    box.addEventListener("beforeinput", (event) => {
      calls += 1
      event.preventDefault()
      const data = (event as InputEvent).data ?? ""
      setTimeout(() => {
        box.textContent = data
      }, 40)
    })
    const placed = await confirmComposerText(box, "Open this public text page", {
      sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
      pollMs: 5,
      timeoutMs: 500,
    })
    expect(calls).toBe(1)
    expect(placed.ok).toBe(true)
    expect(box.textContent).toBe("Open this public text page")
  })

  it("completes from the latest Grok response once the composer is idle", async () => {
    document.body.innerHTML = `<main>
      <div id="box" contenteditable="true" role="textbox" aria-label="Ask anything"></div>
      <button id="send" type="button" aria-label="Send">Send</button>
      <div id="old" data-testid="grokResponse">{"overallScore":86,"summary":"Earlier score."}</div>
      <div id="next" data-testid="grokResponse"></div>
    </main>`
    const provider = webChatProvider("grok-x")
    if (!provider) throw new Error("missing grok-x")
    const notes: string[] = []
    document.getElementById("send")?.addEventListener("click", () => {
      document.getElementById("box")!.textContent = ""
      document.getElementById("next")!.textContent = 'The record is public and the reply is finished. {"overallScore":70,"summary":"done"}'
    })
    const reply = await sendFollowUp(
      document,
      provider,
      "Review the paper.",
      {
        aborted: () => false,
        sleep: (ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
        pollMs: 5,
        stableMs: 0,
        stepTimeoutMs: 800,
        replyStartTimeoutMs: 300,
        submitStableMs: 0,
        submitReadyMs: 20,
        sendVerifyMs: 20,
        onProgress: (message, meta) => notes.push(`${message} ${meta?.detail ?? ""}`),
      },
      "review",
      "json",
    )
    expect(reply).toContain('"overallScore":70')
    expect(reply).not.toContain('"overallScore":86')
    expect(notes.join("\n")).toMatch(/candidate (message-block|\[data-testid="grokResponse"\])/)
    expect(notes.join("\n")).toContain("characters")
    expect(notes.join("\n")).toContain("last change")
  })

  it("reports a missing X reply and re-polls instead of hanging", async () => {
    document.body.innerHTML = `<main><textarea id="box" aria-label="Ask anything"></textarea><button id="send" type="button" aria-label="Send">Send</button></main>`
    const provider = webChatProvider("grok-x")
    if (!provider) throw new Error("missing grok-x")
    const notes: string[] = []
    document.getElementById("send")?.addEventListener("click", () => {
      ;(document.getElementById("box") as HTMLTextAreaElement).value = ""
    })
    const packet = buildWebChatPacket({
      requestId: "x-silent",
      providerId: "grok-x",
      criteria: officialCriteria,
      record,
      documents: [{ filename: "paper.md", text: "A short public note." }],
      useTextPage: true,
    })
    const livePage = `${"The public paper text is long enough to count as the record. ".repeat(12)}\nZenodo record: https://zenodo.org/records/1\nVersion DOI: https://doi.org/10.5281/zenodo.1`
    const result = await runTurn(document, { ...provider, fileUpload: false }, packet, {
      aborted: () => false,
      sleep: (ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
      pollMs: 5,
      stableMs: 0,
      stepTimeoutMs: 400,
      replySilentMs: 40,
      replyStartTimeoutMs: 1000,
      submitStableMs: 0,
      submitReadyMs: 20,
      sendVerifyMs: 20,
      loadTextPage: async () => ({ status: 200, body: livePage }),
      onProgress: (message, meta) => notes.push(`${message} ${meta?.detail ?? ""}`),
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    const log = notes.join("\n")
    expect(log).toContain("Re-polling")
    expect(log).toContain("candidate none")
    expect(log).toContain("0 characters")
    expect(log).toContain("last change none")
    expect(result.message).toContain("candidate none")
  })

  it("reads a Grok reply from new conversation text when no test id matches", async () => {
    document.body.innerHTML = `<main>
      <div id="box" contenteditable="true" role="textbox" aria-label="Ask anything"></div>
      <button id="send" type="button" aria-label="Send">Send</button>
      <div id="thread"><div>Earlier note about the record stays on screen.</div></div>
    </main>`
    const provider = webChatProvider("grok-x")
    if (!provider) throw new Error("missing grok-x")
    const notes: string[] = []
    document.getElementById("send")?.addEventListener("click", () => {
      document.getElementById("box")!.textContent = ""
      const reply = document.createElement("div")
      reply.textContent = '{"overallScore":87,"recommendation":"accept","summary":"The reply is in the conversation."}'
      document.getElementById("thread")!.append(reply)
    })
    const reply = await sendFollowUp(
      document,
      provider,
      "Review the paper.",
      {
        aborted: () => false,
        sleep: (ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
        pollMs: 5,
        stableMs: 0,
        stepTimeoutMs: 800,
        replyStartTimeoutMs: 300,
        submitStableMs: 0,
        submitReadyMs: 20,
        sendVerifyMs: 20,
        onProgress: (message, meta) => notes.push(`${message} ${meta?.detail ?? ""}`),
      },
      "review",
      "json",
    )
    expect(reply).toContain('"overallScore":87')
    const log = notes.join("\n")
    expect(log).toMatch(/candidate (conversation-region|message-block)/)
    expect(log).toContain("characters")
  })

  it("keeps looking until the score JSON, and ignores the prompt echo and a short chip", () => {
    const prompt = "Score the paper again with the same AIR v0.2 rubric. Return one JSON object and nothing else."
    const chip = "Thought for 4s"
    const echo = prompt.slice(0, 120)
    const score = '{"overallScore":88,"recommendation":"accept","summary":"The defended score is ready for the card and cites the record."}'
    const before = "The first review is already on screen and should stay out of the new reply."
    expect(chooseReplyBlock([chip, echo], before, prompt, "json")).toBe("")
    expect(chooseReplyBlock([chip, echo, score], before, prompt, "json")).toBe(score)
    const longer = `${score} ${"The pathway is written down. ".repeat(8)}`
    expect(chooseReplyBlock([longer, chip, score], before, prompt, "json")).toBe(score)
    const wrapped = `${prompt}\n${'{"overallScore":"<0-100>","questionsForAuthors":["<question>"],"summary":"template"}'}\n${score}`
    expect(chooseReplyBlock([wrapped, chip, score], before, prompt, "json")).toBe(score)
  })

  it("reads the sibling Grok reply and ignores the prompt, the template, and Thought for Ns", () => {
    const prompt = "Open this public text page and read the full paper. Score it. Return JSON with overallScore <0-100> and questionsForAuthors <question>. UNIQUE RUBRIC SLICE stays in the prompt."
    document.body.innerHTML = `<main id="conversation">
      <div id="box" contenteditable="true" role="textbox" aria-label="Ask anything"></div>
      <div class="turn" id="user">${prompt}</div>
      <div class="chip">Thought for 3s</div>
      <div class="turn" id="grok">{"overallScore":91,"recommendation":"accept","questionsForAuthors":["What limits the table?"],"summary":"The constants are tabulated for this version of the record."}</div>
    </main>`
    const composer = document.getElementById("box")
    const blocks = messageBlocks(document, composer)
    const picked = chooseReplyBlock(blocks, "", prompt, "json")
    expect(picked).toContain('"overallScore":91')
    expect(picked).not.toContain("UNIQUE RUBRIC SLICE")
    expect(picked).not.toContain("<0-100>")
    expect(picked.length).toBeLessThan(prompt.length)
  })

  it("reads a grok.com assistant message and not the user turn beside it", () => {
    const prompt = "Open this public text page. The rubric says overallScore <0-100>. UNIQUE RUBRIC SLICE."
    document.body.innerHTML = `<main>
      <textarea id="composer" aria-label="Message Grok"></textarea>
      <div class="user-turn">${prompt}</div>
      <div data-testid="assistant-message">{"overallScore":78,"recommendation":"revise","questionsForAuthors":["Which table changed?"],"summary":"The reference values are stated with their limits."}</div>
      <div class="chip">Thought for 2s</div>
    </main>`
    const picked = chooseReplyBlock(messageBlocks(document, document.getElementById("composer")), "", prompt, "json")
    expect(picked).toContain('"overallScore":78')
    expect(picked).not.toContain("UNIQUE RUBRIC SLICE")
  })

  it("accepts a defence readback that is missing only its last few characters", () => {
    const full = `Author defence, round 1 of 2. ${"Answer the criticism about the tabulated value. ".repeat(12)}(Mohr, Newell).`
    const readback = full.slice(0, -4)
    expect(readback.endsWith("(Mohr, Newe")).toBe(true)
    expect(composerTextMatches(readback, full)).toBe(true)
  })

  it("sends the prefix a composer kept instead of abandoning a cut-off defence", () => {
    const full = `${"Answer the criticism about the Boltzmann constant and the tabulated uncertainty. ".repeat(12)}`
    const kept = `${full.slice(0, 180)}…`
    expect(heldPrefix(kept, full)?.startsWith("Answer the criticism")).toBe(true)
    expect(heldPrefix("Thought", full)).toBeNull()
  })
})

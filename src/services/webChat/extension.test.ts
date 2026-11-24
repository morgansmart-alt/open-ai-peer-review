// @vitest-environment happy-dom
import { describe, expect, it } from "vitest"
import { CRITERION_PROFILES, readingCriteria } from "../../domain/profiles.ts"
import { officialCriteria } from "../../domain/officialCriteria.ts"
import { attachmentReady, clickElement } from "./dom.ts"
import { buildWebChatPacket } from "./packet.ts"
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

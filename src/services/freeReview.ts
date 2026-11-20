import type { AssessorProfile, CriteriaSet, ReviewReport } from "../domain/types.ts"
import type { ConversationLink } from "../domain/conversationLinks.ts"
import { buildDemoReport } from "./mockReview.ts"
import { reviewUserPrompt } from "./prompts.ts"
import { anchorExcerpts, readingCoverage } from "./textTools.ts"
import { extractJsonValue, validateReport } from "./validateReport.ts"
import type { ZenodoRecord } from "./zenodo.ts"
import { runReview, type RunContext } from "./review.ts"

/** Quantized weights are about 280 MB. WebLLM's own table estimates about 945 MB of GPU memory. */
export const FREE_BROWSER_MODEL = "Qwen2.5-0.5B-Instruct-q4f16_1-MLC"
export const FREE_BROWSER_SIZE = "about 280 MB of weights, and about 1 GB of GPU memory"
export const OPENROUTER_FREE_MODEL = "meta-llama/llama-3.2-3b-instruct:free"

export const FREE_LABEL = "Free quick review: a smaller model, lower fidelity, screening only"

export class FreeReviewUnavailable extends Error {
  constructor(message: string) {
    super(message)
    this.name = "FreeReviewUnavailable"
  }
}

export async function webGpuStatus(): Promise<"ready" | "missing" | "unavailable"> {
  const gpu = navigator.gpu
  if (!gpu) return "missing"
  try {
    const adapter = await gpu.requestAdapter()
    return adapter ? "ready" : "unavailable"
  } catch {
    return "unavailable"
  }
}

export function freeMockEnabled(): boolean {
  try {
    return sessionStorage.getItem("air-mock-free") === "1"
  } catch {
    return false
  }
}

function gpuMessage(status: "missing" | "unavailable"): string {
  return status === "missing"
    ? `This browser has no WebGPU, so the free on-device model cannot start. Chrome or Edge on a desktop usually can. You can still use a free OpenRouter or Gemini key, or an in-depth review with your own key. The on-device model is ${FREE_BROWSER_MODEL} (${FREE_BROWSER_SIZE}).`
    : `WebGPU is present but no GPU adapter was granted, so the free on-device model cannot start. Try another browser, or use a free key.`
}

export async function runFreeScreening(options: {
  kind: "browser" | "openrouter" | "gemini"
  criteria: CriteriaSet
  record: ZenodoRecord
  documents: { filename: string; text: string }[]
  conversations: ConversationLink[]
  profile?: AssessorProfile
  ctx?: RunContext
  onProgress?: (message: string) => void
}): Promise<ReviewReport> {
  const text = [options.record.description, ...options.documents.map((document) => document.text)].join("\n\n")
  if (freeMockEnabled()) {
    options.onProgress?.("Using the local free-review stand-in for this browser session.")
    return buildDemoReport({
      profile: options.profile ?? {
        id: "free",
        name: "Free quick review",
        shortName: "Free",
        provider: "compatible",
        defaultModel: FREE_BROWSER_MODEL,
        defaultBaseUrl: "",
        blurb: "",
        builtin: false,
      },
      criteria: options.criteria,
      text,
      filenames: options.documents.map((document) => document.filename),
      title: options.record.title,
    })
  }
  if (options.kind === "browser") {
    const status = await webGpuStatus()
    if (status !== "ready") throw new FreeReviewUnavailable(gpuMessage(status))
    options.onProgress?.(`Loading ${FREE_BROWSER_MODEL} (${FREE_BROWSER_SIZE}). The first visit downloads the weights into this browser.`)
    const webllm = (await import("@mlc-ai/web-llm")) as {
      CreateMLCEngine: (
        model: string,
        config: { initProgressCallback?: (report: { text?: string }) => void },
      ) => Promise<{
        chat: {
          completions: {
            create: (body: { messages: { role: string; content: string }[]; temperature?: number }) => Promise<{
              choices?: { message?: { content?: string | null } }[]
            }>
          }
        }
      }>
    }
    const engine = await webllm.CreateMLCEngine(FREE_BROWSER_MODEL, {
      initProgressCallback: (report) => options.onProgress?.(report.text || "Loading the on-device model…"),
    })
    const long = text.length > 12_000
    const packet = long
      ? `This on-device model cannot hold the whole paper. The excerpts below are the beginning, the middle, and the end, so the back half is not dropped.\n\n${anchorExcerpts(text)}`
      : text
    const user = reviewUserPrompt(options.record, options.criteria, packet, options.conversations)
    const completion = await engine.chat.completions.create({
      messages: [
        { role: "system", content: "You are a screening reviewer. Return one JSON object. If you cannot read a link, say so. Never invent a link's contents." },
        { role: "user", content: user },
      ],
      temperature: 0.2,
    })
    const raw = completion.choices?.[0]?.message?.content
    if (!raw) throw new FreeReviewUnavailable("The on-device model returned an empty screening.")
    const validated = validateReport(extractJsonValue(raw), options.criteria)
    if (!validated.ok) throw new FreeReviewUnavailable(`The free model did not return a usable screening. ${validated.errors.slice(0, 2).join(" ")}`)
    const reading = readingCoverage(options.documents, 0)
    return { ...validated.report, reading: long ? { ...reading, coverage: "partial" } : reading }
  }
  if (!options.ctx) throw new FreeReviewUnavailable("Add the free key for that provider first.")
  const model = options.kind === "openrouter" ? OPENROUTER_FREE_MODEL : options.ctx.profile.defaultModel
  return runReview({
    ...options.ctx,
    settings: { ...options.ctx.settings, models: { ...options.ctx.settings.models, [options.ctx.profile.id]: model } },
    conversationLinks: options.conversations,
    onProgress: options.onProgress,
  })
}

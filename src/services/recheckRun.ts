import type { ConversationLink } from "../domain/conversationLinks.ts"
import type { AssessorProfile, CriteriaSet, ProviderSettings } from "../domain/types.ts"
import type { RelatedSnippet, ZenodoRecord } from "./zenodo.ts"
import { runBrowserPrompt } from "./freeReview.ts"
import { uid } from "./hash.ts"
import { buildPacket, sourceCheckPrompt } from "./prompts.ts"
import { parseSourceCheck, runSourceCheck, type SourceCheckDraft } from "./review.ts"
import type { RecheckChoice } from "./recheckRoute.ts"
import { extractJsonValue } from "./validateReport.ts"
import { runWebChatExtension } from "./webChat/client.ts"
import type { WebChatPacket } from "./webChat/protocol.ts"

export async function executeRecheck(options: {
  choice: Extract<RecheckChoice, { ok: true }>
  settings: ProviderSettings
  criteria: CriteriaSet
  record: ZenodoRecord
  documents: { filename: string; text: string }[]
  conversationLinks: ConversationLink[]
  claim: string
  quotedPassage: string
  reason: string
  criterionId: string
  related: RelatedSnippet[]
  onProgress?: (message: string) => void
}): Promise<SourceCheckDraft> {
  const issue = {
    claim: options.claim,
    quotedPassage: options.quotedPassage,
    reason: options.reason,
    criterionId: options.criterionId,
  }
  if (options.choice.kind === "assessor") {
    return runSourceCheck({
      ctx: {
        profile: options.choice.profile,
        settings: options.settings,
        criteria: options.criteria,
        record: options.record,
        documents: options.documents,
        conversationLinks: options.conversationLinks,
        demo: false,
        onProgress: options.onProgress,
      },
      claim: options.claim,
      quotedPassage: options.quotedPassage,
      reason: options.reason,
      criterionId: options.criterionId,
      related: options.related,
    })
  }
  const packet = buildPacket(options.record, options.documents, null)
  const instructions = sourceCheckPrompt(issue, packet, options.related, options.conversationLinks)
  const system = "You check whether a publication addresses a specific failure. Return JSON only. Do not invent quotations."
  if (options.choice.kind === "webgpu") {
    const raw = await runBrowserPrompt(system, instructions, options.onProgress)
    return parseSourceCheck(extractJsonValue(raw))
  }
  const files = options.documents.filter((document) => document.text.trim()).map((document) => ({ filename: document.filename, text: document.text }))
  const webPacket: WebChatPacket = {
    version: 1,
    requestId: uid("recheck"),
    providerId: options.choice.providerId,
    system,
    instructions,
    files,
  }
  const outcome = await runWebChatExtension(webPacket, options.onProgress)
  return parseSourceCheck(extractJsonValue(outcome.text))
}

export function recheckAuthorLabel(choice: Extract<RecheckChoice, { ok: true }>, profiles: readonly AssessorProfile[]): string {
  if (choice.kind === "assessor") return profiles.find((profile) => profile.id === choice.profile.id)?.name ?? choice.profile.name
  if (choice.kind === "webgpu") return "On-device WebGPU"
  return `Web chat (${choice.providerId})`
}

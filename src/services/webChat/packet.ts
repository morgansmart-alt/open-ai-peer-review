import type { ConversationLink } from "../../domain/conversationLinks.ts"
import { readingCriteria } from "../../domain/profiles.ts"
import type { CriteriaSet } from "../../domain/types.ts"
import { reviewSystemPrompt, reviewUserPrompt } from "../prompts.ts"
import type { ZenodoRecord } from "../zenodo.ts"
import { isPublicPaperTextUrl, paperTextRecordId, paperTextUrl } from "./paperText.ts"
import type { WebChatPacket } from "./protocol.ts"

/** PDFs for this route read further than the 40-page API screening. */
export const WEB_CHAT_PDF_PAGES = 400
/** A single file stops here, with a visible note, so a runaway extract cannot freeze the tab. */
export const WEB_CHAT_FILE_CHARS = 1_500_000

export function buildWebChatPacket(options: {
  requestId: string
  providerId: string
  criteria: CriteriaSet
  record: ZenodoRecord
  documents: { filename: string; text: string }[]
  conversations?: ConversationLink[]
  /** Shared paper-type profile. The prompt and the parser both use this set. */
  criterionProfile?: string
  customCriteria?: boolean
  /** Public text page for this record. Omitted for a local file with no Zenodo id. */
  textUrl?: string
  /** Ask the chat to open the public text page instead of pasting the paper. */
  useTextPage?: boolean
}): WebChatPacket {
  const criteria = readingCriteria(options.criteria, options.criterionProfile, options.customCriteria ?? false)
  const files = options.documents
    .filter((document) => document.text.trim())
    .map((document) => ({
      filename: document.filename,
      text:
        document.text.length > WEB_CHAT_FILE_CHARS
          ? `${document.text.slice(0, WEB_CHAT_FILE_CHARS)}\n\n[AIR stopped this file at ${WEB_CHAT_FILE_CHARS.toLocaleString("en-US")} characters.]`
          : document.text,
    }))
  if (files.length === 0 && options.record.description.trim()) {
    files.push({ filename: "description.txt", text: options.record.description.slice(0, WEB_CHAT_FILE_CHARS) })
  }
  const publicId = paperTextRecordId(options.record)
  const textUrl = options.textUrl ?? (options.useTextPage && publicId ? paperTextUrl(publicId) : "")
  return {
    version: 1,
    requestId: options.requestId,
    providerId: options.providerId,
    system: reviewSystemPrompt(criteria),
    instructions: reviewUserPrompt(
      options.record,
      criteria,
      "The paper is supplied separately as attached files or as earlier messages labelled AIR PAPER PART. Score that text. If a file is missing, say so. Do not invent passages.",
      options.conversations ?? [],
    ),
    files,
    ...(options.criterionProfile ? { criterionProfile: options.criterionProfile } : {}),
    ...(textUrl && isPublicPaperTextUrl(textUrl) ? { textUrl } : {}),
  }
}

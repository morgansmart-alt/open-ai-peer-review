import { webChatProvider, type ProviderAdapter } from "../../../extension/adapters/index.ts"

/** Page-to-extension messages use the same source string as the embed height post. */
export const PAGE_SOURCE = "open-ai-peer-review"
/** Extension-to-page messages. The page ignores every other source. */
export const EXTENSION_SOURCE = "air-web-chat-extension"
export const PROTOCOL_VERSION = 1

export const WEB_CHAT_TIER = "free-web-chat" as const
export const WEB_CHAT_LABEL = "free web-chat, uncalibrated"
/** Tag stored on a score the user explicitly sent to the board. */
export const UNCALIBRATED_WEB_CHAT_TIER = "uncalibrated web-chat" as const
export const WEB_CHAT_SOURCE = "web-chat extension" as const

export function isOffBoardTier(tier: string | undefined, source?: string): boolean {
  return tier === "free-screening" || tier === WEB_CHAT_TIER || tier === UNCALIBRATED_WEB_CHAT_TIER || source === WEB_CHAT_SOURCE
}

/** A free web-chat score is labelled uncalibrated and stays out of calibrated medians. */
export function isUncalibratedWebChat(review: { tier?: string; source?: string } | null | undefined): boolean {
  if (!review) return false
  return review.tier === WEB_CHAT_TIER || review.tier === UNCALIBRATED_WEB_CHAT_TIER || review.source === WEB_CHAT_SOURCE
}

/**
 * Origins that may hand a packet to the extension.
 * Localhost and 127.0.0.1 are any port. The public site is the GitHub Pages origin only.
 */
const AIR_ORIGIN = /^(https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?|https:\/\/morgansmart-alt\.github\.io)$/

export function originAllowed(origin: string): boolean {
  return AIR_ORIGIN.test(origin)
}

export interface WebChatFile {
  filename: string
  text: string
}

export interface WebChatPacket {
  version: 1
  requestId: string
  providerId: string
  system: string
  instructions: string
  files: WebChatFile[]
  /** Paper-type profile. Absent means the device or engineering set. */
  criterionProfile?: string
}

/** Eight million characters is a guard against a runaway file, not a model context window. */
export const PACKET_CHAR_CAP = 8_000_000

export function validatePacket(input: unknown): { ok: true; packet: WebChatPacket; provider: ProviderAdapter } | { ok: false; message: string } {
  if (!input || typeof input !== "object") return { ok: false, message: "The review packet was empty." }
  const packet = input as Partial<WebChatPacket>
  if (packet.version !== 1) return { ok: false, message: "This extension does not understand that packet version." }
  if (typeof packet.requestId !== "string" || !packet.requestId.trim()) return { ok: false, message: "The review packet had no request id." }
  if (typeof packet.providerId !== "string") return { ok: false, message: "Pick a chat site first." }
  const provider = webChatProvider(packet.providerId)
  if (!provider) return { ok: false, message: "That chat site is not one of the adapters." }
  if (typeof packet.system !== "string" || typeof packet.instructions !== "string" || !packet.instructions.trim()) {
    return { ok: false, message: "The review packet was missing its prompt." }
  }
  if (!Array.isArray(packet.files)) return { ok: false, message: "The review packet was missing its files." }
  let chars = packet.system.length + packet.instructions.length
  const files: WebChatFile[] = []
  for (const file of packet.files) {
    if (!file || typeof file !== "object") return { ok: false, message: "A paper file in the packet was unreadable." }
    const filename = typeof file.filename === "string" ? file.filename : ""
    const text = typeof file.text === "string" ? file.text : ""
    if (!filename || !text) continue
    chars += text.length
    files.push({ filename, text })
  }
  if (chars > PACKET_CHAR_CAP) {
    return { ok: false, message: "The paper is above the extension's safety cap of 8 million characters." }
  }
  return {
    ok: true,
    provider,
    packet: {
      version: 1,
      requestId: packet.requestId,
      providerId: provider.id,
      system: packet.system,
      instructions: packet.instructions,
      files,
      ...(typeof packet.criterionProfile === "string" && packet.criterionProfile.trim()
        ? { criterionProfile: packet.criterionProfile.trim() }
        : {}),
    },
  }
}

export function isExtensionMessage(data: unknown, requestId?: string): data is { source: string; type: string; requestId?: string; version?: number; text?: string; message?: string } {
  if (!data || typeof data !== "object") return false
  const message = data as { source?: unknown; version?: unknown; requestId?: unknown }
  if (message.source !== EXTENSION_SOURCE || message.version !== PROTOCOL_VERSION) return false
  if (requestId && message.requestId !== requestId) return false
  return true
}

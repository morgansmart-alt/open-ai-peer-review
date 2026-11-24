import { chatgpt } from "./chatgpt.ts"
import { claude } from "./claude.ts"
import { copilot } from "./copilot.ts"
import { deepseek } from "./deepseek.ts"
import { gemini } from "./gemini.ts"
import { grokX } from "./grok-x.ts"
import { grok } from "./grok.ts"
import { mistral } from "./mistral.ts"
import { perplexity } from "./perplexity.ts"
import type { ProviderAdapter } from "./types.ts"

export type { ProviderAdapter, ProviderSelectors } from "./types.ts"

/** Shown first in the extension panel. The rest stay available under Other chats. */
export const primaryWebChatIds = ["grok", "gemini", "claude", "grok-x"]

/** Order is the order shown in the AIR setup panel. */
export const webChatProviders: ProviderAdapter[] = [grok, gemini, chatgpt, claude, grokX, deepseek, mistral, copilot, perplexity]

export function webChatProvider(id: string): ProviderAdapter | null {
  return webChatProviders.find((item) => item.id === id) ?? null
}

import { isHiddenControl, isIgnoredRegion, queryAllDeep } from "./dom.ts"

/** Used when the chat does not show which model or mode is selected. */
export const UNKNOWN_CHAT_MODEL = "unknown (site default)"

const GROK_MODES = ["heavy", "expert", "auto"] as const

function labelOf(el: Element): string {
  return `${el.getAttribute("aria-label") ?? ""} ${(el.textContent ?? "").replace(/\s+/g, " ")}`.trim()
}

function controls(root: ParentNode): Element[] {
  let nodes: Element[] = []
  try {
    nodes = queryAllDeep(root, "button, [role='button'], [data-testid*='model'], [aria-haspopup='listbox']")
  } catch {
    return []
  }
  return nodes.filter((el) => !isIgnoredRegion(el) && !isHiddenControl(el))
}

function titled(label: string): string {
  return label.slice(0, 80)
}

function grokMode(label: string): string | null {
  const lower = label.toLowerCase()
  if (/add files|voice|send|submit|stop|upload/.test(lower)) return null
  const mode = GROK_MODES.find((word) => new RegExp(`\\b${word}\\b`, "i").test(label))
  if (!mode) return null
  if (!/model/.test(lower) && !/^(auto|expert|heavy)$/i.test(label.trim())) return null
  return mode.charAt(0).toUpperCase() + mode.slice(1)
}

function geminiName(label: string): string | null {
  const match = label.match(/gemini(?:\s+\d+(?:\.\d+)?)?(?:\s+(?:pro|flash|thinking|nano|ultra))+/i) || label.match(/\b\d+(?:\.\d+)?\s+(?:pro|flash|thinking)\b/i)
  if (!match) return null
  if (/send|upload|stop|attach/i.test(label)) return null
  return titled(match[0].replace(/\s+/g, " ").trim())
}

function chatgptName(label: string): string | null {
  if (/send|upload|stop|attach|voice/i.test(label)) return null
  const match = label.match(/\b(?:gpt[-\s]?\d+(?:\.\d+)?[a-z]?|chatgpt\s+\w[\w.\-]*|o[134](?:-[\w.]+)?|4o(?:-[\w.]+)?)\b/i)
  if (!match) return null
  return titled(match[0].replace(/\s+/g, " ").trim())
}

/**
 * Read the model or mode the chat is already using.
 * This never clicks, focuses, or changes the picker.
 */
export function detectChatModel(root: ParentNode, providerId: string): string {
  const buttons = controls(root)
  if (providerId === "grok" || providerId === "grok-x") {
    for (const button of buttons) {
      const mode = grokMode(labelOf(button))
      if (mode) return mode
    }
  }
  if (providerId === "gemini") {
    for (const button of buttons) {
      const name = geminiName(labelOf(button))
      if (name) return name
    }
  }
  if (providerId === "chatgpt") {
    for (const button of buttons) {
      const name = chatgptName(labelOf(button))
      if (name) return name
    }
  }
  return UNKNOWN_CHAT_MODEL
}

export function webChatModelId(siteLabel: string, detected: string | null | undefined): string {
  const mode = (detected ?? "").trim() || UNKNOWN_CHAT_MODEL
  return `${siteLabel} · ${mode} (web chat, uncalibrated)`
}

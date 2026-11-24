import type { ProviderAdapter } from "./types.ts"

const deepseek: ProviderAdapter = {
  id: "deepseek",
  label: "DeepSeek",
  assessorId: "deepseek",
  provider: "openrouter",
  modelLabel: "DeepSeek on chat.deepseek.com",
  startUrl: "https://chat.deepseek.com/",
  origins: ["https://chat.deepseek.com/*"],
  pasteLimit: 32_000,
  fileCharLimit: 0,
  maxFiles: 0,
  comfortableTurns: 8,
  fileUpload: false,
  limits:
    "This adapter pastes text, 32,000 characters at a time. It does not attach files. A long paper becomes many turns and can hit DeepSeek's web rate limit. That limit was not measured here.",
  selectors: {
    composer: ["textarea#chat-input", 'textarea[placeholder*="Message"]', "textarea"],
    submit: ['button[aria-label*="Send"]', 'div[role="button"][aria-label*="Send"]', 'button[type="submit"]'],
    stop: ['button[aria-label*="Stop"]'],
    assistant: ['[data-role="assistant"]', ".ds-markdown"],
    fileInput: [],
    login: ['a[href*="/sign_in"]', 'a[href*="login"]', 'button[data-testid="login"]'],
  },
}

export { deepseek }

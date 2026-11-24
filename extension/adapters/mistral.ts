import type { ProviderAdapter } from "./types.ts"

const mistral: ProviderAdapter = {
  id: "mistral",
  label: "Mistral",
  assessorId: "mistral",
  provider: "openrouter",
  modelLabel: "Mistral on chat.mistral.ai",
  startUrl: "https://chat.mistral.ai/chat",
  origins: ["https://chat.mistral.ai/*"],
  pasteLimit: 28_000,
  fileCharLimit: 400_000,
  maxFiles: 4,
  comfortableTurns: 6,
  fileUpload: true,
  limits:
    "AIR tries a file up to about 400,000 characters, then pastes 28,000 characters at a time. Le Chat's free tier has its own rate limit, which was not measured here.",
  selectors: {
    composer: ['textarea[placeholder*="Chat"]', "textarea", 'div[contenteditable="true"][role="textbox"]'],
    submit: ['button[aria-label*="Send"]', 'button[type="submit"]'],
    stop: ['button[aria-label*="Stop"]'],
    assistant: ['[data-testid="assistant-message"]', '[data-message-author="assistant"]'],
    fileInput: ['input[type="file"]'],
    login: ['a[href*="/login"]', 'button[data-testid="login"]'],
  },
}

export { mistral }

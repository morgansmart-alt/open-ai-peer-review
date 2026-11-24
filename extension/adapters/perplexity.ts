import type { ProviderAdapter } from "./types.ts"

const perplexity: ProviderAdapter = {
  id: "perplexity",
  label: "Perplexity",
  assessorId: "web-chat",
  provider: "compatible",
  modelLabel: "Perplexity on perplexity.ai",
  startUrl: "https://www.perplexity.ai/",
  origins: ["https://www.perplexity.ai/*"],
  pasteLimit: 16_000,
  fileCharLimit: 200_000,
  maxFiles: 4,
  comfortableTurns: 4,
  fileUpload: true,
  limits:
    "AIR tries a file up to about 200,000 characters, then pastes 16,000 characters at a time. Perplexity's free tier rate-limits searches. A ~160k-token paper is larger than one comfortable turn. That limit was not measured here.",
  selectors: {
    composer: ['textarea[placeholder*="Ask"]', "textarea", 'div[contenteditable="true"][role="textbox"]'],
    submit: ['button[aria-label="Submit"]', 'button[aria-label*="Send"]'],
    stop: ['button[aria-label*="Stop"]'],
    assistant: ['[data-testid="assistant-message"]'],
    fileInput: ['input[type="file"]'],
    login: ['a[href*="/login"]', 'button[data-testid="login"]'],
  },
}

export { perplexity }

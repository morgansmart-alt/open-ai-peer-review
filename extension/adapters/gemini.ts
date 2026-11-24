import type { ProviderAdapter } from "./types.ts"

const gemini: ProviderAdapter = {
  id: "gemini",
  label: "Gemini",
  assessorId: "gemini",
  provider: "gemini",
  modelLabel: "Gemini on gemini.google.com",
  startUrl: "https://gemini.google.com/app",
  origins: ["https://gemini.google.com/*"],
  pasteLimit: 48_000,
  fileCharLimit: 1_500_000,
  maxFiles: 10,
  comfortableTurns: 8,
  fileUpload: true,
  limits:
    "AIR attaches a paper up to about 1.5 million characters, or pastes 48,000 characters at a time. Gemini's free web app has its own file and rate limits, and a signed-in Google account. Those limits were not measured here.",
  selectors: {
    composer: [
      'div.ql-editor[contenteditable="true"]',
      'rich-textarea div[contenteditable="true"]',
      'div[contenteditable="true"][aria-label*="prompt"]',
      'div[contenteditable="true"][role="textbox"]',
    ],
    submit: ['button[aria-label="Send message"]', 'button[aria-label*="Send"]'],
    stop: ['button[aria-label="Stop response"]', 'button[aria-label*="Stop"]'],
    assistant: ["message-content", "model-response", ".model-response-text"],
    fileInput: ['input[type="file"]'],
    login: ['a[href*="accounts.google.com"]', 'a[aria-label*="Sign in"]', 'button[aria-label*="Sign in"]'],
  },
}

export { gemini }

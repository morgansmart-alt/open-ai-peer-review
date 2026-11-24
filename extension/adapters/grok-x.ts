import type { ProviderAdapter } from "./types.ts"

const grokX: ProviderAdapter = {
  id: "grok-x",
  label: "Grok on X",
  assessorId: "grok",
  provider: "xai",
  modelLabel: "Grok on x.com",
  startUrl: "https://x.com/i/grok",
  origins: ["https://x.com/i/grok*"],
  pasteLimit: 32_000,
  fileCharLimit: 400_000,
  maxFiles: 4,
  comfortableTurns: 6,
  fileUpload: true,
  limits:
    "Grok on X is at x.com/i/grok. AIR tries a file up to about 400,000 characters, then pastes 32,000 characters at a time. X rate-limits long threads. That limit was not measured here.",
  selectors: {
    composer: [
      'textarea[aria-label="Ask Grok"]',
      'textarea[aria-label*="Ask Grok"]',
      'div[data-testid="grokComposer"] textarea',
      'div[contenteditable="true"][role="textbox"]',
    ],
    submit: ['button[aria-label="Send"]', 'button[data-testid="grok-send"]', 'button[aria-label*="Send"]'],
    stop: ['button[aria-label="Stop"]', 'button[aria-label*="Stop"]'],
    assistant: ['[data-testid="assistant-message"]', '[data-testid="grok-message"]'],
    fileInput: ['input[type="file"]'],
    login: ['a[href*="/login"]', 'a[href*="/i/flow/login"]', 'a[data-testid="login"]'],
  },
}

export { grokX }

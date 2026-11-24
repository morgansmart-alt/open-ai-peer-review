import type { ProviderAdapter } from "./types.ts"

const grok: ProviderAdapter = {
  id: "grok",
  label: "Grok",
  assessorId: "grok",
  provider: "xai",
  modelLabel: "Grok on grok.com",
  startUrl: "https://grok.com/",
  origins: ["https://grok.com/*"],
  pasteLimit: 48_000,
  fileCharLimit: 1_200_000,
  maxFiles: 8,
  comfortableTurns: 8,
  fileUpload: true,
  limits:
    "AIR attaches a paper up to about 1.2 million characters, or pastes 48,000 characters at a time. Grok's free web chat rate-limits long threads. The exact cap is set by xAI and was not measured here.",
  selectors: {
    composer: [
      'textarea[aria-label="Message Grok"]',
      'textarea[aria-label*="Message Grok"]',
      '[contenteditable="true"][aria-label="Message Grok"]',
      '[contenteditable="true"][aria-label*="Message Grok"]',
      '[role="textbox"][aria-label="Message Grok"]',
      '[role="textbox"][aria-label*="Message Grok"]',
      'textarea[aria-label="Ask Grok anything"]',
      'textarea[aria-label*="Ask Grok"]',
      'textarea[placeholder*="What do you want to know"]',
      'textarea[aria-label*="What do you want to know"]',
      'textarea[placeholder*="Ask anything"]',
      'textarea[aria-label*="Ask anything"]',
      'textarea[placeholder*="Ask"]',
      '[contenteditable="true"][placeholder*="Ask"]',
      '[contenteditable="true"][aria-label*="Ask"]',
      'div[contenteditable="true"][role="textbox"]',
    ],
    submit: ['button[aria-label="Submit"]', 'button[aria-label*="Send"]', 'button[aria-label*="Submit"]', 'button[type="submit"]'],
    stop: ['button[aria-label="Stop"]', 'button[aria-label*="Stop"]', 'button[aria-label*="Stop generating"]'],
    assistant: ['[data-testid="assistant-message"]', '[data-message-author="assistant"]', '[class*="assistant-message"]'],
    fileInput: ['input[type="file"]'],
    login: ['a[href*="accounts.x.com"]', 'a[href*="/login"]', 'button[data-testid="login"]'],
  },
}

export { grok }

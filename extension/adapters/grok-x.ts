import type { ProviderAdapter } from "./types.ts"

const grokX: ProviderAdapter = {
  id: "grok-x",
  label: "Grok on X",
  assessorId: "grok",
  provider: "xai",
  modelLabel: "Grok on x.com",
  startUrl: "https://x.com/i/grok",
  origins: ["https://x.com/i/grok*"],
  pasteLimit: 100_000,
  fileCharLimit: 400_000,
  maxFiles: 4,
  comfortableTurns: 6,
  fileUpload: true,
  limits:
    "Grok on X is at x.com/i/grok. AIR sends one message when the paper and the instructions fit in about 100,000 characters, attaches a file when the site accepts one, and otherwise pastes in parts. X rate-limits long threads. That limit was not measured here.",
  selectors: {
    composer: [
      'textarea[aria-label="Ask anything"]',
      'textarea[placeholder="Ask anything"]',
      '[contenteditable="true"][aria-label="Ask anything"]',
      '[contenteditable="true"][placeholder="Ask anything"]',
      '[role="textbox"][aria-label*="Ask"]',
      '[role="textbox"][placeholder*="Ask"]',
      'textarea[aria-label="Ask Grok"]',
      'textarea[aria-label*="Ask Grok"]',
      'textarea[aria-label*="Ask"]',
      'textarea[placeholder*="Ask"]',
      'div[data-testid="grokComposer"] textarea',
      'div[contenteditable="true"][role="textbox"]',
    ],
    submit: [
      'button[aria-label="Send"]',
      'button[aria-label*="Send"]',
      'button[aria-label*="Submit"]',
      'button[aria-label*="Grok"]',
      'button[data-testid="grok-send"]',
    ],
    stop: ['button[aria-label="Stop"]', 'button[aria-label*="Stop"]', 'button[aria-label*="Stop generating"]'],
    assistant: [
      '[data-testid="grokResponse"]',
      '[data-testid="grok-response"]',
      '[data-testid="GrokResponse"]',
      '[data-testid="grok-message"]',
      '[data-testid*="grokMessage"]',
      '[data-testid="assistant-message"]',
      '[data-message-author="assistant"]',
      '[class*="assistant-message"]',
      'article[data-testid*="grok"]',
    ],
    fileInput: ['input[type="file"]'],
    login: ['a[href*="/login"]', 'a[href*="/i/flow/login"]', 'a[data-testid="login"]'],
  },
}

export { grokX }

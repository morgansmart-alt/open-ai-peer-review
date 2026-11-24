import type { ProviderAdapter } from "./types.ts"

const copilot: ProviderAdapter = {
  id: "copilot",
  label: "Copilot",
  assessorId: "web-chat",
  provider: "compatible",
  modelLabel: "Copilot on copilot.microsoft.com",
  startUrl: "https://copilot.microsoft.com/",
  origins: ["https://copilot.microsoft.com/*"],
  pasteLimit: 12_000,
  fileCharLimit: 0,
  maxFiles: 0,
  comfortableTurns: 4,
  fileUpload: false,
  limits:
    "This adapter pastes text, 12,000 characters at a time. Copilot's web composer is short, so a full paper becomes many turns and may be refused. A ~160k-token paper is a poor fit here. The rate limit was not measured.",
  selectors: {
    composer: ["textarea#userInput", 'textarea[aria-label*="Message"]', 'div[contenteditable="true"][role="textbox"]'],
    submit: ['button[aria-label="Send"]', 'button[aria-label*="Send"]', 'button[type="submit"]'],
    stop: ['button[aria-label*="Stop"]'],
    assistant: ['[data-content="ai-message"]', '[data-testid="ai-message"]'],
    fileInput: [],
    login: ['a[href*="login.microsoftonline.com"]', 'button[data-testid="login"]'],
  },
}

export { copilot }

import type { ProviderAdapter } from "./types.ts"

const claude: ProviderAdapter = {
  id: "claude",
  label: "Claude",
  assessorId: "claude",
  provider: "anthropic",
  modelLabel: "Claude on claude.ai",
  startUrl: "https://claude.ai/new",
  origins: ["https://claude.ai/*"],
  pasteLimit: 60_000,
  fileCharLimit: 1_200_000,
  maxFiles: 5,
  comfortableTurns: 8,
  fileUpload: true,
  limits:
    "AIR attaches a paper up to about 1.2 million characters, or pastes 60,000 characters at a time. Claude's free web chat has a daily message cap. That cap was not measured here.",
  selectors: {
    composer: [
      'div[contenteditable="true"][data-testid="chat-input"]',
      "div.ProseMirror[contenteditable='true']",
      'div[contenteditable="true"][role="textbox"]',
    ],
    submit: ['button[aria-label="Send message"]', 'button[aria-label*="Send"]'],
    stop: ['button[aria-label="Stop response"]', 'button[aria-label*="Stop"]'],
    assistant: ['[data-testid="assistant-message"]', '[data-testid="assistant-turn"]'],
    fileInput: ['input[type="file"]'],
    login: ['a[href*="/login"]', 'button[data-testid="login"]'],
  },
}

export { claude }

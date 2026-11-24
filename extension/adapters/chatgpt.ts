import type { ProviderAdapter } from "./types.ts"

const chatgpt: ProviderAdapter = {
  id: "chatgpt",
  label: "ChatGPT",
  assessorId: "gpt",
  provider: "openai",
  modelLabel: "ChatGPT on chatgpt.com",
  startUrl: "https://chatgpt.com/",
  origins: ["https://chatgpt.com/*"],
  pasteLimit: 28_000,
  fileCharLimit: 400_000,
  maxFiles: 5,
  comfortableTurns: 6,
  fileUpload: true,
  limits:
    "AIR tries a file up to about 400,000 characters, then pastes 28,000 characters at a time. Free ChatGPT accounts often refuse file upload and rate-limit long chats. A ~160k-token paper may need several turns or a paid chat. Those limits were not measured here.",
  selectors: {
    composer: ["#prompt-textarea", 'textarea[data-id="prompt-textarea"]', 'div#prompt-textarea[contenteditable="true"]'],
    submit: ['button[data-testid="send-button"]', 'button[aria-label="Send prompt"]', 'button[aria-label*="Send"]'],
    stop: ['button[data-testid="stop-button"]', 'button[aria-label*="Stop"]'],
    assistant: ['[data-message-author-role="assistant"]', '[data-testid="conversation-turn"]'],
    fileInput: ['input[type="file"]'],
    login: ['a[href*="/auth/login"]', 'button[data-testid="login-button"]', 'button[data-testid="login"]'],
  },
}

export { chatgpt }

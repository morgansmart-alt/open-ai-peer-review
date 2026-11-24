export const FREE_KEY_GUIDE_TITLE = "Get a free AI key in 2 minutes"

export const GEMINI_KEY_URL = "https://aistudio.google.com"

/** Numbered path a non-technical reader can follow without a card. */
export const GEMINI_KEY_STEPS: { title: string; body: string }[] = [
  {
    title: "Open Google AI Studio",
    body: "Go to aistudio.google.com. That is Google’s page for Gemini keys.",
  },
  {
    title: "Sign in",
    body: "Sign in with a Google account. A normal Gmail account is enough.",
  },
  {
    title: "Get API key",
    body: "Choose Get API key.",
  },
  {
    title: "Create API key",
    body: "Choose Create API key. Gemini’s free tier does not ask for a card.",
  },
  {
    title: "Copy the key",
    body: "Copy the whole key. Do not share it in a chat or a paper.",
  },
  {
    title: "Paste it into AIR",
    body: "Open Keys on this page, choose Google Gemini, paste the key, and press Check key. AIR does not keep a copy on its servers.",
  },
]

export const OPENROUTER_KEY_URL = "https://openrouter.ai/keys"

export const OPENROUTER_KEY_NOTE =
  "OpenRouter is the shorter free option. Sign in at openrouter.ai, create a key, and paste it into AIR’s OpenRouter field. Pick a model marked free. The same key covers the free screening and does not run a review until you ask."

export const WEBGPU_NOTE =
  "No key at all: the free quick review runs inside this browser when WebGPU is available. It is a screening, not a ranked reading. Chrome or Edge on a desktop usually works. If this browser cannot use WebGPU, use the Gemini or OpenRouter key above."

export const KEY_STAYS_LOCAL_NOTE =
  "Your key stays in this browser. It is sent only to the provider you choose, when you check the key or run a reading. It is not sent to AIR’s servers, and it is not stored on the shared board."

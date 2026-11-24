// @vitest-environment happy-dom
import { describe, expect, it } from "vitest"
import { detectChatModel, UNKNOWN_CHAT_MODEL, webChatModelId } from "./chatModel.ts"

describe("chat model detection", () => {
  it("reads the grok.com mode and does not change the picker", () => {
    document.body.innerHTML = `
      <button type="button" id="mode">Select a model Expert</button>
      <button type="button">Send</button>
      <div id="stl-forge"><button type="button">Select a model Auto</button></div>
    `
    const button = document.getElementById("mode") as HTMLButtonElement
    let clicks = 0
    button.addEventListener("click", () => {
      clicks += 1
    })
    expect(detectChatModel(document, "grok")).toBe("Expert")
    expect(button.textContent).toBe("Select a model Expert")
    expect(clicks).toBe(0)
    document.body.innerHTML = `<button type="button">Select a model Heavy</button>`
    expect(detectChatModel(document, "grok")).toBe("Heavy")
    document.body.innerHTML = `<main><textarea aria-label="Message Grok"></textarea></main>`
    expect(detectChatModel(document, "grok")).toBe(UNKNOWN_CHAT_MODEL)
  })

  it("reads a Gemini switcher and a ChatGPT model name", () => {
    document.body.innerHTML = `<button type="button" aria-label="Gemini 2.5 Pro">Gemini 2.5 Pro</button>`
    expect(detectChatModel(document, "gemini")).toBe("Gemini 2.5 Pro")
    document.body.innerHTML = `<button type="button">GPT-4o</button><button type="button">Send prompt</button>`
    expect(detectChatModel(document, "chatgpt")).toBe("GPT-4o")
    expect(webChatModelId("Grok on grok.com", "Expert")).toBe("Grok on grok.com · Expert (web chat, uncalibrated)")
    expect(webChatModelId("Grok on grok.com", "")).toContain(UNKNOWN_CHAT_MODEL)
  })
})

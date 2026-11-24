import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { chromium, expect, test } from "@playwright/test"

const extensionPath = join(process.cwd(), "extension")

test("drives a mock chat once and does not open a real chat site", async () => {
  const userData = mkdtempSync(join(tmpdir(), "air-web-chat-"))
  const context = await chromium.launchPersistentContext(userData, {
    // Full Chromium, not the headless shell: MV3 extensions do not load there.
    headless: false,
    args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
  })
  const page = await context.newPage()
  const requested: string[] = []
  page.on("request", (request) => requested.push(request.url()))
  await page.goto("/e2e/mock-chat.html")
  await page.locator("#prompt-textarea").waitFor()
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"))
  const started = await worker.evaluate(async () => {
    const tabs = await chrome.tabs.query({ url: "http://127.0.0.1:43123/e2e/mock-chat.html*" })
    const tab = tabs[0]
    if (!tab?.id) return { ok: false, tabs: tabs.map((item) => item.url) }
    const packet = {
      version: 1,
      requestId: "mock-1",
      providerId: "chatgpt",
      system: "Return JSON.",
      instructions: "Score every criterion and return JSON.",
      files: [{ filename: "paper.md", text: "The record states a claim a reader can check." }],
      criterionProfile: "theory",
    }
    return chrome.tabs.sendMessage(tab.id, { type: "air-web-chat-run", requestId: "mock-1", providerId: "chatgpt", packet, defenceRounds: 0 })
  })
  expect(started).toMatchObject({ started: true })
  await expect.poll(async () => page.evaluate(() => (window as unknown as { __sendClicks: number }).__sendClicks)).toBe(1)
  await expect(page.locator("#chip")).toHaveAttribute("data-attachment-state", "ready")
  await expect(page.locator("#assistant")).toContainText("summary")
  expect(requested.some((url) => /grok\.com|chatgpt\.com|claude\.ai|gemini\.google|deepseek|mistral|perplexity|copilot\.microsoft|x\.com/.test(url))).toBe(false)
  await context.close()
})

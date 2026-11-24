import { execSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { expect, test } from "@playwright/test"
import { reviewFixture, zenodoFixture } from "./review-fixture.ts"

const EXAMPLE_URL = "https://share.google/aimode/EXAMPLE"

test("landing shows the leaderboard and example-data label", async ({ page }) => {
  await page.goto("/")
  await expect(page.getByRole("heading", { name: /public board for ideas/i })).toBeVisible()
  await expect(page.getByText("Example rows are sample data, not judgements of real work.")).toBeVisible()
  await expect(page.getByRole("checkbox", { name: "Uncalibrated web-chat" })).toBeChecked()
})

test("mobile width still shows the board", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto("/")
  await expect(page.getByRole("heading", { name: /Records by AIR score/i })).toBeVisible()
})

test("embed page posts its height", async ({ page }) => {
  await page.route("http://127.0.0.1:43123/embed-host", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><script>
        window.__air = new Promise((resolve) => {
          window.addEventListener("message", (event) => {
            if (event.data && event.data.type === "air-embed-height" && event.data.height) resolve(event.data.height)
          })
        })
      </script><iframe src="/" style="width:800px;height:600px;border:0"></iframe>`,
    }),
  )
  await page.goto("/embed-host")
  const height = await page.evaluate(() => (window as unknown as { __air: Promise<number> }).__air)
  expect(height).toBeGreaterThan(200)
})

test("notices gate, mocked Zenodo, free screening, private links, and export", async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem("air-mock-free", "1"))
  await page.route("**/zenodo.org/api/records/18916931", (route) => route.fulfill({ json: zenodoFixture }))
  await page.goto("/#/review")
  await expect(page.getByTestId("notices")).toBeVisible()
  await expect(page.getByRole("button", { name: /Publish to the leaderboard/i })).toHaveCount(0)
  await page.getByRole("button", { name: /Try 10\.5281\/zenodo\.18916931/ }).click()
  await expect(page.getByRole("heading", { name: "Smoke-test record" })).toBeVisible()
  await expect(page.getByTestId("web-chat-panel")).toContainText("Review with a web chat (free, uses your own signed-in chat)")
  await expect(page.getByText("Load the extension, then reload this page.")).toBeVisible()
  await expect(page.getByTestId("web-chat-run")).toBeDisabled()
  await expect(page.getByTestId("private-links").locator("input").first()).toHaveValue(EXAMPLE_URL)
  await page.getByTestId("free-review").click()
  const card = page.getByTestId("report-card")
  await expect(card).toContainText(/Free quick review/i, { timeout: 30_000 })
  await expect(card).not.toContainText("share.google")
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    card.getByRole("button", { name: "Download JSON" }).click(),
  ])
  const body = readFileSync(await download.path(), "utf8")
  expect(body).not.toContain("share.google")
  expect(body).toContain("privateContextCount")
})

test("in-depth review uses a mocked provider and can open an issue round", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      "air.settings.v1",
      JSON.stringify({
        remember: true,
        baseUrls: {},
        models: {},
        demoMode: false,
        nodeId: "node-e2e",
        nodeName: "e2e-node",
        orcid: "",
        authorName: "E2E",
        customProfiles: [],
        customCriteria: null,
      }),
    )
    localStorage.setItem("air.keys.v1", JSON.stringify({ xai: "test-key" }))
  })
  await page.route("**/zenodo.org/api/records/18916931**", (route) => route.fulfill({ json: zenodoFixture }))
  await page.route("**/api.x.ai/**", async (route) => {
    const body = route.request().postData() ?? ""
    const content = body.includes("independent check")
      ? { verdict: "pass", summary: "The reading is defensible against the quoted record and does not rely on a chat link.", judgements: [], errorsFound: [], failureModes: [] }
      : reviewFixture
    await route.fulfill({ json: { choices: [{ message: { content: JSON.stringify(content) } }] } })
  })
  await page.goto("/#/review")
  await page.getByRole("button", { name: /Try 10\.5281\/zenodo\.18916931/ }).click()
  await expect(page.getByRole("heading", { name: "Smoke-test record" })).toBeVisible()
  const boxes = page.getByTestId("notices").getByRole("checkbox")
  await boxes.nth(0).check()
  await boxes.nth(1).check()
  await boxes.nth(2).check()
  await boxes.nth(3).check()
  await page.getByRole("checkbox", { name: /GPT gpt-4\.1/ }).uncheck()
  await page.getByRole("checkbox", { name: /Claude / }).uncheck()
  await page.getByRole("checkbox", { name: /Gemini / }).uncheck()
  await page.getByTestId("indepth-review").click()
  await expect(page.getByTestId("report-card")).toContainText(/Overall/i, { timeout: 30_000 })
  await page.getByRole("checkbox", { name: /Publish these readings/i }).check()
  await page.getByRole("button", { name: "Publish to the leaderboard" }).click()
  await page.getByRole("link", { name: "Open the record page" }).click()
  await expect(page.getByTestId("tier-ladder")).toContainText(/In-depth/i)
  await page.locator("summary", { hasText: "decisive check" }).click()
  await page.getByLabel("Response").fill("The publication already quotes the nightly yield.")
  await page.getByRole("button", { name: "Post a response" }).click()
  await expect(page.getByText("The publication already quotes the nightly yield.")).toBeVisible()
  await page.locator("summary", { hasText: "Grok" }).first().click()
  await page.getByRole("button", { name: "Draft a check" }).click()
  await expect(page.getByRole("button", { name: "Submit independent check" })).toBeVisible({ timeout: 30_000 })
  await page.getByRole("button", { name: "Submit independent check" }).click()
  await expect(page.getByText(/Check submitted/i)).toBeVisible()
})

test("live Zenodo record, with a mocked fallback if the network fails", async ({ request, page }) => {
  let live = false
  try {
    const response = await request.get("https://zenodo.org/api/records/18916931", {
      headers: { accept: "application/json", "user-agent": "AIR-Peer-Review-smoke" },
      timeout: 20_000,
    })
    live = response.ok()
  } catch {
    live = false
  }
  if (!live) {
    await page.route("**/zenodo.org/api/records/**", (route) => route.fulfill({ json: zenodoFixture }))
  }
  await page.goto("/#/review")
  await page.getByRole("button", { name: /Try 10\.5281\/zenodo\.18916931/ }).click()
  await expect(page.getByText("10.5281/zenodo.18916931")).toBeVisible({ timeout: 30_000 })
})

test("production build keeps the GitHub Pages base path", () => {
  execSync("npx vite build", { stdio: "inherit" })
  const html = readFileSync("dist/index.html", "utf8")
  expect(html).toContain("/open-ai-peer-review/")
})

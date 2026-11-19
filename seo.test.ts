import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

const html = readFileSync(new URL("./index.html", import.meta.url), "utf8")
const description =
  "Free, open AI peer review for Zenodo papers. Bring your own AI key, get scored against AIR criteria, and see a global idea ranking corroborated by independent AI reviewers."

describe("public metadata", () => {
  it("sets the title, description, canonical, language, and theme colour", () => {
    expect(html).toContain('lang="en-GB"')
    expect(html).toContain("<title>Open AI Peer Review &amp; Idea Rankings | SCG-HMH</title>")
    expect(html).toContain(`content="${description}"`)
    expect(html).toContain('rel="canonical" href="https://morgansmart-alt.github.io/open-ai-peer-review/"')
    expect(html).toContain('name="theme-color" content="#0f5f5b"')
    expect(html).toContain('rel="preconnect" href="https://lotswxboafsenmszijpf.supabase.co"')
  })

  it("includes Open Graph and Twitter large-image cards", () => {
    expect(html).toContain('property="og:title" content="Open AI Peer Review &amp; Idea Rankings | SCG-HMH"')
    expect(html).toContain('property="og:image" content="https://morgansmart-alt.github.io/open-ai-peer-review/og-image.png"')
    expect(html).toContain('property="og:image:width" content="1200"')
    expect(html).toContain('property="og:image:height" content="630"')
    expect(html).toContain('name="twitter:card" content="summary_large_image"')
    expect(html).toContain('name="twitter:image" content="https://morgansmart-alt.github.io/open-ai-peer-review/og-image.png"')
  })

  it("describes a free web application by Morgan Elliott Smart", () => {
    expect(html).toContain('"@type": "WebApplication"')
    expect(html).toContain('"isAccessibleForFree": true')
    expect(html).toContain('"name": "Morgan Elliott Smart"')
    expect(html).toContain("https://www.the-scg-hmh-concepts.co.uk/ai-peer-review")
  })

  it("ships robots, a sitemap, and a 1200 by 630 share image", () => {
    const robots = readFileSync(new URL("./public/robots.txt", import.meta.url), "utf8")
    const sitemap = readFileSync(new URL("./public/sitemap.xml", import.meta.url), "utf8")
    const image = readFileSync(new URL("./public/og-image.png", import.meta.url))
    expect(robots).toContain("Sitemap: https://morgansmart-alt.github.io/open-ai-peer-review/sitemap.xml")
    expect(sitemap).toContain("<loc>https://morgansmart-alt.github.io/open-ai-peer-review/</loc>")
    expect(image.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a")
    expect(image.readUInt32BE(16)).toBe(1200)
    expect(image.readUInt32BE(20)).toBe(630)
  })
})

import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

const html = readFileSync(new URL("./index.html", import.meta.url), "utf8")
const description =
  "AIR is a free public board for work that already has a DOI. Submit a Zenodo record, get AI and human reviews against published criteria, and improve the work. AIR does not replace journal peer review. Calibrated scores and free web-chat scores are labelled apart."

describe("public metadata", () => {
  it("sets the title, description, canonical, language, and theme colour", () => {
    expect(html).toContain('lang="en-GB"')
    expect(html).toContain("<title>Open AI Peer Review &amp; Idea Rankings</title>")
    expect(html).not.toContain("SCG-HMH")
    expect(html).not.toContain("the-scg-hmh-concepts")
    expect(html).toContain(`content="${description}"`)
    expect(html).toContain('rel="canonical" href="https://morgansmart-alt.github.io/open-ai-peer-review/"')
    expect(html).toContain('name="theme-color" content="#0f5f5b"')
    expect(html).toContain('rel="preconnect" href="https://lotswxboafsenmszijpf.supabase.co"')
  })

  it("includes Open Graph and Twitter large-image cards", () => {
    expect(html).toContain('property="og:site_name" content="AIR"')
    expect(html).toContain('property="og:title" content="Open AI Peer Review &amp; Idea Rankings"')
    expect(html).toContain('property="og:image" content="https://morgansmart-alt.github.io/open-ai-peer-review/og-image.jpg"')
    expect(html).toContain('property="og:image:type" content="image/jpeg"')
    expect(html).toContain('property="og:image:width" content="1200"')
    expect(html).toContain('property="og:image:height" content="630"')
    expect(html).toContain('name="twitter:card" content="summary_large_image"')
    expect(html).toContain('name="twitter:image" content="https://morgansmart-alt.github.io/open-ai-peer-review/og-image.jpg"')
  })

  it("describes a free web application by Morgan Elliott Smart", () => {
    expect(html).toContain('"@type": "WebApplication"')
    expect(html).toContain('"isAccessibleForFree": true')
    expect(html).toContain('"name": "Morgan Elliott Smart"')
    expect(html).not.toContain("isRelatedTo")
  })

  it("ships robots, a sitemap, and a 1200 by 630 share image", () => {
    const robots = readFileSync(new URL("./public/robots.txt", import.meta.url), "utf8")
    const sitemap = readFileSync(new URL("./public/sitemap.xml", import.meta.url), "utf8")
    const image = readFileSync(new URL("./public/og-image.jpg", import.meta.url))
    expect(robots).toContain("Sitemap: https://morgansmart-alt.github.io/open-ai-peer-review/sitemap.xml")
    expect(sitemap).toContain("<loc>https://morgansmart-alt.github.io/open-ai-peer-review/</loc>")
    expect(sitemap).toContain("<loc>https://morgansmart-alt.github.io/open-ai-peer-review/#/guide</loc>")
    expect(image.subarray(0, 3).toString("hex")).toBe("ffd8ff")
    expect(image.byteLength).toBeGreaterThan(50_000)
  })

  it("does not put the generator project on the landing, about, or guide", () => {
    const pages = [
      "./src/pages/HomePage.tsx",
      "./src/pages/MethodPage.tsx",
      "./src/pages/GuidePage.tsx",
      "./src/components/HowItWorks.tsx",
      "./src/content/guideCopy.ts",
    ]
    for (const file of pages) {
      const source = readFileSync(new URL(file, import.meta.url), "utf8")
      expect(source).not.toMatch(/SCG-HMH|the-scg-hmh|air_hero_banner|air_section_ai_reviewers|air_section_nodes/)
    }
  })
})

describe("private context migration", () => {
  it("lets anon insert a share link and does not grant anon a read", () => {
    const sql = readFileSync(new URL("./supabase/migrations/20261120000200_private_context.sql", import.meta.url), "utf8")
    expect(sql).toContain("create table if not exists air_private_context")
    expect(sql).toContain("for insert")
    expect(sql).toContain("air_my_context")
    expect(sql).toContain("encode(extensions.digest")
    expect(sql).not.toContain("air_private_context_read")
    expect(sql).not.toContain("for select")
    expect(sql).not.toContain("for update")
    expect(sql).not.toContain("for delete")
  })
})

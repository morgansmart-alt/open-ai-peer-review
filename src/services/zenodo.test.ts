import { describe, expect, it } from "vitest"
import { filesAreRestricted, normalizeZenodoRecord, parseRecordRef, stripHtml } from "./zenodo.ts"

const legacy = {
  id: 18916931,
  conceptrecid: "18916930",
  doi: "10.5281/zenodo.18916931",
  conceptdoi: "10.5281/zenodo.18916930",
  metadata: {
    title: "A public note",
    publication_date: "2026-03-09",
    description: "<p>Line one.<br>Line two.</p>",
    access_right: "open",
    creators: [{ name: "Smart, Morgan", affiliation: null, orcid: "0000-0001-2345-6789" }],
    keywords: ["energy"],
    license: { id: "cc-by-4.0" },
    resource_type: { title: "Publication", type: "publication" },
  },
  files: [
    {
      key: "notes.pdf",
      size: 1200,
      checksum: "md5:abc",
      links: { self: "https://zenodo.org/api/records/18916931/files/notes.pdf/content" },
    },
  ],
  links: { self_html: "https://zenodo.org/records/18916931" },
}

const invenio = {
  id: "42",
  parent: { id: "41" },
  metadata: {
    title: "Modern record",
    version: "v3",
    publication_date: "2026-01-02",
    description: "Plain already.",
    creators: [
      {
        person_or_org: {
          name: "Ada Lovelace",
          identifiers: [{ scheme: "orcid", identifier: "0000-0002-1825-0097" }],
        },
        affiliations: [{ name: "Analytical Engines" }],
      },
    ],
    rights: [{ id: "cc-by-4.0" }],
    subjects: [{ title: "calculation" }],
    related_identifiers: [{ identifier: "10.5281/zenodo.10", relation: "cites", scheme: "doi" }],
  },
  access: { record: "public", files: "restricted" },
  files: {
    entries: {
      "readme.md": { key: "readme.md", size: 80, links: { content: "https://zenodo.org/api/records/42/files/readme.md/content" } },
    },
  },
}

describe("parseRecordRef", () => {
  it("accepts links, DOIs, and bare ids", () => {
    expect(parseRecordRef("https://zenodo.org/records/18916931")?.recordId).toBe("18916931")
    expect(parseRecordRef("https://zenodo.org/record/18916931/")?.recordId).toBe("18916931")
    expect(parseRecordRef("https://doi.org/10.5281/zenodo.18916931")?.doi).toBe("10.5281/zenodo.18916931")
    expect(parseRecordRef("10.5281/zenodo.18916931")?.recordId).toBe("18916931")
    expect(parseRecordRef("zenodo.18916931")?.recordId).toBe("18916931")
    expect(parseRecordRef("18916931")?.recordId).toBe("18916931")
    expect(parseRecordRef("https://example.com/nope")).toBeNull()
  })
})

describe("normalizeZenodoRecord", () => {
  it("reads the legacy records payload", () => {
    const record = normalizeZenodoRecord(legacy)
    expect(record.id).toBe("18916931")
    expect(record.title).toBe("A public note")
    expect(record.conceptId).toBe("18916930")
    expect(record.description).toBe("Line one.\nLine two.")
    expect(record.creators[0]?.orcid).toBe("0000-0001-2345-6789")
    expect(record.license).toBe("cc-by-4.0")
    expect(record.files[0]?.downloadUrl).toContain("/content")
    expect(record.recordVersion).toBe("18916931@2026-03-09")
    expect(filesAreRestricted(record)).toBe(false)
  })

  it("reads an InvenioRDM payload, including restricted files", () => {
    const record = normalizeZenodoRecord(invenio)
    expect(record.version).toBe("v3")
    expect(record.recordVersion).toBe("v3")
    expect(record.creators[0]?.name).toBe("Ada Lovelace")
    expect(record.creators[0]?.orcid).toBe("0000-0002-1825-0097")
    expect(record.keywords).toEqual(["calculation"])
    expect(record.related[0]?.relation).toBe("cites")
    expect(record.files.map((file) => file.key)).toEqual(["readme.md"])
    expect(filesAreRestricted(record)).toBe(true)
  })
})

describe("stripHtml", () => {
  it("drops tags and decodes entities", () => {
    expect(stripHtml("<p>A &amp; B</p>")).toBe("A & B")
  })
})

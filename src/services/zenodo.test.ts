import { describe, expect, it } from "vitest"
import { defaultFileSelection, filesAreRestricted, formatRecordStamp, normalizeZenodoRecord, parseRecordRef, stripHtml, type ZenodoFile } from "./zenodo.ts"

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

function file(key: string, size: number): ZenodoFile {
  const extension = key.split(".").pop()?.toLowerCase() ?? ""
  return { key, size, downloadUrl: "", extension }
}

describe("defaultFileSelection", () => {
  it("preselects the main manuscript of a 12-file record like zenodo 23773780", () => {
    const files = [
      file("01_SCG_HMH_Closed_Derivative_Chain_v8.pdf", 3_448_535),
      file("02_SCG_HMH_v8_Section_6.6_Cold_Side.pdf", 3_501_670),
      file("03_SUPPLEMENTARY_Errata_v7_to_v8.pdf", 47_921),
      file("04_SUPPLEMENTARY_Key_Results_Summary.pdf", 46_847),
      file("05_SUPPLEMENTARY_Bench_Validation_Plan.pdf", 39_429),
      file("06_SUPPLEMENTARY_Open_Questions.pdf", 44_508),
      file("07_SUPPLEMENTARY_Reproducibility.pdf", 59_406),
      file("08_SUPPLEMENTARY_Transistor_Physics_and_Data_Centres.pdf", 78_625),
      file("09_SUPPLEMENTARY_Further_Physics_Exploitations.pdf", 192_717),
      file("10_SCG_HMH_Technology_Readiness_Benchmarks_v5.pdf", 373_135),
      file("11_SCG_HMH_v8_reproducibility_scripts_and_outputs.zip", 846_580),
      file("README.md", 1_148),
    ]
    expect(defaultFileSelection(files)).toEqual([
      "01_SCG_HMH_Closed_Derivative_Chain_v8.pdf",
      "README.md",
      "03_SUPPLEMENTARY_Errata_v7_to_v8.pdf",
      "04_SUPPLEMENTARY_Key_Results_Summary.pdf",
      "05_SUPPLEMENTARY_Bench_Validation_Plan.pdf",
      "06_SUPPLEMENTARY_Open_Questions.pdf",
      "07_SUPPLEMENTARY_Reproducibility.pdf",
      "08_SUPPLEMENTARY_Transistor_Physics_and_Data_Centres.pdf",
      "09_SUPPLEMENTARY_Further_Physics_Exploitations.pdf",
    ])
  })

  it("uses the largest non-supplement PDF when nothing is numbered 01", () => {
    expect(
      defaultFileSelection([
        file("notes.pdf", 20_000),
        file("paper.pdf", 2_000_000),
        file("SUPPLEMENTARY_table.pdf", 10_000),
        file("README.md", 800),
      ]),
    ).toEqual(["paper.pdf", "README.md", "SUPPLEMENTARY_table.pdf"])
  })

  it("still selects a readable file when the record is only supplements", () => {
    expect(defaultFileSelection([file("03_SUPPLEMENTARY_Errata.pdf", 12_000), file("04_SUPPLEMENTARY_Notes.pdf", 80_000)])).toEqual([
      "03_SUPPLEMENTARY_Errata.pdf",
      "04_SUPPLEMENTARY_Notes.pdf",
    ])
  })
})

describe("formatRecordStamp", () => {
  it("uses the Zenodo version when one is present, otherwise the record id and date", () => {
    expect(formatRecordStamp({ version: "v8", id: "23773780", publicationDate: "2026-10-29" })).toBe("version v8 · 2026-10-29")
    expect(formatRecordStamp({ version: "", id: "23773780", publicationDate: "2026-10-29" })).toBe("Record 23773780 · 2026-10-29")
  })
})

describe("stripHtml", () => {
  it("drops tags and decodes entities", () => {
    expect(stripHtml("<p>A &amp; B</p>")).toBe("A & B")
  })
})

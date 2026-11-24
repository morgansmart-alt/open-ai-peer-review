import { describe, expect, it, vi } from "vitest"
import { downloadArrayBuffer } from "./extractText.ts"
import { fileSelectionFor, rememberFileSelection } from "./fileSelection.ts"
import {
  ZenodoError,
  defaultFileSelection,
  fetchRecordVersions,
  fetchZenodoRecord,
  filesAreRestricted,
  formatRecordStamp,
  normalizeZenodoRecord,
  parseRecordRef,
  selectedReadableFiles,
  stripHtml,
  zenodoClientHeaders,
  zenodoHttpMessage,
  zenodoTransport,
  type ZenodoFile,
} from "./zenodo.ts"

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
      "03_SUPPLEMENTARY_Errata_v7_to_v8.pdf",
      "04_SUPPLEMENTARY_Key_Results_Summary.pdf",
      "05_SUPPLEMENTARY_Bench_Validation_Plan.pdf",
      "06_SUPPLEMENTARY_Open_Questions.pdf",
      "07_SUPPLEMENTARY_Reproducibility.pdf",
      "08_SUPPLEMENTARY_Transistor_Physics_and_Data_Centres.pdf",
      "09_SUPPLEMENTARY_Further_Physics_Exploitations.pdf",
      "02_SCG_HMH_v8_Section_6.6_Cold_Side.pdf",
      "10_SCG_HMH_Technology_Readiness_Benchmarks_v5.pdf",
      "README.md",
    ])
    expect(defaultFileSelection(files)).not.toContain("11_SCG_HMH_v8_reproducibility_scripts_and_outputs.zip")
  })

  it("keeps other PDFs that fit after the primary manuscript", () => {
    expect(
      defaultFileSelection([
        file("notes.pdf", 20_000),
        file("paper.pdf", 2_000_000),
        file("chapter.pdf", 400_000),
        file("SUPPLEMENTARY_table.pdf", 10_000),
        file("README.md", 800),
        file("diagram.png", 50_000),
      ]),
    ).toEqual(["paper.pdf", "SUPPLEMENTARY_table.pdf", "chapter.pdf", "notes.pdf", "README.md"])
    expect(
      defaultFileSelection([
        file("01_paper.pdf", 3_000_000),
        file("02_chapter.pdf", 6_000_000),
        file("03_notes.pdf", 100_000),
        file("plot.png", 10_000),
      ]),
    ).toEqual(["01_paper.pdf", "03_notes.pdf"])
  })

  it("preselects the same paper as PDF, markdown, and tex, and skips images and zips", () => {
    expect(
      defaultFileSelection([
        file("manuscript.pdf", 250_000),
        file("manuscript.md", 8_000),
        file("manuscript.tex", 12_000),
        file("figure.png", 40_000),
        file("sources.zip", 30_000),
      ]),
    ).toEqual(["manuscript.pdf", "manuscript.md", "manuscript.tex"])
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

describe("selected files for one version", () => {
  it("ignores keys that are not on this record", () => {
    const files = [file("new.pdf", 1_000), file("notes.md", 100), file("pack.zip", 100), file("fig.png", 100)]
    expect(selectedReadableFiles(files, ["old.pdf", "new.pdf", "fig.png"]).map((item) => item.key)).toEqual(["new.pdf"])
    expect(defaultFileSelection(files)).toEqual(["new.pdf", "notes.md"])
  })

  it("remembers a selection for that record and falls back when it does not fit the files", () => {
    const storage = memoryStore()
    const files = [file("paper.pdf", 1_000), file("notes.md", 100), file("extra.pdf", 500)]
    expect(fileSelectionFor("rec-1", files, storage)).toEqual(["paper.pdf", "extra.pdf", "notes.md"])
    rememberFileSelection("rec-1", ["notes.md"], storage)
    expect(fileSelectionFor("rec-1", files, storage)).toEqual(["notes.md"])
    expect(fileSelectionFor("rec-2", files, storage)).toEqual(["paper.pdf", "extra.pdf", "notes.md"])
    rememberFileSelection("rec-1", ["missing.pdf"], storage)
    expect(fileSelectionFor("rec-1", files, storage)).toEqual(["paper.pdf", "extra.pdf", "notes.md"])
  })
})

function memoryStore() {
  const map = new Map<string, string>()
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value)
    },
  }
}

function searchHit(id: number) {
  return {
    id: String(id),
    doi: `10.5281/zenodo.${id}`,
    metadata: { title: `Version ${id}`, publication_date: "2026-01-01", version: `v${id}` },
  }
}

describe("fetchRecordVersions", () => {
  it("follows pages past the first 20 versions", async () => {
    const page2 = "https://zenodo.org/api/records?page=2&size=100"
    const page3 = "https://zenodo.org/api/records?page=3&size=100"
    const pages = [
      { hits: { hits: Array.from({ length: 20 }, (_, index) => searchHit(index + 1)) }, links: { next: page2 } },
      { hits: { hits: Array.from({ length: 20 }, (_, index) => searchHit(index + 21)) }, links: { next: page3 } },
      { hits: { hits: Array.from({ length: 3 }, (_, index) => searchHit(index + 41)) }, links: {} },
    ]
    const urls: string[] = []
    vi.stubGlobal("fetch", async (url: string) => {
      urls.push(url)
      return { ok: true, status: 200, json: async () => pages[urls.length - 1] }
    })
    try {
      const versions = await fetchRecordVersions("18916930")
      expect(versions).toHaveLength(43)
      expect(versions[0]?.id).toBe("1")
      expect(versions[42]?.id).toBe("43")
      expect(new Set(versions.map((version) => version.id)).size).toBe(43)
      expect(urls).toHaveLength(3)
      expect(urls[0]).toContain("size=100")
      expect(urls[1]).toBe(page2)
      expect(urls[2]).toBe(page3)
    } finally {
      vi.unstubAllGlobals()
    }
  })
})

describe("Zenodo 403", () => {
  it("describes an open record as rate limiting and a closed one as restricted", () => {
    const open = zenodoHttpMessage(403, { record: "public", files: "public" })
    expect(open).toMatch(/open access/)
    expect(open).toMatch(/rate limiting or a temporary block/)
    expect(open).toMatch(/try again/i)
    expect(open).not.toMatch(/restricted|embargoed/)
    expect(zenodoHttpMessage(403, null)).not.toMatch(/restricted|embargoed/)
    expect(zenodoHttpMessage(403, { record: "public", files: "restricted" }, "file")).toMatch(/restricted or embargoed/)
    expect(zenodoHttpMessage(401, null)).toMatch(/restricted or embargoed/)
  })

  it("sends an identifying header only outside the browser", () => {
    expect(zenodoClientHeaders("json").Accept).toBe("application/json")
    expect(zenodoClientHeaders("json")["User-Agent"]).toMatch(/open-ai-peer-review/)
    expect(zenodoClientHeaders("bytes").Accept).toBeUndefined()
    vi.stubGlobal("window", {})
    try {
      expect(zenodoClientHeaders("json")).toEqual({ Accept: "application/json" })
      expect(zenodoClientHeaders("bytes")).toEqual({})
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it("retries an open-record 403 and then reads the record", async () => {
    const saved = [...zenodoTransport.delaysMs]
    zenodoTransport.delaysMs = [0, 0]
    let calls = 0
    vi.stubGlobal("fetch", async () => {
      calls += 1
      if (calls < 3) return { ok: false, status: 403, json: async () => ({}) }
      return { ok: true, status: 200, json: async () => legacy }
    })
    try {
      const record = await fetchZenodoRecord("18916931")
      expect(record.id).toBe("18916931")
      expect(calls).toBe(3)
    } finally {
      zenodoTransport.delaysMs = saved
      vi.unstubAllGlobals()
    }
  })

  it("does not call a failed open-record 403 an embargo", async () => {
    const saved = [...zenodoTransport.delaysMs]
    zenodoTransport.delaysMs = [0, 0]
    vi.stubGlobal("fetch", async () => ({ ok: false, status: 403, json: async () => ({}) }))
    try {
      await expect(fetchZenodoRecord("18916931")).rejects.toBeInstanceOf(ZenodoError)
      await expect(fetchZenodoRecord("18916931")).rejects.toThrow(/rate limiting or a temporary block/)
      await expect(fetchZenodoRecord("18916931")).rejects.not.toThrow(/restricted|embargoed/)
    } finally {
      zenodoTransport.delaysMs = saved
      vi.unstubAllGlobals()
    }
  })

  it("retries an open file and does not retry a restricted one", async () => {
    const saved = [...zenodoTransport.delaysMs]
    zenodoTransport.delaysMs = [0, 0]
    let calls = 0
    vi.stubGlobal("fetch", async () => {
      calls += 1
      return { ok: false, status: 403 }
    })
    try {
      await expect(downloadArrayBuffer("https://zenodo.org/api/records/1/files/a.pdf/content", { record: "public", files: "public" })).rejects.toThrow(/open access/)
      expect(calls).toBe(3)
      calls = 0
      await expect(downloadArrayBuffer("https://zenodo.org/api/records/1/files/a.pdf/content", { record: "public", files: "restricted" })).rejects.toThrow(/restricted or embargoed/)
      expect(calls).toBe(1)
    } finally {
      zenodoTransport.delaysMs = saved
      vi.unstubAllGlobals()
    }
  })
})

describe("stripHtml", () => {
  it("drops tags and decodes entities", () => {
    expect(stripHtml("<p>A &amp; B</p>")).toBe("A & B")
  })
})

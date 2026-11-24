import { describe, expect, it } from "vitest"
import type { ZenodoRecord } from "./zenodo.ts"
import { prepareRecheck } from "./recheck.ts"

function record(partial: Pick<ZenodoRecord, "id" | "doi" | "description" | "recordVersion"> & { text?: string }): ZenodoRecord {
  return {
    id: partial.id,
    conceptId: "concept",
    doi: partial.doi,
    conceptDoi: "10.5281/zenodo.concept",
    title: "Work",
    creators: [],
    description: partial.description,
    descriptionHtml: partial.description,
    keywords: [],
    version: "",
    recordVersion: partial.recordVersion,
    license: "",
    publicationDate: "2026-01-01",
    related: [],
    resourceType: "Publication",
    access: { record: "public", files: "public" },
    files: partial.text ? [{ key: "paper.txt", size: 20, downloadUrl: "https://zenodo.org/files/paper.txt", extension: "txt" }] : [],
    htmlUrl: "",
  }
}

describe("prepareRecheck", () => {
  it("loads and searches the newer version instead of relabelling the current text", async () => {
    const current = record({
      id: "1",
      doi: "10.5281/zenodo.1",
      description: "Old description that should not be searched.",
      recordVersion: "v1",
      text: "old",
    })
    const newer = record({
      id: "2",
      doi: "10.5281/zenodo.2",
      description: "New description.",
      recordVersion: "v2",
      text: "new",
    })
    const prepared = await prepareRecheck({
      current,
      loadedDocuments: [{ filename: "old.txt", text: "The old publication says the yield was estimated only." }],
      targetRecordId: "2",
      issueRecordVersion: "v1",
      fetchRecord: async (id) => {
        expect(id).toBe("2")
        return newer
      },
      loadDocuments: async (target) => {
        expect(target.id).toBe("2")
        return [{ filename: "new.txt", text: "The new publication measures the nightly yield in litres." }]
      },
    })
    expect(prepared.checkedVersionId).toBe("10.5281/zenodo.2")
    expect(prepared.checkedVersionId).not.toContain("@")
    expect(prepared.documents.map((document) => document.filename)).toEqual(["new.txt"])
    expect(prepared.documents.some((document) => document.text.includes("old publication"))).toBe(false)
    expect(prepared.target.description).toBe("New description.")
  })
})

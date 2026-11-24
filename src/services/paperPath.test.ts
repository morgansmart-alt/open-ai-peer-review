import { describe, expect, it } from "vitest"
import { hashUrlForBarePaperPath, paperRecordIdFromPath } from "./paperPath.ts"

describe("bare paper paths", () => {
  it("reads a paper id and leaves the text route and the static file alone", () => {
    expect(paperRecordIdFromPath("/open-ai-peer-review/paper/22826")).toBe("22826")
    expect(paperRecordIdFromPath("/paper/22826/")).toBe("22826")
    expect(paperRecordIdFromPath("/open-ai-peer-review/paper/22826/text")).toBeNull()
    expect(paperRecordIdFromPath("/open-ai-peer-review/paper-text/22826.txt")).toBeNull()
    expect(paperRecordIdFromPath("/open-ai-peer-review/")).toBeNull()
  })

  it("maps the path onto the hash paper page", () => {
    expect(hashUrlForBarePaperPath("/open-ai-peer-review/paper/22826", "/open-ai-peer-review/")).toBe(
      "/open-ai-peer-review/#/paper/22826",
    )
    expect(hashUrlForBarePaperPath("/paper/sample-fog", "/", "?from=link")).toBe("/#/paper/sample-fog?from=link")
    expect(hashUrlForBarePaperPath("/open-ai-peer-review/paper/22826/text", "/open-ai-peer-review/")).toBeNull()
  })
})

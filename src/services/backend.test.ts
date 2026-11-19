import { describe, expect, it } from "vitest"
import { publicPayload } from "./backend.ts"

describe("publicPayload", () => {
  it("drops private chat addresses and keeps the count", () => {
    const stored = publicPayload({
      id: "r1",
      privateContextCount: 1,
      conversationLinks: [{ url: "https://share.google/aimode/EXAMPLE", provider: "Google AI Mode", note: "method" }],
      chatUrl: "https://share.google/aimode/EXAMPLE",
      chatNote: "method",
      privateLinks: ["https://share.google/aimode/EXAMPLE"],
    })
    const body = JSON.stringify(stored)
    expect(body).not.toContain("share.google")
    expect(body).not.toContain("EXAMPLE")
    expect(stored.privateContextCount).toBe(1)
    expect(body).not.toContain("conversationLinks")
  })
})

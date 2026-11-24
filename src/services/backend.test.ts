import { describe, expect, it } from "vitest"
import { assembleRemoteBoard, publicPayload, withTimeout } from "./backend.ts"

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

  it("keeps web-chat rows when the ranked board does not answer", async () => {
    const loaded = assembleRemoteBoard({
      reviews: null,
      reviewsError: "Ranked reviews did not answer within 20 seconds.",
      nodes: [],
      issues: [],
      claims: [],
      webChat: [],
      webChatError: null,
    })
    expect(loaded.db.reviews).toEqual([])
    expect(loaded.error).toContain("Ranked reviews")
    await expect(withTimeout(new Promise(() => undefined), 15, "Ranked reviews")).rejects.toThrow(/20|15|did not answer/)
  })
})

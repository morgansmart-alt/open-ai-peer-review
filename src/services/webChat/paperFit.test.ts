import { describe, expect, it } from "vitest"
import { fitPaperText, GROK_X_MESSAGE_CHARS, omissionNote, packTextPage, paperDeliveryPlan, paperPartMessage, paperParts } from "./paperFit.ts"
import { linkReadingPrompt } from "./paperText.ts"

describe("long paper text", () => {
  it("keeps the results and drops the references when the paper is longer than the send cap", () => {
    const paper = [
      "Abstract",
      "A short abstract of the study.",
      "1 Introduction",
      "The coast is the setting.",
      "2 Methods",
      "M".repeat(80),
      "2.3 Results",
      "The measured yield is 1.8 litres.",
      "3 Discussion",
      "The yield holds in the dry season.",
      "4 Conclusions",
      "The method can be repeated.",
      "References",
      "R".repeat(80),
    ].join("\n")
    const fitted = fitPaperText(paper, 220)
    expect(fitted.capped).toBe(true)
    expect(fitted.text).toContain("The measured yield is 1.8 litres.")
    expect(fitted.text).toContain("The method can be repeated.")
    expect(fitted.text).not.toContain("R".repeat(40))
    expect(fitted.omitted.some((title) => /references/i.test(title))).toBe(true)
    expect(fitted.sent).toBeLessThanOrEqual(220)
    expect(omissionNote(fitted.omitted)).toContain("Do not penalise")
    const parts = paperParts(`${"alpha ".repeat(30)}`, 40)
    expect(parts.length).toBeGreaterThan(1)
    expect(paperPartMessage(1, parts.length, parts[0] ?? "")).toContain("Reply only: OK")
    const packed = packTextPage(`${"A".repeat(50)}${"Z".repeat(50)}`, 40)
    expect(packed.total).toBe(100)
    expect(packed.body.startsWith("A")).toBe(true)
    expect(packed.body.endsWith("Z")).toBe(true)
    expect(packed.body).toContain("omitted a middle stretch")
    const heavy = `${paper}\nReferences\n${"Smith 2019. ".repeat(12_000)}`
    const trimmed = paperDeliveryPlan({
      url: "https://example.test/paper-text?id=1",
      instructions: "Score the paper.",
      paper: heavy,
      sourceChars: heavy.length,
      oneMessage: GROK_X_MESSAGE_CHARS,
      prompt: linkReadingPrompt,
    })
    expect(trimmed.texts[0]).toContain("Do not penalise")
    expect(trimmed.texts.some((text) => text.includes("The measured yield is 1.8 litres."))).toBe(true)
    expect(trimmed.texts.join("\n")).not.toContain("Smith 2019.")
    expect(trimmed.notice).toContain("capped")
    const long = `2.3 Results\nThe measured yield is 1.8 litres.\n${"Finding ".repeat(5000)}`
    const split = paperDeliveryPlan({
      url: "https://example.test/paper-text?id=1",
      instructions: "Score the paper.",
      paper: long,
      sourceChars: long.length,
      oneMessage: GROK_X_MESSAGE_CHARS,
      prompt: linkReadingPrompt,
    })
    expect(split.texts.length).toBeGreaterThan(1)
    expect(split.texts[0]).toContain("Reply only: OK")
    expect(split.texts.some((text) => text.includes("The measured yield is 1.8 litres."))).toBe(true)
    expect(split.texts.at(-1)).toContain("sent in the messages above")
    expect(split.notice).not.toContain("capped")
  })
})

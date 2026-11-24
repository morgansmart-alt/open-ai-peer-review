import { describe, expect, it } from "vitest"
import { altsFromStructTree, captionsFromText, figureBlock, FIGURES_NOT_READ } from "./figures.ts"

describe("figure captions", () => {
  it("keeps captions and alt text, and says when figures were not read", () => {
    const text = "Intro\nFigure 1. The cold-side loop at 582 kg/s.\nMore text\nFig. 2 The bench."
    expect(captionsFromText(text)).toEqual(["Figure 1. The cold-side loop at 582 kg/s.", "Fig. 2 The bench."])
    const alts = altsFromStructTree({ role: "Document", children: [{ role: "Figure", alt: "Schematic of the loop" }, { role: "P", children: [] }] })
    expect(alts).toEqual(["Schematic of the loop"])
    const block = figureBlock({ captions: captionsFromText(text), alts, sawImage: true })
    expect(block).toContain(FIGURES_NOT_READ)
    expect(block).toContain("Schematic of the loop")
    expect(block).toContain("Figure 1.")
    expect(figureBlock({ captions: [], alts: [], sawImage: false })).toBeNull()
    expect(figureBlock({ captions: [], alts: [], sawImage: true })).toContain("No figure caption")
  })
})

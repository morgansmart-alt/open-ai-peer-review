/** Shown wherever image pixels were not scored, so availability cannot treat them as read. */
export const FIGURES_NOT_READ = "Figures not read. Image pixels were not scored."

export function captionsFromText(text: string): string[] {
  const found: string[] = []
  for (const line of text.split(/\n+/)) {
    const trimmed = line.replace(/\s+/g, " ").trim()
    if (/^(figure|fig\.)\s*\d+\b/i.test(trimmed) && trimmed.length > 8) found.push(trimmed.slice(0, 400))
    if (found.length >= 30) break
  }
  return found
}

export function altsFromStructTree(node: unknown, out: string[] = []): string[] {
  if (!node || typeof node !== "object") return out
  const record = node as { alt?: unknown; children?: unknown }
  if (typeof record.alt === "string" && record.alt.trim()) out.push(record.alt.trim().slice(0, 400))
  if (Array.isArray(record.children)) {
    for (const child of record.children) altsFromStructTree(child, out)
  }
  return out
}

export function figureBlock(input: { captions: string[]; alts: string[]; sawImage: boolean }): string | null {
  if (!input.sawImage && input.captions.length === 0 && input.alts.length === 0) return null
  const lines = [FIGURES_NOT_READ]
  if (input.captions.length > 0) lines.push("Figure captions:", ...input.captions)
  else lines.push("No figure caption was found in the text layer.")
  if (input.alts.length > 0) lines.push("Alt text:", ...input.alts)
  else if (input.sawImage) lines.push("No alt text was exposed by the PDF.")
  return lines.join("\n")
}

import { fullTextIncludedLine } from "./paperText.ts"

/** The background returns at most this much of a page, plus the real length. */
export const TEXT_PAGE_LIMIT = 400_000

/** One Grok on X message held about 32,000 raw characters. Parts stay under that. */
export const GROK_X_MESSAGE_CHARS = 32_000

export function packTextPage(full: string, limit = TEXT_PAGE_LIMIT): { body: string; total: number } {
  if (full.length <= limit) return { body: full, total: full.length }
  const tail = Math.min(100_000, Math.floor(limit / 3))
  const head = Math.max(0, limit - tail)
  return {
    body: `${full.slice(0, head).trimEnd()}\n\n[AIR omitted a middle stretch of this long file.]\n\n${full.slice(-tail).trimStart()}`,
    total: full.length,
  }
}
/** A paper longer than this is trimmed, keeping the later sections. */
export const PAPER_SEND_CAP = 120_000

const SECTION_KIND =
  /^(?:#{1,6}\s+)?(?:\d+(?:\.\d+)*\s+)?(references|bibliography|works cited|appendix|appendices|supplementary|supplement|results|discussion|conclusions?|abstract|introduction|methods?)\b/i

type SectionKind = "references" | "appendix" | "results" | "discussion" | "conclusion" | "abstract" | "introduction" | "methods" | "other"

export interface PaperSection {
  title: string
  kind: SectionKind
  text: string
}

export interface FittedPaper {
  text: string
  sent: number
  source: number
  capped: boolean
  omitted: string[]
}

function kindOf(title: string): SectionKind {
  const match = title.match(SECTION_KIND)
  const word = (match?.[1] ?? "").toLowerCase()
  if (word === "references" || word === "bibliography" || word === "works cited") return "references"
  if (word === "appendix" || word === "appendices" || word === "supplementary" || word === "supplement") return "appendix"
  if (word === "results") return "results"
  if (word === "discussion") return "discussion"
  if (word.startsWith("conclusion")) return "conclusion"
  if (word === "abstract") return "abstract"
  if (word === "introduction") return "introduction"
  if (word.startsWith("method")) return "methods"
  return "other"
}

export function paperSections(paper: string): PaperSection[] {
  const lines = paper.split("\n")
  const sections: PaperSection[] = []
  let title = ""
  let kind: SectionKind = "other"
  let buffer: string[] = []
  const flush = () => {
    const text = buffer.join("\n").trim()
    if (text || title) sections.push({ title: title || "Opening", kind, text: [title, text].filter(Boolean).join("\n") })
  }
  for (const line of lines) {
    if (SECTION_KIND.test(line.trim()) && (buffer.length > 0 || title)) {
      flush()
      title = line.trim()
      kind = kindOf(title)
      buffer = []
      continue
    }
    if (!title && !buffer.length && SECTION_KIND.test(line.trim())) {
      title = line.trim()
      kind = kindOf(title)
      continue
    }
    buffer.push(line)
  }
  flush()
  return sections.filter((section) => section.text.trim())
}

/** Drop references and appendices first. If the paper is still too long, keep the ending sections. */
export function fitPaperText(paper: string, budget: number): FittedPaper {
  const source = paper.length
  if (source <= budget) return { text: paper, sent: source, source, capped: false, omitted: [] }
  const sections = paperSections(paper)
  const omitted: string[] = []
  const kept = sections.filter((section) => {
    if (section.kind === "references" || section.kind === "appendix") {
      omitted.push(section.title)
      return false
    }
    return true
  })
  const ordered = kept.length ? kept : sections
  let text = ordered.map((section) => section.text).join("\n\n")
  if (text.length > budget) {
    const late = ordered.filter((section) => section.kind === "results" || section.kind === "discussion" || section.kind === "conclusion")
    const early = ordered.filter((section) => section.kind !== "results" && section.kind !== "discussion" && section.kind !== "conclusion")
    const lateText = late.map((section) => section.text).join("\n\n")
    const room = Math.max(0, budget - lateText.length - 2)
    const earlyText = early.map((section) => section.text).join("\n\n")
    const earlyKept = room <= 0 ? "" : earlyText.length <= room ? earlyText : `${earlyText.slice(0, room).trimEnd()}\n\n[AIR shortened the earlier sections to keep the results, discussion, and conclusions.]`
    if (room <= 0 && early.length) omitted.push(...early.map((section) => section.title))
    text = [earlyKept, lateText.length > budget ? lateText.slice(lateText.length - budget) : lateText].filter(Boolean).join("\n\n")
    if (text.length > budget) text = text.slice(text.length - budget)
  }
  return { text: text.trim(), sent: text.trim().length, source, capped: true, omitted }
}

export function paperParts(text: string, partSize: number): string[] {
  if (text.length <= partSize) return [text]
  const parts: string[] = []
  let cursor = 0
  while (cursor < text.length) {
    let end = Math.min(text.length, cursor + partSize)
    if (end < text.length) {
      const paragraph = text.lastIndexOf("\n\n", end)
      if (paragraph > cursor + partSize * 0.6) end = paragraph
    }
    const piece = text.slice(cursor, end).trim()
    if (piece) parts.push(piece)
    cursor = end
  }
  return parts
}

export function omissionNote(omitted: string[]): string {
  if (!omitted.length) return ""
  return `AIR did not send these sections: ${omitted.join("; ")}. Do not penalise the paper for a section AIR cut. Score only the text you were given.`
}

export function paperPartMessage(index: number, total: number, text: string): string {
  return [`AIR PAPER PART ${index} of ${total}.`, "Reply only: OK", "", text].join("\n")
}

/** One message when it fits. Otherwise the paper goes out in parts, then the review prompt. */
export function paperDeliveryPlan(options: {
  url: string
  instructions: string
  paper: string
  sourceChars: number
  oneMessage: number
  prompt: (url: string, instructions: string, paper?: string, note?: string) => string
}): { texts: string[]; notice: string; sent: number } {
  const fitted = fitPaperText(options.paper, PAPER_SEND_CAP)
  const note = omissionNote(fitted.omitted)
  const combined = fitted.text.length + options.instructions.length + 1_500
  const parts = combined <= options.oneMessage ? [fitted.text] : paperParts(fitted.text, Math.max(4_000, options.oneMessage - 200))
  const notice = fullTextIncludedLine(options.sourceChars, fitted.sent, fitted.sent < options.sourceChars)
  if (parts.length === 1) {
    return { texts: [options.prompt(options.url, options.instructions, parts[0] ?? "", note)], notice, sent: fitted.sent }
  }
  return {
    texts: [
      ...parts.map((part, index) => paperPartMessage(index + 1, parts.length, part)),
      options.prompt(options.url, options.instructions, "", note || "The paper text was sent in the messages above."),
    ],
    notice,
    sent: fitted.sent,
  }
}

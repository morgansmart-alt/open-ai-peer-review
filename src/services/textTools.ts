import { stripHtml } from "./zenodo.ts"

export function decodeText(data: ArrayBuffer): string {
  return new TextDecoder("utf-8", { fatal: false }).decode(data)
}

export function textFromMarkup(filename: string, raw: string): string {
  const extension = filename.toLowerCase().split(".").pop() ?? ""
  if (extension === "html" || extension === "htm" || raw.trimStart().startsWith("<")) return stripHtml(raw)
  return raw.replace(/^\uFEFF/, "").trim()
}

export function chunkText(text: string, size = 12_000): string[] {
  const clean = text.replace(/\r\n/g, "\n").trim()
  if (!clean) return []
  if (clean.length <= size) return [clean]
  const chunks: string[] = []
  let cursor = 0
  while (cursor < clean.length && chunks.length < 8) {
    let end = Math.min(clean.length, cursor + size)
    if (end < clean.length) {
      const paragraph = clean.lastIndexOf("\n\n", end)
      const sentence = clean.lastIndexOf(". ", end)
      const splitAt = paragraph > cursor + size * 0.5 ? paragraph : sentence > cursor + size * 0.5 ? sentence + 1 : end
      end = splitAt
    }
    const piece = clean.slice(cursor, end).trim()
    if (piece) chunks.push(piece)
    cursor = end
  }
  if (cursor < clean.length && chunks.length > 0) {
    const last = chunks[chunks.length - 1]
    chunks[chunks.length - 1] = `${last}\n\n[Further text was left out of this packet so the reading stays within a few calls.]`
  }
  return chunks
}

export function pickQuotes(text: string, count: number): string[] {
  const sentences = text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 40 && sentence.length < 320)
  if (sentences.length === 0) {
    const fallback = text.replace(/\s+/g, " ").trim().slice(0, 220)
    return fallback ? [fallback] : []
  }
  const step = Math.max(1, Math.floor(sentences.length / count))
  const quotes: string[] = []
  for (let index = 0; index < count; index += 1) {
    quotes.push(sentences[Math.min(sentences.length - 1, index * step)] ?? sentences[0] ?? "")
  }
  return quotes.filter(Boolean)
}

export interface TextSignals {
  [criterionId: string]: number
}

export function textSignals(text: string, filenames: string[]): TextSignals {
  const lowered = text.toLowerCase()
  const numbers = text.match(/\d[\d.,]*/g)?.length ?? 0
  const speculation = lowered.match(/\b(might|could|envision|hope|possibly|imagine)\b/g)?.length ?? 0
  const evidence = lowered.match(/\b(measured|observed|dataset|figure|table|equation|we find|result)\b/g)?.length ?? 0
  const code = filenames.some((name) => /\.(py|ipynb|r|jl|js|ts|csv|json|zip)$/i.test(name))
  const pdf = filenames.some((name) => /\.pdf$/i.test(name))
  return {
    clarity: text.length > 1200 ? 0.6 : text.length > 400 ? 0.2 : -0.6,
    "novelty-context": /prior work|previous work|et al|literature|compared with|related work/.test(lowered) ? 0.6 : -0.4,
    "potential-impact": text.length > 800 ? 0.3 : 0,
    methodology: /method|protocol|procedure|parameter|assumption|setup/.test(lowered) ? 0.7 : -0.5,
    consistency: numbers > 12 ? 0.5 : numbers > 3 ? 0.1 : -0.3,
    "evidence-labelling": evidence > speculation ? 0.4 : speculation > evidence + 2 ? -0.6 : 0,
    availability: code ? 0.8 : pdf ? 0.2 : -0.3,
    limitations: /limitation|future work|we do not|does not show|caveat|falsif/.test(lowered) ? 0.8 : -0.7,
    ethics: /ethic|safety|harm|consent|risk|dual use|privacy/.test(lowered) ? 0.6 : -0.2,
    presentation: (pdf ? 0.3 : 0) + (text.length > 500 ? 0.2 : -0.3),
  }
}

import { jsonrepair } from "jsonrepair"

export interface ParsedModelJson {
  ok: true
  value: unknown
  text: string
  repaired: boolean
}

function fenced(raw: string): string {
  const trimmed = raw.trim()
  const match = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  return (match?.[1] ?? trimmed).trim()
}

function objectSlice(body: string): string {
  const start = body.indexOf("{")
  const end = body.lastIndexOf("}")
  if (start >= 0 && end > start) return body.slice(start, end + 1)
  return body
}

/** Strict JSON first. A repair pass covers trailing commas, missing commas, and similar damage. */
export function parseModelJson(raw: string): ParsedModelJson | { ok: false; error: string } {
  const slice = objectSlice(fenced(raw))
  if (!slice.includes("{")) return { ok: false, error: "No JSON object found in the model output." }
  try {
    return { ok: true, value: JSON.parse(slice), text: slice, repaired: false }
  } catch (strictError) {
    try {
      const repaired = jsonrepair(slice)
      return { ok: true, value: JSON.parse(repaired), text: repaired, repaired: true }
    } catch {
      const message = strictError instanceof Error ? strictError.message : "The JSON could not be parsed."
      return { ok: false, error: message }
    }
  }
}

export function reaskJsonPrompt(error: string): string {
  const detail = error.replace(/\s+/g, " ").trim().slice(0, 240)
  return `Your JSON did not parse (${detail}). Reply again with only the corrected JSON object.`
}

/** Repair when possible. If the text still will not parse, ask the chat once. */
export async function settleChatJson(
  raw: string,
  ask: (prompt: string) => Promise<string>,
  log: (message: string) => void,
): Promise<{ text: string; repaired: boolean; reasked: boolean }> {
  const first = parseModelJson(raw)
  if (first.ok) {
    if (first.repaired) log("Repaired the chat's JSON before scoring.")
    return { text: first.repaired ? first.text : raw, repaired: first.repaired, reasked: false }
  }
  const prompt = reaskJsonPrompt(first.error)
  log("Asked once for corrected JSON.")
  const follow = await ask(prompt)
  const second = parseModelJson(follow)
  if (second.ok && second.repaired) log("Repaired the corrected JSON.")
  return { text: second.ok ? (second.repaired ? second.text : follow) : follow, repaired: Boolean(second.ok && second.repaired), reasked: true }
}

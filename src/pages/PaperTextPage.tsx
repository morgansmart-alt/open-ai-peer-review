import { useEffect, useState } from "react"
import { downloadArrayBuffer, extractDocument } from "../services/extractText.ts"
import { formatPaperText } from "../services/webChat/paperText.ts"
import { fetchZenodoRecord, isOpenFiles, type ZenodoRecord } from "../services/zenodo.ts"

/** A clean public page. Chat tools open this URL. It has no account and no private notes. */
export function PaperTextPage({ recordId }: { recordId: string }) {
  const [text, setText] = useState("")
  const [error, setError] = useState("")

  useEffect(() => {
    let cancelled = false
    setText("")
    setError("")
    void load(recordId)
      .then((page) => {
        if (!cancelled) setText(page)
      })
      .catch((caught: unknown) => {
        if (!cancelled) setError(caught instanceof Error ? caught.message : "That public record could not be read.")
      })
    return () => {
      cancelled = true
    }
  }, [recordId])

  return (
    <article className="mx-auto max-w-3xl bg-white px-4 py-8 text-ink">
      <p className="text-xs uppercase tracking-wide text-ink-soft">AIR public text. No account is required.</p>
      {error ? <p className="mt-4 text-sm">{error}</p> : null}
      {!error && !text ? <p className="mt-4 text-sm">Loading the public record…</p> : null}
      {text ? (
        <pre id="paper-text" className="mt-4 whitespace-pre-wrap font-serif text-base leading-relaxed">
          {text}
        </pre>
      ) : null}
    </article>
  )
}

async function load(recordId: string): Promise<string> {
  const record = await fetchZenodoRecord(recordId)
  const documents = await publicDocuments(record)
  return formatPaperText(record, documents)
}

async function publicDocuments(record: ZenodoRecord): Promise<{ filename: string; text: string }[]> {
  if (!isOpenFiles(record.access.files)) return []
  const documents: { filename: string; text: string }[] = []
  for (const file of record.files) {
    if (!file.downloadUrl) continue
    try {
      const bytes = await downloadArrayBuffer(file.downloadUrl, record.access)
      const extracted = await extractDocument(file.key, bytes)
      if (extracted.text.trim()) documents.push({ filename: file.key, text: extracted.text })
    } catch {
      documents.push({ filename: file.key, text: "" })
    }
  }
  return documents.filter((document) => document.text.trim())
}

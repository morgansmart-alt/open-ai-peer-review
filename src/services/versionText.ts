import { downloadArrayBuffer, extractDocument } from "./extractText.ts"
import { defaultFileSelection, isTextualFile, type ZenodoRecord } from "./zenodo.ts"

export async function loadVersionDocuments(record: ZenodoRecord): Promise<{ filename: string; text: string }[]> {
  const picked = record.files.filter((file) => isTextualFile(file) && defaultFileSelection(record.files).includes(file.key))
  const next: { filename: string; text: string }[] = []
  for (const file of picked) {
    try {
      const bytes = await downloadArrayBuffer(file.downloadUrl)
      const extracted = await extractDocument(file.key, bytes)
      if (extracted.text.trim()) next.push({ filename: file.key, text: extracted.text })
    } catch {
      // A later check reports an empty bundle. One unreadable file does not substitute another version's text.
    }
  }
  return next
}

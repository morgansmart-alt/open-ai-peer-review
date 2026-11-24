import { downloadArrayBuffer, extractDocument } from "./extractText.ts"
import { fileSelectionFor } from "./fileSelection.ts"
import { selectedReadableFiles, type ZenodoRecord } from "./zenodo.ts"

export async function loadVersionDocuments(record: ZenodoRecord, selectedKeys?: readonly string[]): Promise<{ filename: string; text: string }[]> {
  const keys = selectedKeys ?? fileSelectionFor(record.id, record.files)
  const picked = selectedReadableFiles(record.files, keys)
  const next: { filename: string; text: string }[] = []
  for (const file of picked) {
    try {
      const bytes = await downloadArrayBuffer(file.downloadUrl, record.access)
      const extracted = await extractDocument(file.key, bytes)
      if (extracted.text.trim()) next.push({ filename: file.key, text: extracted.text })
    } catch {
      // A later check reports an empty bundle. One unreadable file does not substitute another version's text.
    }
  }
  return next
}

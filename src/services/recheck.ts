import { documentsForRecheck, stableVersionId, textBundle, type TextDocument } from "../domain/versions.ts"
import { isTextualFile, type ZenodoRecord } from "./zenodo.ts"

export interface PreparedRecheck {
  target: ZenodoRecord
  documents: TextDocument[]
  /** Stable id of a different version, or the issue's own recordVersion when the check stays on that version. */
  checkedVersionId: string
}

export async function prepareRecheck(options: {
  current: ZenodoRecord
  loadedDocuments: TextDocument[]
  targetRecordId: string
  issueRecordVersion: string
  fetchRecord: (recordId: string) => Promise<ZenodoRecord>
  loadDocuments: (record: ZenodoRecord) => Promise<TextDocument[]>
}): Promise<PreparedRecheck> {
  const target = options.targetRecordId === options.current.id ? options.current : await options.fetchRecord(options.targetRecordId)
  const sameRecord = target.id === options.current.id
  let documents = sameRecord ? options.loadedDocuments : []
  if (!documents.some((document) => document.text.trim())) documents = await options.loadDocuments(target)
  const bundle = textBundle({ description: target.description, hasTextualFiles: target.files.some((file) => isTextualFile(file)) }, documents)
  const searched = documentsForRecheck(
    { id: options.current.id, documents: sameRecord ? bundle : [] },
    { id: target.id, documents: bundle },
  )
  const checkedVersionId =
    sameRecord && target.recordVersion === options.issueRecordVersion ? options.issueRecordVersion : stableVersionId(target)
  return { target, documents: searched, checkedVersionId }
}

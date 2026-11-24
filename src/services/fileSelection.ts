import { defaultFileSelection, isTextualFile, type ZenodoFile } from "./zenodo.ts"

const STORAGE_KEY = "air.fileSelection.v1"

type SelectionStore = Pick<Storage, "getItem" | "setItem">

function browserStorage(): SelectionStore | null {
  try {
    if (typeof localStorage === "undefined") return null
    return localStorage
  } catch {
    return null
  }
}

function readMap(storage: SelectionStore): Record<string, unknown> {
  try {
    const raw = storage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

export function rememberFileSelection(recordId: string, keys: readonly string[], storage: SelectionStore | null = browserStorage()): void {
  if (!storage || !recordId) return
  const map = readMap(storage)
  map[recordId] = [...keys]
  storage.setItem(STORAGE_KEY, JSON.stringify(map))
}

/**
 * Last ticked files for this record, when those names are still on it.
 * A selection saved for a different record is ignored. Otherwise the default selection is used.
 */
export function fileSelectionFor(recordId: string, files: ZenodoFile[], storage: SelectionStore | null = browserStorage()): string[] {
  const fallback = defaultFileSelection(files)
  if (!storage || !recordId) return fallback
  const remembered = readMap(storage)[recordId]
  if (!Array.isArray(remembered)) return fallback
  const textual = new Set(files.filter((file) => isTextualFile(file)).map((file) => file.key))
  const kept = remembered.filter((key): key is string => typeof key === "string" && textual.has(key))
  if (kept.length === 0) return fallback
  return kept
}

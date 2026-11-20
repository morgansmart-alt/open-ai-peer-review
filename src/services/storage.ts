import type { AirDatabase, AssessorProfile, CriteriaSet, ProviderSettings } from "../domain/types.ts"
import { emptyDatabase } from "../domain/types.ts"
import { parseCriteria } from "../domain/criteria.ts"

const DB_KEY = "air.db.v1"
const OVERLAY_KEY = "air.overlay.v1"
const SETTINGS_KEY = "air.settings.v1"
const KEYS_KEY = "air.keys.v1"
const RATE_KEY = "air.rate.v1"

export interface PersistedSettings {
  remember: boolean
  baseUrls: Record<string, string>
  models: Record<string, string>
  demoMode: boolean
  autoPick: boolean
  nodeId: string
  nodeName: string
  orcid: string
  authorName: string
  customProfiles: AssessorProfile[]
  customCriteria: CriteriaSet | null
}

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

function writeJson(key: string, value: unknown): void {
  localStorage.setItem(key, JSON.stringify(value))
}

export function loadLocalDatabase(): AirDatabase {
  return readJson<AirDatabase>(DB_KEY) ?? emptyDatabase()
}

export function saveLocalDatabase(db: AirDatabase): void {
  writeJson(DB_KEY, db)
}

export function loadOverlay(): AirDatabase {
  return readJson<AirDatabase>(OVERLAY_KEY) ?? emptyDatabase()
}

export function saveOverlay(db: AirDatabase): void {
  writeJson(OVERLAY_KEY, db)
}

export function loadRateStamps(): number[] {
  return readJson<number[]>(RATE_KEY) ?? []
}

export function saveRateStamps(stamps: number[]): void {
  writeJson(RATE_KEY, stamps)
}

export function defaultSettings(): PersistedSettings {
  return {
    remember: false,
    baseUrls: {},
    models: {},
    demoMode: true,
    autoPick: true,
    nodeId: "",
    nodeName: "",
    orcid: "",
    authorName: "",
    customProfiles: [],
    customCriteria: null,
  }
}

export function loadSettings(): PersistedSettings {
  const stored = readJson<PersistedSettings>(SETTINGS_KEY)
  const base = defaultSettings()
  if (!stored) {
    base.nodeId = crypto.randomUUID()
    base.nodeName = "guest-node"
    return base
  }
  const custom = stored.customCriteria ? parseCriteria(stored.customCriteria) : null
  return {
    ...base,
    ...stored,
    baseUrls: stored.baseUrls ?? {},
    models: stored.models ?? {},
    customProfiles: Array.isArray(stored.customProfiles) ? stored.customProfiles : [],
    customCriteria: custom && custom.ok ? custom.criteria : null,
    autoPick: stored.autoPick !== false,
    nodeId: stored.nodeId || crypto.randomUUID(),
    nodeName: stored.nodeName || "guest-node",
  }
}

export function saveSettings(settings: PersistedSettings): void {
  writeJson(SETTINGS_KEY, settings)
}

export function loadKeys(remember: boolean): Record<string, string> {
  if (!remember) return {}
  return readJson<Record<string, string>>(KEYS_KEY) ?? {}
}

export function saveKeys(keys: Record<string, string>, remember: boolean): void {
  if (!remember) {
    localStorage.removeItem(KEYS_KEY)
    return
  }
  writeJson(KEYS_KEY, keys)
}

export function clearBrowserData(): void {
  localStorage.removeItem(DB_KEY)
  localStorage.removeItem(OVERLAY_KEY)
  localStorage.removeItem(SETTINGS_KEY)
  localStorage.removeItem(KEYS_KEY)
  localStorage.removeItem(RATE_KEY)
  localStorage.removeItem("air.router.v1")
}

export function toProviderSettings(settings: PersistedSettings, keys: Record<string, string>): ProviderSettings {
  return { keys, baseUrls: settings.baseUrls, models: settings.models, remember: settings.remember }
}

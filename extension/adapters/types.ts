import type { ProviderId } from "../../src/domain/types.ts"

/** Selectors live on the adapter so a site change is a one-file fix. */
export interface ProviderSelectors {
  composer: string[]
  submit: string[]
  stop: string[]
  assistant: string[]
  fileInput: string[]
  /** Elements that appear once a file chip is ready. Optional; the runner also checks data-attachment-state. */
  attachment?: string[]
  login: string[]
}

export interface ProviderAdapter {
  id: string
  label: string
  /** Assessor column this chat corresponds to. Uncalibrated readings still stay off that column's median. */
  assessorId: string
  provider: ProviderId
  /** Shown on the reading. This is the site, not a verified model id. */
  modelLabel: string
  startUrl: string
  /** Manifest match patterns. Kept beside the adapter so the host list can be checked in tests. */
  origins: string[]
  /** Composer paste budget, in characters. AIR splits above this. */
  pasteLimit: number
  /** Attached text budget, in characters, when the adapter declares file upload. */
  fileCharLimit: number
  maxFiles: number
  /** Above this many turns, AIR warns before sending. The run still waits for a click. */
  comfortableTurns: number
  fileUpload: boolean
  /** Practical limits for the README and the setup panel. These are not a vendor contract. */
  limits: string
  selectors: ProviderSelectors
}

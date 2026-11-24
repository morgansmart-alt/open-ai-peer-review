export type ProviderId =
  | "openai"
  | "xai"
  | "anthropic"
  | "gemini"
  | "openrouter"
  | "compatible"

export interface AssessorProfile {
  id: string
  name: string
  shortName: string
  provider: ProviderId
  defaultModel: string
  defaultBaseUrl: string
  blurb: string
  builtin: boolean
}

export interface ScoreBand {
  min: number
  max: number
  label: string
}

export interface Criterion {
  id: string
  name: string
  description: string
  weight: number
  guidance: string
  bands?: ScoreBand[]
}

export interface RecommendationCategory {
  id: string
  label: string
  meaning: string
}

export type ReportSchema = "0.1" | "0.2"

export interface CriteriaSet {
  id: string
  version: string
  name: string
  principles: string[]
  scale: { min: number; max: number; labels: Record<string, string> }
  recommendationCategories: RecommendationCategory[]
  ideaCriterionIds: string[]
  criteria: Criterion[]
  /** Absent on AIR v0.1 files, which remain valid. */
  reportSchema: ReportSchema
}

export interface Citation {
  quote: string
  location: string
  /** False when the quote is not a substring of the extracted paper. Absent on older readings. */
  quoteVerified?: boolean
}

export type Confidence = "low" | "medium" | "high"
export type OntologyClass =
  | "physical-testable"
  | "physical-not-yet-testable"
  | "logical-mathematical"
  | "metaphysical-philosophical"
export type PhysicsClass = "CONSISTENT" | "EXTENDS" | "CHALLENGES"
export type GoalLevel = "none" | "indirect" | "partial" | "direct"

export type EvidenceLabel = "possible" | "proven"

export interface CriterionScore {
  criterionId: string
  score: number
  rationale: string
  citations: Citation[]
  confidence?: Confidence
  /** Possible is not proven. A proven label needs a quotation from the publication. */
  evidence?: EvidenceLabel
}

export interface ValueRange {
  low: string
  central: string
  high: string
  unit: string
}

export interface PhysicsCheck {
  classification: PhysicsClass
  laws: string[]
  howAddressed: string
}

export interface SimulationEvidence {
  reported: number | null
  passed: number | null
  methods: string
  inputsAvailable: boolean
}

export interface ValueEstimate {
  confidence: "low" | "medium" | "high"
  assumptions: string[]
  marketDisruption: string
  addressableMarket: ValueRange
  units: ValueRange
  valuePerUnit: ValueRange
  overallBenefit: ValueRange
  disclaimer: string
}

export interface GoalAlignment {
  goalId: string
  level: GoalLevel
  note: string
}

export interface MajorIssue {
  criterionId: string
  claim: string
  quotedPassage: string
  reason: string
  quoteVerified?: boolean
}

export interface ReviewReport {
  summary: string
  scores: CriterionScore[]
  overallScore: number
  ideaScore: number
  recommendation: string
  /** 100 means the stored numbers are already out of 100. Missing means an older 0–10 or 1–5 reading. */
  scale?: number
  /** The model's own total, kept for the mismatch check. Ranking uses overallScore, which is the weighted score. */
  statedOverall?: number | null
  unverifiedQuotes?: number
  /** Model id the provider actually served, when it differs from the requested id. */
  servedModel?: string
  scoringCheck?: {
    internal: number
    statedOverall: number | null
    mismatch: boolean
    reason: string | null
  }
  strengths: string[]
  majorIssues: MajorIssue[]
  minorIssues: string[]
  questionsForAuthors: string[]
  suggestedNextSteps: string[]
  ontologyClass?: OntologyClass
  physics?: PhysicsCheck
  simulation?: SimulationEvidence
  valueEstimate?: ValueEstimate
  goals?: GoalAlignment[]
  /** How much of the selected files this reading actually covered. */
  reading?: {
    pagesRead: number
    pagesTotal: number
    chunksSummarised: number
    coverage: "full" | "partial"
  }
}

export interface StoredReview {
  id: string
  sample: boolean
  mock: boolean
  doi: string
  recordId: string
  conceptRecordId: string
  recordVersion: string
  title: string
  creators: string[]
  keywords: string[]
  publicationDate: string
  license: string
  assessorId: string
  modelId: string
  provider: ProviderId
  criteriaId: string
  criteriaVersion: string
  customCriteria: boolean
  /** Free screenings stay off the ranked board. In-depth readings are ranked. Community AI never ranks. */
  tier?: "free-screening" | "in-depth" | "demo" | "community-ai"
  report: ReviewReport
  outputHash: string
  createdAt: string
  /** How many private chat links were sent to the model. URLs are never stored here. */
  privateContextCount?: number
  /** Human reviews are stored beside AI readings and never enter an AI median. Community AI is uncalibrated. Absent means an AI reading. */
  origin?: "ai" | "human" | "community-ai"
}

export type Verdict = "pass" | "fail"

export interface CriterionJudgement {
  criterionId: string
  agree: boolean
  theirScore: number | null
  note: string
}

export type AttachmentKind = "json" | "csv" | "text" | "link"

export interface AttachmentMeta {
  name: string
  kind: AttachmentKind
  bytes: number
  sha256: string
  url?: string
  preview?: string
}

export interface NodeSubmission {
  id: string
  reviewId: string
  doi: string
  recordVersion: string
  nodeId: string
  nodeName: string
  assessorId: string
  modelId: string
  criteriaVersion: string
  customCriteria: boolean
  verdict: Verdict
  summary: string
  judgements: CriterionJudgement[]
  errorsFound: string[]
  failureModes: MajorIssue[]
  attachment?: AttachmentMeta
  privateContextCount?: number
  /** In-depth independent checks count toward corroboration. Free and demo checks do not. */
  trusted?: boolean
  /** SHA-256 of the prompt sent to the model. */
  promptHash?: string
  /** The visitor named this model. AIR cannot prove the provider actually used it. */
  selfReported?: boolean
  /** A person edited this check before it was submitted. It still counts as one node, under the same weight cap. */
  humanEdited?: boolean
  createdAt: string
  mock: boolean
}

export type IssueStatus =
  | "open"
  | "addressed-in-publication"
  | "partially-addressed"
  | "unresolved"
  | "fixed-in-new-version"

export type RoundKind = "claim" | "source-check" | "rebuttal" | "counter" | "recheck"

export type SourceResult = "ADDRESSED" | "PARTIALLY_ADDRESSED" | "NOT_ADDRESSED"

export type AuthorRole = "reviewer" | "node" | "author" | "author-self-declared" | "reader" | "human-reviewer" | "ai-recheck"

export interface IssueRound {
  id: string
  kind: RoundKind
  authorLabel: string
  authorRole: AuthorRole
  result?: SourceResult
  citations: Citation[]
  body: string
  recordVersionChecked?: string
  privateContextCount?: number
  createdAt: string
}

export interface IssueThread {
  id: string
  doi: string
  recordVersion: string
  source: "review-major" | "node-fail" | "community-promotion"
  sourceId: string
  criterionId: string
  claim: string
  quotedPassage: string
  reason: string
  status: IssueStatus
  rounds: IssueRound[]
  createdAt: string
  updatedAt: string
}

export interface AuthorClaim {
  id: string
  doi: string
  displayName: string
  orcid: string
  /** True when the typed ORCID appears on the Zenodo creator list. AIR does not authenticate the ORCID. */
  listedOnRecord: boolean
  selfDeclared: boolean
  createdAt: string
}

export interface AirDatabase {
  reviews: StoredReview[]
  nodes: NodeSubmission[]
  issues: IssueThread[]
  claims: AuthorClaim[]
}

export interface ProviderSettings {
  keys: Record<string, string>
  baseUrls: Record<string, string>
  models: Record<string, string>
  remember: boolean
}

export const DISCLAIMER =
  "This is an AI-generated reading against the AIR criteria. It is not a formal journal peer review, not an acceptance decision, and not a statement by the authors or by AIR."

export const STORED_REVIEW_KEYS = [
  "id",
  "sample",
  "mock",
  "doi",
  "recordId",
  "conceptRecordId",
  "recordVersion",
  "title",
  "creators",
  "keywords",
  "publicationDate",
  "license",
  "assessorId",
  "modelId",
  "provider",
  "criteriaId",
  "criteriaVersion",
  "customCriteria",
  "report",
  "outputHash",
  "createdAt",
  "privateContextCount",
  "origin",
] as const

export function emptyDatabase(): AirDatabase {
  return { reviews: [], nodes: [], issues: [], claims: [] }
}

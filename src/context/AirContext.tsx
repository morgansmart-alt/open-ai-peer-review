import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react"
import { listAssessors } from "../domain/assessors.ts"
import { claimKey, issuesFromNode, issuesFromReview } from "../domain/issues.ts"
import { officialCriteria } from "../domain/officialCriteria.ts"
import { sampleDatabase } from "../domain/samples.ts"
import type { AirDatabase, AssessorProfile, AuthorClaim, CriteriaSet, IssueRound, IssueStatus, IssueThread, NodeSubmission, ProviderSettings, StoredReview } from "../domain/types.ts"
import { emptyDatabase } from "../domain/types.ts"
import { openBackend, publishClaim, publishIssues, publishNode, publishReview, saveIssue, type BackendMode } from "../services/backend.ts"
import { mergeDatabases } from "../services/merge.ts"
import { loadKeys, loadLocalDatabase, loadOverlay, loadSettings, saveKeys, saveSettings, toProviderSettings, type PersistedSettings } from "../services/storage.ts"

interface AirContextValue {
  ready: boolean
  mode: BackendMode
  backendError: string | null
  db: AirDatabase
  criteria: CriteriaSet
  customCriteria: boolean
  setSessionCriteria: (criteria: CriteriaSet | null) => void
  profiles: AssessorProfile[]
  addProfile: (profile: AssessorProfile) => void
  settings: PersistedSettings
  providerSettings: ProviderSettings
  setKey: (slot: string, value: string) => void
  setRemember: (remember: boolean) => void
  setModel: (assessorId: string, model: string) => void
  setBaseUrl: (slot: string, url: string) => void
  setDemoMode: (demo: boolean) => void
  setNodeName: (name: string) => void
  setOrcid: (orcid: string) => void
  setAuthorName: (name: string) => void
  keysOpen: boolean
  setKeysOpen: (open: boolean) => void
  publishReading: (review: StoredReview) => Promise<string | null>
  publishCheck: (node: NodeSubmission) => Promise<string | null>
  addRound: (issueId: string, round: IssueRound, status: IssueStatus) => Promise<string | null>
  claimRecord: (claim: AuthorClaim) => Promise<string | null>
}

const AirContext = createContext<AirContextValue | null>(null)

export function AirProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<PersistedSettings>(() => loadSettings())
  const [keys, setKeys] = useState<Record<string, string>>({})
  const [mode, setMode] = useState<BackendMode>("local")
  const [remote, setRemote] = useState<AirDatabase>(emptyDatabase())
  const [tick, setTick] = useState(0)
  const [ready, setReady] = useState(false)
  const [backendError, setBackendError] = useState<string | null>(null)
  const [keysOpen, setKeysOpen] = useState(false)
  const [keysReady, setKeysReady] = useState(false)

  useEffect(() => {
    setKeys(loadKeys(loadSettings().remember))
    setKeysReady(true)
    void openBackend().then((result) => {
      setMode(result.mode)
      setRemote(result.db)
      setBackendError(result.error)
      setReady(true)
    })
  }, [])

  useEffect(() => {
    saveSettings(settings)
  }, [settings])

  useEffect(() => {
    if (!keysReady) return
    saveKeys(keys, settings.remember)
  }, [keys, settings.remember, keysReady])

  const db = useMemo(() => {
    const local = loadLocalDatabase()
    const overlay = loadOverlay()
    void tick
    if (!ready) return emptyDatabase()
    if (mode === "supabase") return mergeDatabases(mergeDatabases(sampleDatabase(), remote), overlay)
    return mergeDatabases(sampleDatabase(), local)
  }, [mode, remote, tick, ready])

  const profiles = useMemo(() => listAssessors(settings.customProfiles), [settings.customProfiles])
  const criteria = settings.customCriteria ?? officialCriteria
  const bump = useCallback(() => setTick((value) => value + 1), [])

  const publishReading = useCallback(
    async (review: StoredReview) => {
      const error = await publishReview(mode, review)
      if (error) return error
      const label = profiles.find((profile) => profile.id === review.assessorId)?.name ?? review.assessorId
      const incoming = issuesFromReview(review, label)
      const seen = new Set(db.issues.map((issue) => claimKey(issue.doi, issue.recordVersion, issue.criterionId, issue.claim)))
      const fresh = incoming.filter((issue) => !seen.has(claimKey(issue.doi, issue.recordVersion, issue.criterionId, issue.claim)))
      const issueError = await publishIssues(mode, fresh, review.mock)
      if (mode === "supabase" && !review.mock) {
        setRemote((current) => ({
          ...current,
          reviews: [...current.reviews.filter((item) => item.id !== review.id), review],
          issues: [...current.issues, ...fresh],
        }))
      }
      bump()
      return issueError
    },
    [bump, db.issues, mode, profiles],
  )

  const publishCheck = useCallback(
    async (node: NodeSubmission) => {
      const error = await publishNode(mode, node)
      if (error) return error
      const label = node.nodeName || "Independent node"
      const incoming = issuesFromNode(node, label)
      const seen = new Set(db.issues.map((issue) => claimKey(issue.doi, issue.recordVersion, issue.criterionId, issue.claim)))
      const fresh = incoming.filter((issue) => !seen.has(claimKey(issue.doi, issue.recordVersion, issue.criterionId, issue.claim)))
      const issueError = await publishIssues(mode, fresh, node.mock)
      if (mode === "supabase" && !node.mock) {
        setRemote((current) => ({
          ...current,
          nodes: [...current.nodes, node],
          issues: [...current.issues, ...fresh],
        }))
      }
      bump()
      return issueError
    },
    [bump, db.issues, mode],
  )

  const addRound = useCallback(
    async (issueId: string, round: IssueRound, status: IssueStatus) => {
      const current = db.issues.find((issue) => issue.id === issueId)
      if (!current) return "That issue is no longer on the board."
      const next: IssueThread = { ...current, status, rounds: [...current.rounds, round], updatedAt: round.createdAt }
      const error = await saveIssue(mode === "supabase" && current.id.includes("sample") ? "local" : mode, next)
      if (!error && mode === "supabase" && !current.id.includes("sample")) {
        setRemote((existing) => ({
          ...existing,
          issues: existing.issues.some((issue) => issue.id === next.id)
            ? existing.issues.map((issue) => (issue.id === next.id ? next : issue))
            : [...existing.issues, next],
        }))
      }
      bump()
      return error
    },
    [bump, db.issues, mode],
  )

  const claimRecord = useCallback(
    async (claim: AuthorClaim) => {
      const error = await publishClaim(mode, claim)
      if (!error && mode === "supabase") {
        setRemote((existing) => ({ ...existing, claims: [...existing.claims.filter((item) => item.doi !== claim.doi), claim] }))
      }
      bump()
      return error
    },
    [bump, mode],
  )

  const value: AirContextValue = {
    ready,
    mode,
    backendError,
    db,
    criteria,
    customCriteria: settings.customCriteria !== null,
    setSessionCriteria: (next) => setSettings((current) => ({ ...current, customCriteria: next })),
    profiles,
    addProfile: (profile) =>
      setSettings((current) => ({
        ...current,
        customProfiles: [...current.customProfiles.filter((item) => item.id !== profile.id), profile],
      })),
    settings,
    providerSettings: toProviderSettings(settings, keys),
    setKey: (slot, key) => setKeys((current) => ({ ...current, [slot]: key })),
    setRemember: (remember) => setSettings((current) => ({ ...current, remember })),
    setModel: (assessorId, model) => setSettings((current) => ({ ...current, models: { ...current.models, [assessorId]: model } })),
    setBaseUrl: (slot, url) => setSettings((current) => ({ ...current, baseUrls: { ...current.baseUrls, [slot]: url } })),
    setDemoMode: (demoMode) => setSettings((current) => ({ ...current, demoMode })),
    setNodeName: (nodeName) => setSettings((current) => ({ ...current, nodeName })),
    setOrcid: (orcid) => setSettings((current) => ({ ...current, orcid })),
    setAuthorName: (authorName) => setSettings((current) => ({ ...current, authorName })),
    keysOpen,
    setKeysOpen,
    publishReading,
    publishCheck,
    addRound,
    claimRecord,
  }

  return <AirContext.Provider value={value}>{children}</AirContext.Provider>
}

export function useAir(): AirContextValue {
  const value = useContext(AirContext)
  if (!value) throw new Error("useAir must be used inside AirProvider")
  return value
}

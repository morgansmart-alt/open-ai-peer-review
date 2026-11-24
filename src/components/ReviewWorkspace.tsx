import { useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { PrivateLinksField, emptyLinkDraft, type LinkDraft } from "./PrivateLinks.tsx"
import { ReportView } from "./ReportView.tsx"
import { Banner, btnPrimary, btnQuiet, fieldClass } from "./ui.tsx"
import { publishNotices } from "../content/notices.ts"
import { keySlot } from "../domain/assessors.ts"
import { collectConversationLinks, saveSubmissionLinks } from "../domain/conversationLinks.ts"
import { weightedMean } from "../domain/criteria.ts"
import { buildHumanReport, emptyHumanDrafts, type HumanCriterionDraft } from "../domain/humanReview.ts"
import { latestAuthorClaim } from "../domain/issues.ts"
import { describeScoring, expectedVerdict } from "../domain/scoring.ts"
import type { MajorIssue, ReviewReport, StoredReview } from "../domain/types.ts"
import { useAir } from "../context/AirContext.tsx"
import { sha256Hex, uid } from "../services/hash.ts"
import { resolvedModel } from "../services/providers.ts"
import { runReview } from "../services/review.ts"
import { publicationPlainText } from "../domain/versions.ts"
import type { ZenodoRecord } from "../services/zenodo.ts"

export function ReviewWorkspace({ record, documents }: { record: ZenodoRecord; documents: { filename: string; text: string }[] }) {
  const text = publicationPlainText(documents, record.description)
  return (
    <section className="mt-8" aria-labelledby="review-workspace-heading">
      <h2 id="review-workspace-heading" className="font-serif text-2xl">
        Review this version
      </h2>
      <p className="mt-1 max-w-3xl text-sm text-ink-soft">
        Score every AIR criterion from 0 to 100. AIR weights those scores itself. If the overall score or the recommendation disagrees with them, the reading is flagged and left out of the median. Mark a claim possible or proven. Possible is not proven, and proven needs a quotation from this version. A human review sits beside the AI scores and is not mixed into them.
      </p>
      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <HumanReviewForm record={record} publicationText={text} />
        <AiReviewPanel record={record} documents={documents} />
      </div>
    </section>
  )
}

function HumanReviewForm({ record, publicationText }: { record: ZenodoRecord; publicationText: string }) {
  const air = useAir()
  const [drafts, setDrafts] = useState<HumanCriterionDraft[]>(() => emptyHumanDrafts(air.criteria))
  const [summary, setSummary] = useState("")
  const [strengths, setStrengths] = useState("")
  const [stated, setStated] = useState<number | null>(null)
  const [recommendation, setRecommendation] = useState<string | null>(null)
  const [issues, setIssues] = useState<MajorIssue[]>([])
  const [ack, setAck] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const weighted = weightedMean(drafts, air.criteria)
  const shownOverall = stated ?? weighted ?? 0
  const suggested = expectedVerdict(weighted ?? shownOverall)
  const shownRecommendation = recommendation ?? suggested
  const scoring = describeScoring({
    scores: drafts,
    statedOverall: shownOverall,
    recommendation: shownRecommendation,
    criteria: air.criteria,
  })
  const orcid = air.settings.orcid.replace(/^https?:\/\/orcid\.org\//i, "").trim()
  const listed = Boolean(orcid) && record.creators.some((creator) => creator.orcid === orcid)
  const claim = latestAuthorClaim(air.db.claims, record.doi)

  function updateDraft(criterionId: string, patch: Partial<HumanCriterionDraft>) {
    setDrafts((current) => current.map((draft) => (draft.criterionId === criterionId ? { ...draft, ...patch } : draft)))
    setSaved(false)
  }

  async function publish() {
    setMessage(null)
    if (!ack) {
      setMessage("Tick the human-review notice before publishing.")
      return
    }
    const built = buildHumanReport({
      criteria: air.criteria,
      summary,
      recommendation: shownRecommendation,
      statedOverall: shownOverall,
      drafts,
      strengths: strengths.split("\n"),
      majorIssues: issues,
      publicationText,
    })
    if (!built.ok) {
      setMessage(built.errors.join(" "))
      return
    }
    const review: StoredReview = {
      id: uid("review"),
      sample: false,
      mock: false,
      doi: record.doi,
      recordId: record.id,
      conceptRecordId: record.conceptId,
      recordVersion: record.recordVersion,
      title: record.title,
      creators: record.creators.map((creator) => creator.name),
      keywords: record.keywords,
      publicationDate: record.publicationDate,
      license: record.license,
      assessorId: "human",
      modelId: "human-reviewer",
      provider: "compatible",
      criteriaId: air.criteria.id,
      criteriaVersion: air.criteria.version,
      customCriteria: air.customCriteria,
      origin: "human",
      report: built.report,
      outputHash: await sha256Hex(`human\n${JSON.stringify(built.report)}`),
      createdAt: new Date().toISOString(),
      privateContextCount: 0,
    }
    const error = await air.publishReading(review)
    setMessage(error ?? "Human review published. It is on the leaderboard beside the AI scores, not inside them.")
    if (!error) setSaved(true)
  }

  return (
    <div className="rounded-3xl border border-line bg-white/70 p-4" data-testid="human-review">
      <h3 className="font-serif text-xl">Human review</h3>
      <p className="mt-1 text-xs text-ink-soft">
        {listed
          ? "The ORCID in your settings is listed on this Zenodo record. AIR has not authenticated you."
          : claim?.selfDeclared
            ? "Author label on this record: self-declared. A response still cannot close an issue."
            : "This review is labelled Human reviewer. It is not an author claim."}{" "}
        {air.customCriteria ? "Custom criteria stay off the ranked board." : "Official criteria. The human median is separate from the AI panel."}
      </p>
      <p className="mt-2 text-sm tabular-nums">
        Weighted score {weighted === null ? "—" : weighted.toFixed(0)} / 100
        {scoring.scoringCheck.mismatch ? " · Scoring mismatch, needs re-check" : ""}
      </p>
      {scoring.scoringCheck.mismatch && scoring.scoringCheck.reason && <p className="mt-1 text-xs text-gold">{scoring.scoringCheck.reason}</p>}
      <ul className="mt-3 max-h-[36rem] space-y-3 overflow-auto pr-1">
        {air.criteria.criteria.map((criterion) => {
          const draft = drafts.find((item) => item.criterionId === criterion.id)
          if (!draft) return null
          return (
            <li key={criterion.id} className="rounded-2xl border border-line/80 p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h4 className="text-sm font-medium">{criterion.name}</h4>
                <label className="text-xs text-ink-soft">
                  Score
                  <input
                    className={`${fieldClass} ml-2 w-20`}
                    type="number"
                    min={air.criteria.scale.min}
                    max={air.criteria.scale.max}
                    value={draft.score}
                    aria-label={`${criterion.name} score`}
                    onChange={(event) => updateDraft(criterion.id, { score: Number(event.target.value) })}
                  />
                </label>
              </div>
              <p className="mt-1 text-xs text-ink-soft">{criterion.description}</p>
              <fieldset className="mt-2 text-xs">
                <legend className="sr-only">{criterion.name} evidence</legend>
                <label className="mr-3">
                  <input type="radio" name={`evidence-${criterion.id}`} checked={draft.evidence === "possible"} onChange={() => updateDraft(criterion.id, { evidence: "possible" })} /> Possible
                </label>
                <label>
                  <input type="radio" name={`evidence-${criterion.id}`} checked={draft.evidence === "proven"} onChange={() => updateDraft(criterion.id, { evidence: "proven" })} /> Proven
                </label>
              </fieldset>
              <label className="mt-2 block text-xs text-ink-soft">
                Rationale
                <textarea className={`${fieldClass} mt-1`} rows={2} value={draft.rationale} aria-label={`${criterion.name} rationale`} onChange={(event) => updateDraft(criterion.id, { rationale: event.target.value })} />
              </label>
              <label className="mt-2 block text-xs text-ink-soft">
                Quotation from this version
                <textarea className={`${fieldClass} mt-1`} rows={2} value={draft.quote} aria-label={`${criterion.name} quotation`} onChange={(event) => updateDraft(criterion.id, { quote: event.target.value })} />
              </label>
            </li>
          )
        })}
      </ul>
      <label className="mt-3 block text-xs text-ink-soft">
        Summary
        <textarea className={`${fieldClass} mt-1`} rows={3} value={summary} onChange={(event) => setSummary(event.target.value)} />
      </label>
      <label className="mt-2 block text-xs text-ink-soft">
        Strengths, one per line
        <textarea className={`${fieldClass} mt-1`} rows={2} value={strengths} onChange={(event) => setStrengths(event.target.value)} />
      </label>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <label className="text-xs text-ink-soft">
          Stated overall
          <input
            className={`${fieldClass} mt-1`}
            type="number"
            min={0}
            max={100}
            value={shownOverall}
            onChange={(event) => setStated(Number(event.target.value))}
          />
        </label>
        <label className="text-xs text-ink-soft">
          Recommendation
          <select className={`${fieldClass} mt-1`} value={shownRecommendation} onChange={(event) => setRecommendation(event.target.value)}>
            {air.criteria.recommendationCategories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <FailureDrafts criteriaIds={air.criteria.criteria.map((criterion) => criterion.id)} issues={issues} onChange={setIssues} />
      <label className="mt-3 flex items-start gap-2 text-sm">
        <input type="checkbox" checked={ack} onChange={(event) => setAck(event.target.checked)} />
        <span>Publish this human review beside the AI scores. It does not enter the AI median. A private link is not part of this form and cannot close an issue.</span>
      </label>
      <button type="button" className={`${btnPrimary} mt-3`} disabled={saved} onClick={() => void publish()}>
        {saved ? "Human review published" : "Publish human review"}
      </button>
      {message && <p className="mt-2 text-xs text-ink-soft">{message}</p>}
    </div>
  )
}

function FailureDrafts({
  criteriaIds,
  issues,
  onChange,
}: {
  criteriaIds: string[]
  issues: MajorIssue[]
  onChange: (issues: MajorIssue[]) => void
}) {
  return (
    <div className="mt-3">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-sm font-medium">Failures to open</h4>
        <button
          type="button"
          className={btnQuiet}
          onClick={() => onChange([...issues, { criterionId: criteriaIds[0] ?? "evidence-labelling", claim: "", quotedPassage: "", reason: "" }])}
        >
          Add a failure
        </button>
      </div>
      <ul className="mt-2 space-y-2">
        {issues.map((issue, index) => (
          <li key={index} className="rounded-2xl border border-dashed border-line p-2">
            <label className="block text-xs text-ink-soft">
              Criterion
              <select
                className={`${fieldClass} mt-1`}
                value={issue.criterionId}
                onChange={(event) => onChange(issues.map((item, itemIndex) => (itemIndex === index ? { ...item, criterionId: event.target.value } : item)))}
              >
                {criteriaIds.map((id) => (
                  <option key={id} value={id}>
                    {id}
                  </option>
                ))}
              </select>
            </label>
            <label className="mt-2 block text-xs text-ink-soft">
              Claim
              <input
                className={`${fieldClass} mt-1`}
                value={issue.claim}
                onChange={(event) => onChange(issues.map((item, itemIndex) => (itemIndex === index ? { ...item, claim: event.target.value } : item)))}
              />
            </label>
            <label className="mt-2 block text-xs text-ink-soft">
              Quotation
              <textarea
                className={`${fieldClass} mt-1`}
                rows={2}
                value={issue.quotedPassage}
                onChange={(event) => onChange(issues.map((item, itemIndex) => (itemIndex === index ? { ...item, quotedPassage: event.target.value } : item)))}
              />
            </label>
            <label className="mt-2 block text-xs text-ink-soft">
              Why it matters
              <textarea
                className={`${fieldClass} mt-1`}
                rows={2}
                value={issue.reason}
                onChange={(event) => onChange(issues.map((item, itemIndex) => (itemIndex === index ? { ...item, reason: event.target.value } : item)))}
              />
            </label>
          </li>
        ))}
      </ul>
    </div>
  )
}

function AiReviewPanel({ record, documents }: { record: ZenodoRecord; documents: { filename: string; text: string }[] }) {
  const air = useAir()
  const [chosen, setChosen] = useState<string[]>(() => air.profiles.slice(0, 1).map((profile) => profile.id))
  const [links, setLinks] = useState<LinkDraft[]>([emptyLinkDraft()])
  const [acks, setAcks] = useState<Record<string, boolean>>({})
  const [optIn, setOptIn] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [results, setResults] = useState<{ assessorId: string; report?: ReviewReport; stored?: StoredReview; error?: string }[]>([])
  const acknowledged = publishNotices.every((notice) => acks[notice.id])
  const ready = useMemo(() => results.flatMap((result) => (result.stored ? [result.stored] : [])), [results])

  async function run() {
    if (documents.length === 0 && !record.description.trim()) {
      setMessage("Load this version’s files before a fresh reading.")
      return
    }
    if (chosen.length === 0) {
      setMessage("Choose an assessor.")
      return
    }
    const collected = collectConversationLinks(links)
    if (!collected.ok) {
      setMessage(collected.error)
      return
    }
    const missing = air.profiles.filter((profile) => chosen.includes(profile.id) && !air.settings.demoMode && !air.providerSettings.keys[keySlot(profile)] && !air.providerSettings.keys[profile.provider])
    if (missing.length) {
      setMessage(`Add a key for ${missing.map((profile) => profile.name).join(", ")}, or turn on demo mode.`)
      air.setKeysOpen(true)
      return
    }
    setBusy(true)
    setMessage(null)
    saveSubmissionLinks(record.doi, record.recordVersion, collected.links)
    const panel: typeof results = []
    for (const assessorId of chosen) {
      const profile = air.profiles.find((item) => item.id === assessorId)
      if (!profile) continue
      try {
        const report = await runReview({
          profile,
          settings: air.providerSettings,
          criteria: air.criteria,
          record,
          documents: documents.length ? documents : [{ filename: "description", text: record.description }],
          conversationLinks: collected.links,
          demo: air.settings.demoMode,
        })
        const modelId = air.settings.demoMode ? `${resolvedModel(profile, air.providerSettings)} (demo)` : resolvedModel(profile, air.providerSettings)
        const stored: StoredReview = {
          id: uid("review"),
          sample: false,
          mock: air.settings.demoMode,
          doi: record.doi,
          recordId: record.id,
          conceptRecordId: record.conceptId,
          recordVersion: record.recordVersion,
          title: record.title,
          creators: record.creators.map((creator) => creator.name),
          keywords: record.keywords,
          publicationDate: record.publicationDate,
          license: record.license,
          assessorId: profile.id,
          modelId,
          provider: profile.provider,
          criteriaId: air.criteria.id,
          criteriaVersion: air.criteria.version,
          customCriteria: air.customCriteria,
          origin: "ai",
          tier: air.settings.demoMode ? "demo" : "in-depth",
          report,
          outputHash: await sha256Hex(`${modelId}\n${JSON.stringify(report)}`),
          createdAt: new Date().toISOString(),
          privateContextCount: collected.links.length,
        }
        panel.push({ assessorId, report, stored })
      } catch (caught) {
        panel.push({ assessorId, error: caught instanceof Error ? caught.message : "The reading failed." })
      }
    }
    setResults(panel)
    setBusy(false)
  }

  async function publish() {
    if (!acknowledged || !optIn) {
      setMessage("Read the notices and tick publish. A fresh reading is a new assessment of this version.")
      return
    }
    for (const review of ready) {
      const error = await air.publishReading(review)
      if (error) {
        setMessage(error)
        return
      }
    }
    setMessage("Published. This version’s AI scores are on the leaderboard. Earlier versions are unchanged.")
  }

  return (
    <div className="rounded-3xl border border-line bg-white/70 p-4">
      <h3 className="font-serif text-xl">AI reading of this version</h3>
      <p className="mt-1 text-xs text-ink-soft">
        A fresh reading is stored on this version only. It does not edit an older score. Private context links stay off the published row.{" "}
        <Link className="underline" to={`/review?doi=${encodeURIComponent(record.doi)}`}>
          Open the full reading desk
        </Link>
      </p>
      <ul className="mt-3 space-y-2">
        {air.profiles.map((profile) => (
          <li key={profile.id}>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={chosen.includes(profile.id)}
                onChange={(event) => setChosen((current) => (event.target.checked ? [...current, profile.id] : current.filter((id) => id !== profile.id)))}
              />
              <span>
                {profile.name}
                <span className="mt-0.5 block text-xs text-ink-soft">{air.settings.demoMode ? "Demo heuristic" : "Uses your key"}</span>
              </span>
            </label>
          </li>
        ))}
      </ul>
      <PrivateLinksField rows={links} onChange={setLinks} />
      <button type="button" className={`${btnPrimary} mt-3`} disabled={busy} onClick={() => void run()}>
        {busy ? "Reading…" : "Run a fresh reading of this version"}
      </button>
      {results.map((result) => {
        const profile = air.profiles.find((item) => item.id === result.assessorId)
        if (result.error || !result.report) {
          return (
            <div key={result.assessorId} className="mt-3">
              <Banner tone="error">
                {profile?.name ?? result.assessorId}: {result.error ?? "No reading."}
              </Banner>
            </div>
          )
        }
        return (
          <div key={result.assessorId} className="mt-3">
            <ReportView
              report={result.report}
              criteria={air.criteria}
              meta={{
                assessorName: profile?.name ?? result.assessorId,
                modelId: result.stored?.modelId ?? "",
                provider: result.stored?.provider ?? profile?.provider ?? "xai",
                doi: record.doi,
                recordVersion: record.recordVersion,
                createdAt: result.stored?.createdAt ?? new Date().toISOString(),
                criteriaVersion: air.criteria.version,
                customCriteria: air.customCriteria,
                mock: result.stored?.mock ?? true,
                outputHash: result.stored?.outputHash,
                stored: result.stored,
              }}
            />
          </div>
        )
      })}
      {ready.length > 0 && (
        <div className="mt-3">
          <ul className="space-y-2">
            {publishNotices.map((notice) => (
              <li key={notice.id}>
                <label className="flex items-start gap-2 text-xs">
                  <input type="checkbox" checked={Boolean(acks[notice.id])} onChange={(event) => setAcks((current) => ({ ...current, [notice.id]: event.target.checked }))} />
                  <span>
                    <span className="font-medium">{notice.title}</span>
                    <span className="mt-1 block text-ink-soft">{notice.body}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <label className="mt-2 flex items-start gap-2 text-sm">
            <input type="checkbox" checked={optIn} onChange={(event) => setOptIn(event.target.checked)} />
            <span>Publish these readings of this version. Demo readings stay in this browser.</span>
          </label>
          <button type="button" className={`${btnQuiet} mt-2`} disabled={!optIn || !acknowledged} onClick={() => void publish()}>
            Publish AI reading
          </button>
        </div>
      )}
      {message && <p className="mt-2 text-xs text-ink-soft">{message}</p>}
    </div>
  )
}

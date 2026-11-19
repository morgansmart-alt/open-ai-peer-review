import { useEffect, useState } from "react"
import { Link, useParams } from "react-router-dom"
import { keySlot } from "../domain/assessors.ts"
import { canAppendRound, ROUND_LIMIT, statusFromCheck, statusLabel } from "../domain/issues.ts"
import { buildRanking } from "../domain/ranking.ts"
import { samplePaperById, type SamplePaper } from "../domain/samples.ts"
import type { AttachmentMeta, AuthorRole, IssueThread, NodeSubmission, StoredReview, Verdict } from "../domain/types.ts"
import { useAir } from "../context/AirContext.tsx"
import { ReportView } from "../components/ReportView.tsx"
import { Banner, btnPrimary, btnQuiet, ExternalLink, fieldClass, formatWhen } from "../components/ui.tsx"
import { loadRoundLink, loadSubmissionLinks, parseConversationLink, publicContextCount, saveRoundLink, saveNodeLink } from "../domain/conversationLinks.ts"
import { ladderTier } from "../domain/fidelity.ts"
import { LineChart } from "../components/charts.tsx"
import { sha256Hex, uid } from "../services/hash.ts"
import { runIndependent, runSourceCheck, type VerdictDraft } from "../services/review.ts"
import { downloadArrayBuffer, extractDocument } from "../services/extractText.ts"
import { resolvedModel } from "../services/providers.ts"
import {
  defaultFileSelection,
  extensionOf,
  fetchRecordVersions,
  fetchRelatedSnippets,
  fetchZenodoRecord,
  isTextualFile,
  type ZenodoRecord,
} from "../services/zenodo.ts"

export function PaperPage() {
  const { recordId = "" } = useParams()
  const decoded = decodeURIComponent(recordId)
  const sample = samplePaperById(decoded)
  const air = useAir()
  const [record, setRecord] = useState<ZenodoRecord | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [newer, setNewer] = useState<{ id: string; label: string } | null>(null)
  const [documents, setDocuments] = useState<{ filename: string; text: string }[]>([])
  const [loadingText, setLoadingText] = useState(false)

  useEffect(() => {
    if (sample) {
      setRecord(sampleRecord(sample))
      setDocuments([{ filename: "sample.txt", text: `${sample.abstract}\n\n${sample.passage}` }])
      return
    }
    let cancelled = false
    setError(null)
    void fetchZenodoRecord(decoded)
      .then((next) => {
        if (cancelled) return
        setRecord(next)
        void fetchRecordVersions(next.conceptId)
          .then((versions) => {
            const later = versions.find((version) => version.publicationDate > next.publicationDate && version.id !== next.id)
            if (later) setNewer({ id: `${later.id}@${later.publicationDate}`, label: `${later.doi} (${later.publicationDate})` })
          })
          .catch(() => undefined)
      })
      .catch((caught: unknown) => {
        if (!cancelled) setError(caught instanceof Error ? caught.message : "Could not load that record.")
      })
    return () => {
      cancelled = true
    }
  }, [decoded, sample])

  const reviews = air.db.reviews.filter((review) => review.recordId === decoded)
  const row = buildRanking(air.db).find((item) => item.recordId === decoded)
  const issues = air.db.issues.filter((issue) => reviews.some((review) => review.doi === issue.doi && review.recordVersion === issue.recordVersion) || (record && issue.doi === record.doi))

  async function loadFiles() {
    if (!record || sample) return
    setLoadingText(true)
    setError(null)
    const picked = record.files.filter((file) => isTextualFile(file) && defaultFileSelection(record.files).includes(file.key))
    const next: { filename: string; text: string }[] = []
    for (const file of picked) {
      try {
        const bytes = await downloadArrayBuffer(file.downloadUrl)
        const extracted = await extractDocument(file.key, bytes)
        if (extracted.text) next.push({ filename: file.key, text: extracted.text })
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Could not read a file.")
      }
    }
    setDocuments(next)
    setLoadingText(false)
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      {!record && !error && <p className="text-sm text-ink-soft">Loading the record…</p>}
      {error && <Banner tone="error">{error}</Banner>}
      {record && (
        <>
          {record.htmlUrl ? (
            <ExternalLink href={record.htmlUrl} className="text-sm text-teal underline">
              {record.doi}
            </ExternalLink>
          ) : (
            <p className="text-sm text-teal">{record.doi}</p>
          )}
          <h1 className="mt-1 font-serif text-4xl">{record.title}</h1>
          <p className="mt-2 text-sm text-ink-soft">
            {record.creators.map((creator) => creator.name).join(", ") || "Creator unlisted"} · {record.publicationDate || "undated"} · version{" "}
            {record.recordVersion}
          </p>
          <p data-testid="tier-ladder" className="mt-3 text-sm">
            Tier: {ladderTier(reviews, air.db.nodes.filter((node) => reviews.some((review) => review.id === node.reviewId))) === "corroborated"
              ? "Independently corroborated (2+ models agree)"
              : ladderTier(reviews, air.db.nodes.filter((node) => reviews.some((review) => review.id === node.reviewId))) === "in-depth"
                ? "In-depth bring-your-own-key review"
                : "Free screening"}
            . Model names on independent checks are self-reported and cannot be proved.
          </p>
          <LineChart values={air.db.nodes.filter((node) => reviews.some((review) => review.id === node.reviewId)).map((node) => (node.verdict === "pass" ? 1 : 0))} />
          {row && <p className="mt-3 text-sm">{row.fidelity.label}. These are AI assessments, not formal peer review.</p>}
          {row?.fidelity.disputed && (
            <div className="mt-3">
              <Banner>
                Independent checks are unconvinced. A fresh reading can sit beside this one.{" "}
                <Link className="underline" to={`/review?doi=${encodeURIComponent(record.doi)}`}>
                  Re-review this version
                </Link>
              </Banner>
            </div>
          )}
          {newer && <p className="mt-3 text-sm text-gold">A newer Zenodo version is available: {newer.label}. Re-check open issues against it.</p>}
          <div className="mt-4 flex flex-wrap gap-2">
            <Link className={btnPrimary} to={`/review?doi=${encodeURIComponent(record.doi)}`}>
              Read this record
            </Link>
            {!sample && (
              <button type="button" className={btnQuiet} disabled={loadingText} onClick={() => void loadFiles()}>
                {loadingText ? "Reading files…" : documents.length ? "Files loaded" : "Load files for a source check"}
              </button>
            )}
          </div>
          <AuthorBox record={record} />
          <section className="mt-8">
            <h2 className="font-serif text-2xl">Readings</h2>
            {reviews.length === 0 && <p className="mt-2 text-sm text-ink-soft">No reading has been published for this record in the current board.</p>}
            <div className="mt-3 space-y-3">
              {reviews
                .slice()
                .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
                .map((review) => (
                  <details key={review.id} className="rounded-2xl border border-line bg-white/50 p-3">
                    <summary className="cursor-pointer text-sm">
                      {air.profiles.find((profile) => profile.id === review.assessorId)?.name ?? review.assessorId} · {review.report.overallScore.toFixed(1)} ·{" "}
                      {formatWhen(review.createdAt)}
                      {review.customCriteria ? " · unranked" : ""}
                      {review.mock ? " · demo" : ""}
                    </summary>
                    <div className="mt-3">
                      <ReportView
                        report={review.report}
                        criteria={air.criteria}
                        meta={{
                          assessorName: air.profiles.find((profile) => profile.id === review.assessorId)?.name ?? review.assessorId,
                          modelId: review.modelId,
                          provider: review.provider,
                          doi: review.doi,
                          recordVersion: review.recordVersion,
                          createdAt: review.createdAt,
                          criteriaVersion: review.criteriaVersion,
                          customCriteria: review.customCriteria,
                          mock: review.mock,
                          outputHash: review.outputHash,
                          stored: review,
                        }}
                      />
                      <IndependentForm review={review} record={record} documents={documents} />
                    </div>
                  </details>
                ))}
            </div>
          </section>
          <section className="mt-8">
            <h2 className="font-serif text-2xl">Issue threads</h2>
            <p className="mt-1 text-sm text-ink-soft">Each failure stays attached to this version. Addressed issues stop counting against the rank. Unresolved ones still nudge it.</p>
            <div className="mt-3 space-y-3">
              {issues.length === 0 && <p className="text-sm text-ink-soft">No failure has been opened.</p>}
              {issues.map((issue) => (
                <IssueCard key={issue.id} issue={issue} record={record} documents={documents} newer={newer} />
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  )
}

function sampleRecord(paper: SamplePaper): ZenodoRecord {
  return {
    id: paper.recordId,
    conceptId: paper.recordId,
    doi: paper.doi,
    conceptDoi: paper.doi,
    title: paper.title,
    creators: paper.creators,
    description: `${paper.abstract}\n\n${paper.passage}`,
    descriptionHtml: paper.abstract,
    keywords: paper.keywords,
    version: paper.publicationDate,
    recordVersion: `${paper.recordId}@${paper.publicationDate}`,
    license: paper.license,
    publicationDate: paper.publicationDate,
    related: [],
    resourceType: "Sample",
    access: { record: "public", files: "public" },
    files: paper.filenames.map((name) => ({ key: name, size: 0, downloadUrl: "", extension: extensionOf(name) })),
    htmlUrl: "",
  }
}

function AuthorBox({ record }: { record: ZenodoRecord }) {
  const air = useAir()
  const orcid = air.settings.orcid.replace(/^https?:\/\/orcid\.org\//i, "").trim()
  const listed = Boolean(orcid) && record.creators.some((creator) => creator.orcid === orcid)
  const claim = air.db.claims.find((item) => item.doi === record.doi)
  return (
    <details className="mt-4 rounded-2xl border border-line bg-white/50 p-3 text-sm">
      <summary className="cursor-pointer">Claim this record as an author</summary>
      <p className="mt-2 text-ink-soft">
        {listed
          ? "The ORCID in your settings is listed on this Zenodo record. AIR still has not authenticated you."
          : "No ORCID match. You can post as a self-declared author, and the label will say so."}
      </p>
      {claim && <p className="mt-2">Current label: {claim.displayName} · {claim.listedOnRecord ? "ORCID listed on the record" : "self-declared"}.</p>}
      <button
        type="button"
        className={`${btnQuiet} mt-2`}
        onClick={() =>
          void air.claimRecord({
            id: uid("claim"),
            doi: record.doi,
            displayName: air.settings.authorName || air.settings.nodeName || "Author",
            orcid,
            listedOnRecord: listed,
            selfDeclared: !listed,
            createdAt: new Date().toISOString(),
          })
        }
      >
        Save author label on this browser’s board
      </button>
    </details>
  )
}

function IssueCard({
  issue,
  record,
  documents,
  newer,
}: {
  issue: IssueThread
  record: ZenodoRecord
  documents: { filename: string; text: string }[]
  newer: { id: string; label: string } | null
}) {
  const air = useAir()
  const [note, setNote] = useState("")
  const [chatUrl, setChatUrl] = useState("")
  const [chatNote, setChatNote] = useState("")
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const role = authorRole(air.db.claims.find((claim) => claim.doi === record.doi)?.listedOnRecord ?? false, air.db.claims.some((claim) => claim.doi === record.doi))

  async function check(version: string) {
    if (documents.length === 0 && !record.description) {
      setMessage("Load the files first so the check has text to search.")
      return
    }
    setBusy(true)
    setMessage(null)
    try {
      const profile = air.profiles.find((item) => item.id === "grok") ?? air.profiles[0]
      if (!profile) return
      const related = air.settings.demoMode ? [] : await fetchRelatedSnippets(record).catch(() => [])
      const privateLinks = [
        ...loadSubmissionLinks(record.doi, record.recordVersion),
        ...issue.rounds.flatMap((round) => {
          const saved = loadRoundLink(round.id)
          return saved ? [saved] : []
        }),
      ]
      const draft = await runSourceCheck({
        ctx: {
          profile,
          settings: air.providerSettings,
          criteria: air.criteria,
          record: version === record.recordVersion ? record : { ...record, recordVersion: version },
          documents: documents.length ? documents : [{ filename: "description", text: record.description }],
          conversationLinks: privateLinks,
          demo: air.settings.demoMode || !air.providerSettings.keys[keySlot(profile)],
        },
        claim: issue.claim,
        quotedPassage: issue.quotedPassage,
        reason: issue.reason,
        criterionId: issue.criterionId,
        related,
      })
      const result = draft.result === "ADDRESSED" && draft.citations.length === 0 ? "NOT_ADDRESSED" : draft.result
      const status = statusFromCheck(result, issue.rounds.length, issue.recordVersion, version)
      const error = await air.addRound(
        issue.id,
        {
          id: uid("round"),
          kind: issue.rounds.some((round) => round.kind === "source-check") ? "recheck" : "source-check",
          authorLabel: air.settings.nodeName || profile.name,
          authorRole: "reader",
          result,
          citations: draft.citations,
          body: draft.explanation,
          recordVersionChecked: version,
          createdAt: new Date().toISOString(),
        },
        status,
      )
      setMessage(error ?? `${draft.result.replaceAll("_", " ")}. Status is now ${statusLabel(status)}.`)
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "The check failed.")
    } finally {
      setBusy(false)
    }
  }

  async function respond(kind: "rebuttal" | "counter") {
    if (!note.trim()) return
    if (!canAppendRound(issue)) {
      setMessage(`This thread stops at ${ROUND_LIMIT} rounds.`)
      return
    }
    const parsed = chatUrl.trim() ? parseConversationLink(chatUrl, chatNote) : null
    if (parsed && !parsed.ok) {
      setMessage(parsed.error)
      return
    }
    const roundId = uid("round")
    if (parsed && parsed.ok) saveRoundLink(roundId, parsed.link)
    const error = await air.addRound(
      issue.id,
      {
        id: roundId,
        kind,
        authorLabel: air.settings.authorName || air.settings.nodeName || "Reader",
        authorRole: role,
        citations: [],
        body: note.trim(),
        privateContextCount: parsed && parsed.ok ? 1 : 0,
        createdAt: new Date().toISOString(),
      },
      issue.status,
    )
    setMessage(error ?? (parsed && parsed.ok ? "Response saved. The chat link stays in this browser and is not published. A later source check still has to quote the publication." : null))
    if (!error) {
      setNote("")
      setChatUrl("")
      setChatNote("")
    }
  }

  return (
    <details className="rounded-2xl border border-line bg-white/50 p-3">
      <summary className="cursor-pointer text-sm">
        <span className="text-ink-soft">{statusLabel(issue.status)} · </span>
        {issue.claim}
      </summary>
      <div className="mt-3 space-y-2 text-sm">
        {issue.quotedPassage && <blockquote className="border-l-2 border-line pl-3">{issue.quotedPassage}</blockquote>}
        <ol className="space-y-2">
          {issue.rounds.map((round) => (
            <li key={round.id} className="rounded-xl bg-paper px-3 py-2">
              <span className="text-xs text-ink-soft">
                {round.kind} · {round.authorLabel} · {round.authorRole}
                {round.result ? ` · ${round.result}` : ""}
              </span>
              <p>{round.body}</p>
              {publicContextCount(round.privateContextCount) && (
                <p className="text-xs text-ink-soft">{publicContextCount(round.privateContextCount)}. Not published.</p>
              )}
              {round.citations.map((citation) => (
                <blockquote key={citation.quote} className="mt-1 border-l-2 border-teal/30 pl-2 text-ink-soft">
                  {citation.quote}
                </blockquote>
              ))}
            </li>
          ))}
        </ol>
        {message && <p className="text-ink-soft">{message}</p>}
        <div className="no-print flex flex-wrap gap-2">
          <button type="button" className={btnQuiet} disabled={busy || !canAppendRound(issue)} onClick={() => void check(record.recordVersion)}>
            Check against this version
          </button>
          {newer && (
            <button type="button" className={btnQuiet} disabled={busy || !canAppendRound(issue)} onClick={() => void check(newer.id)}>
              Re-check against the newer version
            </button>
          )}
        </div>
        <label className="block text-xs text-ink-soft" htmlFor={`note-${issue.id}`}>
          Response
          <textarea id={`note-${issue.id}`} className={`${fieldClass} mt-1`} rows={3} value={note} onChange={(event) => setNote(event.target.value)} />
        </label>
        <details className="rounded-xl border border-line p-2">
          <summary className="cursor-pointer text-xs">Private AI context link for this response (never published)</summary>
          <p className="mt-1 text-xs text-ink-soft">Sent only if you later run a source check in this browser. It does not count as addressing the issue. Quote the publication for that.</p>
          <input className={`${fieldClass} mt-2`} value={chatUrl} placeholder="https://" aria-label="Private chat link" onChange={(event) => setChatUrl(event.target.value)} />
          <input className={`${fieldClass} mt-2`} value={chatNote} placeholder="Optional note" aria-label="Private chat note" onChange={(event) => setChatNote(event.target.value)} />
        </details>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={btnQuiet} onClick={() => void respond("rebuttal")}>
            Post a response
          </button>
          <button type="button" className={btnQuiet} onClick={() => void respond("counter")}>
            Post a counter
          </button>
        </div>
      </div>
    </details>
  )
}

function privateLinksForCheck(doi: string, recordVersion: string, chatUrl: string, chatNote: string) {
  const typed = chatUrl.trim() ? parseConversationLink(chatUrl, chatNote) : null
  return [...loadSubmissionLinks(doi, recordVersion), ...(typed && typed.ok ? [typed.link] : [])]
}

function authorRole(listed: boolean, claimed: boolean): AuthorRole {
  if (listed) return "author"
  if (claimed) return "author-self-declared"
  return "reader"
}

function IndependentForm({
  review,
  record,
  documents,
}: {
  review: StoredReview
  record: ZenodoRecord
  documents: { filename: string; text: string }[]
}) {
  const air = useAir()
  const [assessorId, setAssessorId] = useState(air.profiles[0]?.id ?? "grok")
  const [draft, setDraft] = useState<VerdictDraft | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [link, setLink] = useState("")
  const [chatUrl, setChatUrl] = useState("")
  const [chatNote, setChatNote] = useState("")
  const [fileMeta, setFileMeta] = useState<AttachmentMeta | undefined>()
  const existing = air.db.nodes.some((node) => node.reviewId === review.id && node.nodeId === air.settings.nodeId)
  const profile = air.profiles.find((item) => item.id === assessorId) ?? air.profiles[0]

  async function generate() {
    if (!profile) return
    setBusy(true)
    setMessage(null)
    try {
      const next = await runIndependent({
        ctx: {
          profile,
          settings: air.providerSettings,
          criteria: air.criteria,
          record,
          documents: documents.length ? documents : [{ filename: "description", text: record.description }],
          conversationLinks: privateLinksForCheck(review.doi, review.recordVersion, chatUrl, chatNote),
          demo: air.settings.demoMode || !air.providerSettings.keys[keySlot(profile)],
        },
        original: review.report,
      })
      setDraft(next)
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "The check failed.")
    } finally {
      setBusy(false)
    }
  }

  async function submit() {
    if (!draft || !profile) return
    let attachment = fileMeta
    if (!attachment && link.trim()) {
      try {
        const url = new URL(link.trim())
        if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("Use an http(s) link.")
        attachment = { name: url.href, kind: "link", bytes: 0, sha256: await sha256Hex(url.href), url: url.href }
      } catch (caught) {
        setMessage(caught instanceof Error ? caught.message : "That link is not usable.")
        return
      }
    }
    const chat = chatUrl.trim() ? parseConversationLink(chatUrl, chatNote) : null
    if (chat && !chat.ok) {
      setMessage(chat.error)
      return
    }
    const nodeId = uid("node")
    if (chat && chat.ok) saveNodeLink(nodeId, chat.link)
    const node: NodeSubmission = {
      id: nodeId,
      privateContextCount: chat && chat.ok ? 1 : 0,
      trusted: !air.settings.demoMode && review.tier !== "free-screening",
      promptHash: draft.promptHash,
      selfReported: true,
      reviewId: review.id,
      doi: review.doi,
      recordVersion: review.recordVersion,
      nodeId: air.settings.nodeId,
      nodeName: air.settings.nodeName || "guest-node",
      assessorId: profile.id,
      modelId: air.settings.demoMode ? `${resolvedModel(profile, air.providerSettings)} (demo)` : resolvedModel(profile, air.providerSettings),
      criteriaVersion: air.criteria.version,
      customCriteria: air.customCriteria,
      verdict: draft.verdict,
      summary: draft.summary,
      judgements: draft.judgements,
      errorsFound: draft.errorsFound,
      failureModes: draft.verdict === "fail" ? draft.failureModes : [],
      attachment,
      createdAt: new Date().toISOString(),
      mock: air.settings.demoMode || review.mock,
    }
    const error = await air.publishCheck(node)
    setMessage(error ?? "Check submitted. It now counts toward the trust badge, unless it used custom criteria.")
  }

  return (
    <div className="no-print mt-4 rounded-2xl border border-dashed border-line p-3">
      <h3 className="text-sm font-medium">Independent review</h3>
      <p className="mt-1 text-xs text-ink-soft">
        Run your own check of this reading with your key, edit the verdict, then submit it as this browser’s node. One verdict per node per reading.
      </p>
      {existing && <p className="mt-2 text-xs text-gold">This node has already checked this reading.</p>}
      <label className="mt-2 block text-xs text-ink-soft">
        Assessor
        <select className={`${fieldClass} mt-1`} value={assessorId} onChange={(event) => setAssessorId(event.target.value)}>
          {air.profiles.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      </label>
      <button type="button" className={`${btnQuiet} mt-2`} disabled={busy || existing} onClick={() => void generate()}>
        {busy ? "Checking…" : "Draft a check"}
      </button>
      {draft && (
        <div className="mt-3 space-y-2 text-sm">
          <fieldset>
            <legend className="text-xs text-ink-soft">Verdict</legend>
            {(["pass", "fail"] as Verdict[]).map((verdict) => (
              <label key={verdict} className="mr-3">
                <input type="radio" name={`verdict-${review.id}`} checked={draft.verdict === verdict} onChange={() => setDraft({ ...draft, verdict })} /> {verdict}
              </label>
            ))}
          </fieldset>
          <textarea className={fieldClass} rows={3} value={draft.summary} onChange={(event) => setDraft({ ...draft, summary: event.target.value })} />
          <details>
            <summary className="cursor-pointer text-xs">Per-criterion agree / disagree</summary>
            <ul className="mt-2 space-y-1">
              {draft.judgements.map((judgement, index) => (
                <li key={judgement.criterionId}>
                  <label className="text-xs">
                    <input
                      type="checkbox"
                      checked={judgement.agree}
                      onChange={(event) => {
                        const judgements = draft.judgements.slice()
                        const current = judgements[index]
                        if (!current) return
                        judgements[index] = { ...current, agree: event.target.checked }
                        setDraft({ ...draft, judgements })
                      }}
                    />{" "}
                    {judgement.criterionId}
                    {judgement.theirScore !== null ? ` · their score ${judgement.theirScore}` : ""}
                  </label>
                </li>
              ))}
            </ul>
          </details>
          <details className="rounded-xl border border-line p-2">
            <summary className="cursor-pointer text-xs">Private AI context link (never published)</summary>
            <p className="mt-1 text-xs text-ink-soft">Used only in this check’s prompt. The public result stores a count, not the address.</p>
            <input className={`${fieldClass} mt-2`} value={chatUrl} placeholder="https://" aria-label="Node private chat link" onChange={(event) => setChatUrl(event.target.value)} />
            <input className={`${fieldClass} mt-2`} value={chatNote} placeholder="Optional note" aria-label="Node private chat note" onChange={(event) => setChatNote(event.target.value)} />
          </details>
          <label className="block text-xs text-ink-soft">
            Optional link to a simulation or verification output
            <input className={`${fieldClass} mt-1`} value={link} placeholder="https://…" onChange={(event) => setLink(event.target.value)} />
          </label>
          <label className="block text-xs text-ink-soft">
            Or attach a JSON, CSV, or text result (100 KB)
            <input
              className="mt-1 block text-xs"
              type="file"
              accept=".json,.csv,.txt,text/plain,application/json"
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (!file) return
                void (async () => {
                  if (file.size > 100_000) {
                    setMessage("Attachments are limited to 100 KB.")
                    return
                  }
                  const text = await file.text()
                  const kind = file.name.endsWith(".csv") ? "csv" : file.name.endsWith(".json") ? "json" : "text"
                  setFileMeta({
                    name: file.name,
                    kind,
                    bytes: file.size,
                    sha256: await sha256Hex(text),
                    preview: text.slice(0, 1500),
                  })
                  setLink("")
                  setMessage(`Attached ${file.name}. It will be stored as a hash plus a short preview.`)
                })()
              }}
            />
          </label>
          {fileMeta && <p className="text-xs text-ink-soft">Attached {fileMeta.name} · {fileMeta.sha256.slice(0, 12)}</p>}
          <button type="button" className={btnPrimary} disabled={existing} onClick={() => void submit()}>
            Submit independent check
          </button>
        </div>
      )}
      {message && <p className="mt-2 text-xs text-ink-soft">{message}</p>}
    </div>
  )
}

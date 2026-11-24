import { useEffect, useState } from "react"
import { Link, useParams } from "react-router-dom"
import { keySlot } from "../domain/assessors.ts"
import { canAppendRound, commentStatus, humanQuoteCheck, latestAuthorClaim, newerVersion, roleLabel, ROUND_LIMIT, statusFromCheck, statusLabel } from "../domain/issues.ts"
import { buildRanking } from "../domain/ranking.ts"
import { boardValue } from "../domain/scoring.ts"
import { samplePaperById, type SamplePaper } from "../domain/samples.ts"
import type { AttachmentMeta, AuthorRole, IssueThread, NodeSubmission, StoredReview, Verdict } from "../domain/types.ts"
import { isCommunityAiRecord } from "../domain/moltbook.ts"
import { carryForwardWorkList, isHumanReview, mergeLineage, publicationPlainText, scoreLineage, settleCheckResult, stableVersionId } from "../domain/versions.ts"
import { useAir } from "../context/AirContext.tsx"
import { ReportView } from "../components/ReportView.tsx"
import { ReviewWorkspace } from "../components/ReviewWorkspace.tsx"
import { MoltbookPanel } from "../components/MoltbookPanel.tsx"
import { VersionBar } from "../components/VersionBar.tsx"
import { WorkList } from "../components/WorkList.tsx"
import { FilePicker } from "../components/FilePicker.tsx"
import { Banner, btnPrimary, btnQuiet, ExternalLink, fieldClass, formatWhen } from "../components/ui.tsx"
import { isPrivateShareLink, loadRoundLink, loadSubmissionLinks, parseConversationLink, publicContextCount, saveRoundLink, saveNodeLink } from "../domain/conversationLinks.ts"
import { ladderTier } from "../domain/fidelity.ts"
import { LineChart } from "../components/charts.tsx"
import { sha256Hex, uid } from "../services/hash.ts"
import { prepareRecheck } from "../services/recheck.ts"
import { runIndependent, runSourceCheck, type VerdictDraft } from "../services/review.ts"
import { fileSelectionFor, rememberFileSelection } from "../services/fileSelection.ts"
import { loadVersionDocuments } from "../services/versionText.ts"
import { downloadReceipt, lookupReceipt, savePrivateContext } from "../services/privateContext.ts"
import { resolvedModel } from "../services/providers.ts"
import {
  extensionOf,
  fetchRecordVersions,
  fetchRelatedSnippets,
  fetchZenodoRecord,
  formatRecordStamp,
  formatVersionLabel,
  isDepositedCodeOrData,
  isTextualFile,
  parseRecordRef,
  selectionWithCodeData,
  type ZenodoRecord,
  type ZenodoVersion,
} from "../services/zenodo.ts"

export function PaperPage() {
  const { recordId = "" } = useParams()
  const decoded = decodeURIComponent(recordId)
  const sample = samplePaperById(decoded)
  const lookupId = sample ? decoded : (parseRecordRef(decoded)?.recordId ?? decoded)
  const air = useAir()
  const [record, setRecord] = useState<ZenodoRecord | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [versions, setVersions] = useState<ZenodoVersion[]>([])
  const [documents, setDocuments] = useState<{ filename: string; text: string }[]>([])
  const [selectedFiles, setSelectedFiles] = useState<string[]>([])
  const [includeCodeData, setIncludeCodeData] = useState(true)
  const [loadingText, setLoadingText] = useState(false)
  const [recheckNote, setRecheckNote] = useState<string | null>(null)
  const [recheckBusy, setRecheckBusy] = useState(false)

  useEffect(() => {
    if (sample) {
      setRecord(sampleRecord(sample))
      setDocuments([{ filename: "sample.txt", text: `${sample.abstract}\n\n${sample.passage}` }])
      setSelectedFiles([])
      return
    }
    let cancelled = false
    setError(null)
    setVersions([])
    setDocuments([])
    void fetchZenodoRecord(lookupId)
      .then((next) => {
        if (cancelled) return
        setRecord(next)
        const picked = fileSelectionFor(next.id, next.files)
        setSelectedFiles(picked)
        const codeFiles = next.files.filter((file) => isDepositedCodeOrData(file))
        setIncludeCodeData(codeFiles.length === 0 || codeFiles.some((file) => picked.includes(file.key)))
        setDocuments([])
        void fetchRecordVersions(next.conceptId)
          .then((found) => {
            if (!cancelled) setVersions(found)
          })
          .catch(() => undefined)
      })
      .catch((caught: unknown) => {
        if (!cancelled) setError(caught instanceof Error ? caught.message : "Could not load that record.")
      })
    return () => {
      cancelled = true
    }
  }, [lookupId, sample])

  const reviews = record ? air.db.reviews.filter((review) => review.recordId === record.id || review.doi === record.doi) : []
  const aiReviews = reviews.filter((review) => !isHumanReview(review) && !isCommunityAiRecord(review))
  const humanReviews = reviews.filter((review) => isHumanReview(review) && !isCommunityAiRecord(review))
  const ranking = buildRanking(air.db)
  const row = ranking.find((item) => item.recordId === record?.id)
  const laterRef = record ? newerVersion(versions, record.id) : null
  const later = laterRef ? (versions.find((version) => version.id === laterRef.id) ?? null) : null
  const conceptDois = record
    ? [...new Set([record.doi, ...versions.map((version) => version.doi), ...air.db.reviews.filter((review) => review.conceptRecordId === record.conceptId).map((review) => review.doi)])]
    : []
  const carried = record
    ? carryForwardWorkList({ issues: air.db.issues, current: { doi: record.doi, recordVersion: record.recordVersion }, conceptDois })
    : { outstanding: [], closed: [] }
  const openedHere = air.db.issues.filter((issue) => record && issue.doi === record.doi && issue.recordVersion === record.recordVersion)
  const lineage = record ? mergeLineage(scoreLineage(ranking, record.conceptId), versions.map((version) => ({ id: version.id, doi: version.doi, publicationDate: version.publicationDate, recordVersion: version.stableId }))) : []

  async function loadFiles() {
    if (!record || sample) return
    setLoadingText(true)
    setError(null)
    const next = await loadVersionDocuments(record, selectedFiles)
    if (next.length === 0 && record.files.some((file) => isTextualFile(file))) setError("Could not read this version’s files.")
    setDocuments(next)
    setLoadingText(false)
  }

  async function recheck(issue: IssueThread, targetRecordId: string): Promise<string> {
    if (!record) return "Load the record first."
    const profile = air.profiles.find((item) => item.id === "grok") ?? air.profiles[0]
    if (!profile) return "No assessor is configured."
    try {
      const sameTarget = targetRecordId === record.id
      const reusable =
        sameTarget && selectedFiles.length > 0 && selectedFiles.every((key) => documents.some((doc) => doc.filename === key && doc.text.trim()))
          ? documents.filter((doc) => selectedFiles.includes(doc.filename))
          : []
      const prepared = await prepareRecheck({
        current: record,
        loadedDocuments: reusable,
        targetRecordId,
        issueRecordVersion: issue.recordVersion,
        fetchRecord: fetchZenodoRecord,
        loadDocuments: (target) => loadVersionDocuments(target, target.id === record.id ? selectedFiles : undefined),
      })
      if (prepared.target.id === record.id) setDocuments(prepared.documents)
      const searched = publicationPlainText(prepared.documents, prepared.target.description)
      const related = air.settings.demoMode ? [] : await fetchRelatedSnippets(prepared.target).catch(() => [])
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
          record: prepared.target,
          documents: prepared.documents,
          conversationLinks: privateLinks,
          demo: air.settings.demoMode || !air.providerSettings.keys[keySlot(profile)],
        },
        claim: issue.claim,
        quotedPassage: issue.quotedPassage,
        reason: issue.reason,
        criterionId: issue.criterionId,
        related,
      })
      const settled = settleCheckResult(draft.result === "ADDRESSED" && draft.citations.length === 0 ? "NOT_ADDRESSED" : draft.result, draft.citations, searched)
      const status = statusFromCheck(settled.result, issue.rounds, issue.recordVersion, prepared.checkedVersionId)
      const unverified = settled.result !== draft.result
      const error = await air.addRound(
        issue.id,
        {
          id: uid("round"),
          kind: issue.rounds.some((round) => round.kind === "source-check" || round.kind === "recheck") ? "recheck" : "source-check",
          authorLabel: air.settings.nodeName || profile.name,
          authorRole: "ai-recheck",
          result: settled.result,
          citations: settled.citations,
          body: unverified
            ? `${draft.explanation} No quotation from this version’s text could be verified, so the issue is not marked addressed. A private chat link cannot close it.`
            : draft.explanation,
          recordVersionChecked: prepared.checkedVersionId,
          createdAt: new Date().toISOString(),
        },
        status,
      )
      return error ?? `${settled.result.replaceAll("_", " ")}. Checked ${prepared.checkedVersionId}. Status is now ${statusLabel(status)}.`
    } catch (caught) {
      return caught instanceof Error ? caught.message : "The check failed."
    }
  }

  async function recheckOne(issue: IssueThread, targetRecordId: string) {
    setRecheckBusy(true)
    setRecheckNote(null)
    const message = await recheck(issue, targetRecordId)
    setRecheckNote(message)
    setRecheckBusy(false)
  }

  async function recheckAll(issues: IssueThread[]) {
    if (!record) return
    setRecheckBusy(true)
    const notes: string[] = []
    for (let index = 0; index < issues.length; index += 1) {
      const issue = issues[index]
      if (!issue) continue
      setRecheckNote(`Re-checking ${index + 1} of ${issues.length}.`)
      notes.push(await recheck(issue, record.id))
    }
    setRecheckNote(notes.join(" "))
    setRecheckBusy(false)
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
          <Link className="ml-3 text-sm text-teal underline" to={`/paper/${encodeURIComponent(record.id)}/text`}>
            Plain text
          </Link>
          <h1 className="mt-1 font-serif text-4xl">{record.title}</h1>
          <p className="mt-2 text-sm text-ink-soft">
            {record.creators.map((creator) => creator.name).join(", ") || "Creator unlisted"} · {record.license || "license unlisted"} ·{" "}
            {formatRecordStamp(record)}
          </p>
          <p data-testid="tier-ladder" className="mt-3 text-sm">
            Tier: {ladderTier(aiReviews, air.db.nodes.filter((node) => aiReviews.some((review) => review.id === node.reviewId))) === "corroborated"
              ? "Independently corroborated (2+ models agree)"
              : ladderTier(aiReviews, air.db.nodes.filter((node) => aiReviews.some((review) => review.id === node.reviewId))) === "in-depth"
                ? "In-depth bring-your-own-key review"
                : "Free screening"}
            . Model names on independent checks are self-reported and cannot be proved. Human reviews and community AI replies are labelled separately and do not change this tier.
          </p>
          <LineChart values={air.db.nodes.filter((node) => aiReviews.some((review) => review.id === node.reviewId)).map((node) => (node.verdict === "pass" ? 1 : 0))} />
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
          {later && (
            <p className="mt-3 text-sm text-gold">
              A newer Zenodo version is available:{" "}
              <Link className="underline" to={`/paper/${encodeURIComponent(later.id)}`}>
                {later.doi} ({later.publicationDate || "undated"})
              </Link>
              . Open it to continue from the outstanding issues. A re-check loads that version’s files.
            </p>
          )}
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
          {!sample && record.files.length > 0 && (
            <FilePicker
              compact
              className="mt-6"
              files={record.files}
              selected={selectedFiles}
              legend="Files for a re-check of this version"
              includeCodeData={includeCodeData}
              hint="A re-check of this version reads only the files you leave ticked. Another version is never searched with this list. The manuscript is ticked first, then supplements, other PDFs, text, and a zip when it still fits. Text, code, and markdown inside a zip are read. Images are figures not read. Your last choice for this record is kept on this browser."
              onIncludeCodeData={(next) => {
                setIncludeCodeData(next)
                setSelectedFiles((current) => {
                  const keys = selectionWithCodeData(record.files, current, next)
                  rememberFileSelection(record.id, keys)
                  return keys
                })
                setDocuments([])
              }}
              onChange={(keys) => {
                setSelectedFiles(keys)
                setDocuments([])
                rememberFileSelection(record.id, keys)
              }}
            />
          )}
          <AuthorBox record={record} />
          <VersionBar currentId={record.id} versions={versions} lineage={lineage} />
          <WorkList
            record={record}
            outstanding={carried.outstanding}
            closed={carried.closed}
            busy={recheckBusy}
            note={recheckNote}
            onRecheck={(issue) => void recheckOne(issue, record.id)}
            onRecheckAll={() => void recheckAll(carried.outstanding)}
          />
          <ReviewWorkspace record={record} documents={documents.length ? documents : [{ filename: "description", text: record.description }]} />
          <section className="mt-8">
            <h2 className="font-serif text-2xl">AI readings</h2>
            {aiReviews.length === 0 && (
              <div className="mt-2">
                <p className="text-sm text-ink-soft">No AI reading has been published for this version.</p>
                <Link className={`${btnPrimary} mt-3`} to={`/review?doi=${encodeURIComponent(record.doi)}&guide=1`}>
                  Run a free AI review
                </Link>
              </div>
            )}
            <div className="mt-3 space-y-3">
              {aiReviews
                .slice()
                .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
                .map((review) => (
                  <details key={review.id} className="rounded-2xl border border-line bg-white/50 p-3">
                    <summary className="cursor-pointer text-sm">
                      {air.profiles.find((profile) => profile.id === review.assessorId)?.name ?? review.assessorId} · {boardValue(review.report.overallScore, review.report, review.criteriaVersion).toFixed(0)} / 100 ·{" "}
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
            <h2 className="font-serif text-2xl">Human reviews</h2>
            <p className="mt-1 text-sm text-ink-soft">These scores are not part of the AI panel median. Possible is not marked proven.</p>
            {humanReviews.length === 0 && <p className="mt-2 text-sm text-ink-soft">No human review has been published for this version.</p>}
            <div className="mt-3 space-y-3">
              {humanReviews
                .slice()
                .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
                .map((review) => (
                  <details key={review.id} className="rounded-2xl border border-line bg-white/50 p-3">
                    <summary className="cursor-pointer text-sm">
                      Human reviewer · {boardValue(review.report.overallScore, review.report, review.criteriaVersion).toFixed(0)} / 100 · {formatWhen(review.createdAt)}
                      {review.customCriteria ? " · unranked" : ""}
                    </summary>
                    <div className="mt-3">
                      <ReportView
                        report={review.report}
                        criteria={air.criteria}
                        meta={{
                          assessorName: "Human reviewer",
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
                    </div>
                  </details>
                ))}
            </div>
          </section>
          <MoltbookPanel
            record={{
              id: record.id,
              doi: record.doi,
              conceptDoi: record.conceptDoi,
              title: record.title,
              recordVersion: record.recordVersion,
              creators: record.creators,
            }}
            allowQueue={!sample}
          />
          <section className="mt-8">
            <h2 className="font-serif text-2xl">Issue threads on this version</h2>
            <p className="mt-1 text-sm text-ink-soft">
              Each failure stays attached to the version where it was opened. A re-check against a later version appends a round and searches that version’s text. Addressed issues stop counting against the rank.
            </p>
            <div className="mt-3 space-y-3">
              {openedHere.length === 0 && carried.outstanding.length === 0 && <p className="text-sm text-ink-soft">No failure has been opened on this version.</p>}
              {[...openedHere, ...carried.outstanding.filter((issue) => !openedHere.some((item) => item.id === issue.id))].map((issue) => (
                <IssueCard
                  key={issue.id}
                  issue={issue}
                  record={record}
                  later={later}
                  busy={recheckBusy}
                  publicationText={publicationPlainText(documents, record.description)}
                  onRecheck={(targetId) => void recheckOne(issue, targetId)}
                />
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
  const claim = latestAuthorClaim(air.db.claims, record.doi)
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
  later,
  busy,
  publicationText,
  onRecheck,
}: {
  issue: IssueThread
  record: ZenodoRecord
  later: ZenodoVersion | null
  busy: boolean
  publicationText: string
  onRecheck: (targetRecordId: string) => void
}) {
  const air = useAir()
  const [note, setNote] = useState("")
  const [quote, setQuote] = useState("")
  const [quoteResult, setQuoteResult] = useState<"ADDRESSED" | "PARTIALLY_ADDRESSED" | "NOT_ADDRESSED">("ADDRESSED")
  const [chatUrl, setChatUrl] = useState("")
  const [chatNote, setChatNote] = useState("")
  const [message, setMessage] = useState<string | null>(null)
  const [receipt, setReceipt] = useState<string | null>(null)
  const [receiptCheck, setReceiptCheck] = useState("")
  const [receiptResult, setReceiptResult] = useState<string | null>(null)
  const claim = latestAuthorClaim(air.db.claims, record.doi)
  const role = authorRole(claim?.listedOnRecord ?? false, Boolean(claim))
  const onScreenVersion = record.recordVersion === issue.recordVersion ? issue.recordVersion : stableVersionId(record)
  const sameVersionCheck = canAppendRound(issue, {
    kind: issue.rounds.some((round) => round.kind === "source-check" || round.kind === "recheck") ? "recheck" : "source-check",
    recordVersionChecked: onScreenVersion,
  })
  const laterCheck = later
    ? canAppendRound(issue, { kind: "recheck", recordVersionChecked: later.stableId })
    : false

  async function respond(kind: "rebuttal" | "counter" | "comment") {
    if (!note.trim()) return
    if (!canAppendRound(issue)) {
      setMessage(`This version already has ${ROUND_LIMIT} rounds. A re-check on a later version can start again.`)
      return
    }
    const parsed = chatUrl.trim() ? parseConversationLink(chatUrl, chatNote) : null
    if (parsed && !parsed.ok) {
      setMessage(parsed.error)
      return
    }
    if (parsed && parsed.ok && !isPrivateShareLink(parsed.link.url)) {
      setMessage("Use a Grok, ChatGPT, Claude, or Gemini share link. The link itself is never published.")
      return
    }
    let archiveNote = ""
    if (parsed && parsed.ok) {
      const archived = await savePrivateContext({
        doi: record.doi,
        issueId: issue.id,
        linkUrl: parsed.link.url,
        provider: parsed.link.provider,
      })
      if (archived.state === "rejected") {
        setMessage(archived.reason)
        return
      }
      if (archived.state === "saved") {
        setReceipt(archived.secret)
        archiveNote =
          archived.snapshot === "fetch_failed"
            ? "The link is in the private archive. Its page text could not be copied yet. Save the receipt below. AIR does not keep the secret."
            : "The link is in the private archive. Only this written answer and a count are public. Save the receipt below. AIR does not keep the secret."
      } else {
        archiveNote = "The private archive is not available yet, so this link stays in this browser only and is not published."
      }
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
      kind === "comment" ? commentStatus(issue.status) : issue.status,
    )
    const savedLocally = Boolean(error?.startsWith("Saved on this browser"))
    setMessage(
      error ??
        (kind === "comment"
          ? "Comment saved. It does not change the score or the issue status."
          : archiveNote || (parsed && parsed.ok ? "Response saved. The chat link is not published. A later source check still has to quote the publication." : null)),
    )
    if (!error || savedLocally) {
      setNote("")
      setChatUrl("")
      setChatNote("")
    }
  }

  async function quoteCheck() {
    const checked = humanQuoteCheck({ quote, note, result: quoteResult, publicationText })
    if (!checked.ok) {
      setMessage(checked.error)
      return
    }
    const kind = issue.rounds.some((round) => round.kind === "source-check" || round.kind === "recheck") ? "recheck" : "source-check"
    if (!canAppendRound(issue, { kind, recordVersionChecked: onScreenVersion })) {
      setMessage(`This version already has ${ROUND_LIMIT} rounds. A re-check on a later version can start again.`)
      return
    }
    const status = statusFromCheck(checked.result, issue.rounds, issue.recordVersion, onScreenVersion)
    const error = await air.addRound(
      issue.id,
      {
        id: uid("round"),
        kind,
        authorLabel: air.settings.authorName || air.settings.nodeName || "Reader",
        authorRole: "human-reviewer",
        result: checked.result,
        citations: checked.citations,
        body: checked.body,
        recordVersionChecked: onScreenVersion,
        createdAt: new Date().toISOString(),
      },
      status,
    )
    setMessage(error ?? `${checked.result.replaceAll("_", " ")}. Quoted from this version. No model was called. Status is now ${statusLabel(status)}.`)
    if (!error) {
      setQuote("")
      setNote("")
    }
  }

  return (
    <details className="rounded-2xl border border-line bg-white/50 p-3">
      <summary className="cursor-pointer text-sm">
        <span className="text-ink-soft">{statusLabel(issue.status)} · </span>
        {issue.recordVersion !== record.recordVersion ? `Opened on ${formatVersionLabel(issue.recordVersion)} · ` : ""}
        {issue.claim}
      </summary>
      <div className="mt-3 space-y-2 text-sm">
        {issue.quotedPassage && <blockquote className="border-l-2 border-line pl-3">{issue.quotedPassage}</blockquote>}
        <ol className="space-y-2">
          {issue.rounds.map((round) => (
            <li key={round.id} className="rounded-xl bg-paper px-3 py-2">
              <span className="text-xs text-ink-soft">
                {round.kind} · {round.authorLabel} · {roleLabel(round.authorRole)}
                {round.result ? ` · ${round.result}` : ""}
                {round.recordVersionChecked ? ` · checked ${formatVersionLabel(round.recordVersionChecked)}` : ""}
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
          <button type="button" className={btnQuiet} disabled={busy || !sameVersionCheck} onClick={() => onRecheck(record.id)}>
            Check against this version
          </button>
          {later && (
            <button type="button" className={btnQuiet} disabled={busy || !laterCheck} onClick={() => onRecheck(later.id)}>
              Re-check against the newer version
            </button>
          )}
        </div>
        <label className="block text-xs text-ink-soft" htmlFor={`note-${issue.id}`}>
          Response
          <textarea id={`note-${issue.id}`} className={`${fieldClass} mt-1`} rows={3} value={note} onChange={(event) => setNote(event.target.value)} />
        </label>
        <label className="block text-xs text-ink-soft" htmlFor={`private-link-${issue.id}`}>
          Private context link (never published)
          <input id={`private-link-${issue.id}`} className={`${fieldClass} mt-1`} value={chatUrl} placeholder="https://chatgpt.com/share/…" onChange={(event) => setChatUrl(event.target.value)} />
        </label>
        <p className="text-xs text-ink-soft">
          Only the written answer above and a count are public. A Grok, ChatGPT, Claude, or Gemini share link is archived privately. The chat’s wording, including mistakes and tone, is not published. Quote the publication to address the issue.
        </p>
        <details className="rounded-xl border border-line p-2">
          <summary className="cursor-pointer text-xs">Optional note for this browser only</summary>
          <input className={`${fieldClass} mt-2`} value={chatNote} placeholder="What this conversation covers" aria-label="Private chat note" onChange={(event) => setChatNote(event.target.value)} />
        </details>
        {receipt && (
          <div className="rounded-xl border border-teal/40 bg-teal/5 p-3 text-xs">
            <p className="font-medium">Receipt secret</p>
            <p className="mt-1 break-all font-mono">{receipt}</p>
            <p className="mt-1 text-ink-soft">Save this now. AIR does not keep it. Anyone who has it can read that private archive.</p>
            <button type="button" className={`${btnQuiet} mt-2`} onClick={() => downloadReceipt(receipt, record.doi)}>
              Download receipt
            </button>
          </div>
        )}
        <details className="rounded-xl border border-line p-2">
          <summary className="cursor-pointer text-xs">Look up a private archive with a receipt</summary>
          <input className={`${fieldClass} mt-2`} value={receiptCheck} aria-label="Receipt secret" onChange={(event) => setReceiptCheck(event.target.value)} />
          <button
            type="button"
            className={`${btnQuiet} mt-2`}
            onClick={() =>
              void lookupReceipt(receiptCheck).then((result) => {
                if (result.state === "unavailable") setReceiptResult("The private archive is not available yet.")
                else if (result.state === "rejected") setReceiptResult(result.reason)
                else if (result.rows.length === 0) setReceiptResult("No private archive matches that receipt.")
                else setReceiptResult(result.rows.map((row) => `${row.provider ?? "Link"} · ${row.snapshot_status ?? "pending"} · ${row.doi}`).join("\n"))
              })
            }
          >
            Check receipt
          </button>
          {receiptResult && <p className="mt-2 whitespace-pre-wrap text-ink-soft">{receiptResult}</p>}
        </details>
        <div className="rounded-xl border border-line p-2">
          <p className="text-xs font-medium">Quote-check this version</p>
          <p className="mt-1 text-xs text-ink-soft">Paste a sentence from the loaded text. AIR checks the quotation itself. No model is called. Load the files above first.</p>
          <label className="mt-2 block text-xs text-ink-soft" htmlFor={`quote-${issue.id}`}>
            Quotation from this version
            <textarea id={`quote-${issue.id}`} className={`${fieldClass} mt-1`} rows={2} value={quote} onChange={(event) => setQuote(event.target.value)} />
          </label>
          <label className="mt-2 block text-xs text-ink-soft" htmlFor={`quote-result-${issue.id}`}>
            What the quotation shows
            <select id={`quote-result-${issue.id}`} className={`${fieldClass} mt-1`} value={quoteResult} onChange={(event) => setQuoteResult(event.target.value as typeof quoteResult)}>
              <option value="ADDRESSED">Addressed</option>
              <option value="PARTIALLY_ADDRESSED">Partially addressed</option>
              <option value="NOT_ADDRESSED">Not addressed</option>
            </select>
          </label>
          <button type="button" className={`${btnQuiet} mt-2`} onClick={() => void quoteCheck()}>
            Check this quotation
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={btnQuiet} onClick={() => void respond("rebuttal")}>
            Post a response
          </button>
          <button type="button" className={btnQuiet} onClick={() => void respond("counter")}>
            Post a counter
          </button>
          <button type="button" className={btnQuiet} onClick={() => void respond("comment")}>
            Post a comment
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
      humanEdited: true,
      mock: air.settings.demoMode || review.mock,
    }
    const error = await air.publishCheck(node)
    setMessage(error ?? "Check submitted. It now counts toward the trust badge, unless it used custom criteria.")
  }

  return (
    <div className="no-print mt-4 rounded-2xl border border-dashed border-line p-3">
      <h3 className="text-sm font-medium">Independent review</h3>
      <p className="mt-1 text-xs text-ink-soft">
        Run your own check of this reading with your key, edit the verdict, then submit it as this browser’s node. The submitted check is labelled human-edited. One verdict per node per reading, and any one node is capped at 40% of the badge. It is not an AI median.
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

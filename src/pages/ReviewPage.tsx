import { useEffect, useMemo, useState } from "react"
import { Link, useSearchParams } from "react-router-dom"
import { PrivateLinksField, exampleLinkDraft, type LinkDraft } from "../components/PrivateLinks.tsx"
import { collectConversationLinks, saveSubmissionLinks } from "../domain/conversationLinks.ts"
import { publishNotices } from "../content/notices.ts"
import { keySlot } from "../domain/assessors.ts"
import { median } from "../domain/ranking.ts"
import type { ReviewReport, StoredReview } from "../domain/types.ts"
import { useAir } from "../context/AirContext.tsx"
import { ReportView } from "../components/ReportView.tsx"
import { Banner, btnPrimary, btnQuiet, ExternalLink, fieldClass } from "../components/ui.tsx"
import { sha256Hex, uid } from "../services/hash.ts"
import { resolvedModel } from "../services/providers.ts"
import { FREE_BROWSER_MODEL, FREE_BROWSER_SIZE, FREE_LABEL, runFreeScreening } from "../services/freeReview.ts"
import { runReview } from "../services/review.ts"
import { downloadArrayBuffer, extractDocument, type ExtractedDocument } from "../services/extractText.ts"
import {
  defaultFileSelection,
  fetchZenodoRecord,
  filesAreRestricted,
  formatBytes,
  isTextualFile,
  parseRecordRef,
  type ZenodoRecord,
} from "../services/zenodo.ts"

interface PanelResult {
  assessorId: string
  report?: ReviewReport
  error?: string
  stored?: StoredReview
}

export function ReviewPage() {
  const air = useAir()
  const [params] = useSearchParams()
  const [input, setInput] = useState(params.get("doi") ?? "")
  const [record, setRecord] = useState<ZenodoRecord | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [selected, setSelected] = useState<string[]>([])
  const [docs, setDocs] = useState<ExtractedDocument[]>([])
  const [assessors, setAssessors] = useState<string[]>(["grok", "gpt", "claude", "gemini"])
  const [results, setResults] = useState<PanelResult[]>([])
  const [optIn, setOptIn] = useState(false)
  const [acks, setAcks] = useState<Record<string, boolean>>({})
  const [linkDrafts, setLinkDrafts] = useState<LinkDraft[]>([exampleLinkDraft()])
  const [published, setPublished] = useState(false)
  const acknowledged = publishNotices.every((notice) => acks[notice.id])

  useEffect(() => {
    const initial = params.get("doi")
    if (initial) setInput(initial)
  }, [params])

  async function loadRecord(raw?: string) {
    const parsed = parseRecordRef(raw ?? input)
    if (!parsed) {
      setError("Paste a Zenodo link or a DOI like 10.5281/zenodo.18916931.")
      return
    }
    setBusy(true)
    setError(null)
    setStatus("Fetching the Zenodo record…")
    setResults([])
    setPublished(false)
    setDocs([])
    try {
      const next = await fetchZenodoRecord(parsed.recordId)
      setRecord(next)
      setSelected(defaultFileSelection(next.files))
      setStatus(null)
    } catch (caught) {
      setRecord(null)
      setError(caught instanceof Error ? caught.message : "Could not fetch that record.")
    } finally {
      setBusy(false)
    }
  }

  async function ensureDocs(): Promise<ExtractedDocument[]> {
    if (!record) return []
    const wanted = record.files.filter((file) => selected.includes(file.key))
    const have = new Map(docs.map((doc) => [doc.filename, doc]))
    const next = [...docs]
    for (let index = 0; index < wanted.length; index += 1) {
      const file = wanted[index]
      if (!file || have.has(file.key)) continue
      setStatus(`Reading ${index + 1} of ${wanted.length}: ${file.key}`)
      try {
        const bytes = await downloadArrayBuffer(file.downloadUrl)
        const extracted = await extractDocument(file.key, bytes)
        next.push(extracted)
      } catch (caught) {
        next.push({
          filename: file.key,
          text: "",
          kind: "text",
          note: caught instanceof Error ? caught.message : "Could not download this file.",
        })
      }
    }
    setDocs(next)
    return next
  }

  async function runFree(kind: "browser" | "openrouter" | "gemini") {
    if (!record) return
    const collected = collectConversationLinks(linkDrafts)
    if (!collected.ok) {
      setError(collected.error)
      return
    }
    const profile =
      kind === "openrouter"
        ? air.profiles.find((item) => item.provider === "openrouter")
        : kind === "gemini"
          ? air.profiles.find((item) => item.id === "gemini")
          : undefined
    if (kind !== "browser" && profile && !air.providerSettings.keys[keySlot(profile)] && !air.providerSettings.keys[profile.provider]) {
      setError("Add that free key first, or use the on-device review.")
      air.setKeysOpen(true)
      return
    }
    setBusy(true)
    setError(null)
    saveSubmissionLinks(record.doi, record.recordVersion, collected.links)
    try {
      const extracted = await ensureDocs()
      const documents = extracted.filter((doc) => selected.includes(doc.filename) && doc.text.trim())
      const report = await runFreeScreening({
        kind,
        criteria: air.criteria,
        record,
        documents,
        conversations: collected.links,
        profile,
        ctx: profile
          ? { profile, settings: air.providerSettings, criteria: air.criteria, record, documents, conversationLinks: collected.links, demo: false, onProgress: setStatus }
          : undefined,
        onProgress: setStatus,
      })
      const modelId = kind === "browser" ? FREE_BROWSER_MODEL : kind === "openrouter" ? "openrouter-free" : profile?.defaultModel ?? "gemini"
      setResults([
        {
          assessorId: profile?.id ?? "free",
          report,
          stored: {
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
            assessorId: profile?.id ?? "free",
            modelId,
            provider: profile?.provider ?? "compatible",
            criteriaId: air.criteria.id,
            criteriaVersion: air.criteria.version,
            customCriteria: false,
            tier: "free-screening",
            report,
            outputHash: await sha256Hex(`${modelId}\n${JSON.stringify(report)}`),
            createdAt: new Date().toISOString(),
            privateContextCount: collected.links.length,
          },
        },
      ])
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The free review could not run.")
    } finally {
      setBusy(false)
      setStatus(null)
    }
  }

  async function run(demo: boolean) {
    if (!record) return
    if (!demo) {
      const missing = air.profiles.filter((profile) => assessors.includes(profile.id) && !air.providerSettings.keys[keySlot(profile)] && !air.providerSettings.keys[profile.provider])
      if (missing.length) {
        setError(`Add a key for ${missing.map((profile) => profile.name).join(", ")}, or run a demo reading.`)
        air.setKeysOpen(true)
        return
      }
    }
    if (assessors.length === 0) {
      setError("Choose at least one assessor.")
      return
    }
    const collected = collectConversationLinks(linkDrafts)
    if (!collected.ok) {
      setError(collected.error)
      return
    }
    setBusy(true)
    setError(null)
    setPublished(false)
    saveSubmissionLinks(record.doi, record.recordVersion, collected.links)
    const extracted = await ensureDocs()
    const documents = extracted.filter((doc) => selected.includes(doc.filename) && doc.text.trim())
    const panel: PanelResult[] = []
    await Promise.all(
      assessors.map(async (assessorId) => {
        const profile = air.profiles.find((item) => item.id === assessorId)
        if (!profile) return
        setStatus(`Asking ${profile.name}…`)
        try {
          const report = await runReview({
            profile,
            settings: air.providerSettings,
            criteria: air.criteria,
            record,
            documents,
            conversationLinks: collected.links,
            demo,
            onProgress: setStatus,
          })
          const modelId = demo ? `${resolvedModel(profile, air.providerSettings)} (demo)` : resolvedModel(profile, air.providerSettings)
          const createdAt = new Date().toISOString()
          const outputHash = await sha256Hex(`${modelId}\n${JSON.stringify(report)}`)
          const stored: StoredReview = {
            id: uid("review"),
            sample: false,
            mock: demo,
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
            tier: demo ? "demo" : "in-depth",
            report,
            outputHash,
            createdAt,
            privateContextCount: collected.links.length,
          }
          panel.push({ assessorId, report, stored })
        } catch (caught) {
          if (caught instanceof DOMException && caught.name === "AbortError") return
          panel.push({ assessorId, error: caught instanceof Error ? caught.message : "The reading failed." })
        }
      }),
    )
    setResults(air.profiles.map((profile) => panel.find((item) => item.assessorId === profile.id)).filter((item): item is PanelResult => Boolean(item)))
    setStatus(null)
    setBusy(false)
  }

  async function publish() {
    setError(null)
    const ready = results.flatMap((result) => (result.stored ? [result.stored] : []))
    if (!acknowledged || !optIn) {
      setError("Read the four notices and tick them, then tick publish. Nothing is shared until you do.")
      return
    }
    for (const review of ready) {
      const message = await air.publishReading(review)
      if (message) {
        setError(message)
        return
      }
    }
    setPublished(true)
  }

  const panelScore = median(results.flatMap((result) => (result.report ? [result.report.overallScore] : [])))
  const notes = useMemo(() => disagreementNotes(results, air.criteria.criteria.map((item) => item.id)), [air.criteria.criteria, results])
  const restricted = record ? filesAreRestricted(record) : false

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="font-serif text-4xl">Add a record</h1>
      <p className="mt-2 max-w-2xl text-ink-soft">
        Four steps. The work is judged on its own logic and evidence, not on who wrote it.{" "}
        {air.customCriteria ? "Custom criteria stay off the ranked board." : `New readings use AIR ${air.criteria.version}. Older AIR v0.1 readings stay valid and are labelled.`}
      </p>
      <ol className="mt-6 space-y-4">
        <li data-testid="notices" className="rounded-3xl border border-line bg-white/70 p-4">
          <h2 className="font-serif text-2xl">1. Read this before anything is published</h2>
          <p className="mt-1 text-sm text-ink-soft">Publishing to the ranking stays locked until every box is ticked. You can still fetch a record and run a private reading first.</p>
          <ul className="mt-3 space-y-3">
            {publishNotices.map((notice) => (
              <li key={notice.id}>
                <label className="flex items-start gap-3 text-sm">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={Boolean(acks[notice.id])}
                    onChange={(event) => setAcks((current) => ({ ...current, [notice.id]: event.target.checked }))}
                  />
                  <span>
                    <span className="font-medium">{notice.title}</span>
                    <span className="mt-1 block text-ink-soft">{notice.body}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </li>
      </ol>
      <h2 className="mt-6 font-serif text-2xl">2. Paste the DOI</h2>
      <form
        className="mt-5 flex flex-col gap-2 sm:flex-row"
        onSubmit={(event) => {
          event.preventDefault()
          void loadRecord()
        }}
      >
        <label className="sr-only" htmlFor="doi">
          Zenodo link or DOI
        </label>
        <input
          id="doi"
          className={fieldClass}
          value={input}
          placeholder="https://zenodo.org/records/18916931"
          onChange={(event) => setInput(event.target.value)}
        />
        <button className={btnPrimary} type="submit" disabled={busy}>
          Fetch record
        </button>
        <button className={btnQuiet} type="button" onClick={() => void loadRecord("10.5281/zenodo.18916931")}>
          Try 10.5281/zenodo.18916931
        </button>
      </form>
      {error && (
        <div className="mt-4">
          <Banner tone="error">{error}</Banner>
        </div>
      )}
      {status && (
        <p className="mt-4 text-sm text-ink-soft" role="status">
          {status}
        </p>
      )}
      {record && (
        <section className="mt-6 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-3xl border border-line bg-white/60 p-4">
            <p className="text-xs uppercase tracking-wide text-teal">Step 3 · Files</p>
            <h2 className="font-serif text-2xl">{record.title}</h2>
            <p className="mt-1 text-sm text-ink-soft">
              {record.creators.map((creator) => creator.name).join(", ") || "Creator unlisted"} · {record.publicationDate || "undated"} ·{" "}
              {record.license || "license unlisted"} · version {record.recordVersion}
            </p>
            <p className="mt-2 text-xs text-ink-soft">
              <ExternalLink className="underline" href={record.htmlUrl}>
                {record.doi}
              </ExternalLink>
            </p>
            {record.keywords.length > 0 && <p className="mt-2 text-xs text-ink-soft">{record.keywords.join(" · ")}</p>}
            <details className="mt-3">
              <summary className="cursor-pointer text-sm">Description</summary>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-ink-soft">{record.description || "No description on the record."}</p>
            </details>
            {restricted && (
              <div className="mt-3">
                <Banner tone="error">Files on this record are restricted or embargoed. AIR can still read the public description, not the files.</Banner>
              </div>
            )}
            <fieldset className="mt-4" disabled={restricted}>
              <legend className="text-sm font-medium">Files to read</legend>
              <p className="mt-1 text-xs text-ink-soft">Smaller text files are preselected. Images are skipped. A long paper is summarised in sections before it is scored.</p>
              <ul className="mt-2 max-h-64 space-y-1 overflow-auto text-sm">
                {record.files.map((file) => {
                  const textual = isTextualFile(file)
                  return (
                    <li key={file.key}>
                      <label className="flex items-start gap-2">
                        <input
                          type="checkbox"
                          disabled={!textual}
                          checked={selected.includes(file.key)}
                          onChange={(event) =>
                            setSelected((current) => (event.target.checked ? [...current, file.key] : current.filter((key) => key !== file.key)))
                          }
                        />
                        <span>
                          {file.key} <span className="text-ink-soft">· {formatBytes(file.size)}{textual ? "" : " · not read as text"}</span>
                        </span>
                      </label>
                    </li>
                  )
                })}
              </ul>
            </fieldset>
            <PrivateLinksField rows={linkDrafts} onChange={setLinkDrafts} />
            {docs.length > 0 && (
              <details className="mt-3">
                <summary className="cursor-pointer text-sm">
                  Extracted text ({docs.reduce((total, doc) => total + doc.text.length, 0).toLocaleString()} characters)
                </summary>
                <ul className="mt-2 space-y-2 text-xs text-ink-soft">
                  {docs.map((doc) => (
                    <li key={doc.filename}>
                      <span className="font-medium text-ink">{doc.filename}</span>
                      {doc.note ? ` — ${doc.note}` : ""} · {doc.text.length.toLocaleString()} characters
                      <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap rounded-xl bg-paper p-2">{doc.text.slice(0, 700)}</pre>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
          <div>
            <fieldset className="rounded-3xl border border-line bg-white/60 p-4">
              <legend className="text-sm font-medium">Step 4 · Assessors</legend>
              <p className="mt-1 text-xs text-ink-soft">One model, or a panel. Each uses the key for its provider. Demo mode calls none of them.</p>
              <ul className="mt-3 space-y-2">
                {air.profiles.map((profile) => {
                  const keyed = Boolean(air.providerSettings.keys[keySlot(profile)] || air.providerSettings.keys[profile.provider])
                  return (
                    <li key={profile.id}>
                      <label className="flex items-start gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={assessors.includes(profile.id)}
                          onChange={(event) =>
                            setAssessors((current) => (event.target.checked ? [...current, profile.id] : current.filter((id) => id !== profile.id)))
                          }
                        />
                        <span>
                          <span className="font-medium">{profile.name}</span>
                          <span className="mt-0.5 block text-xs text-ink-soft">
                            {air.settings.models[profile.id] || profile.defaultModel}
                            {air.settings.demoMode ? " · demo" : keyed ? " · key ready" : " · key needed"}
                          </span>
                        </span>
                      </label>
                    </li>
                  )
                })}
              </ul>
              <div className="mt-4 flex flex-wrap gap-2">
                <button type="button" data-testid="indepth-review" className={btnPrimary} disabled={busy} onClick={() => void run(air.settings.demoMode)}>
                  {air.settings.demoMode ? "Run demo readings" : "In-depth review with your key"}
                </button>
                <button type="button" data-testid="free-review" className={btnQuiet} disabled={busy} onClick={() => void runFree("browser")}>
                  Free quick review
                </button>
                {!air.settings.demoMode && (
                  <button type="button" className={btnQuiet} disabled={busy} onClick={() => void run(true)}>
                    Preview with the local heuristic
                  </button>
                )}
                <button type="button" className={btnQuiet} onClick={() => air.setKeysOpen(true)}>
                  Keys
                </button>
              </div>
              <p className="mt-3 text-xs text-ink-soft">{FREE_LABEL}. The no-key model is {FREE_BROWSER_MODEL} ({FREE_BROWSER_SIZE}). It needs WebGPU. If that is missing, use a free OpenRouter or Gemini key, which is still only a screening.</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button type="button" className={btnQuiet} disabled={busy} onClick={() => void runFree("openrouter")}>
                  Free OpenRouter key
                </button>
                <button type="button" className={btnQuiet} disabled={busy} onClick={() => void runFree("gemini")}>
                  Free Gemini key
                </button>
              </div>
              <p className="mt-3 text-xs text-ink-soft">An in-depth review uses your own key and can be ranked. Your key is billed by that provider.</p>
            </fieldset>
          </div>
        </section>
      )}
      {results.length > 0 && (
        <section className="mt-8">
          <div className="mb-4 rounded-3xl border border-line bg-teal/5 p-4">
            <h2 className="font-serif text-2xl">Panel</h2>
            <p className="mt-1 text-sm">
              Combined median {panelScore === null ? "—" : panelScore.toFixed(2)} / 5 across {results.filter((result) => result.report).length} reading
              {results.filter((result) => result.report).length === 1 ? "" : "s"}.
            </p>
            {notes.length > 0 ? (
              <ul className="mt-2 list-disc pl-5 text-sm text-ink-soft">
                {notes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-ink-soft">Where more than one assessor scored a criterion, they stayed within a point.</p>
            )}
            <label className="mt-3 flex items-start gap-2 text-sm">
              <input type="checkbox" checked={optIn} onChange={(event) => setOptIn(event.target.checked)} />
              <span>Publish these readings to the leaderboard. This is optional. Demo readings stay in this browser. Custom criteria stay unranked.</span>
            </label>
            {!acknowledged && <p className="mt-2 text-sm text-ink-soft">Tick the four notices in step 1 before a reading can join the ranking.</p>}
            <button type="button" className={`${btnPrimary} mt-3`} disabled={!optIn || !acknowledged || published} onClick={() => void publish()}>
              {published ? "Published" : "Publish to the leaderboard"}
            </button>
            {published && record && (
              <p className="mt-2 text-sm">
                On the board. <Link className="underline" to={`/paper/${encodeURIComponent(record.id)}`}>Open the record page</Link> to invite an independent check.
              </p>
            )}
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            {results.map((result) => {
              const profile = air.profiles.find((item) => item.id === result.assessorId)
              if (result.error || !result.report || !record) {
                return (
                  <Banner key={result.assessorId} tone="error">
                    {profile?.name ?? result.assessorId}: {result.error ?? "No reading."}
                  </Banner>
                )
              }
              return (
                <ReportView
                  key={result.assessorId}
                  report={result.report}
                  criteria={air.criteria}
                  meta={{
                    assessorName: profile?.name ?? result.assessorId,
                    modelId: result.stored?.modelId ?? "",
                    provider: result.stored?.provider ?? profile?.provider ?? "",
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
              )
            })}
          </div>
        </section>
      )}
    </div>
  )
}

function disagreementNotes(results: PanelResult[], criterionIds: string[]): string[] {
  const notes: string[] = []
  for (const criterionId of criterionIds) {
    const scored = results.flatMap((result) => {
      const score = result.report?.scores.find((item) => item.criterionId === criterionId)
      return score ? [{ name: result.assessorId, score: score.score }] : []
    })
    if (scored.length < 2) continue
    const values = scored.map((item) => item.score)
    const low = Math.min(...values)
    const high = Math.max(...values)
    if (high - low >= 2) {
      notes.push(
        `${criterionId}: ${scored
          .filter((item) => item.score === high)
          .map((item) => item.name)
          .join(", ")} at ${high}, ${scored
          .filter((item) => item.score === low)
          .map((item) => item.name)
          .join(", ")} at ${low}.`,
      )
    }
  }
  return notes.slice(0, 6)
}

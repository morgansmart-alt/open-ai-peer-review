import { useEffect, useMemo, useRef, useState } from "react"
import { Link, useSearchParams } from "react-router-dom"
import { PrivateLinksField, emptyLinkDraft, type LinkDraft } from "../components/PrivateLinks.tsx"
import { collectConversationLinks, saveSubmissionLinks } from "../domain/conversationLinks.ts"
import { publishNotices } from "../content/notices.ts"
import { keySlot } from "../domain/assessors.ts"
import { median } from "../domain/ranking.ts"
import { boardValue } from "../domain/scoring.ts"
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
  extensionOf,
  fetchZenodoRecord,
  filesAreRestricted,
  formatBytes,
  formatRecordStamp,
  isTextualFile,
  type ZenodoFile,
  type ZenodoRecord,
} from "../services/zenodo.ts"
import { isPublishedDoi, parseAnyRef, resolvePublishedDoi } from "../services/works.ts"
import { coverageAllowsPublish } from "../services/textTools.ts"
import { isCalibratedForFullReview } from "../domain/calibration.ts"
import { enoughFamilies, familiesOf } from "../services/fairness.ts"

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
  const [linkDrafts, setLinkDrafts] = useState<LinkDraft[]>([emptyLinkDraft()])
  const [downloadNote, setDownloadNote] = useState<string | null>(null)
  const localBytes = useRef(new Map<string, ArrayBuffer>())
  const [published, setPublished] = useState(false)
  const acknowledged = publishNotices.every((notice) => acks[notice.id])

  useEffect(() => {
    const initial = params.get("doi")
    if (initial) setInput(initial)
  }, [params])

  function rememberLocal(file: ZenodoFile, bytes: ArrayBuffer) {
    localBytes.current.set(file.key, bytes)
  }

  async function attachLocalFiles(list: FileList | File[]) {
    const additions: ZenodoFile[] = []
    for (const file of [...list]) {
      const bytes = await file.arrayBuffer()
      const addition = { key: file.name, size: file.size, downloadUrl: "", extension: extensionOf(file.name) }
      rememberLocal(addition, bytes)
      additions.push(addition)
    }
    if (additions.length === 0) return
    setRecord((current) => {
      if (!current) {
        const first = additions[0]
        return {
          id: "local",
          conceptId: "local",
          doi: "",
          conceptDoi: "",
          title: first?.key ?? "Local text",
          creators: [],
          description: "",
          descriptionHtml: "",
          keywords: [],
          version: "",
          recordVersion: "local",
          license: "",
          publicationDate: "",
          related: [],
          resourceType: "Local file",
          access: { record: "local", files: "local" },
          files: additions,
          htmlUrl: "",
        }
      }
      const files = [...current.files.filter((file) => !additions.some((addition) => addition.key === file.key)), ...additions]
      return { ...current, files }
    })
    setSelected((current) => [...new Set([...current, ...additions.map((file) => file.key)])])
    setDownloadNote(null)
    setError(null)
  }

  async function loadRecord(raw?: string) {
    const parsed = parseAnyRef(raw ?? input)
    if (!parsed) {
      setError("Paste a Zenodo link, a DOI such as 10.5281/zenodo.18916931, or an arXiv DOI.")
      return
    }
    setBusy(true)
    setError(null)
    setDownloadNote(null)
    setStatus(parsed.kind === "zenodo" ? "Fetching the Zenodo record…" : "Looking up that DOI…")
    setResults([])
    setPublished(false)
    setDocs([])
    try {
      const next = parsed.kind === "zenodo" ? await fetchZenodoRecord(parsed.recordId) : await resolvePublishedDoi(parsed.doi)
      setRecord(next)
      setSelected(defaultFileSelection(next.files))
      setDownloadNote(next.files.length === 0 ? "No open file was linked for this DOI. Drop the PDF below. Publishing still needs the DOI." : null)
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
        const bytes = localBytes.current.get(file.key) ?? (file.downloadUrl ? await downloadArrayBuffer(file.downloadUrl) : null)
        if (!bytes) throw new Error(`${file.key} has no download link. Drop the file from your computer.`)
        const extracted = await extractDocument(file.key, bytes, setStatus)
        next.push(extracted)
      } catch (caught) {
        const note = caught instanceof Error ? caught.message : "Could not download this file."
        if (/CORS|blocked|drop the/i.test(note)) setDownloadNote(note)
        next.push({ filename: file.key, text: "", kind: "text", note })
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
    if (documents.length === 0) {
      setError(extracted.find((doc) => doc.note)?.note ?? "None of the selected files had readable text.")
      setBusy(false)
      setStatus(null)
      return
    }
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
    if (documents.length === 0) {
      setError(extracted.find((doc) => doc.note)?.note ?? "None of the selected files had readable text.")
      setBusy(false)
      setStatus(null)
      return
    }
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
            autoPick: air.settings.autoPick,
            keys: air.providerSettings.keys,
            onProgress: setStatus,
          })
          const modelId = demo ? `${resolvedModel(profile, air.providerSettings)} (demo)` : report.servedModel || resolvedModel(profile, air.providerSettings)
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
            provider: (report.router?.provider as StoredReview["provider"]) || profile.provider,
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
    const finished = panel.flatMap((item) => (item.stored && !item.stored.mock ? [item.stored] : []))
    const oneFamily = familiesOf(finished).length < 2
    const uncalibrated = finished.some((review) => (review.report.router?.job === "review-full" || review.report.router?.job === "extract") && !isCalibratedForFullReview(review.modelId))
    if (finished.length > 0 && (oneFamily || uncalibrated)) {
      for (const review of finished) review.tier = "provisional"
    }
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
    if (!record || !isPublishedDoi(record.doi)) {
      setError("Publishing to the leaderboard needs a published DOI. This reading stays in this browser.")
      return
    }
    const live = ready.filter((review) => !review.mock)
    if (!enoughFamilies(live)) {
      setError("A ranked review needs two different model families, for example Gemini and OpenRouter. This one is saved on this device as provisional.")
      return
    }
    if (live.some((review) => (review.report.router?.job === "review-full" || review.report.router?.job === "extract") && !isCalibratedForFullReview(review.modelId))) {
      setError("This model has not passed the reference calibration, so the reading stays provisional. Today only Gemini 3.8 Flash is cleared for a publishable whole-paper review.")
      return
    }
    const thin = ready.filter((review) => !coverageAllowsPublish(review.report.reading))
    if (thin.length > 0) {
      const reading = thin[0]?.report.reading
      setError(
        reading
          ? `This reading covered ${reading.pagesRead} of ${reading.pagesTotal} pages (${reading.coverage}). The ranked board needs full coverage, or at least 90% of the pages.`
          : "This reading has no coverage record. The ranked board needs a full reading.",
      )
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

  const panelScore = median(
    results.flatMap((result) => {
      if (!result.report) return []
      return [boardValue(result.report.overallScore, result.report, result.stored?.criteriaVersion ?? air.criteria.version)]
    }),
  )
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
          <h2 className="font-serif text-2xl">Step 1 · Read this before anything is published</h2>
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
      <h2 className="mt-6 font-serif text-2xl">Step 2 · Paste the DOI</h2>
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
      <div className="mt-4 rounded-2xl border border-line bg-white/40 p-3">
        <p className="text-sm">Zenodo is the main path. A ranked publication still needs a published DOI. If a host blocks the file, or you have the PDF locally, drop it here.</p>
        <label className="mt-2 block text-xs text-ink-soft">
          PDF, text, source, data, DOCX, or a small zip
          <input
            className="mt-1 block w-full text-sm"
            type="file"
            multiple
            accept=".pdf,.txt,.md,.csv,.tsv,.json,.yaml,.yml,.html,.tex,.bib,.py,.js,.ts,.r,.c,.f90,.jl,.docx,.zip"
            onChange={(event) => {
              const files = event.target.files
              if (files) void attachLocalFiles(files)
              event.target.value = ""
            }}
          />
        </label>
      </div>
      {downloadNote && (
        <div className="mt-4">
          <Banner>{downloadNote}</Banner>
        </div>
      )}
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
            <h2 className="font-serif text-2xl">Step 3 · Files</h2>
            <h3 className="mt-2 font-serif text-xl">{record.title}</h3>
            <p className="mt-1 text-sm text-ink-soft">
              {record.creators.map((creator) => creator.name).join(", ") || "Creator unlisted"} · {record.license || "license unlisted"} ·{" "}
              {formatRecordStamp(record)}
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
            <fieldset className="file-fieldset mt-4" disabled={restricted}>
              <legend className="text-sm font-medium">Files to read</legend>
              <p className="mt-1 text-xs text-ink-soft">
                The main manuscript and the small supplements are preselected when they fit. A zip stays unticked. A paper that fits the model's context is sent in full.
              </p>
              <p className="mt-1 text-xs font-medium text-ink">
                {selected.length} of {record.files.length} files · {formatBytes(record.files.filter((file) => selected.includes(file.key)).reduce((total, file) => total + file.size, 0))} selected
              </p>
              <div className="file-scroll mt-2">
              <ul className="space-y-1 text-sm">
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
                        <span className="min-w-0 break-words">
                          {file.key} <span className="text-ink-soft">· {file.size > 0 ? formatBytes(file.size) : "size unknown"}{textual ? "" : " · not read as text"}</span>
                        </span>
                      </label>
                    </li>
                  )
                })}
              </ul>
              </div>
            </fieldset>
            <div className="mt-5">
              <PrivateLinksField rows={linkDrafts} onChange={setLinkDrafts} />
            </div>
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
              <legend className="font-serif text-2xl">Step 4 · Assessors</legend>
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
              <p className="mt-3 text-sm text-ink-soft">Demo readings produce synthetic sample scores and are never published to the live board. A real ranked review uses your own API key, or a free key for an unranked screening.</p>
            </fieldset>
          </div>
        </section>
      )}
      {results.length > 0 && (
        <section className="mt-8">
          <div className="mb-4 rounded-3xl border border-line bg-teal/5 p-4">
            <h2 className="font-serif text-2xl">Panel</h2>
            <p className="mt-1 text-sm">
              Combined median {panelScore === null ? "—" : panelScore.toFixed(0)} / 100 across {results.filter((result) => result.report).length} reading
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
            {record && !isPublishedDoi(record.doi) && <p className="mt-2 text-sm text-ink-soft">Publishing to the leaderboard needs a published DOI. This reading can still run in this browser.</p>}
            {results.some((result) => result.stored && !result.stored.mock) && !enoughFamilies(results.flatMap((result) => (result.stored && !result.stored.mock ? [result.stored] : []))) && (
              <p className="mt-2 text-sm text-ink-soft">Only one model family answered. This stays provisional until a second family, such as OpenRouter, also reviews it.</p>
            )}
            {results.some((result) => result.report && !coverageAllowsPublish(result.report.reading)) && (
              <p className="mt-2 text-sm text-ink-soft">The ranked board needs full coverage, or at least 90% of the pages read.</p>
            )}
            <button
              type="button"
              className={`${btnPrimary} mt-3`}
              disabled={
                !optIn ||
                !acknowledged ||
                published ||
                !record ||
                !isPublishedDoi(record.doi) ||
                results.some((result) => result.report && !coverageAllowsPublish(result.report.reading)) ||
                !enoughFamilies(results.flatMap((result) => (result.stored && !result.stored.mock ? [result.stored] : [])))
              }
              onClick={() => void publish()}
            >
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
    if (high - low >= 20) {
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

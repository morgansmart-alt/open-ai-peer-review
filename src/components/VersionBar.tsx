import { useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import type { LineagePoint } from "../domain/versions.ts"
import { parseRecordRef, type ZenodoVersion } from "../services/zenodo.ts"
import { Sparkline } from "./charts.tsx"
import { btnQuiet, fieldClass } from "./ui.tsx"

export function VersionBar({
  currentId,
  versions,
  lineage,
}: {
  currentId: string
  versions: ZenodoVersion[]
  lineage: LineagePoint[]
}) {
  const navigate = useNavigate()
  const [doi, setDoi] = useState("")
  const [note, setNote] = useState<string | null>(null)
  const ordered = [...versions].sort((a, b) => a.publicationDate.localeCompare(b.publicationDate) || a.id.localeCompare(b.id))

  return (
    <section className="mt-6 rounded-3xl border border-line bg-white/60 p-4" aria-label="Versions of this work">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 className="font-serif text-2xl">Versions</h2>
        <form
          className="flex flex-wrap gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            const parsed = parseRecordRef(doi)
            if (!parsed) {
              setNote("Paste a Zenodo version DOI or record id. AIR does not write to Zenodo.")
              return
            }
            setNote(null)
            navigate(`/paper/${encodeURIComponent(parsed.recordId)}`)
          }}
        >
          <label className="text-xs text-ink-soft">
            Open a version DOI
            <input className={`${fieldClass} mt-1 w-64`} value={doi} placeholder="10.5281/zenodo.…" onChange={(event) => setDoi(event.target.value)} />
          </label>
          <button type="submit" className={`${btnQuiet} self-end`}>
            Open version
          </button>
        </form>
      </div>
      {note && <p className="mt-2 text-sm text-ink-soft">{note}</p>}
      <p className="mt-2 text-sm text-ink-soft">
        Each version keeps its own readings and its own address. Opening a later DOI continues the work. It does not replace the earlier score.
      </p>
      {ordered.length > 0 && (
        <nav className="mt-3 flex flex-wrap gap-2" aria-label="Version switcher" data-testid="version-switcher">
          {ordered.map((version) => {
            const current = version.id === currentId
            const point = lineage.find((item) => item.recordId === version.id)
            const place = point?.place === "earlier" || (!point && version.publicationDate < (ordered.find((item) => item.id === currentId)?.publicationDate ?? ""))
            return (
              <Link
                key={version.id}
                to={`/paper/${encodeURIComponent(version.id)}`}
                aria-current={current ? "page" : undefined}
                className={current ? "rounded-full bg-teal px-3 py-1 text-xs text-paper" : "rounded-full border border-line px-3 py-1 text-xs text-ink-soft hover:border-teal"}
              >
                {version.publicationDate || "undated"}
                {version.version ? ` · ${version.version}` : ""} · {version.doi}
                {current ? " · this version" : place ? " · earlier version" : ""}
              </Link>
            )
          })}
        </nav>
      )}
      {lineage.length > 0 && (
        <div className="mt-4" data-testid="score-lineage">
          <h3 className="text-sm font-medium">Score history</h3>
          <p className="mt-1 text-xs text-ink-soft">
            Panel and idea scores are the AI medians of that version. A later version does not inherit them. Open, partial, and fixed counts stay on the version where the issue was opened.
          </p>
          {lineage.filter((point) => point.panelMedian !== null).length >= 2 && (
            <p className="mt-2 text-xs text-ink-soft">
              Panel across versions <Sparkline values={lineage.flatMap((point) => (point.panelMedian === null ? [] : [point.panelMedian]))} />
            </p>
          )}
          <ol className="mt-3 grid gap-2 sm:grid-cols-2">
            {lineage.map((point) => (
              <li key={point.recordId} className="rounded-2xl border border-line px-3 py-2 text-sm">
                <Link className="underline" to={`/paper/${encodeURIComponent(point.recordId)}`}>
                  {point.publicationDate || "undated"} · {point.doi}
                </Link>
                <span className="mt-1 block text-xs text-ink-soft">{point.place === "earlier" ? "Earlier version" : "Latest version"}</span>
                <p className="mt-1 tabular-nums">
                  Panel {point.panelMedian === null ? "—" : point.panelMedian.toFixed(0)} / 100 · Idea {point.ideaMedian === null ? "—" : point.ideaMedian.toFixed(0)} / 100
                </p>
                <p className="text-xs text-ink-soft">
                  Open {point.open} · Partial {point.partial} · Fixed {point.fixed}
                </p>
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  )
}

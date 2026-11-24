import { Link } from "react-router-dom"
import type { LineagePoint } from "../domain/versions.ts"
import type { CriteriaSet, StoredReview } from "../domain/types.ts"
import { ExternalLink } from "./ui.tsx"
import type { ReadableComment } from "./CommentList.tsx"
import { CommentList } from "./CommentList.tsx"
import { criterionBars, publicDoiUrl, readingLines, sharedVerdict } from "./scoreCardModel.ts"

function badgeClass(badge: string): string {
  if (badge === "Human review") return "bg-paper-deep text-ink"
  if (badge === "free web-chat, uncalibrated" || badge === "Free screening" || badge === "Demo" || badge === "Community reply") return "bg-gold/15 text-gold"
  return "bg-teal/10 text-teal-deep"
}

export function ScoreCard({
  doi,
  zenodoUrl,
  criteria,
  reviews,
  names,
  panelMedian,
  humanMedian,
  lineage,
  comments,
}: {
  doi: string
  zenodoUrl?: string
  criteria: CriteriaSet
  reviews: StoredReview[]
  names: Record<string, string>
  panelMedian: number | null
  humanMedian: number | null
  lineage: LineagePoint[]
  comments: ReadableComment[]
}) {
  const bars = criterionBars(reviews, criteria, names).filter((bar) => bar.marks.length > 0)
  const lines = readingLines(reviews, criteria, names)
  const verdict = sharedVerdict(lines)
  const doiUrl = publicDoiUrl(doi)
  const shownMedian = panelMedian === null ? "—" : panelMedian.toFixed(1)
  const demoOnly = lines.some((line) => line.badge === "Demo") && !lines.some((line) => line.badge === "Calibrated AI")

  return (
    <article data-testid="score-card" aria-labelledby="score-card-heading" className="surface mt-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-xl">
          <p className="text-xs font-medium uppercase tracking-wide text-teal">This version</p>
          <h2 id="score-card-heading" className="mt-1 font-serif text-2xl">
            Score card
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-soft">
            {demoOnly
              ? "The large number is the median of the demo readings on this version. No live model was called. Human reviews and free web-chat scores, if any, stay in their own badges."
              : "The large number is the calibrated AI median on a 0–100 scale, the same median as the board. Human reviews and free web-chat scores are listed with their own badges and are not mixed into that number."}
          </p>
        </div>
        <p className="min-w-28">
          <span className="block font-serif text-5xl tabular-nums leading-none">{shownMedian}</span>
          <span className="mt-1 block text-xs text-ink-soft">{demoOnly ? "demo median / 100" : "calibrated median / 100"}</span>
        </p>
      </div>

      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-xs text-ink-soft">Verdict</dt>
          <dd className="mt-1 font-medium">{verdict ? verdict.label : "No calibrated or demo reading yet"}</dd>
        </div>
        <div>
          <dt className="text-xs text-ink-soft">Human review</dt>
          <dd className="mt-1 font-medium tabular-nums">{humanMedian === null ? "None on this version" : `${humanMedian.toFixed(1)} / 100`}</dd>
        </div>
        <div>
          <dt className="text-xs text-ink-soft">Readings</dt>
          <dd className="mt-1 font-medium">{lines.length === 0 ? "None published" : lines.length}</dd>
        </div>
      </dl>

      <div className="mt-4 flex flex-wrap gap-2 text-sm">
        {zenodoUrl ? (
          <ExternalLink href={zenodoUrl} className="rounded-full border border-line px-3 py-1 underline-offset-2 hover:underline">
            Zenodo record
          </ExternalLink>
        ) : null}
        {doiUrl ? (
          <ExternalLink href={doiUrl} className="rounded-full border border-line px-3 py-1 underline-offset-2 hover:underline">
            DOI {doi}
          </ExternalLink>
        ) : (
          <span className="rounded-full border border-line px-3 py-1 text-ink-soft">DOI {doi}</span>
        )}
      </div>

      <h3 className="mt-6 text-sm font-medium">Per criterion</h3>
      {bars.length === 0 ? (
        <p className="mt-2 text-sm text-ink-soft">No AI reading has been published for this version yet.</p>
      ) : (
        <ul className="mt-3 space-y-4">
          {bars.map((bar) => (
            <li key={bar.id}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="font-medium">
                  {bar.bonus ? `Global goals: ${bar.median === null ? "—" : bar.median.toFixed(0)} (bonus, not counted in overall)` : bar.name}
                </span>
                <span className="tabular-nums text-ink-soft">{bar.median === null ? "—" : bar.median.toFixed(0)}</span>
              </div>
              <div className="score-track mt-1" role="img" aria-label={`${bar.name} median ${bar.median === null ? "unavailable" : bar.median.toFixed(0)} out of 100`}>
                <div className="score-fill" style={{ width: `${Math.max(0, Math.min(100, bar.median ?? 0))}%` }} />
              </div>
              <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-soft">
                {bar.marks.map((mark) => (
                  <li key={mark.reviewId}>
                    {mark.name} {mark.score.toFixed(0)}
                    {mark.evidence === "possible" ? " · possible" : mark.evidence === "proven" ? " · proven" : ""}
                  </li>
                ))}
              </ul>
              <details className="mt-1">
                <summary className="cursor-pointer text-xs text-teal">Notes on {bar.name}</summary>
                <ul className="mt-2 space-y-2">
                  {bar.marks.map((mark) => (
                    <li key={`${mark.reviewId}-note`} className="text-sm leading-relaxed">
                      <span className={`mr-2 rounded-full px-2 py-0.5 text-[11px] ${badgeClass(mark.badge)}`}>{mark.badge}</span>
                      {mark.rationale}
                    </li>
                  ))}
                </ul>
              </details>
            </li>
          ))}
        </ul>
      )}

      <h3 className="mt-6 text-sm font-medium">Readings and verdicts</h3>
      {lines.length === 0 ? (
        <p className="mt-2 text-sm text-ink-soft">Nothing has been published on this version.</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {lines.map((line) => (
            <li key={line.id} className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
              <span className={`rounded-full px-2 py-0.5 text-[11px] ${badgeClass(line.badge)}`}>{line.badge}</span>
              <span className="font-medium">{line.name}</span>
              <span className="tabular-nums">{line.score.toFixed(0)} / 100</span>
              <span>{line.verdict}</span>
              {line.verdictNote ? <span className="text-ink-soft">{line.verdictNote}</span> : null}
              {line.mismatch ? <span className="text-bad">Scoring mismatch, needs re-check</span> : null}
              {line.possible > 0 ? <span className="text-ink-soft">{line.possible} marked possible</span> : null}
              {line.proven > 0 ? <span className="text-ink-soft">{line.proven} marked proven</span> : null}
              {line.mock ? <span className="text-ink-soft">No live model was called</span> : null}
            </li>
          ))}
        </ul>
      )}
      {lines.some((line) => line.possible > 0) ? <p className="mt-2 text-xs text-ink-soft">Possible is not proven.</p> : null}

      <h3 className="mt-6 text-sm font-medium">Version history</h3>
      {lineage.length === 0 ? (
        <p className="mt-2 text-sm text-ink-soft">No other scored version is linked on the board. Each Zenodo version keeps its own address and its own scores.</p>
      ) : (
        <ol className="mt-2 space-y-2">
          {lineage.map((point) => (
            <li key={point.recordId} className="text-sm">
              <Link className="underline-offset-2 hover:underline" to={`/paper/${encodeURIComponent(point.recordId)}`}>
                {point.publicationDate || "undated"} · {point.doi}
              </Link>
              <span className="ml-2 text-ink-soft">
                {point.place === "latest" ? "Latest" : "Earlier"} · panel {point.panelMedian === null ? "—" : point.panelMedian.toFixed(0)} / 100
              </span>
            </li>
          ))}
        </ol>
      )}

      <h3 className="mt-6 text-sm font-medium">Comments</h3>
      <div className="mt-2">
        <CommentList comments={comments} empty="No comments on this version yet. Issue threads further down are where a response is written." />
      </div>
    </article>
  )
}

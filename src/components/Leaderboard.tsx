import { useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { assessorById } from "../domain/assessors.ts"
import { categoryLabel } from "../domain/criteria.ts"
import { statusLabel } from "../domain/issues.ts"
import { buildRanking, listRankingMethods, sortRows, type RankRow } from "../domain/ranking.ts"
import { officialCriteria } from "../domain/officialCriteria.ts"
import { useAir } from "../context/AirContext.tsx"
import { AssessorMark, Sparkline } from "./charts.tsx"
import { cx, fieldClass, ScoreValue } from "./ui.tsx"

export function Leaderboard() {
  const air = useAir()
  const methods = useMemo(() => listRankingMethods(air.profiles), [air.profiles])
  const [methodId, setMethodId] = useState("panel")
  const [query, setQuery] = useState("")
  const [hideSamples, setHideSamples] = useState(false)
  const [openKey, setOpenKey] = useState<string | null>(null)
  const method = methods.find((item) => item.id === methodId) ?? methods[0]
  const rows = useMemo(() => {
    if (!method) return []
    const ranked = sortRows(buildRanking(air.db), method).filter((row) => {
      if (hideSamples && row.demo) return false
      const haystack = [row.title, row.doi, row.creators.join(" "), row.keywords.join(" ")].join(" ").toLowerCase()
      return haystack.includes(query.trim().toLowerCase())
    })
    return ranked
  }, [air.db, hideSamples, method, query])
  const keywords = useMemo(() => {
    const counts = new Map<string, number>()
    for (const row of buildRanking(air.db)) {
      for (const keyword of row.keywords) counts.set(keyword, (counts.get(keyword) ?? 0) + 1)
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([keyword]) => keyword)
  }, [air.db])

  if (!air.ready) return <p className="px-4 py-8 text-sm text-ink-soft">Opening the board…</p>
  if (!method) return null

  return (
    <section aria-labelledby="board-heading" className="mx-auto max-w-6xl px-4 pb-8">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <h2 id="board-heading" className="font-serif text-xl">
          Records by AIR score
        </h2>
        <p className="max-w-xl text-xs text-ink-soft">
          Cells are medians on a 0–10 scale. AIR v0.1 readings are converted from 1–5 and labelled. Order leans toward 5 until several readings exist.
          Sort by impact, feasibility, physics, simulation, estimated value, global goals, or idea. Those scores open inside the row.{" "}
          <Link to="/method" className="underline">
            How this is calculated
          </Link>
        </p>
      </div>
      <div className="no-print mb-3 flex flex-wrap items-center gap-2">
        <label className="min-w-48 flex-1 text-sm">
          <span className="sr-only">Filter</span>
          <input
            className={fieldClass}
            value={query}
            placeholder="Filter by title, keyword, DOI, or author"
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <label className="text-sm text-ink-soft">
          Rank by
          <select
            className={`${fieldClass} ml-2 w-auto`}
            value={method.id}
            aria-label="Rank by"
            onChange={(event) => setMethodId(event.target.value)}
          >
            {methods.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm text-ink-soft">
          <input type="checkbox" checked={hideSamples} onChange={(event) => setHideSamples(event.target.checked)} />
          Hide samples and demos
        </label>
      </div>
      <div className="no-print mb-3 flex flex-wrap gap-2">
        {keywords.map((keyword) => (
          <button key={keyword} type="button" className="rounded-full border border-line px-3 py-1 text-xs text-ink-soft hover:border-teal" onClick={() => setQuery(keyword)}>
            {keyword}
          </button>
        ))}
      </div>
      {rows.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line px-4 py-8 text-sm text-ink-soft">Nothing matches that filter yet.</p>
      ) : (
        <div className="board-scroll rounded-2xl border border-line bg-white/40">
          <table>
            <caption className="sr-only">AIR leaderboard. Scores are AI assessments, not formal peer review.</caption>
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-ink-soft">
                <th className="sticky-col left-0 z-10 px-3 py-3">#</th>
                <th className="sticky-col left-10 z-10 min-w-64 px-3 py-3">Work</th>
                {methods
                  .filter((item) => item.id === "panel" || item.id === "idea" || air.profiles.some((profile) => profile.id === item.id))
                  .map((item) => (
                    <th key={item.id} className="px-2 py-3" aria-sort={item.id === method.id ? "descending" : "none"}>
                      <button type="button" className={cx("underline-offset-2 hover:underline", item.id === method.id && "font-semibold text-teal-deep")} onClick={() => setMethodId(item.id)}>
                        {item.label}
                      </button>
                    </th>
                  ))}
                <th className="px-3 py-3">Trust</th>
              </tr>
            </thead>
            {rows.map((row, index) => (
              <RowBody key={row.key} row={row} rank={index + 1} open={openKey === row.key} onToggle={() => setOpenKey(openKey === row.key ? null : row.key)} methodId={method.id} />
            ))}
          </table>
        </div>
      )}
      <p className="mt-3 text-xs text-ink-soft">These are AI assessments against AIR criteria, not formal peer review. Example rows are sample data.</p>
      <FreeScreening />
    </section>
  )
}

function scoreColumns(row: RankRow, profiles: { id: string }[]) {
  return [
    { id: "panel", value: row.panelMedian, count: row.reviewCount },
    { id: "idea", value: row.ideaMedian, count: row.reviewCount },
    ...profiles.map((profile) => ({
      id: profile.id,
      value: row.byAssessor[profile.id]?.median ?? null,
      count: row.byAssessor[profile.id]?.count ?? 0,
    })),
  ]
}

function RowBody({ row, rank, open, onToggle, methodId }: { row: RankRow; rank: number; open: boolean; onToggle: () => void; methodId: string }) {
  const air = useAir()
  const columns = scoreColumns(row, air.profiles)
  const issueNote = row.unresolvedIssues + row.openIssues
  return (
    <tbody>
      <tr className={cx(methodId && "hover:bg-white/70", row.demo && "text-ink")}>
        <td className="sticky-col left-0 px-3 py-3 text-sm tabular-nums text-ink-soft">{rank}</td>
        <td className="sticky-col left-10 px-3 py-3">
          <Link to={`/paper/${encodeURIComponent(row.recordId)}`} className="font-serif text-base leading-snug text-ink hover:text-teal-deep">
            {row.title}
          </Link>
          <p className="mt-1 text-xs text-ink-soft">
            {row.creators.join(", ") || "Creator unlisted"} · {row.publicationDate || "undated"}
          </p>
          <Sparkline values={[...row.reviews].sort((a, b) => a.createdAt.localeCompare(b.createdAt)).map((review) => review.report.overallScore)} />
          <p className="mt-1 flex flex-wrap gap-1">
            {row.sample && <Chip>Sample</Chip>}
            {!row.sample && row.demo && <Chip>Demo</Chip>}
            {issueNote > 0 && <Chip>{`${issueNote} open`}</Chip>}
            {row.fidelity.disputed && <Chip>Disputed</Chip>}
          </p>
          <button type="button" className="no-print mt-2 text-xs text-teal underline-offset-2 hover:underline" aria-expanded={open} onClick={onToggle}>
            {open ? "Hide details" : "Scores, checks, and issues"}
          </button>
        </td>
        {columns.map((column) => (
          <td key={column.id} className={cx("px-2 py-3 text-sm", column.id === methodId && "bg-teal/5")}>
            <ScoreValue value={column.value} title={column.count ? `${column.count} reading${column.count === 1 ? "" : "s"}` : "No reading"} />
            {column.value !== null && <div className="text-[11px] text-ink-soft">{column.count}</div>}
          </td>
        ))}
        <td className="px-3 py-3 text-xs">
          <span title={row.fidelity.label} className={cx("rounded-full px-2 py-1", row.fidelity.disputed ? "bg-gold/15 text-gold" : row.fidelity.nodes ? "bg-teal/10 text-teal-deep" : "bg-paper-deep text-ink-soft")}>
            {row.fidelity.nodes === 0 ? "Unchecked" : row.fidelity.disputed ? "Disputed" : `${row.fidelity.nodes} · ${Math.round((row.fidelity.passRate ?? 0) * 100)}%`}
          </span>
        </td>
      </tr>
      {open && (
        <tr>
          <td colSpan={columns.length + 3} className="bg-white/70 px-4 py-4">
            <Expanded row={row} />
          </td>
        </tr>
      )}
    </tbody>
  )
}

function FreeScreening() {
  const air = useAir()
  const rows = air.db.reviews.filter((review) => review.tier === "free-screening")
  if (rows.length === 0) return null
  return (
    <section className="mt-6" aria-label="Free screening">
      <h3 className="font-serif text-xl">Free screening</h3>
      <p className="mt-1 text-xs text-ink-soft">Unranked. A free quick review cannot verify a work on its own.</p>
      <ul className="mt-2 space-y-2">
        {rows.map((review) => (
          <li key={review.id} className="rounded-2xl border border-line px-3 py-2 text-sm">
            <AssessorMark name="Free" /> {review.title} · {review.report.overallScore.toFixed(1)} / 10 · screening only
          </li>
        ))}
      </ul>
    </section>
  )
}

function Chip({ children }: { children: string }) {
  return <span className="rounded-full bg-paper-deep px-2 py-0.5 text-[11px] text-ink-soft">{children}</span>
}

function Expanded({ row }: { row: RankRow }) {
  const air = useAir()
  const criteria = row.reviews[0]?.customCriteria ? air.criteria : officialCriteria
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <h3 className="text-sm font-medium">Per-criterion scores</h3>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[32rem] text-sm">
            <thead>
              <tr className="text-left text-xs text-ink-soft">
                <th className="py-1">Criterion</th>
                {row.reviews.map((review) => (
                  <th key={review.id} className="py-1">
                    {assessorById(review.assessorId, air.profiles)?.shortName ?? review.assessorId}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {criteria.criteria.map((criterion) => (
                <tr key={criterion.id} className="border-t border-line/70">
                  <th className="py-1 pr-2 text-left font-normal">{criterion.name}</th>
                  {row.reviews.map((review) => (
                    <td key={review.id} className="py-1 tabular-nums">
                      {review.report.scores.find((score) => score.criterionId === criterion.id)?.score ?? "—"}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-3 space-y-2">
          {row.reviews.map((review) => (
            <details key={review.id}>
              <summary className="cursor-pointer text-sm">
                {assessorById(review.assessorId, air.profiles)?.name ?? review.assessorId} · {review.report.overallScore.toFixed(1)} ·{" "}
                {categoryLabel(criteria, review.report.recommendation)}
              </summary>
              <p className="mt-1 text-sm text-ink-soft">{review.report.summary}</p>
            </details>
          ))}
        </div>
      </div>
      <div className="space-y-3 text-sm">
        <p title={row.fidelity.label}>{row.fidelity.label}</p>
        <p className="text-ink-soft">
          Rank score {row.panelRankScore?.toFixed(2) ?? "—"} from median {row.panelMedian?.toFixed(2) ?? "—"} / 10 across {row.reviewCount} reading
          {row.reviewCount === 1 ? "" : "s"}. Criteria {row.criteriaVersions.join(", ") || "unlabelled"}.
          {row.physicsClass ? ` Physics class ${row.physicsClass}.` : ""}
          {row.issuePenalty > 0 ? ` Open issues nudge the order by ${row.issuePenalty.toFixed(2)}.` : " Addressed issues do not change the order."}
        </p>
        <ul className="grid grid-cols-2 gap-1 text-xs">
          {Object.entries(row.subscores).map(([id, cell]) => (
            <li key={id}>
              {id}: {cell.median === null ? "—" : cell.median.toFixed(1)}
            </li>
          ))}
        </ul>
        <div>
          <h3 className="font-medium">Independent nodes</h3>
          {air.db.nodes.filter((node) => row.reviews.some((review) => review.id === node.reviewId)).length === 0 && <p className="text-ink-soft">None yet.</p>}
          <ul className="mt-1 space-y-1">
            {air.db.nodes
              .filter((node) => row.reviews.some((review) => review.id === node.reviewId))
              .map((node) => (
                <li key={node.id}>
                  <Link className="underline" to={`/nodes/${encodeURIComponent(node.nodeId)}`}>
                    {node.nodeName}
                  </Link>{" "}
                  · {node.verdict}
                </li>
              ))}
          </ul>
        </div>
        <div>
          <h3 className="font-medium">Issues</h3>
          {row.issues.length === 0 && <p className="text-ink-soft">None opened.</p>}
          <ul className="mt-1 space-y-1">
            {row.issues.map((issue) => (
              <li key={issue.id}>
                <span className="text-ink-soft">{statusLabel(issue.status)} · </span>
                {issue.claim}
              </li>
            ))}
          </ul>
        </div>
        <Link to={`/paper/${encodeURIComponent(row.recordId)}`} className="inline-block text-teal underline">
          Open the full record
        </Link>
      </div>
    </div>
  )
}

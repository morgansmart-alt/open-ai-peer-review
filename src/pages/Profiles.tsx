import { Link, useParams } from "react-router-dom"
import { assessorById } from "../domain/assessors.ts"
import { computeReputations, consensusOf, eligibleNodes, reputationOf } from "../domain/fidelity.ts"
import { buildRanking, listRankingMethods, sortRows, tendency } from "../domain/ranking.ts"
import { useAir } from "../context/AirContext.tsx"
import { formatWhen } from "../components/ui.tsx"

export function ReviewersPage() {
  const air = useAir()
  const rows = buildRanking(air.db)
  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="font-serif text-4xl">Assessor profiles</h1>
      <p className="mt-2 max-w-2xl text-ink-soft">
        Each profile is a named model. Its page shows the scores it gives, whether it runs harsh or lenient against the rest of the panel, and its own ranking.
      </p>
      <ul className="mt-6 grid gap-3 sm:grid-cols-2">
        {air.profiles.map((profile) => {
          const lean = tendency(rows, profile.id)
          const count = air.db.reviews.filter((review) => review.assessorId === profile.id && !review.customCriteria).length
          const averageValues = rows.flatMap((row) => (row.byAssessor[profile.id] ? [row.byAssessor[profile.id].median] : []))
          const average = averageValues.length ? averageValues.reduce((total, value) => total + value, 0) / averageValues.length : null
          return (
            <li key={profile.id} className="rounded-3xl border border-line bg-white/60 p-4">
              <Link to={`/reviewers/${profile.id}`} className="font-serif text-2xl text-teal-deep">
                {profile.name}
              </Link>
              <p className="mt-1 text-sm text-ink-soft">{profile.blurb}</p>
              <p className="mt-3 text-sm">
                {count} ranked reading{count === 1 ? "" : "s"}
                {average !== null ? ` · average ${average.toFixed(2)}` : ""} · {lean.label}
                {lean.delta !== null ? ` (${lean.delta > 0 ? "+" : ""}${lean.delta.toFixed(2)})` : ""}
              </p>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

export function ReviewerPage() {
  const { assessorId = "" } = useParams()
  const air = useAir()
  const profile = assessorById(assessorId, air.profiles)
  const rows = buildRanking(air.db)
  const method = listRankingMethods(air.profiles).find((item) => item.id === assessorId)
  const ranked = method ? sortRows(rows.filter((row) => row.byAssessor[assessorId]), method) : []
  const lean = tendency(rows, assessorId)
  const history = air.db.reviews.filter((review) => review.assessorId === assessorId).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  if (!profile) return <p className="px-4 py-8">That assessor is not on this board.</p>
  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <p className="text-sm text-teal">{profile.provider}</p>
      <h1 className="font-serif text-4xl">{profile.name}</h1>
      <p className="mt-2 max-w-2xl text-ink-soft">{profile.blurb}</p>
      <p className="mt-3 text-sm">
        {lean.label}
        {lean.delta !== null ? ` by ${lean.delta.toFixed(2)} across ${lean.compared} shared records.` : "."} Default model {profile.defaultModel}.
      </p>
      <h2 className="mt-8 font-serif text-2xl">Ranked by {profile.name}</h2>
      <ol className="mt-3 divide-y divide-line rounded-2xl border border-line bg-white/50">
        {ranked.length === 0 && <li className="p-4 text-sm text-ink-soft">No ranked readings yet.</li>}
        {ranked.map((row, index) => (
          <li key={row.key} className="flex items-baseline justify-between gap-3 p-3 text-sm">
            <span>
              <span className="text-ink-soft">{index + 1}. </span>
              <Link className="font-serif text-base" to={`/paper/${encodeURIComponent(row.recordId)}`}>
                {row.title}
              </Link>
            </span>
            <span className="tabular-nums">{row.byAssessor[assessorId]?.median.toFixed(1)}</span>
          </li>
        ))}
      </ol>
      <h2 className="mt-8 font-serif text-2xl">History</h2>
      <div className="mt-3 space-y-2">
        {history.map((review) => (
          <details key={review.id} className="rounded-2xl border border-line bg-white/50 p-3 text-sm">
            <summary className="cursor-pointer">
              {review.title} · {review.report.overallScore.toFixed(1)} · {formatWhen(review.createdAt)}
              {review.sample ? " · sample" : ""}
              {review.customCriteria ? " · unranked" : ""}
            </summary>
            <p className="mt-2 text-ink-soft">{review.report.summary}</p>
          </details>
        ))}
      </div>
    </div>
  )
}

export function NodesPage() {
  const air = useAir()
  const reputations = computeReputations(air.db.nodes)
  const ids = [...new Set(air.db.nodes.map((node) => node.nodeId))]
  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="font-serif text-4xl">Independent nodes</h1>
      <p className="mt-2 max-w-2xl text-ink-soft">
        A node is a browser that checked someone else’s reading. Reputation rises when a clear consensus later agrees, and falls when it does not. New nodes start at 1.
      </p>
      <ul className="mt-6 divide-y divide-line rounded-2xl border border-line bg-white/50">
        {ids.length === 0 && <li className="p-4 text-sm text-ink-soft">No independent checks yet.</li>}
        {ids.map((id) => {
          const name = air.db.nodes.find((node) => node.nodeId === id)?.nodeName ?? id
          const count = eligibleNodes(air.db.nodes).filter((node) => node.nodeId === id).length
          return (
            <li key={id} className="flex items-baseline justify-between gap-3 p-3 text-sm">
              <Link className="font-medium" to={`/nodes/${encodeURIComponent(id)}`}>
                {name}
              </Link>
              <span className="text-ink-soft">
                reputation {reputationOf(id, reputations).toFixed(2)} · {count} counted check{count === 1 ? "" : "s"}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

export function NodePage() {
  const { nodeId = "" } = useParams()
  const decoded = decodeURIComponent(nodeId)
  const air = useAir()
  const reputations = computeReputations(air.db.nodes)
  const mine = air.db.nodes.filter((node) => node.nodeId === decoded).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const name = mine[0]?.nodeName ?? decoded
  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="font-serif text-4xl">{name}</h1>
      <p className="mt-2 text-sm text-ink-soft">
        Reputation {reputationOf(decoded, reputations).toFixed(2)}. It moves only when a reading has at least four official checks and at least three quarters of them agree.
        A single node cannot hold more than 40% of the weight on a badge.
      </p>
      <div className="mt-6 space-y-2">
        {mine.length === 0 && <p className="text-sm text-ink-soft">No checks from this node.</p>}
        {mine.map((node) => {
          const peers = eligibleNodes(air.db.nodes, node.reviewId)
          const consensus = consensusOf(peers)
          const review = air.db.reviews.find((item) => item.id === node.reviewId)
          return (
            <details key={node.id} className="rounded-2xl border border-line bg-white/50 p-3 text-sm">
              <summary className="cursor-pointer">
                {node.verdict.toUpperCase()} · {review?.title ?? node.doi} · {formatWhen(node.createdAt)}
                {node.customCriteria ? " · ignored (custom criteria)" : ""}
              </summary>
              <p className="mt-2">{node.summary}</p>
              <p className="mt-1 text-xs text-ink-soft">
                {consensus ? `Consensus so far: ${consensus}. This node ${node.verdict === consensus ? "matches" : "opposes"} it.` : "No consensus yet, so this check has not moved reputation."}
              </p>
              {node.attachment && (
                <p className="mt-1 text-xs text-ink-soft">
                  Attachment {node.attachment.name} · {node.attachment.kind} · {node.attachment.sha256.slice(0, 16)}
                  {node.attachment.url ? ` · ${node.attachment.url}` : ""}
                </p>
              )}
            </details>
          )
        })}
      </div>
    </div>
  )
}

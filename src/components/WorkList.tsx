import { canAppendRound, statusLabel } from "../domain/issues.ts"
import { stableVersionId } from "../domain/versions.ts"
import type { IssueThread } from "../domain/types.ts"
import type { ZenodoRecord } from "../services/zenodo.ts"
import { btnPrimary, btnQuiet } from "./ui.tsx"

export function WorkList({
  record,
  outstanding,
  closed,
  busy,
  note,
  onRecheck,
  onRecheckAll,
}: {
  record: ZenodoRecord
  outstanding: IssueThread[]
  closed: IssueThread[]
  busy: boolean
  note: string | null
  onRecheck: (issue: IssueThread) => void
  onRecheckAll: () => void
}) {
  const checkedId = stableVersionId(record)
  return (
    <section className="mt-8" data-testid="carry-forward">
      <h2 className="font-serif text-2xl">Continue from review feedback</h2>
      <p className="mt-1 text-sm text-ink-soft">
        Outstanding issues from earlier versions of this work are listed here. A re-check appends a round to the original thread and searches this version’s files. It does not copy a score, and it does not close a thread on its own.
      </p>
      {note && <p className="mt-2 text-sm text-ink-soft">{note}</p>}
      {outstanding.length > 0 && (
        <button type="button" className={`${btnPrimary} mt-3`} disabled={busy} onClick={onRecheckAll}>
          {busy ? "Re-checking…" : "Re-check outstanding issues against this version"}
        </button>
      )}
      <ul className="mt-3 space-y-2">
        {outstanding.length === 0 && <li className="text-sm text-ink-soft">No outstanding issue is carried forward onto this version.</li>}
        {outstanding.map((issue) => {
          const allowed = canAppendRound(issue, { kind: "recheck", recordVersionChecked: checkedId })
          return (
            <li key={issue.id} className="rounded-2xl border border-line bg-white/50 px-3 py-2 text-sm">
              <p>
                <span className="text-ink-soft">{statusLabel(issue.status)} · </span>
                {issue.claim}
              </p>
              <p className="mt-1 text-xs text-ink-soft">Opened on {issue.recordVersion}. The thread below keeps every round. This list does not copy it.</p>
              {issue.rounds.length > 0 && (
                <ul className="mt-2 space-y-1 text-xs text-ink-soft">
                  {issue.rounds.map((round) => (
                    <li key={round.id}>
                      {round.kind} · {round.authorLabel}: {round.body}
                    </li>
                  ))}
                </ul>
              )}
              <button type="button" className={`${btnQuiet} mt-2`} disabled={busy || !allowed} onClick={() => onRecheck(issue)}>
                Re-check this issue against this version
              </button>
            </li>
          )
        })}
      </ul>
      <details className="mt-4 rounded-2xl border border-line bg-white/40 p-3">
        <summary className="cursor-pointer text-sm">Closed history ({closed.length})</summary>
        <ul className="mt-2 space-y-2 text-sm">
          {closed.length === 0 && <li className="text-ink-soft">Nothing on this concept is marked addressed yet.</li>}
          {closed.map((issue) => (
            <li key={issue.id}>
              <span className="text-ink-soft">{statusLabel(issue.status)} · </span>
              {issue.claim}
            </li>
          ))}
        </ul>
      </details>
    </section>
  )
}

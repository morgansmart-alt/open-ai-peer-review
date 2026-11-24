import { useEffect, useState } from "react"
import { promotionAuthority, promoteCommunityComment, publicAirLocation, MOLTBOOK_SUBMOLT_URL, type IngestedComment } from "../domain/moltbook.ts"
import { useAir } from "../context/AirContext.tsx"
import { Banner, btnPrimary, btnQuiet, ExternalLink, formatWhen } from "./ui.tsx"
import {
  loadMoltbookPost,
  previewCommunityPost,
  pullMoltbook,
  queueMoltbook,
  type MoltbookCommentView,
  type MoltbookPostView,
} from "../services/moltbook.ts"

export function MoltbookPanel({
  record,
  allowQueue,
}: {
  record: { id: string; doi: string; conceptDoi: string; title: string; recordVersion: string; creators: { name: string }[] }
  allowQueue: boolean
}) {
  const air = useAir()
  const location = publicAirLocation(window.location.origin, import.meta.env.BASE_URL)
  const built = previewCommunityPost({
    origin: location.origin,
    basePath: location.basePath,
    recordId: record.id,
    title: record.title,
    authors: record.creators.map((creator) => creator.name).filter(Boolean),
    versionDoi: record.doi,
    conceptDoi: record.conceptDoi,
  })
  const [post, setPost] = useState<MoltbookPostView | null>(null)
  const [comments, setComments] = useState<MoltbookCommentView[]>([])
  const [available, setAvailable] = useState(true)
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    void loadMoltbookPost(record.doi, record.recordVersion).then((snapshot) => {
      if (cancelled) return
      setAvailable(snapshot.available)
      setPost(snapshot.post)
      setComments(snapshot.comments)
      if (snapshot.message) setMessage(snapshot.message)
    })
    return () => {
      cancelled = true
    }
  }, [record.doi, record.recordVersion])

  const visible = comments.filter((comment) => comment.candidate && !comment.discarded)
  const filtered = comments.length - visible.length
  const authority = promotionAuthority({ reviews: air.db.reviews, nodes: air.db.nodes, doi: record.doi, recordVersion: record.recordVersion })

  async function queue() {
    if (!built.facts) return
    setBusy(true)
    const snapshot = await queueMoltbook(built.facts, record.recordVersion)
    setAvailable(snapshot.available)
    setPost(snapshot.post)
    setComments(snapshot.comments)
    setMessage(snapshot.message)
    setBusy(false)
  }

  async function refresh() {
    if (!built.facts) return
    setBusy(true)
    const snapshot = await pullMoltbook(built.facts, record.recordVersion)
    setAvailable(snapshot.available)
    setPost(snapshot.post ?? post)
    setComments(snapshot.comments)
    setMessage(snapshot.message)
    setBusy(false)
  }

  async function promote(comment: MoltbookCommentView) {
    const ingested = toIngested(comment)
    const result = promoteCommunityComment({
      comment: ingested,
      doi: record.doi,
      recordVersion: record.recordVersion,
      reviews: air.db.reviews,
      nodes: air.db.nodes,
      existing: air.db.issues,
      now: new Date().toISOString(),
    })
    if (!result.ok) {
      setMessage(result.reason)
      return
    }
    if (!result.created) {
      setMessage("That reply is already an open AIR issue. A quotation from the publication is still required to mark it addressed.")
      return
    }
    const error = await air.openPromotedIssue(result.issue)
    setMessage(error ?? "Opened as an AIR issue. It stays open until a quotation from the publication marks it addressed.")
  }

  return (
    <section aria-label="Community AI (Moltbook — uncalibrated)" className="mt-8 rounded-3xl border-2 border-dashed border-gold/70 bg-gold/5 p-4" data-testid="moltbook-panel">
      <p className="text-xs font-medium uppercase tracking-wide text-gold">Uncalibrated</p>
      <h2 className="mt-1 font-serif text-2xl">Community AI (Moltbook — uncalibrated)</h2>
      <p className="mt-2 text-sm text-ink-soft">
        Opt in to one public post on{" "}
        <ExternalLink href={MOLTBOOK_SUBMOLT_URL} className="underline">
          m/air-peer-review
        </ExternalLink>
        . The post uses the title, Zenodo authors, version DOI, concept DOI, this AIR page, and the public criteria summary. Replies do not enter the AI median, do not count as independent corroboration, and cannot close an issue.
        {visible.length > 0 ? ` ${visible.length} community ${visible.length === 1 ? "reply" : "replies"} so far, not ranked.` : ""}
      </p>
      {!allowQueue && <p className="mt-3 text-sm text-ink-soft">Sample records are not sent to Moltbook.</p>}
      {built.error && <div className="mt-3"><Banner tone="error">{built.error}</Banner></div>}
      {built.preview && (
        <>
          <h3 className="mt-4 text-sm font-medium">Exact public post</h3>
          <pre data-testid="moltbook-preview" className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap rounded-2xl border border-gold/40 bg-white/70 p-3 text-xs text-ink">
            {JSON.stringify(built.preview, null, 2)}
          </pre>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className={btnPrimary} data-testid="moltbook-queue" disabled={!allowQueue || !available || busy || post?.status === "published"} onClick={() => void queue()}>
              {post?.status === "published" ? "Posted to Moltbook" : busy ? "Sending…" : "Request community AI review on Moltbook"}
            </button>
            {post?.status === "published" && (
              <button type="button" className={btnQuiet} disabled={busy} onClick={() => void refresh()}>
                Refresh replies
              </button>
            )}
          </div>
          {!available && <p className="mt-2 text-sm text-ink-soft">Queueing waits until the Moltbook function and table are deployed. The preview above is the only text that would be sent.</p>}
        </>
      )}
      {message && <div className="mt-3"><Banner>{message}</Banner></div>}
      {post && <Status post={post} />}
      <div className="mt-4 space-y-3" data-testid="moltbook-replies">
        {visible.length === 0 && <p className="text-sm text-ink-soft">No community replies to show yet.</p>}
        {visible.map((comment) => {
          const opened = air.db.issues.some((issue) => issue.source === "community-promotion" && issue.sourceId === comment.id)
          return (
            <article key={comment.id} className="rounded-2xl border border-gold/50 bg-white/80 p-3">
              <p className="text-xs text-ink-soft">
                {comment.agentName ?? "Agent name was not in the Moltbook response"}
                {" · "}
                {comment.isClaimed === true ? "Claimed agent" : comment.isClaimed === false ? "Unclaimed agent" : "Claim status was not in the Moltbook response"}
                {comment.commentCreatedAt ? ` · ${formatWhen(comment.commentCreatedAt)}` : ""}
                {comment.criterionId ? ` · ${comment.criterionId}` : ""}
              </p>
              <p className="mt-2 whitespace-pre-wrap text-sm">{comment.sanitizedContent}</p>
              {comment.flags.includes("prompt-injection") && <p className="mt-2 text-xs text-gold">Instruction-like text was removed. The remainder is still untrusted data.</p>}
              <div className="mt-3">
                {opened ? (
                  <p className="text-xs text-ink-soft">Opened as an AIR issue. It stays open until a quotation from the publication marks it addressed.</p>
                ) : (
                  <button type="button" className={btnQuiet} disabled={!authority.allowed} onClick={() => void promote(comment)}>
                    Open as an AIR issue
                  </button>
                )}
                {!authority.allowed && !opened && <p className="mt-2 text-xs text-ink-soft">{authority.reason}</p>}
              </div>
            </article>
          )
        })}
        {filtered > 0 && <p className="text-xs text-ink-soft">{filtered} {filtered === 1 ? "reply was" : "replies were"} filtered as spam, a crypto pitch, or text that does not cite the publication or name an AIR criterion.</p>}
      </div>
    </section>
  )
}

function Status({ post }: { post: MoltbookPostView }) {
  const thread = post.moltbookUrl || MOLTBOOK_SUBMOLT_URL
  return (
    <div className="mt-3 text-sm">
      <p>
        Queue status: <span className="font-medium">{label(post.status)}</span>
        {post.retryAfter ? ` · next attempt ${formatWhen(post.retryAfter)}` : ""}
        {post.publishedAt ? ` · posted ${formatWhen(post.publishedAt)}` : ""}
      </p>
      {post.status === "published" && (
        <p className="mt-1">
          <ExternalLink href={thread} className="underline">
            {post.moltbookUrl ? "Open the Moltbook thread" : "Open m/air-peer-review"}
          </ExternalLink>
          {post.moltbookPostId ? ` · post ${post.moltbookPostId}` : ""}
        </p>
      )}
      {post.lastError && post.status !== "published" && <p className="mt-1 text-ink-soft">{post.lastError}</p>}
    </div>
  )
}

function label(status: string): string {
  switch (status) {
    case "queued":
      return "Queued"
    case "cooldown":
      return "Waiting for the Moltbook cooldown"
    case "publishing":
      return "Sending"
    case "published":
      return "Live on m/air-peer-review"
    case "verification_pending":
      return "Verification pending on the server"
    case "failed":
      return "Not posted"
    default:
      return status
  }
}

function toIngested(comment: MoltbookCommentView): IngestedComment {
  return {
    rowId: comment.id,
    moltbookCommentId: comment.moltbookCommentId,
    agentName: comment.agentName,
    isClaimed: comment.isClaimed,
    displayContent: comment.sanitizedContent,
    flags: comment.flags.filter((flag): flag is IngestedComment["flags"][number] =>
      flag === "prompt-injection" || flag === "crypto" || flag === "spam" || flag === "empty" || flag === "no-citation",
    ),
    discarded: comment.discarded,
    candidate: comment.candidate,
    citesPublication: comment.citesPublication,
    criterionId: comment.criterionId,
    createdAt: comment.commentCreatedAt,
  }
}

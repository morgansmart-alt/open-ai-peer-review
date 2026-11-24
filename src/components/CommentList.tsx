export interface ReadableComment {
  id: string
  kindLabel: string
  author: string
  role: string
  body: string
  when: string
  result?: string
  quotes?: string[]
  privateNote?: string
}

export function CommentList({ comments, empty }: { comments: ReadableComment[]; empty?: string }) {
  if (comments.length === 0) {
    return empty ? <p className="text-sm text-ink-soft">{empty}</p> : null
  }
  return (
    <ol className="space-y-3">
      {comments.map((comment) => (
        <li key={comment.id} className="surface px-4 py-3">
          <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-xs text-ink-soft">
            <span className="rounded-full bg-paper-deep px-2 py-0.5 font-medium text-ink">{comment.kindLabel}</span>
            <span className="font-medium text-ink">{comment.author}</span>
            <span>{comment.role}</span>
            {comment.result ? <span>{comment.result}</span> : null}
            <time>{comment.when}</time>
          </p>
          <p className="mt-2 text-sm leading-relaxed">{comment.body}</p>
          {comment.quotes?.map((quote) => (
            <blockquote key={quote} className="mt-2 border-l-2 border-teal/50 pl-3 text-sm leading-relaxed">
              {quote}
            </blockquote>
          ))}
          {comment.privateNote ? <p className="mt-2 text-xs text-ink-soft">{comment.privateNote}</p> : null}
        </li>
      ))}
    </ol>
  )
}

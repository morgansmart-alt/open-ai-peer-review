/**
 * Record id from a path GitHub Pages served as the app shell, such as
 * /open-ai-peer-review/paper/22826. The plain-text route stays on its own page.
 */
export function paperRecordIdFromPath(pathname: string): string | null {
  if (/\/paper\/[^/]+\/text\/?$/.test(pathname)) return null
  if (/\/paper-text\//.test(pathname)) return null
  const match = pathname.match(/\/paper\/([^/]+)\/?$/)
  if (!match?.[1]) return null
  try {
    return decodeURIComponent(match[1])
  } catch {
    return match[1]
  }
}

/** Hash URL for a bare /paper/<id> path. Null when the path is not a paper page. */
export function hashUrlForBarePaperPath(pathname: string, base: string, search = ""): string | null {
  const id = paperRecordIdFromPath(pathname)
  if (!id) return null
  const root = base.endsWith("/") ? base.slice(0, -1) : base
  return `${root}/#/paper/${encodeURIComponent(id)}${search}`
}

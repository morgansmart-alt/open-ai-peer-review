export type BoardSlice = "all" | "open-issues" | "human" | "samples"

export interface BoardQueryRow {
  title: string
  doi: string
  creators: string[]
  keywords: string[]
  demo: boolean
  sample: boolean
  openIssues: number
  unresolvedIssues: number
  humanCount: number
}

export function rowMatchesQuery(row: BoardQueryRow, query: string): boolean {
  const needle = query.trim().toLowerCase()
  if (!needle) return true
  const haystack = [row.title, row.doi, row.creators.join(" "), row.keywords.join(" ")].join(" ").toLowerCase()
  return haystack.includes(needle)
}

export function rowMatchesSlice(row: BoardQueryRow, slice: BoardSlice): boolean {
  if (slice === "open-issues") return row.openIssues + row.unresolvedIssues > 0
  if (slice === "human") return row.humanCount > 0
  if (slice === "samples") return row.sample || row.demo
  return true
}

/** Live Supabase rows should be the board. Samples stay available behind the existing toggle. */
export function hideSamplesWhenLive(liveRows: number, userChose: boolean, hidden: boolean): boolean {
  if (userChose) return hidden
  return liveRows > 0
}

export function filterBoardRows<T extends BoardQueryRow>(rows: T[], query: string, slice: BoardSlice, hideSamples: boolean): T[] {
  return rows.filter((row) => {
    if (hideSamples && row.demo) return false
    if (!rowMatchesSlice(row, slice)) return false
    return rowMatchesQuery(row, query)
  })
}

export function boardErrorMessage(error: string): string {
  const lead = "The shared board could not be reached. This page is showing the copy in this browser, including labelled samples. You can still open a record and run a review."
  const detail = error.trim()
  if (!detail || detail.length > 160) return lead
  if (/eyJ|service_role|secret|api[_ -]?key|bearer /i.test(detail)) return lead
  return `${lead} ${detail}`
}

export function emptyBoardMessage(query: string, slice: BoardSlice, hideSamples: boolean): string {
  if (hideSamples && slice === "samples") return "Samples are hidden. Untick “Hide samples and demos”, or clear the filters."
  if (query.trim()) return `Nothing matches “${query.trim()}”. Try a title, a keyword, a DOI, or an author.`
  if (slice === "open-issues") return "No record on this board has an open issue."
  if (slice === "human") return "No record on this board has a human review yet."
  if (slice === "samples") return "No sample rows are on this board."
  return "The board has no records yet."
}

import type { ReactNode } from "react"

export function ExternalLink({ href, className, children }: { href: string; className?: string; children: ReactNode }) {
  return (
    <a href={href} className={className} target="_blank" rel="noopener noreferrer">
      {children}
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  )
}

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ")
}

export const btnPrimary =
  "inline-flex min-h-10 items-center justify-center rounded-full bg-teal px-4 py-2 text-sm font-medium text-paper transition hover:bg-teal-deep disabled:cursor-not-allowed disabled:opacity-50"
export const btnQuiet =
  "inline-flex min-h-10 items-center justify-center rounded-full border border-line bg-white/60 px-4 py-2 text-sm text-ink transition hover:border-teal disabled:cursor-not-allowed disabled:opacity-50"
export const fieldClass =
  "w-full rounded-xl border border-line bg-white/80 px-3 py-2 text-sm text-ink outline-none placeholder:text-ink-soft/70"

export function ScoreValue({ value, title }: { value: number | null; title?: string }) {
  if (value === null) return <span className="text-ink-soft">—</span>
  return (
    <span title={title} className="font-medium tabular-nums text-ink">
      {value.toFixed(1)}
    </span>
  )
}

export function Banner({ tone = "info", children }: { tone?: "info" | "error" | "good"; children: ReactNode }) {
  const toneClass =
    tone === "error" ? "border-bad/30 bg-bad/5 text-bad" : tone === "good" ? "border-good/30 bg-good/5 text-good" : "border-line bg-white/60 text-ink-soft"
  return (
    <p role={tone === "error" ? "alert" : "status"} className={cx("rounded-2xl border px-4 py-3 text-sm", toneClass)}>
      {children}
    </p>
  )
}

export function formatWhen(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
}

export function scrollToId(id: string) {
  const node = document.getElementById(id)
  if (!node) return
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches
  node.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" })
  if (node instanceof HTMLElement) node.focus({ preventScroll: true })
}

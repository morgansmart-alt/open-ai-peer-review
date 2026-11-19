import { useEffect, useState, type ReactNode } from "react"
import { NavLink } from "react-router-dom"
import { shortNotice } from "../content/notices.ts"
import { useAir } from "../context/AirContext.tsx"
import { KeysDialog } from "./KeysDialog.tsx"
import { cx } from "./ui.tsx"

const links = [
  { to: "/", label: "Leaderboard", end: true },
  { to: "/review", label: "Review" },
  { to: "/reviewers", label: "Assessors" },
  { to: "/criteria", label: "Criteria" },
  { to: "/method", label: "About" },
]

const embedded = window.parent !== window

export function Shell({ children }: { children: ReactNode }) {
  const air = useAir()
  const [theme, setTheme] = useState<"light" | "dark">(() => (localStorage.getItem("air.theme") === "dark" ? "dark" : "light"))
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem("air.theme", theme)
  }, [theme])
  return (
    <div className={cx(!embedded && "min-h-screen", "text-ink")}>
      <a href="#content" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-white focus:px-3 focus:py-2">
        Skip to content
      </a>
      <header className="no-print sticky top-0 z-30 border-b border-line/80 bg-paper/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <NavLink to="/" className="max-w-56 leading-tight sm:max-w-xs">
            <span className="block font-serif text-base font-semibold tracking-tight text-teal-deep sm:text-lg">Open Iterative AI Peer Review</span>
            <span className="block text-xs text-ink-soft">& Idea Rankings</span>
          </NavLink>
          <nav aria-label="Primary" className="flex flex-wrap items-center gap-1">
            {links.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.end}
                className={({ isActive }) =>
                  cx("rounded-full px-3 py-1.5 text-sm", isActive ? "bg-teal text-paper" : "text-ink-soft hover:text-ink")
                }
              >
                {link.label}
              </NavLink>
            ))}
            <button type="button" className="rounded-full px-3 py-1.5 text-sm text-ink-soft hover:text-ink" aria-pressed={theme === "dark"} onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
              {theme === "dark" ? "Light" : "Dark"}
            </button>
            <button type="button" className="rounded-full px-3 py-1.5 text-sm text-ink-soft hover:text-ink" onClick={() => air.setKeysOpen(true)}>
              {air.settings.demoMode ? "Demo keys" : "API keys"}
            </button>
          </nav>
        </div>
      </header>
      <main id="content">{children}</main>
      <footer className="no-print mx-auto max-w-6xl px-4 py-10 text-sm text-ink-soft">
        <p>
          Open Iterative AI Peer Review & Idea Rankings. {shortNotice} Keys stay in this browser. The criteria name is AIR (AI Review).
        </p>
      </footer>
      <KeysDialog />
    </div>
  )
}

import { useEffect, useState, type ReactNode } from "react"
import { NavLink, useLocation } from "react-router-dom"
import { shortNotice } from "../content/notices.ts"
import { useAir } from "../context/AirContext.tsx"
import { KeysDialog } from "./KeysDialog.tsx"
import { cx } from "./ui.tsx"

const links = [
  { to: "/", label: "Leaderboard", end: true },
  { to: "/review", label: "Review" },
  { to: "/guide", label: "Guide" },
  { to: "/criteria", label: "Criteria" },
  { to: "/method", label: "About" },
  { to: "/reviewers", label: "Assessors" },
]

const pageTitles: Record<string, string> = {
  "/": "Open AI Peer Review & Idea Rankings | AIR",
  "/review": "Review a record | AIR",
  "/guide": "How to use AIR | AIR",
  "/criteria": "AIR criteria",
  "/method": "How a score is made | AIR",
  "/reviewers": "Assessors | AIR",
  "/nodes": "Independent checks | AIR",
}

const embedded = window.parent !== window

function storedTheme(): "light" | "dark" {
  try {
    const stored = localStorage.getItem("air.theme")
    if (stored === "dark" || stored === "light") return stored
  } catch {
    /* private mode */
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
}

export function Shell({ children }: { children: ReactNode }) {
  const air = useAir()
  const location = useLocation()
  const [theme, setTheme] = useState<"light" | "dark">(storedTheme)
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    try {
      localStorage.setItem("air.theme", theme)
    } catch {
      /* private mode */
    }
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? "#12171b" : "#0f5f5b")
  }, [theme])
  useEffect(() => {
    if (location.pathname.startsWith("/paper")) return
    document.title = pageTitles[location.pathname] ?? "Open AI Peer Review & Idea Rankings | AIR"
  }, [location.pathname])
  const nextTheme = theme === "dark" ? "light" : "dark"
  return (
    <div className={cx(!embedded && "min-h-screen", "text-ink")}>
      <a href="#content" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:border focus:border-line focus:bg-paper focus:px-3 focus:py-2 focus:text-ink">
        Skip to content
      </a>
      <header className="no-print sticky top-0 z-30 border-b border-line/80 bg-paper/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2">
          <NavLink to="/" className="shrink-0 leading-tight" aria-label="AIR, home">
            <span className="block font-serif text-lg font-semibold tracking-tight text-teal-deep">AIR</span>
            <span className="hidden text-xs text-ink-soft sm:block">Open Iterative AI Peer Review</span>
          </NavLink>
          <nav aria-label="Primary" className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
            {links.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.end}
                className={({ isActive }) =>
                  cx("shrink-0 rounded-full px-3 py-2 text-sm", isActive ? "bg-teal text-paper" : "text-ink-soft hover:text-ink")
                }
              >
                {link.label}
              </NavLink>
            ))}
            <button
              type="button"
              className="shrink-0 rounded-full px-3 py-2 text-sm text-ink-soft hover:text-ink"
              aria-pressed={theme === "dark"}
              aria-label={nextTheme === "dark" ? "Switch to dark theme" : "Switch to light theme"}
              onClick={() => setTheme(nextTheme)}
            >
              {theme === "dark" ? "Light" : "Dark"}
            </button>
            <button type="button" className="shrink-0 rounded-full px-3 py-2 text-sm text-ink-soft hover:text-ink" onClick={() => air.setKeysOpen(true)}>
              {air.settings.demoMode ? "Demo keys" : "API keys"}
            </button>
          </nav>
        </div>
      </header>
      <main id="content">{children}</main>
      <footer className="no-print mx-auto max-w-6xl px-4 py-10 text-sm leading-relaxed text-ink-soft">
        <p>
          Open Iterative AI Peer Review & Idea Rankings. {shortNotice} Keys stay in this browser. The criteria name is AIR (AI Review).
        </p>
      </footer>
      <KeysDialog />
    </div>
  )
}

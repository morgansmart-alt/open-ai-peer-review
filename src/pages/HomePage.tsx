import { Link } from "react-router-dom"
import { Leaderboard } from "../components/Leaderboard.tsx"
import { btnPrimary, btnQuiet } from "../components/ui.tsx"
import { useAir } from "../context/AirContext.tsx"

export function HomePage() {
  const air = useAir()
  return (
    <>
      <section className="mx-auto max-w-6xl px-4 pb-4 pt-8">
        <p className="text-sm text-teal">Open Iterative AI Peer Review & Idea Rankings</p>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-2xl">
            <h1 className="font-serif text-4xl leading-tight sm:text-5xl">A public board for ideas that can be checked.</h1>
            <p className="mt-3 text-base text-ink-soft">
              Each column is an AI assessor, scoring the same Zenodo record against the AIR criteria (AI Review). Bring your own key, or try a demo
              reading first. Nothing here is a journal decision.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to="/review" className={btnPrimary}>
              Review a Zenodo record
            </Link>
            <Link to="/method" className={btnQuiet}>
              How a score is made
            </Link>
          </div>
        </div>
        <p className="mt-4 text-sm font-medium text-ink">Example rows are sample data, not judgements of real work.</p>
        <p className="mt-2 text-sm text-ink-soft">
          {air.mode === "supabase"
            ? "This is the shared global board. Readings you publish are stored for everyone, without API keys. Example rows stay labelled as samples and are not written to the shared board."
            : "This board lives in your browser, with sample rows so you can see the shape of it. Sample rows are not judgements of real work. Connect Supabase when you want a board other people share."}
          {air.backendError ? ` Shared board unavailable: ${air.backendError}` : ""}
        </p>
      </section>
      <Leaderboard />
    </>
  )
}

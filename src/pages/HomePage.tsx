import { Link } from "react-router-dom"
import { HowItWorks } from "../components/HowItWorks.tsx"
import { Leaderboard } from "../components/Leaderboard.tsx"
import { btnPrimary, btnQuiet } from "../components/ui.tsx"
import { mission } from "../content/guideCopy.ts"
import { useAir } from "../context/AirContext.tsx"

export function HomePage() {
  const air = useAir()
  return (
    <>
      <section aria-labelledby="home-heading">
        <div className="mx-auto max-w-6xl px-4 py-8 md:py-14">
          <p className="text-sm font-medium text-teal">{mission.eyebrow}</p>
          <div className="mt-3 max-w-xl">
            <h1 id="home-heading" className="font-serif text-4xl leading-tight sm:text-5xl">
              {mission.title}
            </h1>
            <p className="mt-4 text-base leading-relaxed text-ink-soft">{mission.lede}</p>
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link to="/review" className={btnPrimary}>
              Review a Zenodo record
            </Link>
            <Link to="/guide" className={btnQuiet}>
              How to use AIR
            </Link>
          </div>
          <p className="mt-5 text-sm font-medium text-ink">{mission.sample}</p>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-ink-soft">
            {air.mode === "supabase"
              ? "This is the shared board. Readings you publish are stored for everyone, without API keys. Example rows stay labelled as samples."
              : "This copy lives in your browser, with sample rows so you can see the shape of it. Connect Supabase when you want a board other people share."}
          </p>
        </div>
      </section>
      <HowItWorks />
      <Leaderboard />
    </>
  )
}

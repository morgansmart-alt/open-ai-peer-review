import { useState } from "react"
import { Link } from "react-router-dom"
import { parseCriteria } from "../domain/criteria.ts"
import { applyCriterionProfile, CRITERION_PROFILES, PROFILE_RANKING_NOTE } from "../domain/profiles.ts"
import { officialCriteria } from "../domain/officialCriteria.ts"
import { useAir } from "../context/AirContext.tsx"
import { Banner, btnPrimary, btnQuiet } from "../components/ui.tsx"

export function CriteriaPage() {
  const air = useAir()
  const [draft, setDraft] = useState("")
  const [errors, setErrors] = useState<string[]>([])
  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="font-serif text-4xl">{officialCriteria.name}</h1>
      <p className="mt-2 text-ink-soft">
        Version {officialCriteria.version} is the default for a new reading. AIR v0.1 remains in the repo at criteria/air-v0.1.json, and readings made with it stay valid and labelled. A session can load a different file. Custom criteria are stored with the reading and left off the ranked board.{" "}
        <Link className="underline" to="/guide">
          The same criteria, in plain words
        </Link>
        .
      </p>
      {air.customCriteria && (
        <div className="mt-4">
          <Banner>This session is using custom criteria {air.criteria.version}. Ranked scores still use the official set when other people publish with it.</Banner>
        </div>
      )}
      <h2 className="mt-8 font-serif text-2xl">Principles</h2>
      <ul className="mt-2 list-disc space-y-2 pl-5 text-sm">
        {officialCriteria.principles.map((principle) => (
          <li key={principle}>{principle}</li>
        ))}
      </ul>
      <h2 className="mt-8 font-serif text-2xl">Scale</h2>
      <ul className="mt-2 space-y-1 text-sm">
        {Object.entries(officialCriteria.scale.labels).map(([score, label]) => (
          <li key={score}>
            <span className="font-medium">{score}.</span> {label}
          </li>
        ))}
      </ul>
      <h2 className="mt-8 font-serif text-2xl">Criteria</h2>
      <ul className="mt-3 space-y-3">
        {officialCriteria.criteria.map((criterion) => (
          <li key={criterion.id} className="rounded-2xl border border-line bg-white/60 p-4">
            <h3 className="font-medium">
              {criterion.name} <span className="text-sm font-normal text-ink-soft">weight {criterion.weight}</span>
            </h3>
            <p className="mt-1 text-sm">{criterion.description}</p>
            <p className="mt-2 text-sm text-ink-soft">{criterion.guidance}</p>
            {criterion.bands && (
              <ul className="mt-2 space-y-1 text-xs text-ink-soft">
                {criterion.bands.map((band) => (
                  <li key={band.label}>
                    {band.min}–{band.max}: {band.label}
                  </li>
                ))}
              </ul>
            )}
            {officialCriteria.ideaCriterionIds.includes(criterion.id) && <p className="mt-2 text-xs text-teal">Counts toward the idea ranking.</p>}
          </li>
        ))}
      </ul>
      <h2 className="mt-8 font-serif text-2xl">Profiles</h2>
      <p className="mt-2 text-sm text-ink-soft">{PROFILE_RANKING_NOTE}</p>
      <ul className="mt-3 space-y-3">
        {CRITERION_PROFILES.map((profile) => {
          const applied = applyCriterionProfile(officialCriteria, profile.id)
          return (
            <li key={profile.id} className="rounded-2xl border border-line bg-white/60 p-4">
              <h3 className="font-medium">{profile.label}</h3>
              <p className="mt-1 text-sm">{profile.summary}</p>
              <p className="mt-2 text-xs text-ink-soft">
                {profile.proposal ? "Includes estimated project value." : "Estimated project value is hidden."} Weights:{" "}
                {applied.criteria.map((criterion) => `${criterion.name} ${criterion.weight}`).join(" · ")}
              </p>
            </li>
          )
        })}
      </ul>
      <h2 className="mt-8 font-serif text-2xl">Use a different criteria file</h2>
      <p className="mt-2 text-sm text-ink-soft">Paste JSON for this session only. It is checked before it is used. Clearing it returns you to AIR {officialCriteria.version}.</p>
      <textarea
        className="mt-3 min-h-48 w-full rounded-2xl border border-line bg-white/80 p-3 font-mono text-xs"
        value={draft}
        placeholder="Paste criteria JSON"
        onChange={(event) => setDraft(event.target.value)}
        aria-label="Custom criteria JSON"
      />
      {errors.length > 0 && (
        <ul className="mt-2 list-disc pl-5 text-sm text-bad">
          {errors.map((error) => (
            <li key={error}>{error}</li>
          ))}
        </ul>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          className={btnPrimary}
          onClick={() => {
            try {
              const parsed = parseCriteria(JSON.parse(draft))
              if (!parsed.ok) {
                setErrors(parsed.errors)
                return
              }
              setErrors([])
              air.setSessionCriteria(parsed.criteria)
            } catch {
              setErrors(["That text is not JSON."])
            }
          }}
        >
          Use for this session
        </button>
        <button
          type="button"
          className={btnQuiet}
          onClick={() => {
            air.setSessionCriteria(null)
            setErrors([])
          }}
        >
          Return to AIR {officialCriteria.version}
        </button>
      </div>
    </div>
  )
}

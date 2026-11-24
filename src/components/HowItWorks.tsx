import { Link } from "react-router-dom"
import { mission, reviewKinds, steps } from "../content/guideCopy.ts"
import { FreeKeyGuide } from "./FreeKeyGuide.tsx"
import { scrollToId } from "./ui.tsx"

export function HowItWorks() {
  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-6">
      <section aria-labelledby="review-kinds-heading">
        <h2 id="review-kinds-heading" className="font-serif text-2xl">
          How a review works
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-ink-soft">
          AI reviews and human reviews can sit on the same record. They are not the same kind of score. Calibrated readings can enter the board median. A free web-chat score cannot.
        </p>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {reviewKinds.map((kind) => (
            <li key={kind.id} className="surface px-4 py-3">
              <h3 className="text-sm font-medium">{kind.title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-ink-soft">{kind.body}</p>
            </li>
          ))}
        </ul>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-ink-soft">{mission.possible}</p>
      </section>

      <section aria-labelledby="steps-heading">
        <h2 id="steps-heading" className="font-serif text-2xl">
          Submit, get reviewed, improve
        </h2>
        <ol data-testid="landing-steps" className="mt-4 grid gap-3 lg:grid-cols-3">
          {steps.map((step, index) => (
            <li key={step.id} className="surface px-4 py-4">
              <p className="font-serif text-3xl tabular-nums text-teal">{index + 1}</p>
              <h3 className="mt-1 text-base font-medium">{step.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-soft">{step.body}</p>
            </li>
          ))}
        </ol>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link to="/review" className="inline-flex min-h-10 items-center justify-center rounded-full bg-teal px-4 py-2 text-sm font-medium text-paper">
            Submit a record
          </Link>
          <Link to="/guide" className="inline-flex min-h-10 items-center justify-center rounded-full border border-line px-4 py-2 text-sm">
            Read the guide
          </Link>
          <button type="button" className="inline-flex min-h-10 items-center justify-center rounded-full border border-line px-4 py-2 text-sm" onClick={() => scrollToId("board")}>
            Browse the board
          </button>
        </div>
      </section>

      <details className="surface px-4 py-3">
        <summary className="cursor-pointer text-sm font-medium">Get a free AI key</summary>
        <div className="mt-3">
          <FreeKeyGuide id="how-free-key" />
        </div>
      </details>
    </div>
  )
}

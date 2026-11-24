import { Link } from "react-router-dom"
import { extensionReadmeUrl, extensionSteps, mission, reviewerFaq, rubricInPlainWords, steps, submitterFaq } from "../content/guideCopy.ts"
import { officialCriteria } from "../domain/officialCriteria.ts"
import { ExternalLink, scrollToId } from "../components/ui.tsx"

const onThisPage = [
  { id: "for-submitters", label: "For submitters" },
  { id: "for-reviewers", label: "For reviewers" },
  { id: "rubric", label: "Rubric in plain words" },
  { id: "extension", label: "Browser extension" },
]

export function GuidePage() {
  const rubric = rubricInPlainWords(officialCriteria)
  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <p className="text-sm text-teal">{mission.eyebrow}</p>
      <h1 className="mt-2 font-serif text-4xl leading-tight">How to use AIR</h1>
      <p className="mt-3 text-base leading-relaxed text-ink-soft">{mission.lede}</p>
      <nav aria-label="On this page" className="mt-4 flex flex-wrap gap-2">
        {onThisPage.map((item) => (
          <button key={item.id} type="button" className="rounded-full border border-line px-3 py-1 text-sm" onClick={() => scrollToId(item.id)}>
            {item.label}
          </button>
        ))}
      </nav>

      <section id="for-submitters" tabIndex={-1} aria-labelledby="submitters-heading" className="mt-10 scroll-mt-24">
        <h2 id="submitters-heading" className="font-serif text-2xl">
          For submitters
        </h2>
        <ol className="mt-4 space-y-3">
          {steps.map((step, index) => (
            <li key={step.id} className="surface px-4 py-3">
              <h3 className="text-sm font-medium">
                {index + 1}. {step.title}
              </h3>
              <p className="mt-1 text-sm leading-relaxed text-ink-soft">{step.body}</p>
            </li>
          ))}
        </ol>
        <dl className="mt-4 space-y-4">
          {submitterFaq.map((item) => (
            <div key={item.q}>
              <dt className="text-sm font-medium">{item.q}</dt>
              <dd className="mt-1 text-sm leading-relaxed text-ink-soft">{item.a}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-4 text-sm">
          <Link className="underline" to="/review">
            Open the review page
          </Link>
        </p>
      </section>

      <section id="for-reviewers" tabIndex={-1} aria-labelledby="reviewers-heading" className="mt-10 scroll-mt-24">
        <h2 id="reviewers-heading" className="font-serif text-2xl">
          For reviewers
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">
          Score the public record. Quote it. Say whether a point is possible or proven. A human review and a calibrated AI review are both welcome. They stay labelled, and only the calibrated AI median ranks the row.
        </p>
        <dl className="mt-4 space-y-4">
          {reviewerFaq.map((item) => (
            <div key={item.q}>
              <dt className="text-sm font-medium">{item.q}</dt>
              <dd className="mt-1 text-sm leading-relaxed text-ink-soft">{item.a}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section id="rubric" tabIndex={-1} aria-labelledby="rubric-heading" className="mt-10 scroll-mt-24">
        <h2 id="rubric-heading" className="font-serif text-2xl">
          The rubric in plain words
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">
          AIR version {officialCriteria.version} scores each criterion from 0 to 100. The weights live on the criteria page. This list is the same criteria, in shorter words. It does not change a score.
        </p>
        <ul className="mt-4 space-y-3">
          {rubric.map((item) => (
            <li key={item.id} className="surface px-4 py-3">
              <h3 className="text-sm font-medium">{item.name}</h3>
              <p className="mt-1 text-sm leading-relaxed text-ink-soft">{item.plain}</p>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-sm text-ink-soft">{mission.possible}</p>
        <p className="mt-3 text-sm">
          <Link className="underline" to="/criteria">
            Weights, bands, and principles
          </Link>
        </p>
      </section>

      <section id="extension" tabIndex={-1} aria-labelledby="extension-heading" className="mt-10 scroll-mt-24">
        <h2 id="extension-heading" className="font-serif text-2xl">
          How to use the browser extension
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">
          The extension reviews a paper in a chat you are already signed into. The score is labelled free web-chat, uncalibrated. It is a convenience, not a calibrated reading.
        </p>
        <ol className="mt-4 space-y-3">
          {extensionSteps.map((step, index) => (
            <li key={step.title} className="surface px-4 py-3">
              <h3 className="text-sm font-medium">
                {index + 1}. {step.title}
              </h3>
              <p className="mt-1 text-sm leading-relaxed text-ink-soft">{step.body}</p>
            </li>
          ))}
        </ol>
        <p className="mt-4 text-sm">
          <ExternalLink href={extensionReadmeUrl} className="underline">
            Extension details, chat sites, and what is sent
          </ExternalLink>
        </p>
      </section>
    </div>
  )
}

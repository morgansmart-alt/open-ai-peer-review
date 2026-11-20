const steps = [
  {
    title: "Paste a Zenodo DOI",
    body: "A record link or a DOI such as 10.5281/zenodo.18916931. AIR reads the public metadata and the files you select.",
  },
  {
    title: "Screen free, or review in depth",
    body: "A free quick screening stays off the ranked board. An in-depth reading uses a key you bring and can be published.",
  },
  {
    title: "Opt in to the global board",
    body: "After the four notices, a published reading is stored for everyone. Demo readings and the labelled samples are not.",
  },
  {
    title: "Nodes check the reading",
    body: "An independent node can pass or fail it, or open an issue. A reply can archive a private chat link. Only the written answer and a count are published.",
  },
]

const questions = [
  {
    q: "Is it free?",
    a: "The site is free. An on-device screening is free and unranked. An in-depth review calls the provider you choose, on your own key.",
  },
  {
    q: "Where does my key go?",
    a: "It stays in this browser. It is sent only to the provider you picked, and only when you run a reading. It is not written to the shared board.",
  },
  {
    q: "Are private AI links published?",
    a: "No. A Grok, ChatGPT, Claude, or Gemini share link is archived privately, and you get a receipt secret that AIR does not keep. The public thread shows your written answer and a count. The link and the chat’s wording stay private.",
  },
  {
    q: "How are rankings computed?",
    a: "Each cell is a median on a 0–100 scale. Older 0–10 readings are shown times 10. The order leans toward 50 until there are more readings: n/(n+2) × median + 2/(n+2) × 50. A reading whose scores disagree with its own total, or whose verdict is in the wrong band, is marked Scoring mismatch, needs re-check and left out of that median. If assessors on the same version are more than 30 points apart, the row is marked Assessors disagree. Open issues nudge the order down a little. Custom criteria and free screenings are left out.",
  },
]

export function HowItWorks() {
  return (
    <section aria-labelledby="how-heading" className="mx-auto max-w-6xl px-4 pb-2">
      <h2 id="how-heading" className="font-serif text-xl">
        How it works
      </h2>
      <ol className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {steps.map((step, index) => (
          <li key={step.title} className="rounded-2xl border border-line bg-white/55 px-3 py-3">
            <h3 className="text-sm font-medium">Step {index + 1} · {step.title}</h3>
            <p className="mt-1 text-xs leading-relaxed text-ink-soft">{step.body}</p>
          </li>
        ))}
      </ol>
      <details className="mt-3 rounded-2xl border border-line bg-white/40 px-3 py-2">
        <summary className="cursor-pointer text-sm font-medium">Questions people ask</summary>
        <dl className="mt-3 space-y-3">
          {questions.map((item) => (
            <div key={item.q}>
              <dt className="text-sm font-medium">{item.q}</dt>
              <dd className="mt-1 text-sm text-ink-soft">{item.a}</dd>
            </div>
          ))}
        </dl>
      </details>
    </section>
  )
}

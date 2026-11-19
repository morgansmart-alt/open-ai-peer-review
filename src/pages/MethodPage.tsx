import { Link } from "react-router-dom"
import { publishNotices } from "../content/notices.ts"
import { airCriteriaV02 } from "../domain/officialCriteria.ts"
import { globalGoals } from "../domain/goals.ts"

const sections = [
  {
    title: "What a score is",
    body: "An assessor reads the Zenodo metadata and the files you selected, then scores every AIR criterion from 0 to 10. AIR recomputes the overall score from the published weights. It does not trust a total the model invented. AIR v0.2 is the default for new readings. AIR v0.1 readings stay valid and are labelled. On the board, a v0.1 score is stretched from 1–5 onto 0–10 so the columns share one scale.",
  },
  {
    title: "The leaderboard",
    body: "The number in a cell is the median for that assessor, on a 0–10 scale, or the median of those medians for the panel. Order leans toward 5 until more readings exist: rank score = n/(n+2) × median + 2/(n+2) × 5. You can also sort by impact, feasibility, the physics check, simulation evidence, the quality of the value estimate, global-goals alignment, or the idea score. Those sub-scores sit in the expanded row. The assessor columns stay the centre of the table. Unresolved issues subtract a little (0.08 each, open 0.04, partial 0.03, capped). A disputed record loses another 0.15. Three or more agreeing nodes add 0.10.",
  },
  {
    title: "One reading should not dominate",
    body: "Custom criteria are stored and shown, and left out of every median. Identical resubmits are separate rows only if the output hash differs; the median is what ranks. This browser also refuses more than 12 publishes in ten minutes. The free Supabase schema has no delete policy on readings, so history stays put.",
  },
  {
    title: "Independent nodes",
    body: "Anyone can check a published reading with their own key and submit pass or fail, plus optional per-criterion notes and a small attachment. AIR stores the attachment’s SHA-256 and a short preview, not a secret. One verdict per node per reading. Custom-criteria checks are ignored. Weights use reputation and recency, then cap any one node at 40% so a loud check cannot carry the badge. Disputed means at least three checks and a weighted fail rate of half or more. The badge is an AI-assessment label, not a certification.",
  },
  {
    title: "Reputation",
    body: "Nodes start at 1. Reputation moves only when a reading has at least four official checks and at least 75% of them agree, unweighted. Matching nodes gain 0.08, up to 1.8. Opposing nodes are multiplied by 0.85, down to 0.35. That reputation then weights later badges. It does not stop a crowd of fresh nodes. The README says so plainly.",
  },
  {
    title: "Failure threads",
    body: "A major issue, a failing check, or a physics class of CHALLENGES opens a thread: the claim, a quoted passage, and a reason. CHALLENGES is not an automatic fail. The thread asks the work to show how the clash is addressed. A source check searches the loaded text and optional related Zenodo records and returns ADDRESSED, PARTIALLY ADDRESSED, or NOT ADDRESSED. People can answer. The thread stops at six rounds. Only unresolved, open, and partial threads nudge the rank.",
  },
  {
    title: "Authors",
    body: "If the ORCID you type is already on the Zenodo creator list, responses can be labelled as the author. AIR does not log you in with ORCID, so the label means “this number is on the record,” not “this person proved it.” Otherwise the label is self-declared.",
  },
  {
    title: "Keys",
    body: "Keys live in memory unless you opt into localStorage. They are not a field on a published reading, and the publish path refuses to upload a demo reading to Supabase. Calls go from the browser to the provider.",
  },
]

export function MethodPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="font-serif text-4xl">About this reading</h1>
      <p className="mt-2 text-ink-soft">
        Open Iterative AI Peer Review & Idea Rankings scores public records with the AIR criteria (AI Review), now at version {airCriteriaV02.version}.
        The board is a set of second opinions. It is not a journal, and a high score is not permission to rely on a claim.{" "}
        <Link className="underline" to="/criteria">
          Read the criteria
        </Link>{" "}
        or{" "}
        <Link className="underline" to="/nodes">
          the nodes
        </Link>
        .
      </p>
      <ol className="mt-6 space-y-3">
        {publishNotices.map((notice, index) => (
          <li key={notice.id} className="rounded-2xl border border-line bg-white/70 p-4">
            <h2 className="font-medium">
              {index + 1}. {notice.title}
            </h2>
            <p className="mt-1 text-sm leading-relaxed text-ink-soft">{notice.body}</p>
          </li>
        ))}
      </ol>
      <h2 className="mt-8 font-serif text-2xl">Private AI context</h2>
      <p className="mt-2 text-sm leading-relaxed text-ink-soft">
        A submitter, an author on an issue thread, or an independent node can add https links to earlier AI chats. Those links are sent only to the model that person chose, and only from that browser. The public record shows a count, never the address or the note. The links are not scored and do not move the ranking. A share link can still be opened by anyone who has it, so people should only add a conversation they are willing for that provider to read. If the model cannot open a link, it must say so and must not invent the chat. An issue is addressed only when the publication itself is quoted.
      </p>
      <h2 className="mt-8 font-serif text-2xl">AIR v0.2 weights</h2>
      <ul className="mt-2 space-y-1 text-sm">
        {airCriteriaV02.criteria.map((criterion) => (
          <li key={criterion.id}>
            <span className="font-medium">{criterion.name}</span> · weight {criterion.weight}
          </li>
        ))}
      </ul>
      <p className="mt-3 text-sm text-ink-soft">
        Global goals file {globalGoals.version} lists {globalGoals.goals.length} documented goals, each with a source link. Edit{" "}
        <span className="font-medium">criteria/global-goals.json</span> when those public goals change. AIR v0.1 remains in{" "}
        <span className="font-medium">criteria/air-v0.1.json</span>.
      </p>
      <div className="mt-6 space-y-3">
        {sections.map((section) => (
          <details key={section.title} className="rounded-2xl border border-line bg-white/60 p-4" open={section.title === "The leaderboard"}>
            <summary className="cursor-pointer font-medium">{section.title}</summary>
            <p className="mt-2 text-sm leading-relaxed text-ink-soft">{section.body}</p>
          </details>
        ))}
      </div>
    </div>
  )
}

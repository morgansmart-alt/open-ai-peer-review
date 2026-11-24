import { Link } from "react-router-dom"
import { publishNotices } from "../content/notices.ts"
import { PROFILE_RANKING_NOTE } from "../domain/profiles.ts"
import { airCriteriaV02 } from "../domain/officialCriteria.ts"
import { globalGoals } from "../domain/goals.ts"

const sections = [
  {
    title: "What a score is",
    body: "An assessor reads the Zenodo metadata and the files you selected, then scores every AIR criterion from 0 to 100. AIR recomputes the overall score from the published weights and stores that scale on the reading. It does not trust a total the model invented. Global goals is optional recognition for every paper. That score stays on the card, for example Global goals: 25 (bonus, not counted in overall), and it is left out of the weighted overall and the score bands. The board recomputes that overall when it shows a row. Stored readings are not rewritten. If the model's stated overall is more than 10 points from that weighted total, the reading is marked Scoring mismatch, needs re-check and left out of the median. A verdict in a different band is shown as the band's verdict, with the model's own verdict noted. The bands are accept or encourage from 80, revise from 60, major-revision from 40, otherwise not-ready. AIR v0.2 is the default for new readings. Older readings stay valid. A stored 0–10 score is shown times 10, and an AIR v0.1 score is stretched from 1–5 onto 0–100.",
  },
  {
    title: "Criterion profiles",
    body: PROFILE_RANKING_NOTE,
  },
  {
    title: "The leaderboard",
    body: "The number in a cell is the median for that assessor, on a 0–100 scale, or the median of those medians for the panel. That median leaves out global goals. Readings marked Scoring mismatch, needs re-check are left out, and the row says how many. A verdict that sits in a different band stays in the median. The card shows the band's verdict and notes the model's own verdict. If the remaining assessors on the same DOI and version are more than 30 points apart, the row is marked Assessors disagree. Order leans toward 50 until more readings exist: rank score = n/(n+2) × median + 2/(n+2) × 50. You can also sort by impact, feasibility, the physics check, simulation evidence, the quality of the value estimate, global goals as a bonus, the idea score, or the human review score. Records with no human review sort last on that ranking. Those sub-scores sit in the expanded row. The assessor columns stay the centre of the table. Human reviews sit in their own column and are left out of every AI median. Community replies from Moltbook stay off the median and off the rank score. A count of those replies, when one is shown, is not a score. When a concept has two or more versions, each version keeps its row and the board shows the score history. Unresolved issues subtract a little (0.8 each, open 0.4, partial 0.3, capped at 4). A disputed record loses another 1.5. Three or more agreeing nodes add 1.",
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
    body: "A major issue, a failing check, or a physics class of CHALLENGES opens a thread: the claim, a quoted passage, and a reason. CHALLENGES is not an automatic fail. The thread asks the work to show how the clash is addressed. A source check searches the loaded text of the version being checked and returns ADDRESSED, PARTIALLY ADDRESSED, or NOT ADDRESSED. A re-check against a later version loads that version’s files. People can answer. Discussion on one version stops at six rounds. A re-check on a later version starts a fresh set of rounds. Only unresolved, open, and partial threads nudge the rank. A human review and an author response are labelled, and neither is mixed into an AI median. A private chat link cannot close an issue. A Moltbook reply cannot close an issue either. A human reviewer or a trusted in-depth node can open one as a normal issue, which still needs a quotation from the publication before it can be marked addressed.",
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

function SectionArt({ file, alt, caption }: { file: string; alt: string; caption: string }) {
  return (
    <figure className="mt-6">
      <img
        src={`${import.meta.env.BASE_URL}${file}`}
        alt={alt}
        width={1600}
        height={1200}
        loading="lazy"
        decoding="async"
        className="aspect-[4/3] w-full rounded-2xl border border-line object-cover"
      />
      <figcaption className="mt-2 text-xs text-ink-soft">{caption}</figcaption>
    </figure>
  )
}

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
        . For a short guide, including the browser extension, see{" "}
        <Link className="underline" to="/guide">
          How to use AIR
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
      <SectionArt
        file="air_section_leaderboard.webp"
        alt="Decorative illustration of four ranked cards over a globe. The scores 8.7, 8.1, 7.6 and 7.2 are artwork, not live results."
        caption="Artwork only. The numbers on these cards are not the live leaderboard."
      />
      <h2 className="mt-8 font-serif text-2xl">Private AI context</h2>
      <p className="mt-2 text-sm leading-relaxed text-ink-soft">
        A reply can include one Grok, ChatGPT, Claude, or Gemini share link. AIR archives that link privately and gives the submitter a receipt secret, which AIR does not store. The public thread shows the written answer and a count, never the link, the chat history, or the note. The link is not scored. An issue is addressed only when the publication itself is quoted.
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

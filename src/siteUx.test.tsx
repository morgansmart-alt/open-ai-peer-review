import type { ReactNode } from "react"
import { describe, expect, it } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { MemoryRouter } from "react-router-dom"
import { boardErrorMessage, emptyBoardMessage, filterBoardRows, type BoardQueryRow } from "./browse/boardQuery.ts"
import { kindLabel } from "./components/commentLabel.ts"
import { CommentList } from "./components/CommentList.tsx"
import { HowItWorks } from "./components/HowItWorks.tsx"
import { ScoreCard } from "./components/ScoreCard.tsx"
import { criterionBars, publicDoiUrl, readingLines, reviewerBadge, sharedVerdict } from "./components/scoreCardModel.ts"
import { extensionSteps, mission, reviewKinds, reviewerFaq, rubricInPlainWords, steps, submitterFaq } from "./content/guideCopy.ts"
import { officialCriteria } from "./domain/officialCriteria.ts"
import type { StoredReview } from "./domain/types.ts"
import { GuidePage } from "./pages/GuidePage.tsx"

function html(node: ReactNode): string {
  return renderToStaticMarkup(<MemoryRouter>{node}</MemoryRouter>)
}

function row(partial: Partial<BoardQueryRow>): BoardQueryRow {
  return {
    title: "Fog nets",
    doi: "10.5281/zenodo.1",
    creators: ["A. Okonkwo"],
    keywords: ["water"],
    demo: false,
    sample: false,
    openIssues: 0,
    unresolvedIssues: 0,
    humanCount: 0,
    ...partial,
  }
}

function review(partial: Partial<StoredReview>): StoredReview {
  return {
    id: partial.id ?? "r1",
    sample: false,
    mock: false,
    doi: "10.5281/zenodo.18916931",
    recordId: "18916931",
    conceptRecordId: "18916931",
    recordVersion: "18916931",
    title: "A public note",
    creators: [],
    keywords: [],
    publicationDate: "2026-01-01",
    license: "cc-by-4.0",
    assessorId: "gpt",
    modelId: "gpt-test",
    provider: "openai",
    criteriaId: "air",
    criteriaVersion: "0.2.0",
    customCriteria: false,
    report: {
      summary: "The record names a measurement.",
      scores: [
        {
          criterionId: "impact",
          score: 64,
          rationale: "The text names who would use the water.",
          citations: [],
          evidence: "possible",
        },
      ],
      overallScore: 64,
      ideaScore: 50,
      recommendation: "revise",
      scale: 100,
      strengths: [],
      majorIssues: [],
      minorIssues: [],
      questionsForAuthors: [],
      suggestedNextSteps: [],
    },
    outputHash: "abc",
    createdAt: "2026-02-01T00:00:00.000Z",
    ...partial,
  }
}

describe("guide copy", () => {
  it("states the mission, the three steps, and the two review kinds without hype", () => {
    expect(mission.lede).toMatch(/does not replace journal peer review/i)
    expect(steps.map((step) => step.title)).toEqual(["Submit", "Get reviewed", "Improve"])
    expect(reviewKinds.map((kind) => kind.title)).toContain("Human review")
    expect(reviewKinds.map((kind) => kind.title)).toContain("Free web-chat, uncalibrated")
    expect(mission.possible).toMatch(/Possible is not proven/)
    const blob = JSON.stringify({ mission, steps, reviewKinds, submitterFaq, reviewerFaq, extensionSteps })
    expect(blob).not.toMatch(/revolution|magic|guarantee|testimonial|world-changing|cutting-edge/i)
  })

  it("explains every official criterion in plain words", () => {
    const plain = rubricInPlainWords(officialCriteria)
    expect(plain.map((item) => item.id)).toEqual(officialCriteria.criteria.map((item) => item.id))
    for (const item of plain) {
      const official = officialCriteria.criteria.find((criterion) => criterion.id === item.id)
      expect(item.plain.length).toBeGreaterThan(40)
      expect(item.plain).not.toBe(official?.description)
    }
  })
})

describe("board query", () => {
  const rows = [
    row({ title: "Fog nets", creators: ["A. Okonkwo"], keywords: ["water"], openIssues: 1 }),
    row({ title: "Unit notebook", doi: "10.5281/zenodo.2", creators: ["R. Ibarra"], keywords: ["software"], humanCount: 2 }),
    row({ title: "Sample wire", doi: "10.5281/zenodo.sample.wire", creators: ["Unattributed"], sample: true, demo: true }),
  ]

  it("searches title, DOI, and author and applies a slice", () => {
    expect(filterBoardRows(rows, "okonkwo", "all", false)).toHaveLength(1)
    expect(filterBoardRows(rows, "", "open-issues", false).map((item) => item.title)).toEqual(["Fog nets"])
    expect(filterBoardRows(rows, "", "human", false)).toHaveLength(1)
    expect(filterBoardRows(rows, "", "samples", true)).toHaveLength(0)
    expect(filterBoardRows(rows, "10.5281/zenodo.2", "all", false)).toHaveLength(1)
  })

  it("writes an empty state and hides secrets in a board error", () => {
    expect(emptyBoardMessage("plasma", "all", false)).toMatch(/plasma/)
    expect(emptyBoardMessage("", "samples", true)).toMatch(/Untick/)
    expect(boardErrorMessage("Failed to fetch")).toMatch(/showing the copy in this browser/)
    expect(boardErrorMessage("Failed to fetch")).toMatch(/Failed to fetch/)
    expect(boardErrorMessage("refused eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.secret")).not.toMatch(/eyJ/)
  })
})

describe("score card model", () => {
  it("badges calibrated, human, demo, and uncalibrated web-chat readings apart", () => {
    expect(reviewerBadge(review({}))).toBe("Calibrated AI")
    expect(reviewerBadge(review({ origin: "human", assessorId: "human" }))).toBe("Human review")
    expect(reviewerBadge(review({ mock: true }))).toBe("Demo")
    expect(reviewerBadge(review({ tier: "free-screening" }))).toBe("Free screening")
    expect(reviewerBadge(review({ tier: "uncalibrated web-chat", source: "web-chat extension" }))).toBe("free web-chat, uncalibrated")
    expect(publicDoiUrl("10.5281/zenodo.18916931")).toBe("https://doi.org/10.5281/zenodo.18916931")
    expect(publicDoiUrl("10.5281/zenodo.sample.fog")).toBeNull()
  })

  it("keeps web-chat scores out of the criterion bar and names a shared verdict", () => {
    const calibrated = review({ id: "ai" })
    const chat = review({ id: "chat", assessorId: "grok", tier: "uncalibrated web-chat", source: "web-chat extension" })
    const bars = criterionBars([calibrated, chat], officialCriteria, { gpt: "GPT", grok: "Grok" })
    const impact = bars.find((bar) => bar.id === "impact")
    expect(impact?.marks.map((mark) => mark.name)).toEqual(["GPT"])
    const lines = readingLines([calibrated, chat], officialCriteria, { gpt: "GPT", grok: "Grok" })
    expect(lines.map((line) => line.badge)).toEqual(["Calibrated AI", "free web-chat, uncalibrated"])
    expect(sharedVerdict(lines)?.label).toBe("Promising, needs revision")
    const other = review({ id: "other", report: { ...calibrated.report, recommendation: "not-ready" } })
    expect(sharedVerdict(readingLines([calibrated, other], officialCriteria, { gpt: "GPT" }))?.mixed).toBe(true)
  })
})

describe("landing, guide, comments, and score card", () => {
  it("renders the three-step landing and the review-kind labels", () => {
    const markup = html(<HowItWorks />)
    expect(markup).toContain("Submit, get reviewed, improve")
    expect(markup).toContain("Calibrated AI review")
    expect(markup).toContain("free web-chat, uncalibrated")
    expect(markup).toContain("Possible is not proven")
    expect(markup).toContain('data-testid="landing-steps"')
  })

  it("renders the guide for submitters, reviewers, the rubric, and the extension", () => {
    const markup = html(<GuidePage />)
    expect(markup).toContain("For submitters")
    expect(markup).toContain("For reviewers")
    expect(markup).toContain("The rubric in plain words")
    expect(markup).toContain("How to use the browser extension")
    expect(markup).toContain("Limitations")
    expect(markup).toContain("Load it unpacked")
    expect(markup).not.toContain("testimonial")
  })

  it("renders a comment with its role and a score card with links, a verdict, and a version", () => {
    const comments = html(
      <CommentList
        comments={[
          {
            id: "c1",
            kindLabel: "Comment",
            author: "Reader",
            role: "Human reviewer",
            body: "The weighing protocol is in the supplement.",
            when: "1 Feb 2026",
            quotes: ["Net B collected 1.8 litres"],
          },
        ]}
      />,
    )
    expect(kindLabel("rebuttal")).toBe("Response")
    expect(kindLabel("comment")).toBe("Comment")
    expect(comments).toContain("The weighing protocol is in the supplement.")
    expect(comments).toContain("Human reviewer")
    expect(comments).toContain("Net B collected 1.8 litres")

    const card = html(
      <ScoreCard
        doi="10.5281/zenodo.18916931"
        zenodoUrl="https://zenodo.org/records/18916931"
        criteria={officialCriteria}
        reviews={[review({})]}
        names={{ gpt: "GPT" }}
        panelMedian={64}
        humanMedian={null}
        lineage={[
          {
            recordId: "18916931",
            doi: "10.5281/zenodo.18916931",
            recordVersion: "18916931",
            publicationDate: "2026-01-01",
            panelMedian: 64,
            ideaMedian: 50,
            open: 0,
            partial: 0,
            fixed: 0,
            place: "latest",
          },
        ]}
        comments={[
          {
            id: "c1",
            kindLabel: "Comment",
            author: "Reader",
            role: "Reader",
            body: "Please quote the methods.",
            when: "1 Feb 2026",
          },
        ]}
      />,
    )
    expect(card).toContain('data-testid="score-card"')
    expect(card).toContain("64")
    expect(card).toContain("calibrated median / 100")
    expect(card).toContain("Promising, needs revision")
    expect(card).toContain("https://zenodo.org/records/18916931")
    expect(card).toContain("https://doi.org/10.5281/zenodo.18916931")
    expect(card).toContain("Impact")
    expect(card).toContain("possible")
    expect(card).toContain("Please quote the methods.")
    expect(card).toContain("Latest")
    expect(card).toContain("Possible is not proven.")
  })
})

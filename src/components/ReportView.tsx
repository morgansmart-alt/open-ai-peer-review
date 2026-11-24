import type { ReactNode } from "react"
import { GoalsHeatmap, PhysicsGauge, QuadrantChart, RadarChart, RangeBars } from "./charts.tsx"
import { publicContextCount } from "../domain/conversationLinks.ts"
import { categoryLabel, impactFeasibilityQuadrant } from "../domain/criteria.ts"
import { scoringMismatch, storedScale, toBoard } from "../domain/scoring.ts"
import { globalGoals } from "../domain/goals.ts"
import { DISCLAIMER, type CriteriaSet, type ReviewReport, type StoredReview } from "../domain/types.ts"
import { downloadText, reportToMarkdown } from "../services/markdown.ts"
import { btnQuiet } from "./ui.tsx"
import { formatWhen } from "./ui.tsx"

export function ReportView({
  report,
  criteria,
  meta,
}: {
  report: ReviewReport
  criteria: CriteriaSet
  meta: {
    assessorName: string
    modelId: string
    provider: string
    doi: string
    recordVersion: string
    createdAt: string
    criteriaVersion: string
    customCriteria: boolean
    mock: boolean
    outputHash?: string
    stored?: StoredReview
  }
}) {
  const exportReview: StoredReview =
    meta.stored ??
    ({
      id: "session",
      sample: false,
      mock: meta.mock,
      doi: meta.doi,
      recordId: "",
      conceptRecordId: "",
      recordVersion: meta.recordVersion,
      title: meta.doi,
      creators: [],
      keywords: [],
      publicationDate: "",
      license: "",
      assessorId: meta.assessorName,
      modelId: meta.modelId,
      provider: meta.provider as StoredReview["provider"],
      criteriaId: criteria.id,
      criteriaVersion: meta.criteriaVersion,
      customCriteria: meta.customCriteria,
      report,
      outputHash: meta.outputHash ?? "",
      createdAt: meta.createdAt,
    } satisfies StoredReview)
  const scale = storedScale(report, meta.criteriaVersion)
  const shown = (score: number) => toBoard(score, scale)
  const check = scoringMismatch(exportReview)

  return (
    <article data-testid="report-card" className="rounded-3xl border border-line bg-white/70 p-4 sm:p-6">
      <header>
        <p className="text-xs uppercase tracking-wide text-teal">{meta.assessorName}</p>
        <h3 className="mt-1 font-serif text-2xl">{categoryLabel(criteria, report.recommendation)}</h3>
        <p className="mt-2 text-sm text-ink-soft">
          Overall {shown(report.overallScore).toFixed(0)} / 100 · Idea {shown(report.ideaScore).toFixed(0)} / 100
          {criteria.version.startsWith("0.1") ? " · AIR v0.1" : ""}
        </p>
        {report.reading && (
          <p className="mt-1 text-sm text-ink">
            {report.reading.pagesRead} / {report.reading.pagesTotal} pages · coverage {report.reading.coverage}
            {report.reading.chunksSummarised > 0 ? ` · ${report.reading.chunksSummarised} sections summarised` : " · full text sent"}
          </p>
        )}
        {report.unverifiedQuotes ? <p className="mt-1 text-xs text-ink-soft">{report.unverifiedQuotes} unverified quote{report.unverifiedQuotes === 1 ? "" : "s"}</p> : null}
        {check.mismatch && (
          <p className="mt-2 text-sm text-bad">
            Scoring mismatch, needs re-check. {check.reason}
          </p>
        )}
        <dl className="mt-3 grid gap-1 text-xs text-ink-soft sm:grid-cols-2">
          <div>Model: {meta.modelId}</div>
          <div>Provider: {meta.provider}</div>
          <div>Criteria: {meta.criteriaVersion}{meta.customCriteria ? " · custom, unranked" : ""}</div>
          <div>DOI: {meta.doi}</div>
          <div>Record version: {meta.recordVersion}</div>
          <div>Generated: {formatWhen(meta.createdAt)}</div>
          {meta.outputHash && <div className="sm:col-span-2 break-all">Output hash: {meta.outputHash}</div>}
        </dl>
        {publicContextCount(meta.stored?.privateContextCount) && (
          <p className="mt-3 text-sm">{publicContextCount(meta.stored?.privateContextCount)}. The addresses stay in the browser that sent them and are not part of this report.</p>
        )}
        {meta.stored?.origin === "human" && (
          <p className="mt-3 text-sm">Human review. This score is not part of the AI panel median. Possible is not proven.</p>
        )}
        {meta.stored?.tier === "free-screening" && (
          <p className="mt-3 text-sm text-gold">Free quick review: a smaller model, lower fidelity, screening only. It is not ranked and cannot verify the work.</p>
        )}
        {meta.mock && <p className="mt-3 text-sm text-gold">Demo reading. No model was called. The notes are a local stand-in so the report can be tried.</p>}
        <p className="mt-3 text-sm">{DISCLAIMER}</p>
      </header>
      <div className="no-print mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          className={btnQuiet}
          onClick={() => downloadText(`${meta.assessorName}-air.md`, reportToMarkdown(exportReview, criteria, meta.assessorName), "text/markdown")}
        >
          Download Markdown
        </button>
        <button
          type="button"
          className={btnQuiet}
          onClick={() => downloadText(`${meta.assessorName}-air.json`, JSON.stringify(exportReview, null, 2), "application/json")}
        >
          Download JSON
        </button>
        <button type="button" className={btnQuiet} onClick={() => window.print()}>
          Print / save PDF
        </button>
      </div>
      <Matrices report={report} criteria={criteria} scale={scale} />
      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <RadarChart scores={report.scores.slice(0, 8).map((score) => ({ label: criteria.criteria.find((item) => item.id === score.criterionId)?.name ?? score.criterionId, score: shown(score.score), max: 100 }))} />
        {report.physics && <PhysicsGauge classification={report.physics.classification} />}
        {report.goals && <GoalsHeatmap goals={report.goals} />}
        {report.valueEstimate && <RangeBars low={report.valueEstimate.overallBenefit.low} central={report.valueEstimate.overallBenefit.central} high={report.valueEstimate.overallBenefit.high} />}
      </div>
      <Section title="Summary" open>
        <p>{report.summary}</p>
      </Section>
      <Section title="Scores" open>
        <ul className="space-y-3">
          {report.scores.map((score) => {
            const criterion = criteria.criteria.find((item) => item.id === score.criterionId)
            return (
              <li key={score.criterionId} className="rounded-2xl border border-line/80 p-3">
                <div className="flex items-baseline justify-between gap-3">
                  <h4 className="font-medium">{criterion?.name ?? score.criterionId}</h4>
                  <span className="tabular-nums">
                    {shown(score.score).toFixed(0)}/100
                    {score.confidence ? ` · ${score.confidence}` : ""}
                    {score.evidence === "proven" ? " · Proven" : score.evidence === "possible" ? " · Possible" : ""}
                  </span>
                </div>
                <p className="mt-1 text-sm text-ink-soft">{score.rationale}</p>
                {score.citations.map((citation, index) => (
                  <blockquote key={index} className="mt-2 border-l-2 border-teal/40 pl-3 text-sm">
                    {citation.quote}
                    <footer className="mt-1 text-xs text-ink-soft">
                      {citation.location}
                      {citation.quoteVerified === false ? " · unverified" : ""}
                    </footer>
                  </blockquote>
                ))}
              </li>
            )
          })}
        </ul>
      </Section>
      <Section title="Strengths" open>
        <Bullet items={report.strengths} empty="None recorded." />
      </Section>
      <Section title="Major issues">
        {report.majorIssues.length === 0 ? (
          <p className="text-sm text-ink-soft">None recorded.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {report.majorIssues.map((issue, index) => (
              <li key={index}>
                <span className="font-medium">{issue.claim}</span>
                {issue.quotedPassage && (
                  <blockquote className="mt-1 border-l-2 border-line pl-3">
                    {issue.quotedPassage}
                    {issue.quoteVerified === false ? <span className="mt-1 block text-xs text-ink-soft">unverified</span> : null}
                  </blockquote>
                )}
                <p className="text-ink-soft">{issue.reason}</p>
              </li>
            ))}
          </ul>
        )}
      </Section>
      <Section title="Minor issues">
        <Bullet items={report.minorIssues} empty="None recorded." />
      </Section>
      <Section title="Questions for the authors">
        <Bullet items={report.questionsForAuthors} empty="None recorded." />
      </Section>
      <Section title="Suggested next steps">
        <Bullet items={report.suggestedNextSteps} empty="None recorded." />
      </Section>
    </article>
  )
}

function Matrices({ report, criteria, scale }: { report: ReviewReport; criteria: CriteriaSet; scale: number }) {
  if (criteria.reportSchema !== "0.2" && !report.physics && !report.goals) return null
  const impactRaw = report.scores.find((score) => score.criterionId === "impact")?.score
  const feasibilityRaw = report.scores.find((score) => score.criterionId === "feasibility")?.score
  const impact = impactRaw === undefined ? undefined : toBoard(impactRaw, scale)
  const feasibility = feasibilityRaw === undefined ? undefined : toBoard(feasibilityRaw, scale)
  const quadrant = impact !== undefined && feasibility !== undefined ? impactFeasibilityQuadrant(impact, feasibility) : null
  return (
    <div className="mt-4 grid gap-3 lg:grid-cols-2">
      {quadrant && (
        <section className="rounded-2xl border border-line p-3">
          <h3 className="text-sm font-medium">Impact × feasibility</h3>
          <p className="mt-1 text-sm">
            Impact {impact} · Feasibility {feasibility}
          </p>
          <QuadrantChart impact={impact ?? 0} feasibility={feasibility ?? 0} />
          <p className="mt-1 text-sm font-medium text-teal-deep">{quadrant.label}</p>
          <p className="text-sm text-ink-soft">{quadrant.meaning}</p>
        </section>
      )}
      {report.physics && (
        <section className="rounded-2xl border border-line p-3">
          <h3 className="text-sm font-medium">Physics check · {report.physics.classification}</h3>
          <p className="mt-1 text-sm">Laws: {report.physics.laws.join(", ") || "none named"}</p>
          <p className="mt-1 text-sm text-ink-soft">{report.physics.howAddressed}</p>
          {report.ontologyClass && <p className="mt-1 text-xs text-ink-soft">Class: {report.ontologyClass}</p>}
          {report.physics.classification === "CHALLENGES" && (
            <p className="mt-2 text-xs">A challenge is not an automatic fail. It opens an issue so the account can be checked.</p>
          )}
        </section>
      )}
      {report.goals && report.goals.length > 0 && (
        <section className="rounded-2xl border border-line p-3 lg:col-span-2">
          <h3 className="text-sm font-medium">Global goals matrix</h3>
          <p className="mt-1 text-xs text-ink-soft">Levels come from the reading. Sources live in the goals file, version {globalGoals.version}.</p>
          <ul className="mt-2 grid gap-1 sm:grid-cols-2">
            {report.goals.map((row) => {
              const goal = globalGoals.goals.find((item) => item.id === row.goalId)
              return (
                <li key={row.goalId} className="text-sm">
                  <span className="font-medium">{goal?.name ?? row.goalId}</span>
                  <span className="text-ink-soft"> · {row.level}</span>
                </li>
              )
            })}
          </ul>
        </section>
      )}
      {report.valueEstimate && (
        <section className="rounded-2xl border border-line p-3 lg:col-span-2">
          <h3 className="text-sm font-medium">Estimated project value · confidence {report.valueEstimate.confidence}</h3>
          <p className="mt-1 text-sm">{report.valueEstimate.disclaimer}</p>
          <p className="mt-1 text-sm text-ink-soft">{report.valueEstimate.marketDisruption}</p>
          <p className="mt-1 text-xs text-ink-soft">
            Overall benefit {report.valueEstimate.overallBenefit.low} / {report.valueEstimate.overallBenefit.central} /{" "}
            {report.valueEstimate.overallBenefit.high} ({report.valueEstimate.overallBenefit.unit})
          </p>
        </section>
      )}
      {report.simulation && (
        <section className="rounded-2xl border border-line p-3 lg:col-span-2">
          <h3 className="text-sm font-medium">Simulation evidence</h3>
          <p className="mt-1 text-sm text-ink-soft">
            Reported {report.simulation.reported ?? "not stated"} · passed {report.simulation.passed ?? "not stated"} · inputs{" "}
            {report.simulation.inputsAvailable ? "available" : "not shown"}. {report.simulation.methods}
          </p>
        </section>
      )}
    </div>
  )
}

function Section({ title, open = false, children }: { title: string; open?: boolean; children: ReactNode }) {
  return (
    <details open={open} className="mt-4 border-t border-line pt-3">
      <summary className="cursor-pointer font-medium">{title}</summary>
      <div className="mt-2 text-sm leading-relaxed">{children}</div>
    </details>
  )
}

function Bullet({ items, empty }: { items: string[]; empty: string }) {
  if (items.length === 0) return <p className="text-sm text-ink-soft">{empty}</p>
  return (
    <ul className="list-disc space-y-1 pl-5">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  )
}

import type { GoalAlignment } from "../domain/types.ts"
import { globalGoals } from "../domain/goals.ts"

export function RadarChart({ scores }: { scores: { label: string; score: number; max: number }[] }) {
  const size = 220
  const cx = size / 2
  const cy = size / 2
  const radius = 78
  const points = scores.map((item, index) => {
    const angle = -Math.PI / 2 + (index / scores.length) * Math.PI * 2
    const ratio = item.max === 0 ? 0 : item.score / item.max
    return [cx + Math.cos(angle) * radius * ratio, cy + Math.sin(angle) * radius * ratio]
  })
  const grid = [0.25, 0.5, 0.75, 1].map((ring) =>
    scores
      .map((_, index) => {
        const angle = -Math.PI / 2 + (index / scores.length) * Math.PI * 2
        return `${cx + Math.cos(angle) * radius * ring},${cy + Math.sin(angle) * radius * ring}`
      })
      .join(" "),
  )
  return (
    <svg viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Criteria radar" className="h-56 w-full">
      {grid.map((poly) => (
        <polygon key={poly} points={poly} fill="none" stroke="currentColor" className="text-line" />
      ))}
      <polygon points={points.map((point) => point.join(",")).join(" ")} className="fill-teal/30 stroke-teal" strokeWidth="2" />
      {scores.map((item, index) => {
        const angle = -Math.PI / 2 + (index / scores.length) * Math.PI * 2
        return (
          <text key={item.label} x={cx + Math.cos(angle) * (radius + 18)} y={cy + Math.sin(angle) * (radius + 18)} textAnchor="middle" className="fill-ink-soft text-[8px]">
            {item.label.slice(0, 10)}
          </text>
        )
      })}
    </svg>
  )
}

export function QuadrantChart({ impact, feasibility }: { impact: number; feasibility: number }) {
  return (
    <svg viewBox="0 0 200 160" role="img" aria-label="Impact versus feasibility" className="h-40 w-full">
      <rect x="20" y="10" width="80" height="60" className="fill-gold/20" />
      <rect x="100" y="10" width="80" height="60" className="fill-teal/25" />
      <rect x="20" y="70" width="80" height="60" className="fill-bad/15" />
      <rect x="100" y="70" width="80" height="60" className="fill-paper-deep" />
      <circle cx={20 + (feasibility / 10) * 160} cy={130 - (impact / 10) * 120} r="5" className="fill-ink" />
      <text x="100" y="154" textAnchor="middle" className="fill-ink-soft text-[9px]">
        Feasibility →
      </text>
    </svg>
  )
}

export function GoalsHeatmap({ goals }: { goals: GoalAlignment[] }) {
  const level: Record<string, number> = { none: 0, indirect: 1, partial: 2, direct: 3 }
  return (
    <div className="grid grid-cols-2 gap-1 sm:grid-cols-3" role="img" aria-label="Goals alignment">
      {goals.map((goal) => {
        const name = globalGoals.goals.find((item) => item.id === goal.goalId)?.name ?? goal.goalId
        const tone = ["bg-paper-deep", "bg-gold/20", "bg-teal/20", "bg-teal/50"][level[goal.level] ?? 0]
        return (
          <div key={goal.goalId} className={`rounded-lg px-2 py-1 text-[11px] ${tone}`}>
            {name}
            <span className="mt-0.5 block text-ink-soft">{goal.level}</span>
          </div>
        )
      })}
    </div>
  )
}

export function PhysicsGauge({ classification }: { classification: string }) {
  const position = classification === "CONSISTENT" ? 18 : classification === "EXTENDS" ? 50 : 82
  return (
    <svg viewBox="0 0 200 70" role="img" aria-label={`Physics check ${classification}`} className="h-16 w-full">
      <rect x="10" y="28" width="180" height="10" rx="5" className="fill-paper-deep" />
      <circle cx={position * 1.8 + 10} cy="33" r="8" className="fill-teal" />
      <text x="20" y="58" className="fill-ink-soft text-[9px]">Consistent</text>
      <text x="82" y="58" className="fill-ink-soft text-[9px]">Extends</text>
      <text x="145" y="58" className="fill-ink-soft text-[9px]">Challenges</text>
    </svg>
  )
}

export function RangeBars({ low, central, high }: { low: string; central: string; high: string }) {
  return (
    <ul className="space-y-1 text-xs" aria-label="Value ranges">
      {[
        ["Low", low],
        ["Central", central],
        ["High", high],
      ].map(([label, value]) => (
        <li key={label} className="grid grid-cols-[4rem_1fr] items-center gap-2">
          <span>{label}</span>
          <span className="truncate rounded-full bg-teal/15 px-2 py-1">{value}</span>
        </li>
      ))}
    </ul>
  )
}

export function LineChart({ values }: { values: number[] }) {
  if (values.length === 0) return <p className="text-xs text-ink-soft">No checks yet.</p>
  const width = 180
  const height = 56
  const max = Math.max(1, ...values)
  const step = values.length === 1 ? 0 : width / (values.length - 1)
  const points = values.map((value, index) => `${index * step},${height - (value / max) * (height - 8) - 4}`).join(" ")
  return (
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Fidelity over checks" className="h-16 w-full">
      <polyline points={points} fill="none" className="stroke-teal" strokeWidth="2" />
    </svg>
  )
}

export function Sparkline({ values }: { values: number[] }) {
  const width = 72
  const height = 24
  if (values.length === 0) return null
  const step = values.length === 1 ? 0 : width / (values.length - 1)
  const points = values.map((value, index) => `${index * step},${height - (Math.min(10, Math.max(0, value)) / 10) * (height - 4) - 2}`).join(" ")
  return (
    <svg viewBox={`0 0 ${width} ${height}`} aria-hidden="true" className="inline-block h-6 w-16">
      <polyline points={points} fill="none" className="stroke-teal" strokeWidth="2" />
    </svg>
  )
}

export function AssessorMark({ name }: { name: string }) {
  const initials = name
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()
  return (
    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-teal text-[10px] font-semibold text-paper" aria-hidden="true">
      {initials}
    </span>
  )
}

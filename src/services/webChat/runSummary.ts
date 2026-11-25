export function defenceRoundCounts(transcript: { round: number; kind: string }[] | undefined): { completed: number; requested: number } {
  const turns = transcript ?? []
  const completed = turns.filter((turn) => turn.kind === "reply").length
  const requested = turns.reduce((max, turn) => Math.max(max, turn.round || 0), 0)
  return { completed, requested }
}

export function defenceRoundsLabel(transcript: { round: number; kind: string }[] | undefined): string {
  const rounds = defenceRoundCounts(transcript)
  if (rounds.requested <= 0) return ""
  return `Defence rounds ${rounds.completed}/${rounds.requested}`
}

function summaryScore(value: number): string {
  return value.toFixed(2)
}

export function runSummary(input: { completed: number; requested: number; blind: number; after: number | null }): string {
  if (input.requested <= 0) {
    return input.after == null ? "Done. The blind score is below." : "Done. The blind score and the score after author defence are below."
  }
  const after = input.after == null ? "after defence not read" : `after defence ${summaryScore(input.after)}`
  return `Rounds ${input.completed}/${input.requested} · blind ${summaryScore(input.blind)} · ${after}`
}

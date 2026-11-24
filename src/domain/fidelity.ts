import { clamp, round2 } from "./criteria.ts"
import { isCommunityAiRecord } from "./moltbook.ts"
import { isUncalibratedWebChat } from "../services/webChat/protocol.ts"
import type { NodeSubmission, StoredReview } from "./types.ts"

export interface FidelitySummary {
  nodes: number
  passRate: number | null
  distinctModels: number
  confidence: number
  disputed: boolean
  verifiedBoost: boolean
  label: string
}

export function eligibleNodes(nodes: NodeSubmission[], reviewId?: string): NodeSubmission[] {
  const filtered = nodes.filter(
    (node) => node.trusted !== false && !node.customCriteria && (!reviewId || node.reviewId === reviewId),
  )
  const latest = new Map<string, NodeSubmission>()
  for (const node of filtered) {
    const key = `${node.reviewId}::${node.nodeId}`
    const previous = latest.get(key)
    if (!previous || previous.createdAt < node.createdAt) latest.set(key, node)
  }
  return [...latest.values()]
}

/** Unweighted consensus used only to update reputation. Requires a clear majority. */
export function consensusOf(nodes: NodeSubmission[]): "pass" | "fail" | null {
  if (nodes.length < 4) return null
  const passes = nodes.filter((node) => node.verdict === "pass").length
  const rate = passes / nodes.length
  if (rate >= 0.75) return "pass"
  if (rate <= 0.25) return "fail"
  return null
}

export function computeReputations(nodes: NodeSubmission[]): Map<string, number> {
  const scores = new Map<string, number>()
  const ordered = eligibleNodes(nodes).sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
  const byReview = new Map<string, NodeSubmission[]>()
  for (const node of ordered) {
    const list = byReview.get(node.reviewId) ?? []
    list.push(node)
    byReview.set(node.reviewId, list)
  }
  const reviewIds = [...byReview.keys()].sort()
  for (const reviewId of reviewIds) {
    const group = byReview.get(reviewId) ?? []
    const consensus = consensusOf(group)
    if (!consensus) continue
    for (const node of group) {
      const current = scores.get(node.nodeId) ?? 1
      const next = node.verdict === consensus ? Math.min(1.8, current + 0.08) : Math.max(0.35, current * 0.85)
      scores.set(node.nodeId, round2(next))
    }
  }
  return scores
}

export function reputationOf(nodeId: string, reputations: Map<string, number>): number {
  return clamp(reputations.get(nodeId) ?? 1, 0.35, 1.8)
}

function recencyOf(iso: string, now: number): number {
  const parsed = Date.parse(iso)
  const ageDays = Number.isNaN(parsed) ? 0 : Math.max(0, (now - parsed) / 86_400_000)
  return 0.55 + 0.45 * Math.exp(-ageDays / 180)
}

/** Pull any single node down to at most 40% of the weight, iteratively. */
export function capWeights(weights: number[]): number[] {
  const next = weights.slice()
  for (let pass = 0; pass < 12; pass += 1) {
    const sum = next.reduce((total, value) => total + value, 0)
    if (sum <= 0) return next
    const cap = sum * 0.4
    let changed = false
    for (let index = 0; index < next.length; index += 1) {
      if (next[index] > cap + 1e-9) {
        next[index] = cap
        changed = true
      }
    }
    if (!changed) break
  }
  return next
}

export function fidelityFor(nodes: NodeSubmission[], reputations: Map<string, number>, now = Date.now()): FidelitySummary {
  const eligible = eligibleNodes(nodes)
  if (eligible.length === 0) {
    return {
      nodes: 0,
      passRate: null,
      distinctModels: 0,
      confidence: 0,
      disputed: false,
      verifiedBoost: false,
      label: "No independent checks yet",
    }
  }
  const raw = eligible.map((node) => reputationOf(node.nodeId, reputations) * recencyOf(node.createdAt, now))
  const weights = capWeights(raw)
  const weightTotal = weights.reduce((total, value) => total + value, 0)
  const passWeight = weights.reduce((total, value, index) => total + (eligible[index]?.verdict === "pass" ? value : 0), 0)
  const passRate = weightTotal > 0 ? passWeight / weightTotal : 0
  const distinctModels = new Set(eligible.map((node) => node.assessorId)).size
  const dominance = Math.max(passRate, 1 - passRate)
  const sample = 1 - Math.exp(-eligible.length / 3)
  const modelFactor = Math.min(distinctModels, 4) / 4
  const confidence = clamp(sample * (0.65 * dominance + 0.35 * modelFactor), 0, 1)
  const disputed = eligible.length >= 3 && 1 - passRate >= 0.5
  const verifiedBoost = !disputed && eligible.length >= 3 && passRate >= 0.7
  const percent = Math.round(passRate * 100)
  const noun = eligible.length === 1 ? "node" : "nodes"
  const label = disputed
    ? `Disputed · ${eligible.length} independent ${noun}, ${percent}% pass`
    : `Verified by ${eligible.length} independent ${noun}, ${percent}% pass`
  return {
    nodes: eligible.length,
    passRate: round2(passRate),
    distinctModels,
    confidence: round2(confidence),
    disputed,
    verifiedBoost,
    label,
  }
}

export type LadderTier = "free-screening" | "free-web-chat" | "in-depth" | "corroborated"

/** Two distinct trusted model ids must pass before a record is called corroborated. */
export const CORROBORATING_MODEL_COUNT = 2

export function ladderTier(reviews: StoredReview[], nodes: NodeSubmission[]): LadderTier {
  const offBoard = new Set(reviews.filter((review) => isCommunityAiRecord(review) || isUncalibratedWebChat(review)).map((review) => review.id))
  const distinct = new Set(
    nodes
      .filter((node) => node.trusted === true && node.verdict === "pass" && !offBoard.has(node.reviewId))
      .map((node) => node.modelId),
  )
  if (distinct.size >= CORROBORATING_MODEL_COUNT) return "corroborated"
  if (reviews.some((review) => !isCommunityAiRecord(review) && !isUncalibratedWebChat(review) && review.tier !== "free-screening")) return "in-depth"
  if (reviews.some((review) => isUncalibratedWebChat(review))) return "free-web-chat"
  return "free-screening"
}

export function nodesForReviews(all: NodeSubmission[], reviews: StoredReview[]): NodeSubmission[] {
  const ids = new Set(reviews.filter((review) => !review.customCriteria && !isCommunityAiRecord(review) && !isUncalibratedWebChat(review)).map((review) => review.id))
  return eligibleNodes(all.filter((node) => ids.has(node.reviewId)))
}

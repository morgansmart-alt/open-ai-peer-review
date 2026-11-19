import { emptyDatabase, type AirDatabase } from "../domain/types.ts"

export function mergeDatabases(base: AirDatabase, overlay: AirDatabase): AirDatabase {
  const reviews = new Map(base.reviews.map((review) => [review.id, review]))
  for (const review of overlay.reviews) reviews.set(review.id, review)
  const issues = new Map(base.issues.map((issue) => [issue.id, issue]))
  for (const issue of overlay.issues) issues.set(issue.id, issue)
  const nodes = [...base.nodes]
  const seenNodes = new Set(nodes.map((node) => node.id))
  for (const node of overlay.nodes) {
    if (!seenNodes.has(node.id)) nodes.push(node)
  }
  const claims = new Map(base.claims.map((claim) => [claim.doi, claim]))
  for (const claim of overlay.claims) claims.set(claim.doi, claim)
  return {
    reviews: [...reviews.values()],
    nodes,
    issues: [...issues.values()],
    claims: [...claims.values()],
  }
}

export function blankDatabase(): AirDatabase {
  return emptyDatabase()
}

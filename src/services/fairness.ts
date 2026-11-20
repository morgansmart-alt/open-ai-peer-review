import type { StoredReview } from "../domain/types.ts"

export function familyOf(
  review: Pick<StoredReview, "provider"> & { tier?: StoredReview["tier"]; report?: { router?: { family?: string }; provenance?: { source?: string } } },
): string {
  if (review.tier === "local-screening" || review.report?.provenance?.source === "local-nano") return ""
  return review.report?.router?.family || review.provider
}

type FamilyReview = Parameters<typeof familyOf>[0]

export function familiesOf(reviews: FamilyReview[]): string[] {
  return [...new Set(reviews.map(familyOf).filter(Boolean))]
}

export function enoughFamilies(reviews: FamilyReview[]): boolean {
  return familiesOf(reviews).length >= 2
}

import type { StoredReview } from "../domain/types.ts"

export function familyOf(review: Pick<StoredReview, "provider"> & { report?: { router?: { family?: string } } }): string {
  return review.report?.router?.family || review.provider
}

export function familiesOf(reviews: Array<Pick<StoredReview, "provider"> & { report?: { router?: { family?: string } } }>): string[] {
  return [...new Set(reviews.map(familyOf).filter(Boolean))]
}

export function enoughFamilies(reviews: Array<Pick<StoredReview, "provider"> & { report?: { router?: { family?: string } } }>): boolean {
  return familiesOf(reviews).length >= 2
}

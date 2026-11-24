import { isCriterionProfileId } from "../domain/profiles.ts"
import type { StoredReview } from "../domain/types.ts"
import { isHumanReview } from "../domain/versions.ts"
import { sha256Hex } from "./hash.ts"
import { loadLocalDatabase } from "./storage.ts"

const OWNERS_KEY = "air.review-owners.v1"

function browserStorage(): Storage | null {
  try {
    if (typeof localStorage === "undefined") return null
    return localStorage
  } catch {
    return null
  }
}

export function newOwnerSecret(): string {
  const bytes = new Uint8Array(24)
  const cryptoObj = globalThis.crypto
  if (cryptoObj?.getRandomValues) cryptoObj.getRandomValues(bytes)
  else {
    for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256)
  }
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("")
}

export function readReviewOwners(): Record<string, string> {
  const store = browserStorage()
  if (!store) return {}
  try {
    const raw = store.getItem(OWNERS_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== "object") return {}
    const owners: Record<string, string> = {}
    for (const [id, secret] of Object.entries(parsed)) {
      if (typeof secret === "string" && secret.length >= 16 && secret.length <= 200) owners[id] = secret
    }
    return owners
  } catch {
    return {}
  }
}

export function ownerSecretFor(reviewId: string): string | null {
  return readReviewOwners()[reviewId] ?? null
}

export function rememberReviewOwner(reviewId: string, secret: string): void {
  const store = browserStorage()
  if (!store) return
  const owners = readReviewOwners()
  owners[reviewId] = secret
  store.setItem(OWNERS_KEY, JSON.stringify(owners))
}

/** The secret stays in this browser. Only its sha256 is sent with the review row. */
export async function createReviewOwner(reviewId: string): Promise<{ secret: string; hash: string }> {
  const existing = ownerSecretFor(reviewId)
  const secret = existing ?? newOwnerSecret()
  if (!existing) rememberReviewOwner(reviewId, secret)
  return { secret, hash: await sha256Hex(secret) }
}

export function reviewIsInLocalDatabase(reviewId: string): boolean {
  try {
    return loadLocalDatabase().reviews.some((review) => review.id === reviewId)
  } catch {
    return false
  }
}

export function canRetagHumanReview(
  review: Pick<StoredReview, "id" | "origin" | "assessorId">,
  options: { hasSecret: boolean; inLocalDatabase: boolean },
): boolean {
  if (!isHumanReview(review)) return false
  return options.hasSecret || options.inLocalDatabase
}

export function humanReviewOwnedHere(review: Pick<StoredReview, "id" | "origin" | "assessorId">): boolean {
  return canRetagHumanReview(review, {
    hasSecret: Boolean(ownerSecretFor(review.id)),
    inLocalDatabase: reviewIsInLocalDatabase(review.id),
  })
}

export function withCriterionProfile(review: StoredReview, profileId: string): { ok: true; review: StoredReview } | { ok: false; error: string } {
  if (!isHumanReview(review)) return { ok: false, error: "Only a human review can change its criterion profile." }
  if (!isCriterionProfileId(profileId)) return { ok: false, error: "That criterion profile is not one of the five." }
  return { ok: true, review: { ...review, criterionProfile: profileId } }
}

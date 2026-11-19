export const RATE_LIMIT = 12
export const RATE_WINDOW_MS = 10 * 60 * 1000

export function rateLimitDecision(
  stamps: number[],
  now: number,
  limit = RATE_LIMIT,
  windowMs = RATE_WINDOW_MS,
): { ok: boolean; stamps: number[] } {
  const fresh = stamps.filter((stamp) => now - stamp < windowMs)
  if (fresh.length >= limit) return { ok: false, stamps: fresh }
  return { ok: true, stamps: [...fresh, now] }
}

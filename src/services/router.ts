import { isCalibratedForFullReview } from "../domain/calibration.ts"
import { capabilityPrior, FREE_MODELS, isLiteModel, modelFits, needsMinuteGap, type FreeModel, type RouterJob } from "../domain/freeModels.ts"

export interface ModelHealth {
  successes: number
  attempts: number
  schemaPasses: number
  quotePasses: number
  agreementPasses: number
  qualitySamples: number
  latencyMs: number[]
  cooldownUntil: number
  disabledUntil: number
  invalid: boolean
  dailyCount: number
  dailyResetAt: number
  backoffMs: number
}

export type RouterHealth = Record<string, ModelHealth>

export interface RouterCallResult {
  status: number
  body: string
  headers?: { retryAfter?: string }
  content?: string
  servedModel?: string
}

export interface RouteSuccess {
  ok: true
  model: FreeModel
  content: string
  servedModel: string
  family: string
  attempts: string[]
  health: RouterHealth
}

export interface RouteFailure {
  ok: false
  error: string
  attempts: string[]
  health: RouterHealth
}

export function emptyHealth(): ModelHealth {
  return {
    successes: 0,
    attempts: 0,
    schemaPasses: 0,
    quotePasses: 0,
    agreementPasses: 0,
    qualitySamples: 0,
    latencyMs: [],
    cooldownUntil: 0,
    disabledUntil: 0,
    invalid: false,
    dailyCount: 0,
    dailyResetAt: 0,
    backoffMs: 0,
  }
}

export function healthKey(model: { provider: string; model: string }): string {
  return `${model.provider}:${model.model}`
}

/** Process quality only. Score values are not an input. */
export function processQuality(health: ModelHealth | undefined): number {
  if (!health || health.qualitySamples <= 0) return 0.5
  const schema = health.schemaPasses / health.qualitySamples
  const quotes = health.quotePasses / health.qualitySamples
  const agree = health.agreementPasses / health.qualitySamples
  return (schema + quotes + agree) / 3
}

export function recordProcessQuality(health: ModelHealth, sample: { schemaValid: boolean; quotesVerified: boolean; scoresAgree: boolean }): ModelHealth {
  return {
    ...health,
    qualitySamples: health.qualitySamples + 1,
    schemaPasses: health.schemaPasses + (sample.schemaValid ? 1 : 0),
    quotePasses: health.quotePasses + (sample.quotesVerified ? 1 : 0),
    agreementPasses: health.agreementPasses + (sample.scoresAgree ? 1 : 0),
  }
}

function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)] ?? 0
}

export function utilityOf(model: FreeModel, health: ModelHealth | undefined, now = Date.now()): number {
  const current = health ? normalizeHealth(health, model.provider, now) : undefined
  const samples = current?.qualitySamples ?? 0
  const learned = processQuality(current)
  const quality = samples === 0 ? capabilityPrior(model) : capabilityPrior(model) * 0.75 + learned * 0.25
  const attempts = current?.attempts ?? 0
  const raw = attempts === 0 ? 0.5 : (current?.successes ?? 0) / attempts
  const availability = (raw * attempts + 2) / (attempts + 4)
  const used = current?.dailyCount ?? 0
  const headroom = Math.max(0, (model.rpd - used) / model.rpd)
  const latency = median(current?.latencyMs ?? [])
  const speed = latency > 0 ? 1 / (1 + latency / 1000) : 0.5
  return 0.45 * quality + 0.25 * availability + 0.15 * headroom + 0.15 * speed
}

function zoneParts(now: number, timeZone: string): { year: number; month: number; day: number; hour: number; minute: number; second: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(now))
  const read = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? "0")
  return { year: read("year"), month: read("month"), day: read("day"), hour: read("hour"), minute: read("minute"), second: read("second") }
}

function midnightInZone(timeZone: string, year: number, month: number, day: number): number {
  let guess = Date.UTC(year, month - 1, day, 8, 0, 0)
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const shown = zoneParts(guess, timeZone)
    const actual = Date.UTC(shown.year, shown.month - 1, shown.day, shown.hour, shown.minute, shown.second)
    const target = Date.UTC(year, month - 1, day, 0, 0, 0)
    guess -= actual - target
  }
  return guess
}

export function nextDailyReset(provider: string, now: number): number {
  if (provider !== "gemini") {
    const date = new Date(now)
    const reset = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0)
    return reset > now ? reset : reset + 86_400_000
  }
  const shown = zoneParts(now, "America/Los_Angeles")
  let midnight = midnightInZone("America/Los_Angeles", shown.year, shown.month, shown.day)
  if (midnight <= now) {
    const tomorrow = zoneParts(now + 36 * 3_600_000, "America/Los_Angeles")
    midnight = midnightInZone("America/Los_Angeles", tomorrow.year, tomorrow.month, tomorrow.day)
  }
  return midnight
}

export function normalizeHealth(health: ModelHealth, provider: string, now: number): ModelHealth {
  if (health.dailyResetAt > now) return health
  return { ...health, dailyCount: 0, dailyResetAt: nextDailyReset(provider, now) }
}

export function nextOverloadBackoff(previousMs: number): number {
  if (previousMs < 30_000) return 30_000
  if (previousMs < 120_000) return 120_000
  return 600_000
}

function cooling(health: ModelHealth | undefined, now: number): boolean {
  if (!health) return false
  if (health.invalid) return true
  if (health.disabledUntil > now) return true
  return health.cooldownUntil > now
}

export function rankCandidates(input: {
  tokens: number
  job: RouterJob
  providersWithKeys: string[]
  health: RouterHealth
  now: number
  privateMaterial: boolean
}): FreeModel[] {
  const present = new Set(input.providersWithKeys)
  const ranked = FREE_MODELS.filter((model) => present.has(model.provider))
    .filter((model) => modelFits(model, input.tokens))
    .filter((model) => !(input.privateMaterial && model.trainsOnFree))
    .filter((model) => !(input.job === "review-full" && isLiteModel(model) && !isCalibratedForFullReview(model.model)))
    .filter((model) => !cooling(normalizeHealth(input.health[healthKey(model)] ?? emptyHealth(), model.provider, input.now), input.now))
    .sort((a, b) => {
      const delta = utilityOf(b, input.health[healthKey(b)], input.now) - utilityOf(a, input.health[healthKey(a)], input.now)
      if (delta !== 0) return delta
      return capabilityPrior(b) - capabilityPrior(a)
    })
  return interleaveFamilies(ranked)
}

function interleaveFamilies(models: FreeModel[]): FreeModel[] {
  const groups: FreeModel[][] = []
  const indexOf = new Map<string, number>()
  for (const model of models) {
    const existing = indexOf.get(model.family)
    if (existing === undefined) {
      indexOf.set(model.family, groups.length)
      groups.push([model])
    } else {
      groups[existing]?.push(model)
    }
  }
  const mixed: FreeModel[] = []
  let cursor = 0
  while (mixed.length < models.length) {
    let added = false
    for (const group of groups) {
      const item = group[cursor]
      if (!item) continue
      mixed.push(item)
      added = true
    }
    if (!added) break
    cursor += 1
  }
  return mixed
}

export function retryDelayMs(body: string, retryAfter?: string): number | null {
  if (retryAfter && Number(retryAfter) > 0) return Math.ceil(Number(retryAfter) * 1000)
  const match = body.match(/retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/i)
  if (match?.[1]) return Math.ceil(Number(match[1]) * 1000)
  return null
}

export function isDailyQuota(body: string): boolean {
  if (/PerMinute|per minute/i.test(body)) return false
  return /PerDay|per day|RequestsPerDay/i.test(body)
}

function applyFailure(health: RouterHealth, model: FreeModel, status: number, body: string, retryAfter: string | undefined, now: number): RouterHealth {
  const key = healthKey(model)
  const current = normalizeHealth(health[key] ?? emptyHealth(), model.provider, now)
  const next = { ...current, attempts: current.attempts + 1 }
  const lower = body.toLowerCase()
  const delay = retryDelayMs(body, retryAfter)
  if (status === 401 || status === 404) {
    next.invalid = true
  } else if (status === 402 || (status === 403 && /credit|billing|spending|payment|insufficient/.test(lower))) {
    next.disabledUntil = now + 365 * 86_400_000
  } else if (status === 429 && isDailyQuota(body)) {
    next.cooldownUntil = nextDailyReset(model.provider, now)
    next.dailyCount = model.rpd
  } else if (status === 429) {
    next.cooldownUntil = now + (delay ?? 65_000)
  } else if (status === 503 || status === 0) {
    const wait = nextOverloadBackoff(current.backoffMs)
    next.backoffMs = wait
    next.cooldownUntil = now + wait
  } else {
    next.cooldownUntil = now + 30_000
  }
  return { ...health, [key]: next }
}

function applySuccess(health: RouterHealth, model: FreeModel, latencyMs: number, now: number, tokens: number): RouterHealth {
  const key = healthKey(model)
  const current = normalizeHealth(health[key] ?? emptyHealth(), model.provider, now)
  const gap = needsMinuteGap(model, tokens) ? now + 60_000 : 0
  return {
    ...health,
    [key]: {
      ...current,
      attempts: current.attempts + 1,
      successes: current.successes + 1,
      dailyCount: current.dailyCount + 1,
      backoffMs: 0,
      cooldownUntil: Math.max(current.cooldownUntil, gap),
      latencyMs: [...current.latencyMs, latencyMs].slice(-20),
    },
  }
}

function soonestCooldown(models: FreeModel[], health: RouterHealth, now: number): number | null {
  let soonest: number | null = null
  for (const model of models) {
    const current = normalizeHealth(health[healthKey(model)] ?? emptyHealth(), model.provider, now)
    if (current.invalid || current.disabledUntil > now) continue
    if (current.cooldownUntil <= now) continue
    if (soonest === null || current.cooldownUntil < soonest) soonest = current.cooldownUntil
  }
  return soonest
}

function fittingModels(input: { tokens: number; providersWithKeys: string[]; privateMaterial: boolean }): FreeModel[] {
  const present = new Set(input.providersWithKeys)
  return FREE_MODELS.filter((model) => present.has(model.provider))
    .filter((model) => modelFits(model, input.tokens))
    .filter((model) => !(input.privateMaterial && model.trainsOnFree))
}

function gmtClock(ms: number): string {
  return `${new Date(ms).toISOString().slice(11, 16)} GMT`
}

const SHORT_WAIT_MS = 3 * 60 * 1000
const WAIT_BUDGET_MS = 10 * 60 * 1000

export async function routeComplete(input: {
  tokens: number
  job: RouterJob
  providersWithKeys: string[]
  health: RouterHealth
  now: number
  privateMaterial: boolean
  maxAttempts?: number
  budgetMs?: number
  clock?: () => number
  sleep?: (ms: number) => Promise<void>
  onHealth?: (health: RouterHealth) => void
  call: (model: FreeModel) => Promise<RouterCallResult>
}): Promise<RouteSuccess | RouteFailure> {
  const clock = input.clock ?? Date.now
  const sleep = input.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)))
  const deadline = input.now + (input.budgetMs ?? WAIT_BUDGET_MS)
  const attempts: string[] = []
  let health = input.health
  let virtualNow = input.now
  const limit = input.maxAttempts ?? 4
  while (virtualNow <= deadline) {
    const ranked = rankCandidates({ ...input, health, now: virtualNow })
    if (ranked.length === 0) {
      const soonest = soonestCooldown(fittingModels(input).filter((model) => !(input.job === "review-full" && isLiteModel(model) && !isCalibratedForFullReview(model.model))), health, virtualNow)
      const waitMs = soonest === null ? Number.POSITIVE_INFINITY : soonest - virtualNow
      if (soonest === null || waitMs > SHORT_WAIT_MS || soonest > deadline) {
        const when = soonest === null ? "" : ` Next model free at ${gmtClock(soonest)}.`
        const waited = attempts.length === 0 ? "No free model has room for this job." : `Tried ${attempts.join(", ")}.`
        return { ok: false, error: `${waited}${when} Add another free key, or wait for the quota to reset.`, attempts, health }
      }
      await sleep(waitMs)
      virtualNow = clock()
      continue
    }
    for (const model of ranked.slice(0, limit)) {
      attempts.push(healthKey(model))
      const started = clock()
      const result = await input.call(model)
      const latency = Math.max(1, clock() - started)
      if (result.status >= 200 && result.status < 300 && result.content) {
        health = applySuccess(health, model, latency, virtualNow, input.tokens)
        input.onHealth?.(health)
        return {
          ok: true,
          model,
          content: result.content,
          servedModel: result.servedModel || model.model,
          family: model.family,
          attempts,
          health,
        }
      }
      health = applyFailure(health, model, result.status, result.body, result.headers?.retryAfter, virtualNow)
      input.onHealth?.(health)
    }
    const soonest = soonestCooldown(fittingModels(input), health, virtualNow)
    const waitMs = soonest === null ? Number.POSITIVE_INFINITY : soonest - virtualNow
    if (soonest === null || waitMs > SHORT_WAIT_MS || soonest > deadline) break
    await sleep(waitMs)
    virtualNow = clock()
  }
  const soonest = soonestCooldown(fittingModels(input), health, virtualNow)
  const when = soonest ? ` Next model free at ${gmtClock(soonest)}.` : ""
  const waited = attempts.length === 0 ? "No free model has room for this job." : `Tried ${attempts.join(", ")}.`
  return { ok: false, error: `${waited}${when} Add another free key, or wait for the quota to reset.`, attempts, health }
}

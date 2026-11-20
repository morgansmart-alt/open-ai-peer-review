import { FREE_MODELS, modelFits, type FreeModel, type RouterJob } from "../domain/freeModels.ts"

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
    backoffMs: 0,
  }
}

export function healthKey(model: FreeModel): string {
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

export function utilityOf(model: FreeModel, health: ModelHealth | undefined): number {
  const quality = processQuality(health)
  const availability = !health || health.attempts === 0 ? 0.5 : health.successes / health.attempts
  const used = health?.dailyCount ?? 0
  const headroom = Math.max(0, (model.rpd - used) / model.rpd)
  const latency = median(health?.latencyMs ?? [])
  const speed = latency > 0 ? 1 / (1 + latency / 1000) : 0.5
  return 0.45 * quality + 0.25 * availability + 0.15 * headroom + 0.15 * speed
}

export function nextDailyReset(provider: string, now: number): number {
  const date = new Date(now)
  const hour = provider === "gemini" ? 8 : 0
  const reset = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), hour, 0, 0, 0)
  return reset > now ? reset : reset + 86_400_000
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
    .filter((model) => !cooling(input.health[healthKey(model)], input.now))
    .sort((a, b) => {
      const delta = utilityOf(b, input.health[healthKey(b)]) - utilityOf(a, input.health[healthKey(a)])
      if (delta !== 0) return delta
      return healthKey(a).localeCompare(healthKey(b))
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

function applyFailure(health: RouterHealth, model: FreeModel, status: number, body: string, retryAfter: string | undefined, now: number): RouterHealth {
  const key = healthKey(model)
  const current = health[key] ?? emptyHealth()
  const next = { ...current, attempts: current.attempts + 1 }
  const lower = body.toLowerCase()
  if (status === 401) {
    next.invalid = true
  } else if (status === 402 || (status === 403 && /credit|billing|spending|payment|insufficient/.test(lower))) {
    next.disabledUntil = now + 365 * 86_400_000
  } else if (status === 429 && /per day|daily|quota/.test(lower)) {
    next.cooldownUntil = nextDailyReset(model.provider, now)
    next.dailyCount = model.rpd
  } else if (status === 429) {
    const seconds = Number(retryAfter)
    next.cooldownUntil = now + (Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 60_000)
  } else if (status === 503 || status === 0) {
    const wait = nextOverloadBackoff(current.backoffMs)
    next.backoffMs = wait
    next.cooldownUntil = now + wait
  } else {
    next.cooldownUntil = now + 30_000
  }
  return { ...health, [key]: next }
}

function applySuccess(health: RouterHealth, model: FreeModel, latencyMs: number): RouterHealth {
  const key = healthKey(model)
  const current = health[key] ?? emptyHealth()
  return {
    ...health,
    [key]: {
      ...current,
      attempts: current.attempts + 1,
      successes: current.successes + 1,
      dailyCount: current.dailyCount + 1,
      backoffMs: 0,
      latencyMs: [...current.latencyMs, latencyMs].slice(-20),
    },
  }
}

export async function routeComplete(input: {
  tokens: number
  job: RouterJob
  providersWithKeys: string[]
  health: RouterHealth
  now: number
  privateMaterial: boolean
  maxAttempts?: number
  call: (model: FreeModel) => Promise<RouterCallResult>
}): Promise<RouteSuccess | RouteFailure> {
  const ranked = rankCandidates(input)
  const attempts: string[] = []
  let health = input.health
  let now = input.now
  const limit = input.maxAttempts ?? 4
  for (const model of ranked.slice(0, limit)) {
    attempts.push(healthKey(model))
    const started = now
    const result = await input.call(model)
    if (result.status >= 200 && result.status < 300 && result.content) {
      health = applySuccess(health, model, Math.max(1, now - started + 1))
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
    health = applyFailure(health, model, result.status, result.body, result.headers?.retryAfter, now)
    now += 1
  }
  const waited = attempts.length === 0 ? "No free model has room for this job." : `Tried ${attempts.join(", ")}.`
  return { ok: false, error: `${waited} Add another free key, or wait for the quota to reset.`, attempts, health }
}

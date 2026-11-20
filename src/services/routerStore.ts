import type { RouterHealth } from "./router.ts"

const ROUTER_KEY = "air.router.v1"

export function loadRouterHealth(): RouterHealth {
  try {
    if (typeof localStorage === "undefined") return {}
    const raw = localStorage.getItem(ROUTER_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as RouterHealth
    return parsed && typeof parsed === "object" ? parsed : {}
  } catch {
    return {}
  }
}

export function saveRouterHealth(health: RouterHealth): void {
  try {
    if (typeof localStorage === "undefined") return
    localStorage.setItem(ROUTER_KEY, JSON.stringify(health))
  } catch {
    // The review can continue if the browser refuses storage.
  }
}

export function clearRouterHealth(): void {
  try {
    if (typeof localStorage === "undefined") return
    localStorage.removeItem(ROUTER_KEY)
  } catch {
    // Nothing stored.
  }
}

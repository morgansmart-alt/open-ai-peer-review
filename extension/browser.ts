export interface JobRecord {
  requestId: string
  airTabId: number
  providerTabId: number
  providerId: string
  startedAt: number
}

export function lastError(): string | null {
  const message = chrome.runtime.lastError?.message
  return message ?? null
}

export function runtimeSend(message: unknown): Promise<unknown> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response: unknown) => {
      const messageText = lastError()
      if (messageText) reject(new Error(messageText))
      else resolve(response)
    })
  })
}

export function tabSend(tabId: number, message: unknown): Promise<unknown> {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, (response: unknown) => {
      const messageText = lastError()
      if (messageText) reject(new Error(messageText))
      else resolve(response)
    })
  })
}

export function sessionGet<T>(key: string): Promise<T | null> {
  return new Promise((resolve) => {
    chrome.storage.session.get(key, (data: Record<string, T>) => {
      if (lastError()) resolve(null)
      else resolve(data?.[key] ?? null)
    })
  })
}

export function sessionSet(key: string, value: unknown): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.session.set({ [key]: value }, () => resolve())
  })
}

export function sessionRemove(key: string): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.session.remove(key, () => resolve())
  })
}

export const JOB_KEY = "air-web-chat-job"

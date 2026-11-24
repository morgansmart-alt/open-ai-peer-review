import type { ProviderAdapter } from "../../../extension/adapters/index.ts"
import type { WebChatFile } from "./protocol.ts"

export type PageDiagnosis = "ready" | "signed-out" | "selector-miss"

export function queryDeep(root: ParentNode, selector: string): Element | null {
  const direct = root.querySelector(selector)
  if (direct) return direct
  for (const el of root.querySelectorAll("*")) {
    if (el.shadowRoot) {
      const found = queryDeep(el.shadowRoot, selector)
      if (found) return found
    }
  }
  return null
}

export function queryAllDeep(root: ParentNode, selector: string): Element[] {
  const found = [...root.querySelectorAll(selector)]
  for (const el of root.querySelectorAll("*")) {
    if (el.shadowRoot) found.push(...queryAllDeep(el.shadowRoot, selector))
  }
  return found
}

export function queryFirst(root: ParentNode, selectors: string[]): Element | null {
  for (const selector of selectors) {
    if (!selector) continue
    try {
      const found = queryDeep(root, selector)
      if (found) return found
    } catch {
      // A selector that the site no longer accepts is skipped. The next fallback is tried.
    }
  }
  return null
}

export function diagnose(root: ParentNode, provider: ProviderAdapter): PageDiagnosis {
  if (queryFirst(root, provider.selectors.composer)) return "ready"
  if (queryFirst(root, provider.selectors.login)) return "signed-out"
  return "selector-miss"
}

export function assistantText(root: ParentNode, selectors: string[]): string {
  for (const selector of selectors) {
    let nodes: Element[] = []
    try {
      nodes = queryAllDeep(root, selector)
    } catch {
      continue
    }
    const last = nodes[nodes.length - 1]
    if (!last) continue
    const element = last as HTMLElement
    const text = typeof element.innerText === "string" && element.innerText.trim() ? element.innerText : (last.textContent ?? "")
    const trimmed = text.trim()
    if (trimmed) return trimmed
  }
  return ""
}

export function isActiveStop(el: Element): boolean {
  if (el.hasAttribute("hidden")) return false
  if (el.getAttribute("aria-hidden") === "true") return false
  if ("disabled" in el && Boolean((el as HTMLButtonElement).disabled)) return false
  return true
}

export function textFilename(filename: string): string {
  const base = filename.replace(/[^\w.\- ]+/g, "_").slice(0, 80) || "paper"
  return /\.(txt|md|csv|json)$/i.test(base) ? base : `${base}.txt`
}

export function writeComposer(el: Element, text: string): void {
  const tag = el.tagName
  if (tag === "TEXTAREA" || tag === "INPUT") {
    const control = el as HTMLTextAreaElement
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(control) as object, "value")?.set
    if (typeof setter === "function") setter.call(control, text)
    else control.value = text
    control.dispatchEvent(new Event("input", { bubbles: true }))
    control.dispatchEvent(new Event("change", { bubbles: true }))
    return
  }
  const editable = el as HTMLElement
  if (typeof editable.focus === "function") editable.focus()
  const doc = el.ownerDocument
  let inserted = false
  try {
    const selection = doc.getSelection?.()
    const range = doc.createRange()
    range.selectNodeContents(el)
    selection?.removeAllRanges()
    selection?.addRange(range)
    inserted = Boolean(doc.execCommand?.("insertText", false, text))
  } catch {
    inserted = false
  }
  const current = editable.textContent ?? ""
  if (!inserted || (text.length > 0 && !current.includes(text.slice(0, Math.min(16, text.length))))) {
    editable.textContent = text
    try {
      editable.dispatchEvent(new InputEvent("input", { bubbles: true, data: text, inputType: "insertText" }))
    } catch {
      editable.dispatchEvent(new Event("input", { bubbles: true }))
    }
  }
}

/** One click, then ignore a second call on the same element until the turn yields. */
const clickLock = new WeakMap<Element, number>()

export function clickElement(el: Element): boolean {
  if (clickLock.has(el)) return false
  clickLock.set(el, 1)
  queueMicrotask(() => {
    setTimeout(() => clickLock.delete(el), 0)
  })
  const node = el as HTMLElement
  if (typeof node.click === "function") node.click()
  else el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }))
  return true
}

export const ATTACHMENT_SELECTORS = [
  '[data-attachment-state="ready"]',
  '[data-attachment-state="complete"]',
  '[data-testid*="attachment"]',
  '[data-testid*="file-thumbnail"]',
  '[aria-label*="Attached"]',
  '[aria-label*="Remove file"]',
]

/** True when the chat shows the attached file, not merely that the input accepted a FileList. */
export function attachmentReady(root: ParentNode, files: WebChatFile[], selectors: string[] = ATTACHMENT_SELECTORS): boolean {
  const names = files.map((file) => textFilename(file.filename).toLowerCase()).filter((name) => name.length > 0)
  const seen = new Set<Element>()
  const list = selectors.length > 0 ? selectors : ATTACHMENT_SELECTORS
  for (const selector of [...list, "[data-attachment-state]"]) {
    let nodes: Element[] = []
    try {
      nodes = queryAllDeep(root, selector)
    } catch {
      continue
    }
    for (const node of nodes) {
      if (seen.has(node) || node.tagName === "INPUT" || node.tagName === "TEXTAREA" || node.tagName === "SCRIPT" || node.tagName === "STYLE") continue
      seen.add(node)
      const state = `${node.getAttribute("data-attachment-state") ?? ""} ${node.getAttribute("data-state") ?? ""}`.toLowerCase()
      const text = (node.textContent ?? "").toLowerCase()
      const pending = /\b(pending|uploading|processing)\b/.test(state)
      const ready = /\b(ready|complete|uploaded|attached)\b/.test(state)
      if (ready) return true
      if (!pending && names.some((name) => text.includes(name))) return true
    }
  }
  return false
}

export function attachTextFiles(input: Element, files: WebChatFile[]): boolean {
  if (input.tagName !== "INPUT") return false
  try {
    const transfer = new DataTransfer()
    for (const file of files) {
      transfer.items.add(new File([file.text], textFilename(file.filename), { type: "text/plain" }))
    }
    const target = input as HTMLInputElement
    target.files = transfer.files
    target.dispatchEvent(new Event("change", { bubbles: true }))
    return (target.files?.length ?? 0) === files.length
  } catch {
    return false
  }
}

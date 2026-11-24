import type { ProviderAdapter } from "../../../extension/adapters/index.ts"
import { lastScoreJson } from "../jsonText.ts"
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

const COMPOSER_HINTS = ["message grok", "ask", "what do you want to know", "message"]
const SEND_WORDS = ["send", "submit", "grok", "ask"]

function ignoredElement(node: Element): boolean {
  const id = (node.id || "").toLowerCase()
  const className = classNameOf(node).toLowerCase()
  const tag = node.tagName.toLowerCase()
  const label = `${node.getAttribute("aria-label") ?? ""} ${node.getAttribute("title") ?? ""}`.toLowerCase()
  const blob = `${id} ${className} ${tag} ${(node.getAttribute("data-extension") || "").toLowerCase()} ${label}`
  return (
    id === "air-web-chat-banner" ||
    node.hasAttribute("data-air-ignore") ||
    blob.includes("stl-forge") ||
    blob.includes("stlforge") ||
    blob.includes("stl_forge") ||
    blob.includes("stl forge") ||
    tag.includes("forge")
  )
}

/** Our banner and other extension overlays, including STL Forge, are not the chat. */
export function isIgnoredRegion(el: Element): boolean {
  let node: Node | null = el
  const seen = new Set<Node>()
  while (node && !seen.has(node)) {
    seen.add(node)
    if (node instanceof Element && ignoredElement(node)) return true
    const parent: Node | null = node.parentNode
    if (parent instanceof ShadowRoot) {
      node = parent.host
      continue
    }
    node = parent
  }
  return false
}

export function isHiddenControl(el: Element): boolean {
  if (el.hasAttribute("hidden")) return true
  if (el.getAttribute("aria-hidden") === "true") return true
  if (el.getAttribute("aria-disabled") === "true") return true
  const style = (el as HTMLElement).style
  if (style?.display === "none" || style?.visibility === "hidden") return true
  if ("disabled" in el && Boolean((el as HTMLButtonElement).disabled)) return true
  return false
}

function classNameOf(el: Element): string {
  return typeof el.className === "string" ? el.className : ""
}

function isComposerCandidate(el: Element): boolean {
  if (isIgnoredRegion(el) || isHiddenControl(el)) return false
  const tag = el.tagName
  if (tag === "TEXTAREA") return true
  if (tag === "INPUT") {
    const type = ((el as HTMLInputElement).type || "text").toLowerCase()
    return type === "text" || type === "search"
  }
  if (el.getAttribute("contenteditable") === "true" || el.getAttribute("contenteditable") === "") return true
  if (el.getAttribute("role") === "textbox") return true
  return false
}

function hintText(el: Element): string {
  return `${el.getAttribute("aria-label") ?? ""} ${el.getAttribute("placeholder") ?? ""}`.toLowerCase()
}

function matchesHint(el: Element): boolean {
  const text = hintText(el)
  return COMPOSER_HINTS.some((hint) => text.includes(hint))
}

function chatRegion(root: ParentNode): ParentNode {
  const scope = root instanceof Document ? (root.body ?? root) : root
  if (scope instanceof Element || scope instanceof Document) {
    const main = scope.querySelector("main, [role='main']")
    if (main) return main
  }
  return scope
}

function firstUsable(nodes: Element[], accept: (el: Element) => boolean): Element | null {
  return nodes.find((el) => accept(el)) ?? null
}

/**
 * Adapter selectors first, then a hint, a textarea, a contenteditable, and a textbox.
 * Fallbacks stay inside the main chat region. Hidden controls and extension overlays are skipped.
 */
export function findComposer(root: ParentNode, selectors: string[]): Element | null {
  for (const selector of selectors) {
    let nodes: Element[] = []
    try {
      nodes = queryAllDeep(root, selector)
    } catch {
      continue
    }
    const found = firstUsable(nodes, isComposerCandidate)
    if (found) return found
  }
  const region = chatRegion(root)
  let pool: Element[] = []
  try {
    pool = queryAllDeep(region, "textarea, input, [contenteditable='true'], [contenteditable=''], [role='textbox']")
  } catch {
    pool = []
  }
  const usable = pool.filter(isComposerCandidate)
  return (
    usable.find(matchesHint) ??
    usable.find((el) => el.tagName === "TEXTAREA") ??
    usable.find((el) => el.getAttribute("contenteditable") === "true" || el.getAttribute("contenteditable") === "") ??
    usable.find((el) => el.getAttribute("role") === "textbox") ??
    null
  )
}

function buttonLabel(el: Element): string {
  return `${el.getAttribute("aria-label") ?? ""} ${el.getAttribute("title") ?? ""} ${(el.textContent ?? "").replace(/\s+/g, " ")}`.toLowerCase()
}

function isSendControl(el: Element): boolean {
  if (isIgnoredRegion(el) || isHiddenControl(el)) return false
  const tag = el.tagName
  if (tag !== "BUTTON" && el.getAttribute("role") !== "button" && (el as HTMLInputElement).type !== "submit") return false
  const label = buttonLabel(el)
  if (/add files|voice mode|select a model|model auto/.test(label)) return false
  return true
}

function nearest(origin: Element, options: Element[]): Element | null {
  if (options.length === 0) return null
  const doc = origin.ownerDocument
  if (!doc) return options[0] ?? null
  const order = [...doc.querySelectorAll("body *")]
  const index = new Map(order.map((el, position) => [el, position]))
  const originIndex = index.get(origin) ?? 0
  let best = options[0] ?? null
  let bestDistance = Number.POSITIVE_INFINITY
  for (const option of options) {
    const distance = Math.abs((index.get(option) ?? 0) - originIndex)
    if (distance < bestDistance) {
      best = option
      bestDistance = distance
    }
  }
  return best
}

function uniqueElements(nodes: Element[]): Element[] {
  return [...new Set(nodes)]
}

/** Enabled send controls, preferring the one nearest the composer so an overlay button is not clicked. */
export function findSubmit(root: ParentNode, selectors: string[], composer: Element | null): Element | null {
  const matches: Element[] = []
  for (const selector of selectors) {
    try {
      matches.push(...queryAllDeep(root, selector).filter(isSendControl))
    } catch {
      // The next selector is tried.
    }
  }
  const listed = uniqueElements(matches)
  if (listed.length) return composer ? nearest(composer, listed) : listed[listed.length - 1] ?? null
  const region = chatRegion(root)
  let buttons: Element[] = []
  try {
    buttons = queryAllDeep(region, "button, [role='button'], input[type='submit']").filter(isSendControl)
  } catch {
    buttons = []
  }
  const hinted: Element[] = []
  for (const word of SEND_WORDS) hinted.push(...buttons.filter((button) => buttonLabel(button).includes(word)))
  const hintedUnique = uniqueElements(hinted)
  if (hintedUnique.length) return composer ? nearest(composer, hintedUnique) : hintedUnique[hintedUnique.length - 1] ?? null
  const submits = buttons.filter((button) => button.getAttribute("type") === "submit" || (button as HTMLInputElement).type === "submit")
  if (composer) return nearest(composer, submits)
  return submits[submits.length - 1] ?? null
}

export function describeButtons(root: ParentNode, limit = 6): string {
  let nodes: Element[] = []
  try {
    nodes = queryAllDeep(root, "button, [role='button'], input[type='submit']")
  } catch {
    nodes = []
  }
  if (nodes.length === 0) return "Buttons: none."
  const text = nodes
    .filter((el) => !isIgnoredRegion(el))
    .slice(0, limit)
    .map((el) => {
      const tag = el.tagName.toLowerCase()
      const type = el.getAttribute("type") ?? ""
      const label = el.getAttribute("aria-label") ?? ""
      const state = isHiddenControl(el) ? "disabled" : "enabled"
      return [tag, type && `type=${type}`, label && `aria-label=${label}`, state].filter(Boolean).join(" ")
    })
    .join("; ")
  return `Buttons: ${text}.`
}

export function describeCandidates(root: ParentNode, limit = 6): string {
  let nodes: Element[] = []
  try {
    nodes = queryAllDeep(root, "textarea, input, [contenteditable='true'], [contenteditable=''], [role='textbox']")
  } catch {
    nodes = []
  }
  const candidates = nodes.filter((el) => {
    if (el.tagName === "INPUT") {
      const type = ((el as HTMLInputElement).type || "").toLowerCase()
      if (type === "file" || type === "hidden" || type === "password" || type === "checkbox" || type === "radio") return false
    }
    return el.tagName === "TEXTAREA" || el.tagName === "INPUT" || el.getAttribute("contenteditable") != null || el.getAttribute("role") === "textbox"
  })
  if (candidates.length === 0) return "none"
  return candidates
    .slice(0, limit)
    .map((el) => {
      const tag = el.tagName.toLowerCase()
      const role = el.getAttribute("role") ?? ""
      const label = el.getAttribute("aria-label") ?? ""
      const placeholder = el.getAttribute("placeholder") ?? ""
      return [tag, role && `role=${role}`, label && `aria-label=${label}`, placeholder && `placeholder=${placeholder}`].filter(Boolean).join(" ")
    })
    .join("; ")
}

export function diagnose(root: ParentNode, provider: ProviderAdapter): PageDiagnosis {
  if (findComposer(root, provider.selectors.composer)) return "ready"
  if (queryFirst(root, provider.selectors.login)) return "signed-out"
  return "selector-miss"
}

function elementText(el: Element): string {
  const element = el as HTMLElement
  const text = typeof element.innerText === "string" && element.innerText.trim() ? element.innerText : (el.textContent ?? "")
  return text.trim()
}

function looksLikeAssistant(el: Element): boolean {
  const blob = `${el.getAttribute("data-testid") ?? ""} ${el.getAttribute("data-message-author") ?? ""} ${el.getAttribute("data-message-author-role") ?? ""} ${classNameOf(el)}`.toLowerCase()
  return /assistant|grok-message|model-response|response-message/.test(blob)
}

/** Adapter assistant selectors, then a reply node that is not the composer. */
export function assistantText(root: ParentNode, selectors: string[], composer?: Element | null): string {
  const seen = new Set<Element>()
  const consider = (nodes: Element[]): string => {
    const usable = nodes.filter((el) => {
      if (seen.has(el) || isIgnoredRegion(el)) return false
      seen.add(el)
      if (!composer) return true
      if (el === composer || composer.contains(el) || el.contains(composer)) return false
      return true
    })
    const last = usable[usable.length - 1]
    return last ? elementText(last) : ""
  }
  for (const selector of selectors) {
    let nodes: Element[] = []
    try {
      nodes = queryAllDeep(root, selector)
    } catch {
      continue
    }
    const text = consider(nodes)
    if (text) return text
  }
  let pool: Element[] = []
  try {
    pool = queryAllDeep(root, "[data-testid], [data-message-author], [data-message-author-role], [class*='assistant'], [class*='response']")
  } catch {
    pool = []
  }
  const text = consider(pool.filter(looksLikeAssistant))
  return text
}

function walkReplyText(node: Node, composer: Element | null, chunks: string[]): void {
  if (node instanceof Element) {
    if (isIgnoredRegion(node)) return
    if (composer && (node === composer || composer.contains(node))) return
    if (node.shadowRoot) walkReplyText(node.shadowRoot, composer, chunks)
  }
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent ?? ""
    if (text.trim()) chunks.push(text)
    return
  }
  for (const child of node.childNodes) walkReplyText(child, composer, chunks)
}

/** Text the reviewer can see, without the composer or another extension's overlay. */
export function visibleReplyText(root: ParentNode, composer: Element | null): string {
  const chunks: string[] = []
  const scope = root instanceof Document ? (root.body ?? root.documentElement) : root
  walkReplyText(scope, composer, chunks)
  return chunks.join("\n")
}

/** The last JSON object in the text whose overallScore is a number. The prompt schema is not a number. */
export function reviewJsonBlock(text: string): string {
  return lastScoreJson(text)?.text ?? ""
}

export function reviewJsonOnPage(root: ParentNode, composer: Element | null): string {
  return reviewJsonBlock(visibleReplyText(root, composer))
}

export function stopControlActive(root: ParentNode, selectors: string[]): boolean {
  const extra = ["button", "[role='button']"]
  const found: Element[] = []
  for (const selector of [...selectors, ...extra]) {
    try {
      found.push(...queryAllDeep(root, selector))
    } catch {
      // Keep looking.
    }
  }
  return found.some((el) => {
    if (isIgnoredRegion(el) || !isActiveStop(el)) return false
    const fromAdapter = selectors.some((selector) => {
      try {
        return el.matches(selector)
      } catch {
        return false
      }
    })
    if (fromAdapter) return true
    return /stop/.test(buttonLabel(el))
  })
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

function dispatchInput(el: Element, text: string): void {
  try {
    el.dispatchEvent(new InputEvent("input", { bubbles: true, data: text, inputType: "insertText" }))
  } catch {
    el.dispatchEvent(new Event("input", { bubbles: true }))
  }
}

function containsStart(el: Element, text: string): boolean {
  if (!text) return true
  const probe = text.slice(0, Math.min(16, text.length))
  const value = "value" in el ? String((el as HTMLTextAreaElement).value ?? "") : ""
  return value.includes(probe) || (el.textContent ?? "").includes(probe)
}

function pasteText(el: Element, text: string): boolean {
  try {
    const transfer = new DataTransfer()
    transfer.setData("text/plain", text)
    const event = new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: transfer })
    el.dispatchEvent(event)
  } catch {
    return false
  }
  return containsStart(el, text)
}

export function writeComposer(el: Element, text: string): void {
  const tag = el.tagName
  if (tag === "TEXTAREA" || tag === "INPUT") {
    const control = el as HTMLTextAreaElement
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(control) as object, "value")?.set
    if (typeof setter === "function") setter.call(control, text)
    else control.value = text
    dispatchInput(control, text)
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
  if (!inserted || !containsStart(editable, text)) inserted = pasteText(editable, text)
  if (!inserted || !containsStart(editable, text)) {
    editable.textContent = text
    dispatchInput(editable, text)
  }
}

/** One click, then ignore a second call on the same element until the turn yields. */
const clickLock = new WeakMap<Element, number>()

/** One Enter keydown. A second call in the same turn does nothing. */
export function pressEnterOnce(el: Element): boolean {
  if (clickLock.has(el)) return false
  clickLock.set(el, 1)
  queueMicrotask(() => {
    setTimeout(() => clickLock.delete(el), 0)
  })
  el.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true, cancelable: true }))
  return true
}

/** One Enter attempt: keydown, keypress, and keyup. A second call in the same turn does nothing. */
export function pressEnterSequence(el: Element): boolean {
  if (clickLock.has(el)) return false
  clickLock.set(el, 1)
  queueMicrotask(() => {
    setTimeout(() => clickLock.delete(el), 0)
  })
  const init: KeyboardEventInit & { keyCode?: number; which?: number } = {
    key: "Enter",
    code: "Enter",
    keyCode: 13,
    which: 13,
    bubbles: true,
    cancelable: true,
  }
  el.dispatchEvent(new KeyboardEvent("keydown", init))
  el.dispatchEvent(new KeyboardEvent("keypress", init))
  el.dispatchEvent(new KeyboardEvent("keyup", init))
  return true
}

/** One pointer gesture ending in a single click. Does not also call element.click(). */
export function pointerClick(el: Element): void {
  if (typeof (el as HTMLElement).focus === "function") (el as HTMLElement).focus()
  const view = el.ownerDocument?.defaultView ?? undefined
  const common = { bubbles: true, cancelable: true, view }
  try {
    el.dispatchEvent(new PointerEvent("pointerdown", common))
  } catch {
    // PointerEvent can be missing in a test realm.
  }
  el.dispatchEvent(new MouseEvent("mousedown", common))
  try {
    el.dispatchEvent(new PointerEvent("pointerup", common))
  } catch {
    // Same as pointerdown.
  }
  el.dispatchEvent(new MouseEvent("mouseup", common))
  el.dispatchEvent(new MouseEvent("click", common))
}

/** Prefer the form's own submit when the button is inside one. Returns false if there is no form. */
export function requestSubmitButton(button: Element): boolean {
  const control = button as HTMLButtonElement
  const form = control.form
  if (!form || typeof form.requestSubmit !== "function") return false
  try {
    form.requestSubmit(control)
    return true
  } catch {
    return false
  }
}

export function composerText(el: Element): string {
  if ("value" in el && typeof (el as HTMLTextAreaElement).value === "string") return (el as HTMLTextAreaElement).value
  return el.textContent ?? ""
}

/** True when the chat accepted the message: the box cleared, a reply or stop appeared, or the text showed up as a user turn. */
export function sendLanded(doc: ParentNode, composer: Element, beforeAssistant: string, previousComposer: string): boolean {
  const now = composerText(composer).trim()
  const placeholder = (composer.getAttribute("placeholder") ?? "").toLowerCase()
  if (/ask, create images, or build anything/.test(placeholder) && now.length < 12) return true
  if (previousComposer.trim().length > 12 && now.length < previousComposer.trim().length * 0.25) return true
  const reply = assistantText(doc, [], composer)
  if (reply && reply !== beforeAssistant) return true
  if (ackReply(doc, composer)) return true
  if (stopControlActive(doc, [])) return true
  const probe = previousComposer.trim().slice(0, 24)
  if (probe.length > 8 && userTurnHas(doc, composer, probe)) return true
  return false
}

function userTurnHas(doc: ParentNode, composer: Element, probe: string): boolean {
  let nodes: Element[] = []
  try {
    nodes = queryAllDeep(doc, "div, p, span, article")
  } catch {
    return false
  }
  return nodes.some((el) => {
    if (el === composer || composer.contains(el) || el.contains(composer) || isIgnoredRegion(el)) return false
    const text = (el.textContent ?? "").trim()
    return text.length < 8000 && text.includes(probe)
  })
}

const ACK_PATTERN = /\bRECEIVED(?:\s+(?:FILES|INSTRUCTIONS))?\s+\d+\b/i

function ackLabel(text: string): string {
  const compact = text.replace(/\s+/g, " ").trim()
  const match = compact.match(ACK_PATTERN)
  if (!match?.[0]) return ""
  if (compact.length > match[0].length + 30) return ""
  return match[0].replace(/\s+/g, " ").toUpperCase()
}

export function ackReply(root: ParentNode, composer: Element | null): string {
  let nodes: Element[] = []
  try {
    nodes = queryAllDeep(root, "div, p, span, article")
  } catch {
    return ""
  }
  const hits = nodes.filter((el) => {
    if (isIgnoredRegion(el) || (composer && (el === composer || composer.contains(el) || el.contains(composer)))) return false
    return Boolean(ackLabel(el.textContent ?? ""))
  })
  return ackLabel(hits[hits.length - 1]?.textContent ?? "")
}

export function replyActionsVisible(root: ParentNode): boolean {
  let nodes: Element[] = []
  try {
    nodes = queryAllDeep(root, "button, [role='button']")
  } catch {
    return false
  }
  return nodes.some((el) => {
    if (isIgnoredRegion(el) || isHiddenControl(el)) return false
    return /\b(copy|regenerate|retry|rewrite)\b/i.test(buttonLabel(el))
  })
}

export function describeMessages(root: ParentNode, limit = 4): string {
  let nodes: Element[] = []
  try {
    nodes = queryAllDeep(root, "div, p, article")
  } catch {
    return "Messages: none."
  }
  const lines = nodes
    .filter((el) => !isIgnoredRegion(el))
    .map((el) => (el.textContent ?? "").trim().replace(/\s+/g, " "))
    .filter((text) => text.length > 2 && text.length < 180)
    .slice(-limit)
  if (lines.length === 0) return "Messages: none."
  return `Messages: ${lines.join(" | ")}.`
}

/** Click Send once, or press Enter once when the page has not drawn a send button yet. */
export function submitOnce(composer: Element, submit: Element | null): "click" | "enter" | "blocked" {
  if (submit) return clickElement(submit) ? "click" : "blocked"
  return pressEnterOnce(composer) ? "enter" : "blocked"
}

export function clickElement(el: Element): boolean {
  if (clickLock.has(el)) return false
  clickLock.set(el, 1)
  queueMicrotask(() => {
    setTimeout(() => clickLock.delete(el), 0)
  })
  const node = el as HTMLElement
  if (typeof node.focus === "function") node.focus()
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

function attachmentNames(files: WebChatFile[]): string[] {
  const names = new Set<string>()
  for (const file of files) {
    const raw = file.filename.trim().toLowerCase()
    const named = textFilename(file.filename).toLowerCase()
    if (raw.length > 2) names.add(raw)
    if (named.length > 2) names.add(named)
    const stem = named.replace(/\.txt$/i, "")
    if (stem.length > 2) names.add(stem)
  }
  return [...names]
}

function attachmentState(el: Element): string {
  return `${el.getAttribute("data-attachment-state") ?? ""} ${el.getAttribute("data-state") ?? ""}`.toLowerCase()
}

function isPendingAttachment(el: Element): boolean {
  return /\b(pending|uploading|processing)\b/.test(attachmentState(el))
}

/** True when the chat shows the attached file, not merely that the input accepted a FileList. */
export function attachmentReady(root: ParentNode, files: WebChatFile[], selectors: string[] = ATTACHMENT_SELECTORS): boolean {
  const names = attachmentNames(files)
  const seen = new Set<Element>()
  const list = selectors.length > 0 ? selectors : ATTACHMENT_SELECTORS
  const consider = (node: Element): boolean => {
    if (seen.has(node) || isIgnoredRegion(node)) return false
    if (node.tagName === "INPUT" || node.tagName === "TEXTAREA" || node.tagName === "SCRIPT" || node.tagName === "STYLE") return false
    if (node.getAttribute("contenteditable") === "true" || node.getAttribute("role") === "textbox") return false
    seen.add(node)
    if (isPendingAttachment(node)) return false
    const state = attachmentState(node)
    if (/\b(ready|complete|uploaded|attached)\b/.test(state)) return true
    const label = (node.getAttribute("aria-label") ?? "").toLowerCase()
    const text = (node.textContent ?? "").trim().toLowerCase()
    const short = text.length > 0 && text.length < 180
    return names.some((name) => label.includes(name) || (short && text.includes(name)))
  }
  for (const selector of [...list, "[data-attachment-state]", "[class*='file']", "[class*='chip']", "[aria-label*='Remove']"]) {
    let nodes: Element[] = []
    try {
      nodes = queryAllDeep(root, selector)
    } catch {
      continue
    }
    if (nodes.some(consider)) return true
  }
  let all: Element[] = []
  try {
    all = queryAllDeep(root, "div, span, li, button, p")
  } catch {
    all = []
  }
  return all.some(consider)
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

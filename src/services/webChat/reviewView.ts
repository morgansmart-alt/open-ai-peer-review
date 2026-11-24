import { CRITERION_PROFILES } from "../../domain/profiles.ts"
import { primaryWebChatIds, webChatProviders } from "../../../extension/adapters/index.ts"

export interface ReviewCard {
  title: string
  overall: number
  recommendation: string
  summary: string
  mismatch: string | null
  label: string
  defendedOverall?: number | null
  defendedLabel?: string
  scores?: { criterionId: string; score: number }[]
  feedback?: { label: string; text: string }[]
  model?: string
  notice?: string
}

export interface HistoryItem {
  id: string
  title: string
  overall: number
  doi?: string
  url?: string
  site?: string
  model?: string
  createdAt?: string
  mismatch?: boolean
  selected?: boolean
}

export interface PublicationDraft {
  title: string
  authors: string[]
  doi: string
  url: string
}

export interface ReviewModel {
  showOnboarding: boolean
  providerId: string
  /** Paper-type profile. Absent means device or engineering. */
  profileId?: string
  fileName: string
  link: string
  publication: PublicationDraft | null
  defend: boolean
  defenceRounds: number
  status: string
  error: string
  busy: boolean
  result: ReviewCard | null
  history: HistoryItem[]
}

export interface ReviewActions {
  onDismissOnboarding(): void
  onProvider(id: string): void
  onProfile?(id: string): void
  onFile(file: File): void
  onLink(value: string): void
  onLookup(): void
  onDefend(on: boolean): void
  onRounds(rounds: number): void
  onStop(): void
  onReview(): void
  onExport(): void
  onToggle(id: string): void
  onSend(id: string): void
  onSendSelected(): void
}

const SITE_LINKS = [
  { href: "https://grok.com/", label: "Grok" },
  { href: "https://gemini.google.com/app", label: "Gemini" },
  { href: "https://claude.ai/new", label: "Claude" },
  { href: "https://x.com/i/grok", label: "Grok on X" },
]

function el<K extends keyof HTMLElementTagNameMap>(parent: ParentNode, tag: K, text?: string, className?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  if (text) node.textContent = text
  if (className) node.className = className
  parent.append(node)
  return node
}

function providerOptions(select: HTMLSelectElement, selected: string): void {
  const primary = new Set(primaryWebChatIds)
  const main = document.createElement("optgroup")
  main.label = "Start here"
  const more = document.createElement("optgroup")
  more.label = "Other chats"
  for (const provider of webChatProviders) {
    const option = document.createElement("option")
    option.value = provider.id
    option.textContent = provider.label
    option.selected = provider.id === selected
    ;(primary.has(provider.id) ? main : more).append(option)
  }
  select.append(main, more)
}

/** Draws the side panel. Call it again when the model changes. */
export function renderReviewApp(root: HTMLElement, model: ReviewModel, actions: ReviewActions): void {
  root.replaceChildren()
  if (model.showOnboarding) {
    const welcome = el(root, "section")
    el(welcome, "h1", "Review a paper")
    el(welcome, "p", "Two steps. You do the first one once.")
    const list = el(welcome, "ol")
    const signIn = el(list, "li")
    el(signIn, "p", "Sign in to a chat you already use. Open one of these and sign in there. This panel never sees your password.")
    const links = el(signIn, "p", undefined, "links")
    for (const site of SITE_LINKS) {
      const anchor = el(links, "a", site.label)
      anchor.href = site.href
      anchor.target = "_blank"
      anchor.rel = "noopener noreferrer"
    }
    const second = el(list, "li")
    el(second, "p", "Come back here. Choose that chat, add your paper, and click Review my paper.")
    const done = el(welcome, "button", "I'm signed in", "primary")
    done.type = "button"
    done.id = "onboard-done"
    done.addEventListener("click", () => actions.onDismissOnboarding())
    return
  }

  const form = el(root, "section")
  el(form, "h1", "Review a paper")
  el(form, "p", "Pick a chat you are signed into. Add a PDF or a text file, or paste a Zenodo, DOI, or arXiv link. A chat tab opens in front of you.")

  const chatLabel = el(form, "label", "Chat")
  const select = document.createElement("select")
  select.id = "provider"
  providerOptions(select, model.providerId)
  select.addEventListener("change", () => actions.onProvider(select.value))
  chatLabel.append(select)

  const profileLabel = el(form, "label", "Paper type")
  const profile = document.createElement("select")
  profile.id = "criterion-profile"
  const selectedProfile = model.profileId || "device"
  for (const item of CRITERION_PROFILES) {
    const option = document.createElement("option")
    option.value = item.id
    option.textContent = item.label
    option.selected = item.id === selectedProfile
    profile.append(option)
  }
  profile.addEventListener("change", () => actions.onProfile?.(profile.value))
  profileLabel.append(profile)
  const profileNote = CRITERION_PROFILES.find((item) => item.id === selectedProfile)
  if (profileNote) el(form, "p", profileNote.summary, "note")

  const fileLabel = el(form, "label", "Paper")
  const input = document.createElement("input")
  input.id = "paper"
  input.type = "file"
  input.accept = ".pdf,.txt,.md,.markdown,.text,application/pdf,text/plain"
  input.addEventListener("change", () => {
    const file = input.files?.[0]
    if (file) actions.onFile(file)
  })
  fileLabel.append(input)
  if (model.fileName) el(form, "p", model.fileName, "file-name")

  const linkLabel = el(form, "label", "Publication link")
  const link = document.createElement("input")
  link.id = "publication-link"
  link.type = "url"
  link.placeholder = "https://zenodo.org/records/…"
  link.value = model.link
  link.addEventListener("input", () => actions.onLink(link.value))
  linkLabel.append(link)
  const lookup = el(form, "button", "Look up this link", "quiet")
  lookup.type = "button"
  lookup.id = "lookup"
  lookup.disabled = model.busy
  lookup.addEventListener("click", () => actions.onLookup())
  if (model.publication) {
    const preview = el(form, "div", undefined, "preview")
    preview.id = "publication-preview"
    el(preview, "p", model.publication.title, "score")
    el(preview, "p", model.publication.authors.join(", ") || "Authors were not listed")
    el(preview, "p", [model.publication.doi, model.publication.url].filter(Boolean).join(" · "), "note")
  }

  const defendLabel = el(form, "label", "Defend my paper")
  const defend = document.createElement("input")
  defend.id = "defend"
  defend.type = "checkbox"
  defend.checked = model.defend
  defend.addEventListener("change", () => actions.onDefend(defend.checked))
  defendLabel.prepend(defend)
  const roundsLabel = el(form, "label", "Defence rounds")
  const rounds = document.createElement("select")
  rounds.id = "defence-rounds"
  for (const count of [1, 2, 3]) {
    const option = document.createElement("option")
    option.value = String(count)
    option.textContent = String(count)
    option.selected = count === model.defenceRounds
    rounds.append(option)
  }
  rounds.addEventListener("change", () => actions.onRounds(Number(rounds.value)))
  roundsLabel.append(rounds)

  const ready = Boolean(model.fileName || model.publication)
  const run = el(form, "button", model.busy ? "Working…" : "Review my paper", "primary")
  run.type = "button"
  run.id = "review"
  run.disabled = model.busy || !ready
  run.addEventListener("click", () => actions.onReview())
  if (model.busy) {
    const stop = el(form, "button", "Stop", "quiet")
    stop.type = "button"
    stop.id = "stop"
    stop.addEventListener("click", () => actions.onStop())
  }

  if (model.status) {
    const status = el(form, "p", model.status, "status")
    status.id = "status"
    status.setAttribute("role", "status")
  }
  if (model.error) {
    const error = el(form, "p", model.error, "error")
    error.setAttribute("role", "alert")
  }

  if (model.result) {
    const card = el(form, "article", undefined, "result")
    card.id = "result"
    el(card, "p", model.result.label, "label")
    el(card, "h2", model.result.title)
    el(card, "p", `Blind score ${Math.round(model.result.overall)} out of 100 · ${model.result.recommendation}`, "score")
    if (model.result.model) {
      const line = el(card, "p", `Model: ${model.result.model}`, "note")
      line.id = "chat-model"
    }
    if (model.result.defendedOverall != null) {
      el(card, "p", `${model.result.defendedLabel || "after author defence"} ${Math.round(model.result.defendedOverall)} out of 100`, "score")
    }
    if (model.result.notice) {
      const note = el(card, "p", model.result.notice, "mismatch")
      note.id = "text-page-note"
    }
    if (model.result.mismatch) el(card, "p", model.result.mismatch, "mismatch")
    el(card, "p", model.result.summary)
    if (model.result.scores && model.result.scores.length > 0) {
      const list = el(card, "ul")
      list.id = "criterion-scores"
      for (const score of model.result.scores) {
        el(list, "li", `${score.criterionId}: ${Math.round(score.score)}`)
      }
    }
    if (model.result.feedback && model.result.feedback.length > 0) {
      const details = el(card, "details")
      details.id = "air-feedback"
      const summary = el(details, "summary", "Feedback on AIR")
      summary.id = "air-feedback-summary"
      for (const note of model.result.feedback) {
        el(details, "p", `${note.label}: ${note.text}`)
      }
    }
    el(card, "p", "This score stays in this browser until you send it. It is labelled free web-chat, uncalibrated.", "note")
  }

  if (model.history.length > 0) {
    el(form, "h2", "Saved on this browser")
    const history = el(form, "ul")
    history.id = "results"
    for (const item of model.history) {
      const row = el(history, "li")
      const box = document.createElement("input")
      box.type = "checkbox"
      box.checked = Boolean(item.selected)
      box.disabled = Boolean(item.mismatch)
      box.setAttribute("aria-label", `Select ${item.title}`)
      box.addEventListener("change", () => actions.onToggle(item.id))
      row.append(box, document.createTextNode(` ${item.title}`))
      const detail = [item.doi || item.url, item.site, item.model, item.createdAt ? item.createdAt.slice(0, 16).replace("T", " ") : "", `${Math.round(item.overall)} / 100`]
        .filter(Boolean)
        .join(" · ")
      el(row, "p", detail, "note")
      if (item.mismatch) el(row, "p", "Scoring mismatch, needs re-check. Not sent.", "mismatch")
      const send = el(row, "button", "Send to Global Good Idea leaderboard", "quiet")
      send.type = "button"
      send.disabled = Boolean(item.mismatch) || model.busy
      send.addEventListener("click", () => actions.onSend(item.id))
    }
    const sendSelected = el(form, "button", "Send selected", "quiet")
    sendSelected.type = "button"
    sendSelected.id = "send-selected"
    sendSelected.disabled = model.busy || !model.history.some((item) => item.selected && !item.mismatch)
    sendSelected.addEventListener("click", () => actions.onSendSelected())
    const save = el(form, "button", "Save a copy", "quiet")
    save.type = "button"
    save.id = "export"
    save.addEventListener("click", () => actions.onExport())
  }
}

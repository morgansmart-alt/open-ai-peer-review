import {
  EXAMPLE_GOOGLE_AI_MODE_URL,
  MAX_CONVERSATION_LINKS,
  PRIVATE_CONTEXT_NOTICE,
  providerFromUrl,
} from "../domain/conversationLinks.ts"
import { fieldClass } from "./ui.tsx"

export interface LinkDraft {
  url: string
  note: string
}

export function emptyLinkDraft(): LinkDraft {
  return { url: "", note: "" }
}

export function exampleLinkDraft(): LinkDraft {
  return { url: EXAMPLE_GOOGLE_AI_MODE_URL, note: "Example only. Replace or clear this before a real reading." }
}

export function PrivateLinksField({
  rows,
  onChange,
  title = "Private AI context links (sent only to your chosen AI reviewer, never published)",
}: {
  rows: LinkDraft[]
  onChange: (rows: LinkDraft[]) => void
  title?: string
}) {
  return (
    <details open data-testid="private-links" className="mt-4 rounded-2xl border border-line bg-white/50 p-3">
      <summary className="cursor-pointer text-sm font-medium">{title}</summary>
      <p className="mt-2 text-xs text-ink-soft">{PRIVATE_CONTEXT_NOTICE}</p>
      <ul className="mt-3 space-y-3">
        {rows.map((row, index) => (
          <li key={index} className="grid gap-2">
            <label className="text-xs text-ink-soft">
              https link
              <input
                className={`${fieldClass} mt-1`}
                value={row.url}
                placeholder="https://"
                onChange={(event) => onChange(rows.map((item, itemIndex) => (itemIndex === index ? { ...item, url: event.target.value } : item)))}
              />
            </label>
            {row.url.trim().startsWith("https://") && <p className="text-xs text-teal">{providerFromUrl(row.url)}</p>}
            <label className="text-xs text-ink-soft">
              Optional note
              <input
                className={`${fieldClass} mt-1`}
                value={row.note}
                placeholder="What this conversation covers"
                onChange={(event) => onChange(rows.map((item, itemIndex) => (itemIndex === index ? { ...item, note: event.target.value } : item)))}
              />
            </label>
          </li>
        ))}
      </ul>
      {rows.length < MAX_CONVERSATION_LINKS && (
        <button type="button" className="mt-3 text-sm text-teal underline" onClick={() => onChange([...rows, emptyLinkDraft()])}>
          Add another link
        </button>
      )}
    </details>
  )
}

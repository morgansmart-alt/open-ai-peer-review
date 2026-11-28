import { useEffect, useState } from "react"
import { webChatProviders } from "../../extension/adapters/index.ts"
import { btnPrimary, btnQuiet, fieldClass } from "./ui.tsx"
import { pingWebChatExtension } from "../services/webChat/client.ts"

export function WebChatPanel({
  busy,
  warning,
  onRun,
  onCopy,
  onImport,
}: {
  busy: boolean
  warning: string | null
  onRun: (providerId: string) => void
  onCopy: (providerId: string) => void
  onImport: (file: File) => void
}) {
  const [providerId, setProviderId] = useState(webChatProviders[0]?.id ?? "grok")
  const [ready, setReady] = useState<boolean | null>(null)
  const [nonce, setNonce] = useState(0)
  const provider = webChatProviders.find((item) => item.id === providerId) ?? webChatProviders[0]

  useEffect(() => {
    let cancelled = false
    void pingWebChatExtension().then((connected) => {
      if (!cancelled) setReady(connected)
    })
    return () => {
      cancelled = true
    }
  }, [nonce])

  return (
    <div data-testid="web-chat-panel" className="mt-4 rounded-2xl border border-dashed border-line p-3">
      <h3 className="text-sm font-medium">Review with a web chat (free, uses your own signed-in chat)</h3>
      <p className="mt-1 text-xs text-ink-soft">
        The score is labelled free web-chat, uncalibrated. It uses the chat you are already signed into. AIR does not see your password. You can publish it to the leaderboard as an uncalibrated web-chat review. It does not enter the calibrated ranking.
      </p>
      <p className="mt-2 text-xs" role="status">
        {ready === null ? "Looking for the extension…" : ready ? "Extension connected." : "Load the extension, then reload this page."}
      </p>
      <ol className="mt-2 list-decimal space-y-1 pl-4 text-xs text-ink-soft">
        <li>Download release/air-web-chat.zip, unzip it, and in chrome://extensions turn on Developer mode and choose Load unpacked. The plain steps are in INSTALL.md. No terminal.</li>
        <li>Click the AIR icon. Sign in to a chat, pick a PDF, and click Review my paper. The score is labelled free web-chat, uncalibrated. Send selected and Send to Global Good Idea leaderboard post the same score. A global goals score goes with that post as a bonus and is not part of the overall. The row then says Published.</li>
        <li>From this page you can still hand the extension a Zenodo record, or import a JSON copy with the button below.</li>
      </ol>
      <label className="mt-3 block text-xs text-ink-soft">
        Chat site
        <select className={`${fieldClass} mt-1`} value={providerId} aria-label="Web chat site" onChange={(event) => setProviderId(event.target.value)}>
          {webChatProviders.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
      </label>
      {provider && <p className="mt-2 text-xs text-ink-soft">{provider.limits}</p>}
      {warning && <p className="mt-2 text-xs text-gold">{warning} Click Run again to send it.</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" data-testid="web-chat-run" className={btnPrimary} disabled={busy || ready !== true} onClick={() => onRun(providerId)}>
          Run free web-chat review
        </button>
        <button type="button" className={btnQuiet} disabled={busy} onClick={() => onCopy(providerId)}>
          Copy packet
        </button>
        <button type="button" className={btnQuiet} onClick={() => setNonce((value) => value + 1)}>
          Check extension
        </button>
        <label className={btnQuiet}>
          Import JSON
          <input
            className="sr-only"
            type="file"
            accept="application/json,.json"
            aria-label="Import a web-chat JSON file"
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) onImport(file)
              event.target.value = ""
            }}
          />
        </label>
      </div>
    </div>
  )
}

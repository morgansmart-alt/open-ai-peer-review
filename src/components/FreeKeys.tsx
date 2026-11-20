import { useState } from "react"
import { Link } from "react-router-dom"
import type { ProviderId } from "../domain/types.ts"
import { useAir } from "../context/AirContext.tsx"
import { describeKeyStatus, testProviderKey, type KeyTestResult } from "../services/keyProbe.ts"
import { clearRouterHealth } from "../services/routerStore.ts"
import { btnPrimary, btnQuiet, fieldClass } from "./ui.tsx"

const CARDS: { id: ProviderId; title: string; goodFor: string; signup: string }[] = [
  { id: "gemini", title: "Gemini", goodFor: "Whole-paper reviews. AIR rotates its free models.", signup: "https://aistudio.google.com/apikey" },
  { id: "openrouter", title: "OpenRouter", goodFor: "A second model family. Free model ids end in :free.", signup: "https://openrouter.ai/settings/keys" },
  { id: "groq", title: "Groq", goodFor: "Fast chat and short checks. Not a whole paper.", signup: "https://console.groq.com/keys" },
  { id: "cohere", title: "Cohere", goodFor: "Optional third family for checks.", signup: "https://dashboard.cohere.com/api-keys" },
]

export function FreeKeys() {
  const air = useAir()
  const [visible, setVisible] = useState<Record<string, boolean>>({})
  const [results, setResults] = useState<Record<string, KeyTestResult>>({})
  const [busy, setBusy] = useState(false)

  async function testOne(provider: ProviderId) {
    const key = air.providerSettings.keys[provider] ?? ""
    const result = await testProviderKey(provider, key)
    setResults((current) => ({ ...current, [provider]: result }))
  }

  async function testAll() {
    setBusy(true)
    const present = CARDS.filter((card) => (air.providerSettings.keys[card.id] ?? "").trim())
    const next: Record<string, KeyTestResult> = {}
    for (const card of present) {
      next[card.id] = await testProviderKey(card.id, air.providerSettings.keys[card.id] ?? "")
    }
    setResults((current) => ({ ...current, ...next }))
    setBusy(false)
  }

  const ready = CARDS.filter((card) => results[card.id]?.status === "works").map((card) => card.title)

  return (
    <section className="mt-5" aria-label="Free keys">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-serif text-xl">Free keys</h3>
        <button type="button" className={btnPrimary} disabled={busy} onClick={() => void testAll()}>
          {busy ? "Testing…" : "Test all keys"}
        </button>
      </div>
      <label className="mt-3 flex items-start gap-3 text-sm">
        <input type="checkbox" className="mt-1" checked={air.settings.autoPick} onChange={(event) => air.setAutoPick(event.target.checked)} />
        <span>
          <span className="font-medium">Auto-pick</span>
          <span className="mt-1 block text-ink-soft">AIR tries the free model that fits the job, then the next one if a provider is busy or out of quota.</span>
        </span>
      </label>
      <div className="mt-3 space-y-3">
        {CARDS.map((card) => {
          const result = results[card.id]
          return (
            <fieldset key={card.id} className="rounded-2xl border border-line bg-white/50 p-3">
              <legend className="px-1 text-sm font-medium">{card.title}</legend>
              <p className="text-xs text-ink-soft">{card.goodFor}</p>
              <a className="mt-1 inline-block text-xs text-teal underline" href={card.signup} target="_blank" rel="noreferrer">
                Open sign-up page
              </a>
              <label className="mt-2 block text-xs text-ink-soft" htmlFor={`free-key-${card.id}`}>
                API key
              </label>
              <div className="mt-1 flex gap-2">
                <input
                  id={`free-key-${card.id}`}
                  className={fieldClass}
                  type={visible[card.id] ? "text" : "password"}
                  autoComplete="off"
                  value={air.providerSettings.keys[card.id] ?? ""}
                  onChange={(event) => air.setKey(card.id, event.target.value)}
                />
                <button type="button" className={btnQuiet} onClick={() => setVisible((current) => ({ ...current, [card.id]: !current[card.id] }))}>
                  {visible[card.id] ? "Hide" : "Show"}
                </button>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <button type="button" className={btnQuiet} onClick={() => void testOne(card.id)}>
                  Test
                </button>
                {result && <span className="text-xs text-ink-soft">{describeKeyStatus(result)}. {result.detail}</span>}
              </div>
            </fieldset>
          )
        })}
      </div>
      <p className="mt-3 text-sm text-ink-soft">
        {ready.length > 0 ? `Working now: ${ready.join(", ")}.` : "No free key has been tested yet."}{" "}
        <Link className="text-teal underline" to="/keys">How to get a key</Link>
      </p>
      <button
        type="button"
        className={`${btnQuiet} mt-3`}
        onClick={() => {
          air.forgetKeys()
          clearRouterHealth()
        }}
      >
        Forget all keys
      </button>
    </section>
  )
}

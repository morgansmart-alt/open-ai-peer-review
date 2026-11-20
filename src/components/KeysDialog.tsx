import { useEffect, useId, useRef } from "react"
import { keySlot, providerLabel, providerOrder } from "../domain/assessors.ts"
import type { ProviderId } from "../domain/types.ts"
import { clearBrowserData } from "../services/storage.ts"
import { useAir } from "../context/AirContext.tsx"
import { btnPrimary, btnQuiet, fieldClass } from "./ui.tsx"
import { FreeKeys } from "./FreeKeys.tsx"

export function KeysDialog() {
  const air = useAir()
  const titleId = useId()
  const first = useRef<HTMLInputElement>(null)
  const { keysOpen, setKeysOpen } = air
  useEffect(() => {
    if (!keysOpen) return
    first.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setKeysOpen(false)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [keysOpen, setKeysOpen])

  if (!keysOpen) return null
  const providers = providerOrder.filter((provider) => provider !== "compatible" || air.profiles.some((profile) => profile.provider === "compatible" && !profile.builtin))
  return (
    <div className="fixed inset-0 z-40">
      <button type="button" className="absolute inset-0 bg-ink/40" aria-label="Close settings" onClick={() => air.setKeysOpen(false)} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="absolute inset-y-0 right-0 w-full max-w-lg overflow-y-auto border-l border-line bg-paper p-5 shadow-xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id={titleId} className="font-serif text-2xl">
              Keys and demo mode
            </h2>
            <p className="mt-1 text-sm text-ink-soft">
              Keys stay in this browser. AIR has no account and no server log of them. Calls go from this page to the provider.
            </p>
          </div>
          <button type="button" className={btnQuiet} onClick={() => air.setKeysOpen(false)}>
            Close
          </button>
        </div>
        <label className="mt-5 flex items-start gap-3 text-sm">
          <input
            ref={first}
            type="checkbox"
            className="mt-1"
            checked={air.settings.demoMode}
            onChange={(event) => air.setDemoMode(event.target.checked)}
          />
          <span>
            <span className="font-medium text-ink">Demo mode</span>
            <span className="mt-1 block text-ink-soft">
              Build a full reading with a local heuristic, so you can try the report, the panel, and the board without a key. Turn this off to call a model.
            </span>
          </span>
        </label>
        <label className="mt-4 flex items-start gap-3 text-sm">
          <input type="checkbox" className="mt-1" checked={air.settings.remember} onChange={(event) => air.setRemember(event.target.checked)} />
          <span>
            <span className="font-medium text-ink">Remember keys in this browser</span>
            <span className="mt-1 block text-ink-soft">
              Off by default: keys live in memory until you close the tab. On: they sit in localStorage on this device. They are still never sent to AIR.
            </span>
          </span>
        </label>
        <FreeKeys />
        <div className="mt-5 space-y-4">
          {providers
            .filter((provider) => provider !== "gemini" && provider !== "openrouter" && provider !== "groq" && provider !== "cohere")
            .map((provider) => (
              <ProviderFields key={provider} provider={provider} />
            ))}
        </div>
        <NodeFields />
        <AddProfile />
        <div className="mt-6 flex flex-wrap gap-2">
          <button
            type="button"
            className={btnQuiet}
            onClick={() => {
              clearBrowserData()
              window.location.reload()
            }}
          >
            Clear this browser’s AIR data
          </button>
          <button type="button" className={btnPrimary} onClick={() => air.setKeysOpen(false)}>
            Done
          </button>
        </div>
      </div>
    </div>
  )
}

function ProviderFields({ provider }: { provider: ProviderId }) {
  const air = useAir()
  const slot = provider
  const profiles = air.profiles.filter((profile) => profile.builtin && profile.provider === provider)
  return (
    <fieldset className="rounded-2xl border border-line bg-white/50 p-3">
      <legend className="px-1 text-sm font-medium">{providerLabel(provider)}</legend>
      <label className="mt-2 block text-xs text-ink-soft" htmlFor={`key-${slot}`}>
        API key
      </label>
      <input
        id={`key-${slot}`}
        className={fieldClass}
        type="password"
        autoComplete="off"
        value={air.providerSettings.keys[slot] ?? ""}
        onChange={(event) => air.setKey(slot, event.target.value)}
      />
      <label className="mt-2 block text-xs text-ink-soft" htmlFor={`base-${slot}`}>
        Base URL
      </label>
      <input
        id={`base-${slot}`}
        className={fieldClass}
        value={air.settings.baseUrls[slot] ?? profiles[0]?.defaultBaseUrl ?? ""}
        onChange={(event) => air.setBaseUrl(slot, event.target.value)}
      />
      {profiles.map((profile) => (
        <label key={profile.id} className="mt-2 block text-xs text-ink-soft">
          {profile.name} model
          <input
            className={`${fieldClass} mt-1`}
            value={air.settings.models[profile.id] ?? profile.defaultModel}
            onChange={(event) => air.setModel(profile.id, event.target.value)}
          />
        </label>
      ))}
    </fieldset>
  )
}

function NodeFields() {
  const air = useAir()
  return (
    <fieldset className="mt-4 rounded-2xl border border-line bg-white/50 p-3">
      <legend className="px-1 text-sm font-medium">This browser’s node</legend>
      <label className="mt-2 block text-xs text-ink-soft" htmlFor="node-name">
        Pseudonym
      </label>
      <input id="node-name" className={fieldClass} value={air.settings.nodeName} onChange={(event) => air.setNodeName(event.target.value)} />
      <label className="mt-2 block text-xs text-ink-soft" htmlFor="author-name">
        Name to use if you claim a record
      </label>
      <input id="author-name" className={fieldClass} value={air.settings.authorName} onChange={(event) => air.setAuthorName(event.target.value)} />
      <label className="mt-2 block text-xs text-ink-soft" htmlFor="orcid">
        ORCID, if you want a creator match
      </label>
      <input
        id="orcid"
        className={fieldClass}
        placeholder="0000-0000-0000-0000"
        value={air.settings.orcid}
        onChange={(event) => air.setOrcid(event.target.value)}
      />
      <p className="mt-2 text-xs text-ink-soft">AIR cannot sign you in with ORCID. A match only means the number you typed is already written on the Zenodo record.</p>
    </fieldset>
  )
}

function AddProfile() {
  const air = useAir()
  return (
    <form
      className="mt-4 rounded-2xl border border-line bg-white/50 p-3"
      onSubmit={(event) => {
        event.preventDefault()
        const data = new FormData(event.currentTarget)
        const name = String(data.get("name") ?? "").trim()
        const model = String(data.get("model") ?? "").trim()
        const baseUrl = String(data.get("base") ?? "").trim()
        const key = String(data.get("key") ?? "").trim()
        if (!name || !model || !baseUrl) return
        const id = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "custom"
        air.addProfile({
          id,
          name,
          shortName: name.slice(0, 12),
          provider: "compatible",
          defaultModel: model,
          defaultBaseUrl: baseUrl,
          blurb: "A custom OpenAI-compatible assessor added in this browser.",
          builtin: false,
        })
        if (key) air.setKey(id, key)
        event.currentTarget.reset()
      }}
    >
      <h3 className="text-sm font-medium">Add an OpenAI-compatible assessor</h3>
      <p className="mt-1 text-xs text-ink-soft">It gets its own column, profile page, and sort. The key stays in this browser under the profile id ({keySlot({ builtin: false, id: "example", name: "", shortName: "", provider: "compatible", defaultModel: "", defaultBaseUrl: "", blurb: "" })}).</p>
      <div className="mt-2 grid gap-2">
        <input name="name" className={fieldClass} placeholder="Display name" aria-label="Custom assessor name" />
        <input name="model" className={fieldClass} placeholder="Model id" aria-label="Custom model id" />
        <input name="base" className={fieldClass} placeholder="https://host/v1" aria-label="Custom base URL" />
        <input name="key" type="password" autoComplete="off" className={fieldClass} placeholder="API key" aria-label="Custom API key" />
        <button type="submit" className={btnQuiet}>
          Add profile
        </button>
      </div>
    </form>
  )
}

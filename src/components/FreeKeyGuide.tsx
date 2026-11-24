import { useEffect, useState } from "react"
import { ExternalLink } from "./ui.tsx"
import {
  FREE_KEY_GUIDE_TITLE,
  GEMINI_KEY_STEPS,
  GEMINI_KEY_URL,
  KEY_STAYS_LOCAL_NOTE,
  OPENROUTER_KEY_NOTE,
  OPENROUTER_KEY_URL,
  WEBGPU_NOTE,
} from "../content/freeKeyGuide.ts"
import { webGpuStatus } from "../services/freeReview.ts"

export function FreeKeyGuide({ id = "free-key-guide" }: { id?: string }) {
  const [gpu, setGpu] = useState<"checking" | "ready" | "missing" | "unavailable">("checking")
  useEffect(() => {
    let cancelled = false
    void webGpuStatus()
      .then((status) => {
        if (!cancelled) setGpu(status)
      })
      .catch(() => {
        if (!cancelled) setGpu("unavailable")
      })
    return () => {
      cancelled = true
    }
  }, [])
  const gpuLabel =
    gpu === "checking"
      ? "Checking this browser for WebGPU…"
      : gpu === "ready"
        ? "This browser can run the no-key review. WebGPU is available."
        : gpu === "missing"
          ? "This browser has no WebGPU. Use a free Gemini or OpenRouter key instead."
          : "WebGPU is present, but this browser did not grant a GPU. Use a free key, or try Chrome or Edge."
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="rounded-2xl border border-line bg-white/70 p-4">
      <h3 id={`${id}-title`} className="font-serif text-xl">
        {FREE_KEY_GUIDE_TITLE}
      </h3>
      <p className="mt-1 text-sm text-ink-soft">
        An in-depth reading uses a key you create yourself. Gemini’s free tier is the easiest start, and it does not need a card. The key never goes to AIR’s servers.
      </p>
      <ol className="mt-3 space-y-2">
        {GEMINI_KEY_STEPS.map((step, index) => (
          <li key={step.title} className="text-sm">
            <span className="font-medium">
              {index + 1}. {step.title}.
            </span>{" "}
            <span className="text-ink-soft">{step.body}</span>
          </li>
        ))}
      </ol>
      <p className="mt-3 text-sm">
        <ExternalLink className="underline" href={GEMINI_KEY_URL}>
          Open Google AI Studio
        </ExternalLink>
      </p>
      <h4 className="mt-4 text-sm font-medium">OpenRouter, if you would rather</h4>
      <p className="mt-1 text-sm text-ink-soft">{OPENROUTER_KEY_NOTE}</p>
      <p className="mt-2 text-sm">
        <ExternalLink className="underline" href={OPENROUTER_KEY_URL}>
          Open OpenRouter keys
        </ExternalLink>
      </p>
      <h4 className="mt-4 text-sm font-medium">Or skip the key</h4>
      <p className="mt-1 text-sm text-ink-soft">{WEBGPU_NOTE}</p>
      <p className="mt-2 text-sm" role="status">
        {gpuLabel}
      </p>
      <p className="mt-3 text-sm text-ink-soft">{KEY_STAYS_LOCAL_NOTE}</p>
    </section>
  )
}

import { Link } from "react-router-dom"

const steps = [
  {
    title: "Google Gemini, for a whole paper",
    body: [
      "Open https://aistudio.google.com/apikey and sign in.",
      "Choose Create API key. A new project is fine.",
      "Copy the key.",
      "In AIR, open Keys, choose Gemini, paste the key, and press Test. You want Works.",
    ],
  },
  {
    title: "OpenRouter, for a second model family",
    body: [
      "Sign in at https://openrouter.ai.",
      "Open https://openrouter.ai/settings/keys and create a key named AIR.",
      "If it offers a credit limit, set it to 0 so the key cannot spend money.",
      "Copy it. OpenRouter shows a key only once.",
      "In AIR, paste it under OpenRouter and press Test.",
    ],
  },
  {
    title: "Groq, for fast chat and short checks",
    body: [
      "Sign up at https://console.groq.com.",
      "Open https://console.groq.com/keys and create a key named AIR.",
      "Copy it. It is shown only once.",
      "In AIR, paste it under Groq and press Test. Groq cannot read a whole paper in one call, so AIR uses it for short jobs.",
    ],
  },
  {
    title: "Cohere, optional third family",
    body: [
      "Sign up at https://dashboard.cohere.com.",
      "Open the API keys page. A trial key is often already there.",
      "Copy it and paste it under Cohere in AIR, then press Test.",
    ],
  },
]

export function KeysGuidePage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="font-serif text-4xl">Set up a free key</h1>
      <p className="mt-3 text-ink-soft">
        One key is enough to try a reading. Two keys from different families, Gemini and OpenRouter, let AIR publish a cross-checked review. Keys stay in this browser.
      </p>
      <ol className="mt-6 list-decimal space-y-3 pl-5 text-sm">
        <li>A key is like a password. Paste it only into AIR on your own device.</li>
        <li>AIR does not send keys to its own server. Leave Remember off unless you want them kept on this device.</li>
        <li>Do not add a payment card unless you mean to. These keys work without one.</li>
        <li>Use one account per provider. Extra accounts do not add free quota.</li>
        <li>Free Google keys may use public paper text to improve their models. AIR does not send private notes to those keys.</li>
      </ol>
      <div className="mt-8 space-y-6">
        {steps.map((step, index) => (
          <section key={step.title} className="rounded-3xl border border-line bg-white/60 p-4">
            <h2 className="font-serif text-2xl">
              {index + 1}. {step.title}
            </h2>
            <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm">
              {step.body.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ol>
          </section>
        ))}
      </div>
      <p className="mt-6 text-sm">
        The small on-device model needs no key. It is only a screening. <Link className="text-teal underline" to="/review">Back to a review</Link>
      </p>
    </div>
  )
}

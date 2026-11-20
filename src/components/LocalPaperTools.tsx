import { useState } from "react"
import type { CriteriaSet } from "../domain/types.ts"
import { detectLocalAi, downloadRatio, LOCAL_REQUIREMENTS, readPromptApi, type LocalAiStatus, type PromptSession } from "../services/localModel.ts"
import { askPrompt, assessPastedReply, buildGeminiHandoff, chunkForLocal, extractPrompt, LOCAL_SCREENING_LABEL, quotesInAnswer, summaryPrompt, type GeminiPlan } from "../services/localTasks.ts"
import { indexPaper, searchPaper } from "../services/paperSearch.ts"
import type { ZenodoRecord } from "../services/zenodo.ts"
import { ReportView } from "./ReportView.tsx"
import { btnPrimary, btnQuiet, fieldClass } from "./ui.tsx"

export function LocalPaperTools({
  record,
  criteria,
  documents,
  onRead,
}: {
  record: ZenodoRecord | null
  criteria: CriteriaSet
  documents: { filename: string; text: string }[]
  onRead: () => Promise<void>
}) {
  const [status, setStatus] = useState<LocalAiStatus | null>(null)
  const [progress, setProgress] = useState<number | null>(null)
  const [question, setQuestion] = useState("")
  const [answer, setAnswer] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [plan, setPlan] = useState<GeminiPlan>("free")
  const [pasted, setPasted] = useState("")
  const [modelName, setModelName] = useState("")
  const [handoffNote, setHandoffNote] = useState("")
  const [pastedReport, setPastedReport] = useState<ReturnType<typeof assessPastedReply> | null>(null)
  const corpus = documents.map((document) => document.text).join("\n\n")

  async function checkComputer() {
    setError(null)
    const next = await detectLocalAi()
    setStatus(next)
  }

  async function openSession(): Promise<PromptSession | null> {
    const api = readPromptApi()
    if (!api) {
      setError("This browser has no built-in model. Use a free key, or the copy-paste Gemini mode.")
      return null
    }
    const session = await api.create({
      monitor(monitor) {
        monitor.addEventListener("downloadprogress", (event) => {
          const ratio = downloadRatio(event as { loaded?: number; total?: number })
          if (ratio !== null) setProgress(ratio)
        })
      },
    })
    const contextTokens = typeof session.contextWindow === "number" ? session.contextWindow : null
    setStatus((current) => ({ state: "available", reason: current?.reason ?? "Ready.", contextTokens }))
    return session
  }

  async function ask() {
    setError(null)
    if (documents.length === 0) {
      setError("Read the selected files first.")
      return
    }
    const slices = searchPaper(indexPaper(documents), question)
    const session = await openSession()
    if (!session) return
    const context = session.contextWindow && session.contextWindow > 0 ? session.contextWindow : null
    if (!context) {
      setError("The on-device model did not report its context size, so AIR will not guess one.")
      session.destroy?.()
      return
    }
    const room = chunkForLocal(slices.map((slice) => slice.text).join("\n\n") || " ", context)
    const limited = room[0] ?? ""
    const reply = await session.prompt(askPrompt(question, slices.length ? [{ ...slices[0], text: limited }] : []))
    setAnswer(reply)
    session.destroy?.()
  }

  async function extractFirst() {
    setError(null)
    const session = await openSession()
    if (!session?.contextWindow) {
      setError("The on-device model did not report its context size.")
      session?.destroy?.()
      return
    }
    const chunk = chunkForLocal(corpus, session.contextWindow)[0]
    if (!chunk) return
    const reply = await session.prompt(extractPrompt(documents[0]?.filename ?? "Section", chunk))
    setAnswer(reply.startsWith("AI SECTION SUMMARY") ? reply : reply)
    session.destroy?.()
  }

  async function summariseFirst() {
    const session = await openSession()
    if (!session?.contextWindow) return
    const chunk = chunkForLocal(corpus, session.contextWindow)[0]
    if (!chunk) return
    const reply = await session.prompt(summaryPrompt(documents[0]?.filename ?? "Section", chunk))
    setAnswer(reply.startsWith("AI SECTION SUMMARY") ? reply : `AI SECTION SUMMARY\n${reply}`)
    session.destroy?.()
  }

  async function openGemini() {
    if (!record) return
    const handoff = buildGeminiHandoff({ record, criteria, documents, plan })
    setHandoffNote(handoff.note)
    await navigator.clipboard.writeText(handoff.prompt)
    window.open("https://gemini.google.com/", "_blank", "noopener")
  }

  function readPaste() {
    const coverage = handoffNote.includes("part of the paper") ? "partial" : "full"
    const result = assessPastedReply(pasted, criteria, corpus, coverage)
    if (result.ok) {
      result.report.provenance = {
        source: "gemini-web",
        label: "Gemini web, pasted",
        modelName: modelName.trim() || "unnamed",
        plan,
        humanHandoff: true,
        selfReported: true,
      }
    }
    setPastedReport(result)
  }

  const quotes = answer ? quotesInAnswer(answer, corpus) : []

  return (
    <section className="mt-8 rounded-3xl border border-line bg-white/60 p-4" aria-label="Ask the paper">
      <h2 className="font-serif text-2xl">Ask the paper</h2>
      <p className="mt-1 text-sm text-ink-soft">Local answers are a screening. They are not ranked, and they do not count as a second model family.</p>
      <div className="mt-3">
        <button type="button" className={btnQuiet} onClick={() => void checkComputer()}>
          Can my computer run this?
        </button>
        {status && (
          <div className="mt-2 text-sm">
            <p>
              {status.state === "available" ? "Available" : status.state === "downloadable" ? "Downloadable" : status.state === "downloading" ? "Downloading" : "Unavailable"}. {status.reason}
            </p>
            {status.contextTokens ? <p>Context window reported by this browser: {status.contextTokens.toLocaleString()} tokens.</p> : null}
            {progress !== null && <p>Download {Math.round(progress * 100)}%.</p>}
            <ul className="mt-2 list-disc pl-5 text-ink-soft">
              {LOCAL_REQUIREMENTS.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            {status.state === "unavailable" && <p className="mt-2">Use a free key, or copy a prompt into Gemini yourself.</p>}
          </div>
        )}
      </div>
      <label className="mt-4 block text-sm" htmlFor="ask-paper">
        Question
        <input id="ask-paper" className={`${fieldClass} mt-1`} value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Where is the bench gate defined?" />
      </label>
      <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" className={btnQuiet} disabled={!record} onClick={() => void onRead()}>
          Read selected files
        </button>
        <button type="button" className={btnPrimary} disabled={!record || !question.trim()} onClick={() => void ask()}>
          Ask on this computer
        </button>
        <button type="button" className={btnQuiet} disabled={!record} onClick={() => void onRead().then(() => extractFirst())}>
          Extract claims
        </button>
        <button type="button" className={btnQuiet} disabled={!record} onClick={() => void onRead().then(() => summariseFirst())}>
          Summarise a section
        </button>
      </div>
      {error && <p className="mt-2 text-sm text-bad">{error}</p>}
      {answer && (
        <div className="mt-3 text-sm">
          <p className="font-medium">{LOCAL_SCREENING_LABEL}</p>
          <p className="mt-1 whitespace-pre-wrap">{answer}</p>
          <ul className="mt-2 space-y-1 text-xs text-ink-soft">
            {quotes.map((item) => (
              <li key={item.quote}>
                {item.verified ? "✓" : "✗"} {item.quote}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="mt-6 border-t border-line pt-4">
        <h3 className="font-serif text-xl">Use my Gemini</h3>
        <p className="mt-1 text-sm text-ink-soft">
          AIR copies a prompt and opens Gemini. You paste it, press Send, then paste the reply back. AIR does not type into or read the Gemini page. A free account takes about 32,000 tokens, so a long paper is sent in sections.
        </p>
        <label className="mt-2 block text-sm" htmlFor="gemini-plan">
          Account size
          <select id="gemini-plan" className={`${fieldClass} mt-1`} value={plan} onChange={(event) => setPlan(event.target.value as GeminiPlan)}>
            <option value="free">Free, about 32,000 tokens</option>
            <option value="plus">Plus, about 128,000 tokens</option>
            <option value="pro">Pro or Ultra, about 1,000,000 tokens</option>
          </select>
        </label>
        <button type="button" className={`${btnQuiet} mt-2`} disabled={!record || documents.length === 0} onClick={() => void openGemini()}>
          Copy prompt and open Gemini
        </button>
        {handoffNote && <p className="mt-2 text-sm text-ink-soft">{handoffNote}</p>}
        <label className="mt-3 block text-sm" htmlFor="gemini-model-name">
          Model name, if Gemini showed one
          <input id="gemini-model-name" className={`${fieldClass} mt-1`} value={modelName} onChange={(event) => setModelName(event.target.value)} placeholder="Gemini web, pasted" />
        </label>
        <label className="mt-2 block text-sm" htmlFor="gemini-reply">
          Paste Gemini’s answer
          <textarea id="gemini-reply" className={`${fieldClass} mt-1 min-h-28`} value={pasted} onChange={(event) => setPasted(event.target.value)} />
        </label>
        <button type="button" className={`${btnPrimary} mt-2`} disabled={!pasted.trim()} onClick={readPaste}>
          Read the pasted answer
        </button>
        {pastedReport && !pastedReport.ok && <p className="mt-2 text-sm text-bad">{pastedReport.errors.join(" ")}</p>}
        {pastedReport && pastedReport.ok && (
          <div className="mt-3">
            <p className="text-sm font-medium">Gemini web, pasted. {modelName.trim() || "Model not named"}. This stays provisional unless it passes the calibration gate and a second model family also reviews it.</p>
            <ReportView
              report={pastedReport.report}
              criteria={criteria}
              meta={{
                assessorName: "Gemini web",
                modelId: modelName.trim() || "Gemini web, pasted",
                provider: "gemini",
                doi: record?.doi ?? "",
                recordVersion: record?.recordVersion ?? "",
                createdAt: new Date().toISOString(),
                criteriaVersion: criteria.version,
                customCriteria: false,
                mock: false,
              }}
            />
          </div>
        )}
      </div>
    </section>
  )
}

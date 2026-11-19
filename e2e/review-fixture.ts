const criterion = (id: string, score: number) => ({
  criterionId: id,
  score,
  confidence: "medium",
  rationale: `${id} is scored from the supplied record text, with the gap named in plain words.`,
  citations: [{ quote: "Net B collected 1.8 litres per square metre per night.", location: "record" }],
})

export const reviewFixture = {
  summary: "The record states a narrow public claim. This mocked reading quotes that claim and does not treat a chat link as evidence.",
  scores: ["impact", "feasibility", "world-class", "testability", "simulation", "physics", "estimated-value", "global-goals", "clarity", "consistency", "evidence-labelling", "availability", "limitations"].map((id, index) => criterion(id, index % 2 === 0 ? 6 : 5)),
  recommendation: "revise",
  strengths: ["The files are public."],
  majorIssues: [{ criterionId: "testability", claim: "The decisive check is not fully specified.", quotedPassage: "Net B collected 1.8 litres per square metre per night.", reason: "A reader still needs the stopping rule." }],
  minorIssues: ["The season is narrow."],
  questionsForAuthors: ["What measurement would show this claim to be wrong?"],
  suggestedNextSteps: ["Publish the weighing sheet beside the figure."],
  ontologyClass: "physical-testable",
  physics: { classification: "CONSISTENT", laws: ["thermodynamics"], howAddressed: "The text names a physical limit." },
  simulation: { reported: null, passed: null, methods: "No simulation count is reported.", inputsAvailable: false },
  valueEstimate: {
    assumptions: ["No price list was in the record."],
    marketDisruption: "Not estimated.",
    addressableMarket: { low: "not estimated", central: "not estimated", high: "not estimated", unit: "not estimated" },
    units: { low: "not estimated", central: "not estimated", high: "not estimated", unit: "units" },
    valuePerUnit: { low: "not estimated", central: "not estimated", high: "not estimated", unit: "per unit" },
    overallBenefit: { low: "not estimated", central: "not estimated", high: "not estimated", unit: "not estimated" },
  },
  goals: [{ goalId: "sdg-7", level: "partial", note: "Energy is mentioned." }],
}

export const zenodoFixture = {
  id: 18916931,
  conceptrecid: "18916930",
  doi: "10.5281/zenodo.18916931",
  metadata: {
    title: "Smoke-test record",
    publication_date: "2026-03-09",
    description: "A public note with a claim that can be checked.",
    access_right: "open",
    creators: [{ name: "Example Author" }],
    keywords: ["energy"],
    license: { id: "cc-by-4.0" },
  },
  files: [],
  links: { self_html: "https://zenodo.org/records/18916931" },
}

import { builtinAssessors } from "./assessors.ts"
import type { AirDatabase, IssueThread, NodeSubmission, StoredReview } from "./types.ts"
import { buildDemoReport } from "../services/mockReview.ts"
import { officialCriteria } from "./officialCriteria.ts"
import { issuesFromReview } from "./issues.ts"

export interface SamplePaper {
  recordId: string
  doi: string
  title: string
  creators: { name: string; orcid?: string }[]
  keywords: string[]
  publicationDate: string
  license: string
  abstract: string
  passage: string
  filenames: string[]
}

export const samplePapers: SamplePaper[] = [
  {
    recordId: "sample-fog",
    doi: "10.5281/zenodo.sample.fog",
    title: "Sample: Fog-net yield on a dry ridge",
    creators: [{ name: "A. Okonkwo" }, { name: "L. Berg", orcid: "0000-0002-1825-0097" }],
    keywords: ["water", "field methods"],
    publicationDate: "2026-04-02",
    license: "cc-by-4.0",
    abstract:
      "We measured water collected by two fog-net designs over 40 nights. Prior work on mesh collectors is cited and compared. Methods list mesh area, height, and the weighing protocol. A limitation section states that one ridge and one season cannot show annual yield. The dataset and the weighing script are in the files.",
    passage:
      "Net B collected 1.8 litres per square metre per night, against 1.1 for net A. We do not claim this ratio holds in other seasons. Figure 2 shows the nightly weights.",
    filenames: ["fog-yield.pdf", "weighing.py"],
  },
  {
    recordId: "sample-units",
    doi: "10.5281/zenodo.sample.units",
    title: "Sample: A notebook that flags unit mistakes",
    creators: [{ name: "R. Ibarra" }],
    keywords: ["software", "reproducibility"],
    publicationDate: "2026-05-18",
    license: "mit",
    abstract:
      "This notebook checks whether a lab protocol mixes units inside one calculation. The method is a set of rules and twelve worked examples. It does not claim to catch every class of error. Code is included.",
    passage: "Example 4 mixes milligrams and grams in one sum. The notebook marks that line and stops. Limitations: prose quantities outside the marked cells are ignored.",
    filenames: ["unit-checks.ipynb"],
  },
  {
    recordId: "sample-heat",
    doi: "10.5281/zenodo.sample.heat",
    title: "Sample: A one-summer census of heat shelters",
    creators: [{ name: "M. Adelayo" }, { name: "S. Cho" }],
    keywords: ["heat", "cities"],
    publicationDate: "2026-06-09",
    license: "cc-by-4.0",
    abstract:
      "Volunteers counted open heat shelters in one city over twelve hot days. Consent notes and a safety protocol for volunteers are included. The method is a walking route, not a complete inventory. We hope the list helps local planners, and we might extend it next summer.",
    passage: "On 14 July the route passed 11 open doors and 4 closed ones. This does not show city-wide coverage. Ethics: volunteers could stop at any time.",
    filenames: ["shelter-census.pdf"],
  },
  {
    recordId: "sample-wire",
    doi: "10.5281/zenodo.sample.wire",
    title: "Sample: A claimed lossless wire",
    creators: [{ name: "Unattributed lab note" }],
    keywords: ["materials", "energy"],
    publicationDate: "2026-02-11",
    license: "cc-by-4.0",
    abstract:
      "We envision a room-temperature wire that might carry power with no loss. It could change every grid. The note imagines a city running on a single strand. No measurement steps are given.",
    passage: "The wire might conduct perfectly. We hope a later experiment will show zero resistance. Possibly the effect appears only at dawn.",
    filenames: ["note.txt"],
  },
  {
    recordId: "sample-trees",
    doi: "10.5281/zenodo.sample.trees",
    title: "Sample: Street-tree photos for shade models",
    creators: [{ name: "P. Ndlovu" }],
    keywords: ["open data", "shade"],
    publicationDate: "2026-07-01",
    license: "cc0-1.0",
    abstract:
      "This deposit is 200 labelled photos of street trees, a CSV of canopy widths, and a short method for how the photos were taken. Prior work on shade models is named. The set does not show cooling by itself. Privacy: faces were cropped before upload.",
    passage: "Table 1 lists 200 crowns. Mean width is 6.4 metres. We do not estimate temperature change from these photos alone.",
    filenames: ["crowns.csv", "method.pdf"],
  },
  {
    recordId: "sample-fractions",
    doi: "10.5281/zenodo.sample.fractions",
    title: "Sample: A classroom check for fraction proofs",
    creators: [{ name: "H. Sato" }, { name: "E. Marchetti" }],
    publicationDate: "2026-08-20",
    license: "cc-by-4.0",
    keywords: ["education", "math"],
    abstract:
      "Students check a fraction identity with a small proof assistant. The method is the exercise sheet plus the expected tactic script. Related classroom tools are cited. A limitation: the sheet covers one identity, not a course. No student names are stored.",
    passage: "Exercise 2 asks for a proof that 1/2 + 1/3 = 5/6. The script accepts the common-denominator step. We do not claim this measures understanding.",
    filenames: ["exercise.md", "tactics.py"],
  },
]

const PANEL = ["grok", "gpt", "claude", "gemini"]

function reviewFor(paper: SamplePaper, assessorId: string, createdAt: string): StoredReview {
  const profile = builtinAssessors.find((item) => item.id === assessorId)
  if (!profile) throw new Error(assessorId)
  const report = buildDemoReport({
    profile,
    criteria: officialCriteria,
    text: `${paper.abstract}\n\n${paper.passage}`,
    filenames: paper.filenames,
    title: paper.title,
  })
  return {
    id: `sample_${paper.recordId}_${assessorId}`,
    sample: true,
    mock: true,
    doi: paper.doi,
    recordId: paper.recordId,
    conceptRecordId: paper.recordId,
    recordVersion: `${paper.recordId}@${paper.publicationDate}`,
    title: paper.title,
    creators: paper.creators.map((creator) => creator.name),
    keywords: paper.keywords,
    publicationDate: paper.publicationDate,
    license: paper.license,
    assessorId,
    modelId: `${profile.defaultModel} (demo)`,
    provider: profile.provider,
    criteriaId: officialCriteria.id,
    criteriaVersion: officialCriteria.version,
    customCriteria: false,
    report,
    outputHash: `sample:${paper.recordId}:${assessorId}`,
    createdAt,
  }
}

function node(partial: Omit<NodeSubmission, "mock" | "customCriteria" | "criteriaVersion" | "attachment"> & { createdAt: string }): NodeSubmission {
  return { ...partial, mock: true, customCriteria: false, criteriaVersion: officialCriteria.version }
}

export function buildSampleDatabase(): AirDatabase {
  const reviews = samplePapers.flatMap((paper, index) =>
    PANEL.map((assessorId, assessorIndex) =>
      reviewFor(paper, assessorId, `2026-09-${String(10 + index).padStart(2, "0")}T${String(8 + assessorIndex).padStart(2, "0")}:00:00.000Z`),
    ),
  )
  const fogClaude = reviews.find((review) => review.id === "sample_sample-fog_claude")
  const wireGpt = reviews.find((review) => review.id === "sample_sample-wire_gpt")
  const nodes: NodeSubmission[] = []
  if (fogClaude) {
    for (const [name, id] of [
      ["north-quay", "node_sample_north"],
      ["lens-two", "node_sample_lens"],
      ["field-note", "node_sample_field"],
      ["quiet-hour", "node_sample_quiet"],
    ] as const) {
      nodes.push(
        node({
          id: `node_sub_${id}_fog`,
          reviewId: fogClaude.id,
          doi: fogClaude.doi,
          recordVersion: fogClaude.recordVersion,
          nodeId: id,
          nodeName: name,
          assessorId: "gpt",
          modelId: "demo",
          verdict: "pass",
          summary: "Demo check: the fog-net reading stays close to the text that was supplied.",
          judgements: [],
          errorsFound: [],
          failureModes: [],
          createdAt: "2026-09-28T12:00:00.000Z",
        }),
      )
    }
  }
  if (wireGpt) {
    for (const [name, id] of [
      ["cedar-row", "node_sample_cedar"],
      ["lens-two", "node_sample_lens"],
      ["field-note", "node_sample_field"],
    ] as const) {
      nodes.push(
        node({
          id: `node_sub_${id}_wire`,
          reviewId: wireGpt.id,
          doi: wireGpt.doi,
          recordVersion: wireGpt.recordVersion,
          nodeId: id,
          nodeName: name,
          assessorId: "claude",
          modelId: "demo",
          verdict: "fail",
          summary: "Demo check: the lossless-wire note states a hope, not a measurement.",
          judgements: [],
          errorsFound: ["No measurement protocol is described."],
          failureModes: [
            {
              criterionId: "evidence-labelling",
              claim: "The note uses results language for an experiment it does not report.",
              quotedPassage: "The wire might conduct perfectly.",
              reason: "A reader cannot tell a hope from a finding.",
            },
          ],
          createdAt: "2026-09-29T12:00:00.000Z",
        }),
      )
    }
  }
  const issues: IssueThread[] = []
  const fog = reviews.find((review) => review.id === "sample_sample-fog_grok")
  const wire = reviews.find((review) => review.id === "sample_sample-wire_grok")
  if (fog) {
    const generated = issuesFromReview(fog, "Grok")[0]
    issues.push(
      generated
        ? { ...generated, status: "addressed-in-publication" }
        : {
            id: "issue_sample_fog_scope",
            doi: fog.doi,
            recordVersion: fog.recordVersion,
            source: "review-major",
            sourceId: fog.id,
            criterionId: "limitations",
            claim: "A single ridge cannot yet stand in for an annual yield.",
            quotedPassage: "We do not claim this ratio holds in other seasons.",
            reason: "The record already says this. The failure is addressed in the publication.",
            status: "addressed-in-publication",
            rounds: [
              {
                id: "round_sample_fog_scope",
                kind: "claim",
                authorLabel: "Grok",
                authorRole: "reviewer",
                citations: [],
                body: "Scope is easy to over-read.",
                createdAt: fog.createdAt,
              },
              {
                id: "round_sample_fog_scope_check",
                kind: "source-check",
                authorLabel: "north-quay",
                authorRole: "node",
                result: "ADDRESSED",
                citations: [{ quote: "We do not claim this ratio holds in other seasons.", location: "Sample passage" }],
                body: "The publication states the limit in its own words.",
                recordVersionChecked: fog.recordVersion,
                createdAt: "2026-09-28T15:00:00.000Z",
              },
            ],
            createdAt: fog.createdAt,
            updatedAt: "2026-09-28T15:00:00.000Z",
          },
    )
  }
  if (wire) {
    const generated = issuesFromReview(wire, "Grok")
    if (generated.length === 0) {
      issues.push({
        id: "issue_sample_wire_evidence",
        doi: wire.doi,
        recordVersion: wire.recordVersion,
        source: "review-major",
        sourceId: wire.id,
        criterionId: "evidence-labelling",
        claim: "The note speaks as if a lossless wire has been shown, but it reports no measurement.",
        quotedPassage: "The wire might conduct perfectly.",
        reason: "Hope and result are not distinguished.",
        status: "unresolved",
        rounds: [
          {
            id: "round_sample_wire_evidence",
            kind: "claim",
            authorLabel: "Grok",
            authorRole: "reviewer",
            citations: [{ quote: "The wire might conduct perfectly.", location: "Sample passage" }],
            body: "A later sentence would need to show a measurement, a derivation, or an explicit speculation label.",
            createdAt: wire.createdAt,
          },
        ],
        createdAt: wire.createdAt,
        updatedAt: wire.createdAt,
      })
    } else {
      for (const issue of generated) issues.push({ ...issue, status: "unresolved" })
    }
  }
  return { reviews, nodes, issues, claims: [] }
}

export function samplePaperById(recordId: string): SamplePaper | undefined {
  return samplePapers.find((paper) => paper.recordId === recordId)
}

let cached: AirDatabase | null = null

export function sampleDatabase(): AirDatabase {
  cached ??= buildSampleDatabase()
  return cached
}

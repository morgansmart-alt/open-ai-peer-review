import type { CriteriaSet } from "../domain/types.ts"

/** Plain-language gloss for each AIR v0.2 criterion. Scoring weights stay in the criteria file. */
const PLAIN: Record<string, string> = {
  impact: "If the claims held, who would benefit, and is the path from the claim to that benefit written down?",
  feasibility: "Could a stranger follow the record and see a way to build, run, or test the claim with what the text actually gives?",
  "world-class": "What kind of claim is this — physical, mathematical, or philosophical — and how viable is it inside that kind?",
  testability: "Is there a test, measurement, derivation, or observation that could show the claim is right or wrong?",
  simulation: "If the work reports simulations, are the runs, the methods, and the inputs available to check?",
  physics: "How does the account sit against known laws? A clash is not an automatic fail. The text has to say how it is handled.",
  "estimated-value": "An estimate of money or scale, with the assumptions written down. It is not a fact and not investment advice.",
  "global-goals":
    "Optional recognition. Working towards a documented public goal is a nice-to-have. The score stays on the card and is not counted in the overall.",
  clarity: "Can a reader point to what is claimed, for whom, and under which conditions?",
  consistency: "Do the numbers, units, and derivations agree with each other?",
  "evidence-labelling": "Are observations, calculations, and speculation labelled as what they are?",
  availability: "Are the data, code, or other files needed to check the work public, or is their absence explained?",
  limitations: "Does the record say how it could fail, and what it does not show?",
}

export interface PlainCriterion {
  id: string
  name: string
  plain: string
}

export function rubricInPlainWords(criteria: CriteriaSet): PlainCriterion[] {
  return criteria.criteria.map((criterion) => ({
    id: criterion.id,
    name: criterion.name,
    plain: PLAIN[criterion.id] ?? criterion.description,
  }))
}

export const mission = {
  eyebrow: "AIR · Open Iterative AI Peer Review",
  title: "A public board for ideas that can be checked.",
  lede: "AIR is a place to share an idea that is already public, without a journal, a university, or a fee. It is meant to improve peer review for the person who submitted the work and for the person reviewing it. It does not replace journal peer review.",
  sample: "Example rows are sample data, not judgements of real work.",
  possible: "A mark of possible means the text suggests the claim. A mark of proven means the publication shows it, with a quotation. Possible is not proven.",
}

export const reviewKinds = [
  {
    id: "calibrated",
    title: "Calibrated AI review",
    body: "An in-depth reading uses a key you bring. AIR recomputes the weighted score from the published criteria. Those readings can enter the median on the board.",
  },
  {
    id: "human",
    title: "Human review",
    body: "A person can score the same criteria. The review is labelled as a human review and is kept out of the AI median.",
  },
  {
    id: "web-chat",
    title: "Free web-chat, uncalibrated",
    body: "A chat you are already signed into can score the paper. The result is labelled free web-chat, uncalibrated. It does not enter the calibrated median and does not count as a second model agreeing.",
  },
  {
    id: "screening",
    title: "Free screening",
    body: "A smaller model can run in the browser, or on a free key. It is a first look. It stays off the ranked board and cannot verify the work on its own.",
  },
] as const

export const steps = [
  {
    id: "submit",
    title: "Submit",
    body: "Paste a Zenodo link or a DOI for work that is already public. AIR reads the metadata and the files you select. It does not register the DOI, and it does not take the copyright.",
  },
  {
    id: "review",
    title: "Get reviewed",
    body: "Run a calibrated AI reading, add a human review, or use a signed-in web chat. Each kind of review stays labelled. You choose which ones to run.",
  },
  {
    id: "improve",
    title: "Improve",
    body: "Read the score card, the notes on each criterion, and the comments. Answer an issue by quoting the publication, or deposit a new version. The earlier version keeps its own scores.",
  },
] as const

export const submitterFaq = [
  {
    q: "Do I need a journal or a university?",
    a: "No. You need a public DOI, usually from Zenodo. AIR does not register that DOI and does not charge a fee.",
  },
  {
    q: "Does a high score mean the work is accepted?",
    a: "No. A score is an assessment against the AIR criteria. It is not a journal decision, a certification, or an endorsement.",
  },
  {
    q: "What should I submit?",
    a: "A record that is already public. Select the files a reader should judge. A scan with no extractable text cannot be read as a full paper.",
  },
  {
    q: "How do I improve the work after a review?",
    a: "Use the criterion notes. Answer an open issue by quoting the publication, or publish a new Zenodo version. The old version stays on the board.",
  },
] as const

export const reviewerFaq = [
  {
    q: "What am I scoring?",
    a: "The public text, against the written criteria. Not the author’s name, job, or institution.",
  },
  {
    q: "What is the difference between possible and proven?",
    a: "Possible means the text suggests it. Proven means the publication shows it, with a quotation. Possible is not proven.",
  },
  {
    q: "Can I review as a person?",
    a: "Yes. A human review is labelled and is kept out of the AI median. It still uses the same criteria.",
  },
  {
    q: "Which scores are calibrated?",
    a: "An in-depth reading that uses a key you bring can enter the median. A free web-chat score is labelled uncalibrated and stays out of that median.",
  },
  {
    q: "Does global goals change the overall score?",
    a: "No. Working towards a documented public goal is a nice-to-have, not a requirement. The score stays on the card as a bonus, for example Global goals: 25 (bonus, not counted in overall). It is left out of the weighted overall, the score bands, and the board median for every paper. The board computes that overall when it shows the row. Stored readings are not rewritten.",
  },
  {
    q: "What if the verdict does not match the score?",
    a: "The card shows the band for the overall: accept or encourage from 80, revise from 60, major-revision from 40, otherwise not-ready. It notes the model's own verdict. That note is not a re-check. A stated overall more than 10 points from the weighted total is still marked Scoring mismatch, needs re-check and left out of the median.",
  },
] as const

export const extensionSteps = [
  {
    title: "Get the extension folder",
    body: "The extension is not in a browser store. Download the project zip, or clone the repository, and unzip it. The folder you load is the one that contains manifest.json.",
  },
  {
    title: "Load it unpacked",
    body: "In Chrome or Edge, open the extensions page, turn on Developer mode, and choose Load unpacked. In Firefox, use Load Temporary Add-on and select manifest.json. A temporary Firefox add-on lasts until the browser closes.",
  },
  {
    title: "Open a public record in AIR",
    body: "Fetch a Zenodo record and leave the files you want selected. On the review page, choose Review with a web chat.",
  },
  {
    title: "Use a chat you are already signed into",
    body: "Pick the chat, then stay on that tab until the reply finishes. AIR does not read passwords or cookies. It types into the chat because you clicked Run.",
  },
  {
    title: "Read the label before you publish",
    body: "The score is labelled free web-chat, uncalibrated. It stays on this device until you choose to publish it or send it to the board. Publishing keeps that label. It does not enter the calibrated median.",
  },
  {
    title: "If the chat page will not send",
    body: "Use Copy packet and paste the prompt yourself. That path is there for when a chat site changes its buttons. The same uncalibrated label applies.",
  },
] as const

export const extensionReadmeUrl = "https://github.com/morgansmart-alt/open-ai-peer-review/blob/main/extension/README.md"

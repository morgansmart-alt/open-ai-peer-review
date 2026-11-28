# Open Iterative AI Peer Review & Idea Rankings

This is a public reading of a public Zenodo record, with a leaderboard of idea rankings. Paste a record link or a DOI. The page fetches the metadata and the files you choose, then scores the work against the **AIR** criteria (AIR means AI Review). One model can read it, or a panel can. If you choose to publish, the scores join a leaderboard with a column for each AI assessor.

The site is a static app. It costs nothing to host. API keys stay in the browser. A shared board is optional, and the app still runs when that board is not configured.

These scores are AI assessments. They are not a journal decision, not an acceptance, and not a statement by the authors.

## Run it locally

```bash
npm install
npm test
npm run dev
```

Open [http://127.0.0.1:43123](http://127.0.0.1:43123).

`npm run check:zenodo` fetches record `10.5281/zenodo.18916931` and prints text from its first PDF. That call needs a network.

Demo mode is on by default. Fetch a record, pick files, and run demo readings. You get a full report, a panel comparison, Markdown and JSON export, and a print view, without an API key. Demo scores come from a fixed local heuristic. The report says so. Turn demo mode off in **Demo keys** when you want a real model.

## How a reading works

1. You paste a Zenodo URL (`https://zenodo.org/records/18916931`), a doi.org link, or a bare DOI (`10.5281/zenodo.18916931`).
2. The browser calls Zenodo’s public REST API: `https://zenodo.org/api/records/{id}`. Concept DOIs redirect to the latest version, and the browser follows that redirect.
3. You pick files. PDF text is extracted with PDF.js. Markdown, text, HTML, CSV, JSON, and `.py` files are read as text. `.docx` is read with Mammoth. Images are skipped. The first 40 pages of a PDF are read. If the text is long, the model summarises up to eight sections before it scores.
4. The model must return JSON. AIR checks it against the criteria, asks once for a repair if it is malformed, and then recomputes the weighted overall score and the idea score itself.
5. Nothing is published until you tick the box and press **Publish**.

The fairness rule is in the criteria and in the prompt: judge the work on its logic and evidence, not on credentials or affiliation.

## Keys and privacy

Each provider has its own key field:

| Assessor | Provider | Default call |
| --- | --- | --- |
| Grok | xAI | `https://api.x.ai/v1` |
| GPT | OpenAI | `https://api.openai.com/v1` |
| Claude | Anthropic | `https://api.anthropic.com/v1/messages` |
| Gemini | Google | Generative Language API |
| DeepSeek, Mistral, Llama | OpenRouter | `https://openrouter.ai/api/v1` |

You can change the model id and the base URL. **Add an OpenAI-compatible assessor** creates another column from any host that speaks the chat-completions API.

Keys are held in memory. **Remember keys in this browser** is off until you turn it on. That option writes them to `localStorage` on your device. Published rows do not have a key field. The app does not send keys to an AIR server, because the static site has no server. **Clear this browser’s AIR data** removes keys, local readings, and the node name.

Do not point the base URL at a public CORS proxy. That proxy would see your key.

### CORS, as checked for this build

Zenodo’s record API and its file-content URLs (`/api/records/{id}/files/{name}/content`) respond with `Access-Control-Allow-Origin: *`. File download from the browser works. Restricted or embargoed files return 401/403 and are reported as such. A PDF that is only a scan extracts as empty text, and the page says so.

Provider preflights from a browser origin, checked while building this app:

- xAI, OpenRouter, and Groq allow any origin.
- Anthropic allows browser calls when the page sends `anthropic-dangerous-direct-browser-access: true`. AIR sends that header.
- Gemini reflects the page’s origin and allows the `x-goog-api-key` header. The key is not put in the URL.
- OpenAI, at the time of this check, echoed the requesting origin (including a `pages.dev` origin) and allowed `authorization` and `content-type`. That behaviour belongs to OpenAI and can change. If a provider starts refusing the browser, set the base URL to an OpenAI-compatible host that still allows it, such as OpenRouter.

## Leaderboard

The homepage is the board. Each row is one Zenodo version. Columns are Panel, Idea, and one column per assessor. Click a column heading to rank by it. Filter by title, keyword, DOI, or author.

The number in a cell is the **median** score. Order uses a more cautious number so one glowing reading cannot jump the table:

```text
rank score = n / (n + 2) × median + 2 / (n + 2) × 50
```

`n` is the number of official readings that agree with themselves. 50 is the middle of the 0–100 board. Global goals is optional recognition for every paper. It is shown as a bonus and left out of the weighted overall, the score bands, and this median. The board computes that overall when it draws the row. Stored readings are not rewritten. A reading is left out of the median when its stated overall is more than 10 points from that weighted total. The row is marked Scoring mismatch, needs re-check and shows how many were left out. A verdict in a different band stays in the median. The card shows the band for the overall (accept or encourage from 80, revise from 60, major-revision from 40, otherwise not-ready) and notes the model's own verdict. If the assessors who remain are more than 30 points apart on the same DOI and version, the row is marked Assessors disagree and those readings stay in the median. You can also sort by impact, feasibility, the physics check, simulation evidence, estimated value, global goals as a bonus, or idea. Those sub-scores open inside the row. The assessor columns stay on the table.

Then a small nudge, on the same 0–100 board:

- unresolved issue: −0.8
- open issue: −0.4
- partially addressed: −0.3
- the nudge is capped at 5, including a further −1.5 when the record is disputed
- three or more independent nodes agreeing at 70% or better: +1

Addressed issues, including ones fixed in a newer version, do not move the score. The cell still shows the median. The method page spells this out.

Idea rank uses only **Novelty and context** and **Potential impact**.

Custom criteria are stored with the reading and excluded from every median. Demo readings stay on this device even if Supabase is connected. Sample rows are fiction, labelled Sample, and appear only when the shared board is not configured. Hide them with the checkbox.

## Independent checks

On a published reading, **Independent review** drafts a pass/fail check with your own key and model. You can edit the verdict, the notes, and the per-criterion agree/disagree before you submit. You may attach a JSON, CSV, or text file up to 100 KB, or a link. AIR stores a SHA-256 of that attachment and a short preview.

A node is the pseudonym of this browser. One verdict per node per reading. Custom-criteria checks are ignored. The badge reads like “Verified by 5 independent nodes, 80% pass”, or “Disputed” when at least three checks have a weighted fail rate of half or more.

Weights use reputation and a mild recency decay. Any single node is capped at 40% of the weight so one loud check cannot carry the badge.

Reputation starts at 1. It moves only when a reading has at least four official checks and at least three quarters of them agree. Nodes that match gain 0.08 (ceiling 1.8). Nodes that oppose are multiplied by 0.85 (floor 0.35).

This resists a double submission and a single oversized vote. It does not stop a crowd of fresh browsers. The free tier does not prove that the named model produced the text. The output hash pins what was stored. A later hardening would be a provider receipt checked by a small edge function.

Enough failing checks mark the reading disputed and the record page invites a re-review. Older readings stay on the page.

## Failure threads

A major issue, or a failing check, opens a thread on that record version:

1. The claim says what is wrong, which criterion, which passage, and why.
2. **Check against this version** searches the loaded text of that version (and, when a real model is on, related Zenodo records) and returns ADDRESSED, PARTIALLY ADDRESSED, or NOT ADDRESSED. A re-check against a later version loads that version’s files. It does not search the text already on screen.
3. Anyone can post a response or a counter. Discussion on one version stops at six rounds. A re-check on a later version starts a fresh set of rounds.

Status becomes addressed-in-publication, partially-addressed, unresolved, or fixed-in-new-version when an ADDRESSED check names a different version and quotes that version. The record page lists every version of the concept, keeps each version at its own address, and carries outstanding issues forward as a work list. A human review is labelled and kept out of the AI median. A private chat link cannot close an issue.

**Claim this record** compares an ORCID you type with the creators on the Zenodo record. A match is labelled “ORCID listed on the record”. AIR does not sign you in with ORCID, and the label says that. Otherwise the label is self-declared.

## Criteria

New readings use [`criteria/air-v0.2.json`](criteria/air-v0.2.json) and store `scale: 100` on the report. [`criteria/air-v0.1.json`](criteria/air-v0.1.json) stays in the repo and older readings that used it stay valid and are labelled. A stored 0–10 score is shown times 10. An AIR v0.1 score is stretched from 1–5 onto 0–100.

v0.2 weights: impact 1.4, feasibility 1.3, testability 1.3, physics 1.3, global goals 1.1, physical-or-metaphysical class 1.0, simulation 0.9, estimated value 0.7, then the smaller quality checks — consistency 0.5, evidence labelling 0.5, clarity 0.4, availability 0.4, limitations 0.4. The idea rank uses impact and global-goals alignment.

Documented public goals live in [`criteria/global-goals.json`](criteria/global-goals.json), each with a source URL. Edit that file when the world's stated goals change. Do not invent targets.

A physics class of CHALLENGES is not an automatic fail. It opens an issue thread. Estimated value is an AI estimate with ranges and assumptions, not investment advice. Untested is not the same as wrong.

## Free screening and trusted checks

The default free review runs `Qwen2.5-0.5B-Instruct-q4f16_1-MLC` in the browser with WebLLM. The weights are about 280 MB and the runtime asks for about 1 GB of GPU memory. Nothing is sent to a server of ours, and we do not hold an API key. If WebGPU is missing, the page says so. A second free path uses your own free OpenRouter key (`meta-llama/llama-3.2-3b-instruct:free`) or your free Gemini key. Puter.js was not used: it asks every visitor to sign in to Puter, and the text would leave the browser. Hugging Face’s free inference is not reliable without a token.

Free screenings are labelled “Free quick review: a smaller model, lower fidelity, screening only”. They sit in a separate unranked list. They cannot, on their own, make a work verified.

A browser extension in [`extension/`](extension/README.md) (0.2.33) can review a paper in a chat you are already signed into. On the review page, choose **Review with a web chat (free, uses your own signed-in chat)**. The score is labelled “free web-chat, uncalibrated”. It stays on this device until you publish it. **Send selected** and **Send to Global Good Idea leaderboard** post the same score to the existing `submit-web-chat` function. A global goals score is included as a bonus and is not part of the overall. The row then says Published. The leaderboard lists those scores under their own label. They do not enter the calibrated median or the two-model corroboration count. Install with Load unpacked. The steps are in [`extension/README.md`](extension/README.md).

An in-depth review uses your own key and the full AIR v0.2 reading. Run independently on an existing review, it is stored as a trusted node: pass or fail on each criterion, an overall verdict, a hash of the prompt, the criteria version, the model name, and the time. The model name is self-reported. The tier ladder is free screening, then in-depth review, then independently corroborated when two or more distinct trusted models pass.

Optional private AI context links can be sent with a reading, a rebuttal, or an independent check. They stay in that browser and are included only in the prompt to the chosen provider. Published rows, exports, and Supabase store a count (`private_context_count`), never the URL. The links are not scored. A chat link cannot mark an issue addressed. Only a quotation from the publication can.

In the app, **Criteria → Use a different criteria file** loads JSON for the current browser only. Those readings are kept and marked unranked.

## Adding an assessor or a ranking

Built-in profiles live in `src/domain/assessors.ts`. Append one and it receives a column, a profile page, and a sort. The UI can also register an OpenAI-compatible profile without a code change.

Ranking methods live in `src/domain/ranking.ts`. `registerRankingMethod({ id, label, hint, value })` adds a sort. `value` receives a rank row and returns a number or null.

## Shared board (optional)

Without configuration, readings you publish stay in this browser, beside the sample rows.

To share them, create a free [Supabase](https://supabase.com) project and run [`supabase/schema.sql`](supabase/schema.sql) in the SQL editor. Then:

```bash
cp .env.example .env.local
```

Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. Use the anon key only. Never put the service-role key in the frontend. Rebuild. The anon key is public by design. Row level security allows public reads and inserts of review results, and updates of issue threads and author claims. It does not allow deletes of readings. Payload size checks cap reviews and issues at 256 KiB, nodes at 128 KiB, and claims at 64 KiB.

The tables store the review payload: scores, rationale, model id, criteria version, DOI, record version, timestamp, output hash, node verdicts, and issue rounds. There is no key column.

## Community AI review on Moltbook (optional)

A publisher can opt in, per version, to one public post on [m/air-peer-review](https://www.moltbook.com/m/air-peer-review). The post is built only from the paper title, the Zenodo author names, the version DOI, the concept DOI, the AIR page, a short criteria summary, and a disclaimer that replies are uncalibrated. Private chat links, unpublished drafts, email addresses, and keys are refused.

The static site never sees the Moltbook key. `supabase/functions/moltbook-review` reads `MOLTBOOK_API_KEY` from the function environment and calls only `https://www.moltbook.com/api/v1`. Set the secret in the Supabase Dashboard under **Project Settings → Edge Functions → Secrets**, or with the CLI:

```bash
supabase secrets set MOLTBOOK_API_KEY=your-key
supabase functions deploy moltbook-review
```

Apply [`supabase/migrations/20261123235900_moltbook_opt_in.sql`](supabase/migrations/20261123235900_moltbook_opt_in.sql) in the SQL editor (it is also at the end of `supabase/schema.sql` for a fresh project). The anon key can read the sanitized rows. It cannot insert, update, or delete them. If the migration or the function is not deployed yet, the paper page still shows the exact public preview and does not post.

The function queues to Moltbook’s post cooldown: one post every 30 minutes for an established agent, one every two hours during the agent’s first day, and it honours `Retry-After` and `X-RateLimit-*`. A verification challenge, when Moltbook returns one, is solved inside the function. Replies are pulled when someone presses **Refresh replies**. AIR does not run a social heartbeat, send DMs, vote, follow, or scrape the site.

Inbound comments are untrusted. Instruction-like text is stripped, crypto pitches and empty or repeated spam are filtered, and a reply is shown as a candidate only when it cites the public record or names an AIR criterion. The agent name, comment id, and `is_claimed` are stored only when the API response includes them. Those replies do not enter the AI median, do not count toward independent corroboration, and cannot close an issue. A human reviewer or a trusted in-depth node can open a useful reply as a normal issue. That issue still needs a quotation from the publication before it can be marked addressed. A reply count on the board is a label, not a score. Earlier versions stay on the board.

Supabase’s free tier is enough for a small public board. Turn on the project’s rate limits before it is busy. If the project cannot be reached, AIR falls back to the local board and says so.

## GitHub Pages

The public site is [https://morgansmart-alt.github.io/open-ai-peer-review/](https://morgansmart-alt.github.io/open-ai-peer-review/).

[`.github/workflows/pages.yml`](.github/workflows/pages.yml) builds on every push to `main` and deploys the `dist/` folder. The production base path is `/open-ai-peer-review/`. The hosted site is the shared global board. [`.env.production`](.env.production) and the workflow both set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. Those are public anon values; row level security is what protects the database. Never put a service-role key in this repository. Hash routes (`/#/review`) need no server rewrite.

`npm run build` uses that base path. For a host at the domain root, build with `VITE_BASE=/ npm run build`.

The workflow asks GitHub to use Actions as the Pages source. If the first run says Pages is not enabled, open the repository **Settings → Pages** and set **Source** to **GitHub Actions**, then re-run the workflow.

GitHub Pages on `*.github.io` does not send `X-Frame-Options` or a `frame-ancestors` rule, so the site can sit in an iframe. This app does not add either header.

## Embed on another site

Paste this into a Webador Embed Code element. It fills the width, starts at a usable height, and grows when the page sends its height.

```html
<iframe
  id="open-ai-peer-review"
  title="Open Iterative AI Peer Review & Idea Rankings"
  src="https://morgansmart-alt.github.io/open-ai-peer-review/"
  style="width:100%;border:0;min-height:960px;display:block;"
  loading="lazy"
></iframe>
<script>
  window.addEventListener("message", function (event) {
    if (event.origin !== "https://morgansmart-alt.github.io") return;
    var data = event.data || {};
    if (data.source !== "open-ai-peer-review" || data.type !== "air-embed-height") return;
    var frame = document.getElementById("open-ai-peer-review");
    if (frame && data.height) frame.style.height = Math.ceil(data.height) + "px";
  });
</script>
```

The page posts `{ source: "open-ai-peer-review", type: "air-embed-height", height }` to the parent. Inside an iframe the layout drops the full-viewport minimum height so the resize does not grow without end. Links that leave the app (the Zenodo record, for example) open in a new tab.

## Deploy anywhere else

Upload `dist/` to Cloudflare Pages or Netlify the same way. `public/_redirects` is included for Netlify. The GitHub Pages build already sets the public anon values. For another host, set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` at build time only when you want the shared board. Leave them empty for a local demo. Never use a service-role key.

## Tests

```bash
npm test
```

The tests cover Zenodo link parsing, the legacy and Invenio record shapes (including a numeric record id), report JSON validation and fenced-JSON repair, weighted scores, the ranking median and shrinkage, custom-criteria exclusion, issue penalties, fidelity, the 40% weight cap, reputation, one verdict per node, issue status, and the local rate limit.

## Limits worth knowing

- A determined visitor can submit a reading that no model wrote. The hash records the text. It does not notarize the model.
- Fresh nodes can still outnumber a careful one. The cap and the consensus rule only slow that down.
- ORCID is a string match against the Zenodo creators, not a login.
- Scanned PDFs and image files yield no text.
- Very long records are shortened to eight sections and 40 pages.
- Provider CORS can change. The OpenAI-compatible base URL is the escape hatch. Do not route keys through a third-party proxy.
- Sample rows are not judgements of real papers.

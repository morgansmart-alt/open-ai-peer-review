# AIR web-chat review

A Chrome and Edge extension that scores a PDF in a chat you are already signed into. It is not published to a browser store.

If you do not use a terminal, follow [INSTALL.md](../INSTALL.md). The file to download is [release/air-web-chat.zip](../release/air-web-chat.zip). Unzip it and use Load unpacked. Click the AIR icon, pick a paper, and click **Review my paper**.

## Changelog

- 0.2.33: Open Research Europe uses the journal's own XML, not an opaque download id. Fetched text that does not match the title is dropped and the abstract is used. An empty physics.laws list is accepted.
- 0.2.32: Paper parts wait for a new OK and retry once. Open Research Europe DOIs can be looked up. A figure-only PDF warns before Send. The link field is not rebuilt while a review is running.
- 0.2.31: The blind prose is kept when X splits it from the score sheet. A long paper is sent in parts instead of stopping at 20,000 characters, and a cut section is named so it is not held against the authors.
- 0.2.30: The full-text line counts what the reviewer received, and says when that text was capped. Send selected posts the global goals bonus with the score. That bonus is not part of the overall. The row then says Published.
- 0.2.29: The link route sends the paper-text service, including the PDF, and the panel says whether that full text was included. A doubled https:// in the publication link is collapsed.
- 0.2.28: An open-licence Zenodo PDF is copied onto the public text page. When that text is missing, the page and the review say full text unavailable.
- 0.2.27: The prose before the score sheet is posted, including when X renders the fence as a code block. The defence argument is posted beside it. Both are capped at 12,000 characters.
- 0.2.26: A Zenodo link of the form /doi/10.5281/zenodo.N keeps that record id. Send for a looked-up Zenodo record still uses the DOI and record URL.
- 0.2.25: The reviewer writes the analysis in prose first and ends with a fenced JSON score sheet. A reply step waits 10 minutes, stays quiet for 20 seconds, and treats a visible Thinking indicator as still streaming. Send names a DOI found in the file, and every refusal is shown on the saved row.

The score is labelled **free web-chat, uncalibrated**. It stays in the browser until you opt in. **Save a copy** writes JSON the AIR site can import. **Send selected** and **Send to Global Good Idea leaderboard** post the same score. A global goals score is included as a bonus and is not part of the overall. After that post the row says Published. The extension does not read passwords or cookies.

## Rebuild (only if you change the code)

From the repository root, the browser files are already built. Rebuild after changing adapters or the panel:

```bash
npm install
npm run build:extension
```

Chrome or Edge:

1. Open `chrome://extensions` (Edge uses `edge://extensions`).
2. Turn on **Developer mode**.
3. Choose **Load unpacked**.
4. Select this `extension` folder (the one that contains `manifest.json`).

Click the toolbar icon to review a PDF, or a Zenodo, DOI, or arXiv link, with no AIR website running. **Send to Global Good Idea leaderboard** runs only after a click. A score marked Scoring mismatch, needs re-check is not sent. Sent scores are tagged `source: "web-chat extension"` and `tier: "uncalibrated web-chat"`. They show in their own section and stay out of the calibrated board and the two-family count.

The button posts to `https://lotswxboafsenmszijpf.supabase.co/functions/v1/submit-web-chat`. Deploy these two files before that call can succeed. Do not put the service-role key in the extension.

1. Run `supabase/migrations/20261122100000_web_chat_submissions.sql` in the Supabase SQL editor. It creates `air_web_chat`. Anon can read it. Anon cannot insert.
2. Deploy the whole folder `supabase/functions/submit-web-chat` (`index.ts` and the generated `submission.ts`):

```bash
supabase functions deploy submit-web-chat --no-verify-jwt
```

`submission.ts` is produced from `src/services/webChat/submission.ts` by `npm run vendor:submit`. The function checks the payload, strips private chat links, refuses a scoring mismatch on the blind score, keeps at most 12 new rows in 10 minutes, and skips a duplicate paper+site+model. The blind score is the ranking value. A second score is stored only as `after author defence`. **Defend my paper** stays in the same chat tab, waits until each reply finishes, pauses four seconds between turns, and stops when you click **Stop**.

Firefox 128 or newer:

1. Open `about:debugging#/runtime/this-firefox`.
2. Choose **Load Temporary Add-on**.
3. Select `extension/manifest.json`.
4. A temporary add-on lasts until you close Firefox.

Then reload AIR. The review page should say **Extension connected**.

Local AIR is [http://127.0.0.1:43123](http://127.0.0.1:43123) (`npm run dev`). The public site origin that the extension accepts is `https://morgansmart-alt.github.io`.

## Try one reading

1. In AIR, fetch a Zenodo record and leave the files you want selected.
2. Pick a chat you are signed into.
3. Click **Run free web-chat review**.
4. Stay on the chat tab. A banner at the top of that tab says AIR is using it because you clicked Run.
5. When the reply finishes, AIR parses the JSON. The card is labelled **Free web-chat review, uncalibrated**.
6. The reading is kept on this device, labelled free web-chat, uncalibrated. Publishing it, from the site or with **Send to Global Good Idea leaderboard**, keeps that label. It stays out of the calibrated ranking and out of the two-model corroboration count.

If the paper needs more messages than the site usually accepts, AIR says so and waits for a second click.

**Copy packet** puts the same prompt on the clipboard, or in a box on the page if the clipboard refuses, so you can paste it yourself when a site changes its buttons.

## What is sent

AIR posts one message to its own page. The extension's content script on the AIR origin checks the origin, then asks the service worker to open the chat. The packet is:

```json
{
  "source": "open-ai-peer-review",
  "type": "air-web-chat-request",
  "version": 1,
  "requestId": "web-…",
  "packet": {
    "version": 1,
    "requestId": "web-…",
    "providerId": "grok",
    "system": "AIR reviewer instructions",
    "instructions": "criteria, JSON schema, and any private context links you added",
    "files": [{ "filename": "paper.pdf", "text": "extracted text" }]
  }
}
```

Accepted page origins:

- `http://localhost` and `http://127.0.0.1`, any port
- `https://localhost` and `https://127.0.0.1`, any port
- `https://morgansmart-alt.github.io`

`externally_connectable` allows those same origins to call `chrome.runtime.sendMessage` with the same body. The page itself uses `window.postMessage`, so it does not need the extension id.

Replies come back as `source: "air-web-chat-extension"`:

| type | meaning |
| --- | --- |
| `air-web-chat-pong` | the extension is installed on this page |
| `air-web-chat-progress` | a short status line |
| `air-web-chat-result` | `text` is the chat's reply |
| `air-web-chat-error` | `message` says what failed |

Cancel with `{ "type": "air-web-chat-cancel", "requestId": "…" }`. The chat tab stays open.

The service worker remembers the AIR tab id and the chat tab id for the active job (`chrome.storage.session`). It does not store the paper, the prompt, or the reply. Session storage clears when the browser closes.

Private AI context links that you added in AIR are included in the prompt the chat sees, because you asked for them to be part of that reading. They are removed from the stored reading if the model echoes them. The stored row keeps a count. The address is not published.

## Chat sites

Each site is one file in `adapters/`. Selectors are only in that file.

| Site | Adapter | How a long paper is sent |
| --- | --- | --- |
| [grok.com](https://grok.com/) | `adapters/grok.ts` | File up to about 1.2 million characters, else paste 48,000 at a time |
| [gemini.google.com](https://gemini.google.com/app) | `adapters/gemini.ts` | File up to about 1.5 million characters, else paste 48,000 |
| [chatgpt.com](https://chatgpt.com/) | `adapters/chatgpt.ts` | File up to about 400,000 characters, else paste 28,000 |
| [claude.ai](https://claude.ai/new) | `adapters/claude.ts` | File up to about 1.2 million characters, else paste 60,000 |
| [chat.deepseek.com](https://chat.deepseek.com/) | `adapters/deepseek.ts` | Paste only, 32,000 characters at a time |
| [chat.mistral.ai](https://chat.mistral.ai/chat) | `adapters/mistral.ts` | File up to about 400,000 characters, else paste 28,000 |
| [copilot.microsoft.com](https://copilot.microsoft.com/) | `adapters/copilot.ts` | Paste only, 12,000 characters at a time |
| [perplexity.ai](https://www.perplexity.ai/) | `adapters/perplexity.ts` | File up to about 200,000 characters, else paste 16,000 |

A ~160k-token paper is on the order of 600–700 thousand characters. Grok, Gemini, and Claude are the practical file-upload targets for that size. ChatGPT's free composer often refuses uploads and rate-limits a long thread. Copilot's box is short, so a full paper is a poor fit. DeepSeek and Perplexity sit in between. The numbers above are the split points in the adapters. They are not published vendor quotas, and they were not measured against live accounts in this build.

If the message box cannot be found, AIR says the layout may have changed and names the adapter file. If the page is a sign-in wall, AIR asks you to sign in on that tab and run again. A failed upload falls back to pasted parts. Parts are labelled `AIR PAPER PART i of n` and ask the model to wait until the last message, which requests one JSON object.

PDFs for this route are read up to 400 pages. A single file stops at 1.5 million characters, with a note in the text that it stopped. The API review path still reads 40 pages.

## When a site changes

1. Open the adapter file.
2. Update the selector lists. The first match wins.
3. Update `extension/fixtures/<id>.html` so the fixture still matches the first selector.
4. Run `npm test` and `npm run build:extension`.
5. Reload the unpacked extension.

## Limits

- One review runs at a time.
- Each turn waits up to four minutes. The page waits up to fifteen minutes.
- The chat tab is left open when the run finishes, fails, or is cancelled.
- A service-worker restart can drop the route back to the AIR tab. Run again if the reply never returns. The paper is not written to disk.
- Live rate limits, login walls, and selector breakages were not exercised against signed-in accounts here. The fixture tests check the selectors and the handoff on saved HTML.

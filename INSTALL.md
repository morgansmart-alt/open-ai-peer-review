# Install AIR web-chat review

This adds a button to Chrome or Edge. You use it to score a paper in a chat you are already signed into, such as Grok, Gemini, Claude, ChatGPT, DeepSeek, Mistral, Copilot, or Perplexity.

The score is labelled **free web-chat, uncalibrated**. It stays in this browser until you choose to send it. **Send to Global Good Idea leaderboard** posts one score only when you click it. A score marked "Scoring mismatch, needs re-check" is not sent.

## Install (Load unpacked)

1. In this repository, run `npm install` and `npm run build:extension` if `extension/build` is not already there. You can also unzip `release/air-web-chat.zip`.
2. Open Chrome or Edge. Type `chrome://extensions` in the address bar and press Enter. Edge uses `edge://extensions`. Turn on **Developer mode**.
3. Click **Load unpacked**. Choose the `extension` folder (the one that contains `manifest.json`), or the unzipped `air-web-chat` folder.
4. Pin **AIR web-chat review** from the puzzle-piece menu if you do not see the icon.

## How to use

1. Click the AIR icon. Sign in to a chat using the links in the panel, then click **I'm signed in**.
2. Choose that chat and a paper type (device or engineering, theory, data or reference, roadmap or report, or empirical study). Add a PDF or text file, or paste a Zenodo, DOI, or arXiv link. Leave **Defend my paper** on if you want a second score after the chat answers its own criticisms. Click **Review my paper**.
3. Stay on the chat tab until the reply finishes. The panel shows the blind score, labelled free web-chat, uncalibrated.
4. **Save a copy** writes JSON. **Send to Global Good Idea leaderboard** is optional. It posts to the existing `submit-web-chat` function. The score is stored as an uncalibrated web-chat review and is not mixed into the calibrated ranking.

The panel does not read your password or your cookies. If the chat asks you to sign in, sign in on that tab and click **Review my paper** again.

From the AIR site, **Review with a web chat (free, uses your own signed-in chat)** uses this same extension. Reload the site after you load the extension.

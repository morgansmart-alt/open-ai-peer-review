import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import App from "./App.tsx"
import { startEmbedResize } from "./embed.ts"
import { hashUrlForBarePaperPath } from "./services/paperPath.ts"
import "./index.css"

// GitHub Pages serves the app shell for /paper/<id>. The board lives on the hash route.
const barePaper = hashUrlForBarePaperPath(window.location.pathname, import.meta.env.BASE_URL, window.location.search)
if (barePaper && !window.location.hash.startsWith("#/")) {
  window.history.replaceState(null, "", barePaper)
}

startEmbedResize()

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

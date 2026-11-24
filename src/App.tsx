import { lazy, Suspense } from "react"
import { HashRouter, Link, Route, Routes, useParams } from "react-router-dom"
import { Shell } from "./components/Shell.tsx"
import { AirProvider } from "./context/AirContext.tsx"
import { CriteriaPage } from "./pages/CriteriaPage.tsx"
import { GuidePage } from "./pages/GuidePage.tsx"
import { HomePage } from "./pages/HomePage.tsx"
import { MethodPage } from "./pages/MethodPage.tsx"
import { PaperTextPage } from "./pages/PaperTextPage.tsx"
import { NodePage, NodesPage, ReviewerPage, ReviewersPage } from "./pages/Profiles.tsx"
import { paperTextRecordIdFromPath } from "./services/webChat/paperText.ts"

const ReviewPage = lazy(() => import("./pages/ReviewPage.tsx").then((module) => ({ default: module.ReviewPage })))
const PaperPage = lazy(() => import("./pages/PaperPage.tsx").then((module) => ({ default: module.PaperPage })))

export default function App() {
  const textId = paperTextRecordIdFromPath(window.location.pathname)
  if (textId) {
    return (
      <AirProvider>
        <PaperTextPage recordId={textId} />
      </AirProvider>
    )
  }
  return (
    <AirProvider>
      <HashRouter>
        <Shell>
          <Suspense fallback={<p role="status" className="px-4 py-8 text-sm text-ink-soft">Loading the page…</p>}>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/review" element={<ReviewPage />} />
            <Route path="/paper/:recordId" element={<PaperPage />} />
            <Route path="/paper/:recordId/text" element={<PaperTextRoute />} />
            <Route path="/reviewers" element={<ReviewersPage />} />
            <Route path="/reviewers/:assessorId" element={<ReviewerPage />} />
            <Route path="/nodes" element={<NodesPage />} />
            <Route path="/nodes/:nodeId" element={<NodePage />} />
            <Route path="/guide" element={<GuidePage />} />
            <Route path="/criteria" element={<CriteriaPage />} />
            <Route path="/method" element={<MethodPage />} />
            <Route
              path="*"
              element={
                <p className="mx-auto max-w-3xl px-4 py-10 text-sm">
                  That address is not a page on AIR. <Link to="/">Back to the board</Link>
                </p>
              }
            />
          </Routes>
          </Suspense>
        </Shell>
      </HashRouter>
    </AirProvider>
  )
}

function PaperTextRoute() {
  const params = useParams()
  return <PaperTextPage recordId={params.recordId ?? ""} />
}

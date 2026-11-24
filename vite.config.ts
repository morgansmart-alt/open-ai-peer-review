import { copyFileSync } from "node:fs"
import { join } from "node:path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig, type Plugin } from "vite"

/** GitHub Pages serves 404.html for /paper/<id>/text, so the id stays in the path. */
function pagesFallback(): Plugin {
  return {
    name: "github-pages-text-fallback",
    apply: "build",
    closeBundle() {
      const outDir = join(process.cwd(), "dist")
      copyFileSync(join(outDir, "index.html"), join(outDir, "404.html"))
    },
  }
}

export default defineConfig(({ command }) => ({
  // GitHub Pages project site. Dev stays at /. Override with VITE_BASE=/ for a root host.
  base: process.env.VITE_BASE ?? (command === "build" ? "/open-ai-peer-review/" : "/"),
  plugins: [react(), tailwindcss(), pagesFallback()],
  server: { port: 43123, host: "0.0.0.0", strictPort: true },
  preview: { port: 43123, host: "0.0.0.0", strictPort: true },
}))

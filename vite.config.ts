import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

export default defineConfig(({ command }) => ({
  // GitHub Pages project site. Dev stays at /. Override with VITE_BASE=/ for a root host.
  base: process.env.VITE_BASE ?? (command === "build" ? "/open-ai-peer-review/" : "/"),
  plugins: [react(), tailwindcss()],
  server: { port: 43123, host: "0.0.0.0", strictPort: true },
  preview: { port: 43123, host: "0.0.0.0", strictPort: true },
}))

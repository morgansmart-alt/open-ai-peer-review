import { execFileSync } from "node:child_process"
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const folder = join(process.cwd(), "supabase/functions/submit-web-chat")

describe("paper-text deploy bundle", () => {
  it("inlines the shared modules and leaves unpdf external", () => {
    const output = execFileSync(process.execPath, ["scripts/bundle-paper-text.mjs", "--check"], { encoding: "utf8" })
    expect(output).toContain("unpdf external")
    expect(output).toContain("npm:unpdf@2.2.3")
    const importMap = readFileSync(join(process.cwd(), "supabase/functions/paper-text/deno.json"), "utf8")
    expect(importMap).toContain('"unpdf": "npm:unpdf@2.2.3"')
  })
})

describe("submit-web-chat deploy bundle", () => {
  it("matches the src submission module", () => {
    execFileSync(process.execPath, ["scripts/vendor-submit-web-chat.mjs", "--check"], { stdio: "pipe" })
  })

  it("imports only siblings or remote URLs", () => {
    const files = readdirSync(folder).filter((name) => name.endsWith(".ts"))
    expect(files).toContain("index.ts")
    expect(files).toContain("submission.ts")
    const index = readFileSync(join(folder, "index.ts"), "utf8")
    expect(index).toContain('from "./submission.ts"')
    for (const name of files) {
      const text = readFileSync(join(folder, name), "utf8")
      const specs = [...text.matchAll(/from\s+["']([^"']+)["']/g)].map((match) => match[1] ?? "")
      for (const spec of specs) {
        const local = spec.startsWith("./")
        const remote = spec.startsWith("https://") || spec.startsWith("npm:")
        expect(local || remote, `${name} imports ${spec}`).toBe(true)
        expect(spec.includes(".."), `${name} imports ${spec}`).toBe(false)
      }
    }
  })
})

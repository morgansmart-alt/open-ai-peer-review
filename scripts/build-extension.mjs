import { deflateSync } from "node:zlib"
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { execFileSync } from "node:child_process"
import { build } from "esbuild"

function crc32(buf) {
  let c = ~0
  for (const byte of buf) {
    c ^= byte
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  }
  return ~c >>> 0
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([length, body, crc])
}

function png(size) {
  const raw = Buffer.alloc((size * 4 + 1) * size)
  for (let y = 0; y < size; y += 1) {
    const row = y * (size * 4 + 1)
    raw[row] = 0
    for (let x = 0; x < size; x += 1) {
      const i = row + 1 + x * 4
      const edge = x < size * 0.12 || y < size * 0.12 || x >= size * 0.88 || y >= size * 0.88
      raw[i] = edge ? 15 : 20
      raw[i + 1] = edge ? 80 : 150
      raw[i + 2] = edge ? 78 : 132
      raw[i + 3] = 255
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ])
}

mkdirSync("extension/icons", { recursive: true })
mkdirSync("extension/build", { recursive: true })
for (const size of [16, 48, 128]) writeFileSync(`extension/icons/icon${size}.png`, png(size))

mkdirSync("extension/vendor", { recursive: true })
cpSync("node_modules/pdfjs-dist/build/pdf.min.mjs", "extension/vendor/pdf.min.mjs")
cpSync("node_modules/pdfjs-dist/build/pdf.worker.min.mjs", "extension/vendor/pdf.worker.min.mjs")

function publicAnonKey() {
  const text = readFileSync(".env.production", "utf8")
  const line = text.split("\n").find((item) => item.startsWith("VITE_SUPABASE_ANON_KEY="))
  return line ? line.slice("VITE_SUPABASE_ANON_KEY=".length).trim() : ""
}

await build({
  entryPoints: {
    background: "extension/background.ts",
    bridge: "extension/bridge.ts",
    runner: "extension/runner.ts",
    review: "extension/review.ts",
  },
  outdir: "extension/build",
  bundle: true,
  format: "iife",
  platform: "browser",
  target: ["chrome120", "firefox128"],
  legalComments: "none",
  logLevel: "info",
  define: {
    "import.meta.env.VITE_SUPABASE_ANON_KEY": JSON.stringify(publicAnonKey()),
  },
})

const stage = "release/stage"
rmSync(stage, { recursive: true, force: true })
mkdirSync(`${stage}/air-web-chat`, { recursive: true })
mkdirSync("release", { recursive: true })
for (const file of ["manifest.json", "review.html", "review.css"]) {
  cpSync(`extension/${file}`, `${stage}/air-web-chat/${file}`)
}
cpSync("INSTALL.md", `${stage}/air-web-chat/INSTALL.md`)
cpSync("extension/icons", `${stage}/air-web-chat/icons`, { recursive: true })
cpSync("extension/build", `${stage}/air-web-chat/build`, { recursive: true })
cpSync("extension/vendor", `${stage}/air-web-chat/vendor`, { recursive: true })
rmSync("release/air-web-chat.zip", { force: true })
execFileSync("zip", ["-r", "-9", "-q", "../air-web-chat.zip", "air-web-chat"], { cwd: stage })
rmSync(stage, { recursive: true, force: true })

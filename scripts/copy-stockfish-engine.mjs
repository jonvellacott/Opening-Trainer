// Vendors the Stockfish worker + wasm into public/ so Vite serves them as
// plain static files (their paired js/wasm lookup relies on matching
// filenames in the same directory — not something Vite's bundler pipeline
// preserves for third-party prebuilt assets).
import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ENGINE = 'stockfish-18-lite-single'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const srcDir = join(root, 'node_modules', 'stockfish', 'bin')
const destDir = join(root, 'public', 'engine')

mkdirSync(destDir, { recursive: true })

for (const ext of ['js', 'wasm']) {
  const src = join(srcDir, `${ENGINE}.${ext}`)
  if (!existsSync(src)) {
    console.error(`Missing ${src} — run "npm install" first.`)
    process.exit(1)
  }
  copyFileSync(src, join(destDir, `${ENGINE}.${ext}`))
}

console.log(`Copied local Stockfish engine (${ENGINE}) into public/engine/`)

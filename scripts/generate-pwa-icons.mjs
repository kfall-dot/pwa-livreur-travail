#!/usr/bin/env node
/**
 * Génère icon-192.png et icon-512.png depuis public/favicon.svg
 * Usage : node scripts/generate-pwa-icons.mjs
 */
import { readFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const svgPath = join(root, 'public', 'favicon.svg')
const outDir = join(root, 'public', 'icons')

mkdirSync(outDir, { recursive: true })
const svg = readFileSync(svgPath)

for (const size of [192, 512]) {
  const out = join(outDir, `icon-${size}.png`)
  await sharp(svg).resize(size, size).png().toFile(out)
  console.log(`Wrote ${out}`)
}

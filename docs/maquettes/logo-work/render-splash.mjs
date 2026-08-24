/**
 * Compose PWA / iOS splash PNGs: solid brand green + centered TraceO lockup.
 * Usage: node docs/maquettes/logo-work/render-splash.mjs
 */
import sharp from 'sharp'
import { readFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..')
const lockupSvg = readFileSync(join(root, 'public/brand/traceo-splash-lockup.svg'))
const outDir = join(root, 'public/brand')
mkdirSync(outDir, { recursive: true })

const GREEN = { r: 11, g: 74, b: 44, alpha: 1 }

const targets = [
  { file: 'traceo-splash.png', w: 1280, h: 1920 },
  { file: 'apple-splash-1170x2532.png', w: 1170, h: 2532 },
  { file: 'apple-splash-1290x2796.png', w: 1290, h: 2796 },
]

for (const t of targets) {
  const lockupW = Math.round(t.w * 0.72)
  const lockup = await sharp(lockupSvg, { density: 288 })
    .resize(lockupW, Math.round(lockupW * 0.75), { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer({ resolveWithObject: true })

  const left = Math.round((t.w - lockup.info.width) / 2)
  const top = Math.round((t.h - lockup.info.height) / 2) - Math.round(t.h * 0.04)

  await sharp({
    create: { width: t.w, height: t.h, channels: 4, background: GREEN },
  })
    .composite([{ input: lockup.data, left, top }])
    .png()
    .toFile(join(outDir, t.file))
  console.log('wrote', t.file)
}

// Copy main splash into docs for review
await sharp(join(outDir, 'traceo-splash.png'))
  .resize(640)
  .toFile(join(root, 'docs/maquettes/logo-work/splash-preview.png'))
console.log('wrote docs/maquettes/logo-work/splash-preview.png')

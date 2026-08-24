import { writeFileSync, copyFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..')
const GREEN = '#0b4a2c'
const ORANGE = '#e85d04'
const CX = 30
const CY = 34
const R = 17

function polar(deg, radius = R) {
  const rad = ((deg - 90) * Math.PI) / 180
  return { x: CX + radius * Math.cos(rad), y: CY + radius * Math.sin(rad) }
}
function arcPath(a, b, radius = R) {
  const s = polar(a, radius)
  const e = polar(b, radius)
  const sweep = (b - a + 360) % 360
  const large = sweep > 180 ? 1 : 0
  return `M ${s.x.toFixed(2)} ${s.y.toFixed(2)} A ${radius} ${radius} 0 ${large} 1 ${e.x.toFixed(2)} ${e.y.toFixed(2)}`
}

const solid = arcPath(168, 18)
const dashDots = [70].map((d) => polar(d))
const wp = polar(145)
const pinAt = polar(18)
const pinTip = 12.5
const pinTx = pinAt.x
const pinTy = pinAt.y - pinTip
const pin =
  'M0 12.5 C-5.2 5.3 -7.6 2.2 -7.6 -2 A7.6 7.6 0 1 1 7.6 -2 C7.6 2.2 5.2 5.3 0 12.5 Z'

function markInner({ ring, hole }) {
  const dots = dashDots
    .map((p) => `<circle cx="${p.x.toFixed(2)}" cy="${p.y.toFixed(2)}" r="1.7" fill="${ring}"/>`)
    .join('\n  ')
  return `
  <path d="${solid}" stroke="${ring}" stroke-width="4.8" stroke-linecap="round" fill="none"/>
  ${dots}
  <circle cx="${wp.x.toFixed(2)}" cy="${wp.y.toFixed(2)}" r="2.6" fill="${ORANGE}"/>
  <g transform="translate(${pinTx.toFixed(2)} ${pinTy.toFixed(2)})">
    <path fill="${ORANGE}" d="${pin}"/>
    <circle cx="0" cy="-2" r="2.9" fill="${hole}"/>
  </g>`
}

function svgDoc(inner, vb = '0 0 64 64') {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" fill="none">${inner}\n</svg>\n`
}

const markBody = markInner({ ring: GREEN, hole: '#ffffff' })
const onBody = markInner({ ring: '#ffffff', hole: GREEN })

for (const [rel, svg] of Object.entries({
  'public/favicon.svg': svgDoc(`\n  <rect width="64" height="64" rx="14" fill="${GREEN}"/>${onBody}`),
  'public/brand/traceo-mark.svg': svgDoc(markBody),
  'public/brand/traceo-mark-onbrand.svg': svgDoc(onBody),
  'public/brand/traceo-mark-mono.svg': svgDoc(
    markInner({ ring: 'currentColor', hole: '#ffffff' }).replaceAll(ORANGE, 'currentColor'),
  ),
  'public/brand/traceo-icon-maskable.svg': svgDoc(
    `\n  <rect width="512" height="512" fill="${GREEN}"/>\n  <g transform="translate(60 50) scale(6.1)">${onBody}</g>`,
    '0 0 512 512',
  ),
})) {
  writeFileSync(join(root, rel), svg)
}

const preview = svgDoc(
  `
  <rect width="720" height="340" fill="#ffffff"/>
  <g transform="translate(70 50) scale(2.8)">${markBody}</g>
  <g transform="translate(320 50) scale(2.8)">
    <rect width="64" height="64" rx="14" fill="${GREEN}"/>
    ${onBody}
  </g>
  <text x="70" y="300" font-family="system-ui,sans-serif" font-size="48" font-weight="700" fill="${GREEN}">Trace</text>
  <g transform="translate(188 255) scale(1.05)">${markBody}</g>
  <text x="252" y="268" font-family="system-ui,sans-serif" font-size="16" font-weight="700" fill="${ORANGE}">&#174;</text>
`,
  '0 0 720 340',
)

const previewPath = join(root, 'docs/maquettes/logo-work/preview-new-mark.png')
await sharp(Buffer.from(preview), { density: 200 }).png().toFile(previewPath)
copyFileSync(previewPath, join(root, 'docs/maquettes/logo-concept-2-vector.png'))

const maskable = svgDoc(
  `\n  <rect width="512" height="512" fill="${GREEN}"/>\n  <g transform="translate(60 50) scale(6.1)">${onBody}</g>`,
  '0 0 512 512',
)
await sharp(Buffer.from(maskable), { density: 288 }).resize(512, 512).png().toFile(join(root, 'public/icons/icon-512.png'))
await sharp(Buffer.from(maskable), { density: 288 }).resize(192, 192).png().toFile(join(root, 'public/icons/icon-192.png'))

const horiz = (inner, fill) => `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 64" fill="none" role="img" aria-label="TraceO">
  <text x="0" y="44" font-family="'DM Sans', system-ui, sans-serif" font-size="34" font-weight="700" letter-spacing="-0.5" fill="${fill}">Trace</text>
  <g transform="translate(100 2) scale(0.92)">${inner}</g>
  <text x="162" y="20" font-family="system-ui,sans-serif" font-size="12" font-weight="700" fill="#e85d04">&#174;</text>
</svg>
`
writeFileSync(join(root, 'public/brand/traceo-logo-horizontal.svg'), horiz(markBody, GREEN))
writeFileSync(join(root, 'public/brand/traceo-logo-horizontal-onbrand.svg'), horiz(onBody, '#ffffff'))

const mockBuf = await sharp(join(root, 'docs/maquettes/logo-concept-2-route-o.png'))
  .resize(400, 360, { fit: 'contain', background: '#ffffff' })
  .png()
  .toBuffer()
const vecBuf = await sharp(previewPath).resize(400, 360, { fit: 'contain', background: '#ffffff' }).png().toBuffer()
await sharp({
  create: { width: 840, height: 420, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } },
})
  .composite([
    { input: mockBuf, left: 10, top: 40 },
    { input: vecBuf, left: 430, top: 40 },
  ])
  .png()
  .toFile(join(root, 'docs/maquettes/logo-compare-mockup-vs-vector.png'))

console.log('OK')

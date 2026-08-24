import sharp from 'sharp'
import { readFileSync } from 'node:fs'
import { argv } from 'node:process'

const [, , input, output, widthArg, heightArg] = argv
if (!input || !output || !widthArg) {
  console.error('Usage: node render.mjs <src.svg> <out.png> <width> [height]')
  process.exit(1)
}
const width = Number(widthArg)
const height = heightArg ? Number(heightArg) : width
const svg = readFileSync(input)
await sharp(svg, { density: 288 })
  .resize(width, height, { fit: 'fill' })
  .png()
  .toFile(output)
console.log('wrote', output, `${width}x${height}`)

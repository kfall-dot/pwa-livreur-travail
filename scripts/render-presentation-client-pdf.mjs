#!/usr/bin/env node
/** @deprecated Utiliser npm run presentation:pdfs */
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const res = spawnSync(process.execPath, [path.join(__dirname, 'render-presentation-pdfs.mjs')], {
  stdio: 'inherit',
  cwd: path.join(__dirname, '..'),
})
process.exit(res.status ?? 1)

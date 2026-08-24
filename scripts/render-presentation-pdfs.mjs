#!/usr/bin/env node
/**
 * Génère les PDF des documents PRESENTATION* + sales deck HTML.
 * Usage: node scripts/render-presentation-pdfs.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const docs = path.join(root, 'docs')

const CONTACT = {
  label: 'TraceO® — Côte d’Ivoire',
  email: 'kfallet@gmail.com',
  site: 'https://pwa-livreur.netlify.app',
  siteLabel: 'pwa-livreur.netlify.app',
  phone: '225 07 00 43 04 02',
  phoneHref: 'tel:+2250700430402',
}

const MARKDOWN_JOBS = [
  {
    id: 'client',
    input: 'PRESENTATION-CLIENT.md',
    output: 'TraceO_Presentation-Client.pdf',
    html: 'presentation-client-print.html',
    variant: 'client',
    transform(md) {
      const cut = md.indexOf('\n## Annexe — Maquettes')
      let body = cut === -1 ? md : md.slice(0, cut) + md.slice(cut).slice(md.slice(cut).indexOf('\n## Prochaine étape'))
      return body
    },
  },
  {
    id: 'slides',
    input: 'PRESENTATION-SLIDES.md',
    output: 'TraceO_Presentation-Slides.pdf',
    html: 'presentation-slides-print.html',
    variant: 'slides',
    title: 'Notes présentateur — Sales Deck',
  },
  {
    id: 'live-script',
    input: 'PRESENTATION-LIVE-SCRIPT.md',
    output: 'TraceO_Presentation-Live-Script.pdf',
    html: 'presentation-live-script-print.html',
    variant: 'internal',
    title: 'Script présentation live (40–45 min)',
    badge: 'Usage interne',
  },
  {
    id: 'dry-run',
    input: 'PRESENTATION-DRY-RUN-LOG.md',
    output: 'TraceO_Presentation-Dry-Run-Log.pdf',
    html: 'presentation-dry-run-print.html',
    variant: 'internal',
    title: 'Journal test sec présentation',
    badge: 'Usage interne',
  },
  {
    id: 'btp-synthese',
    input: 'BTP-SYNTHESE-EXECUTIVE-DIRECTION.md',
    output: 'TraceO_BTP-Synthese-Executive-Direction.pdf',
    html: 'btp-synthese-executive-print.html',
    variant: 'btp',
    title: 'Synthèse exécutive — Évolution TraceO BTP',
    badge: 'Document de décision',
    transform(md) {
      const toc = md.indexOf('\n## Table des matières')
      if (toc !== -1) return md.slice(toc + 1)
      const start = md.indexOf('\n## 1. Constat')
      return start !== -1 ? md.slice(start + 1) : md
    },
  },
  {
    id: 'btp-options-eb',
    input: 'BTP-OPTIONS-DIGITALISATION-EB-BOARD.md',
    output: 'TraceO_BTP-Options-Digitalisation-EB-Board.pdf',
    html: 'btp-options-eb-print.html',
    variant: 'btp-options',
    title: 'Options digitalisation EB — Document board',
    badge: 'Document de décision',
    transform(md) {
      const start = md.indexOf('\n## 1. Contexte')
      return start !== -1 ? md.slice(start + 1) : md
    },
  },
]

function escapeHtml(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function headingId(label) {
  return label
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/['''´`]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function inlineMd(text) {
  let s = escapeHtml(text)
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>')
  return s
}

function parseTable(lines) {
  const rows = lines.map((line) =>
    line
      .trim()
      .replace(/^\|/, '')
      .replace(/\|$/, '')
      .split('|')
      .map((c) => c.trim()),
  )
  const body = rows
    .slice(2)
    .map((cells) => `<tr>${cells.map((c) => `<td>${inlineMd(c)}</td>`).join('')}</tr>`)
    .join('')
  const head = `<tr>${rows[0].map((c) => `<th>${inlineMd(c)}</th>`).join('')}</tr>`
  return `<table><thead>${head}</thead><tbody>${body}</tbody></table>`
}

function mdToHtml(md) {
  const lines = md.split('\n')
  const out = []
  let i = 0
  let inCode = false
  let codeBuf = []
  let listType = null

  const flushList = () => {
    if (listType) {
      out.push(listType === 'ol' ? '</ol>' : '</ul>')
      listType = null
    }
  }

  while (i < lines.length) {
    const line = lines[i]

    if (line.startsWith('```')) {
      if (inCode) {
        out.push(`<pre><code>${escapeHtml(codeBuf.join('\n'))}</code></pre>`)
        codeBuf = []
        inCode = false
      } else {
        flushList()
        inCode = true
      }
      i++
      continue
    }
    if (inCode) {
      codeBuf.push(line)
      i++
      continue
    }

    if (line.startsWith('|')) {
      flushList()
      const tableLines = []
      while (i < lines.length && lines[i].startsWith('|')) {
        tableLines.push(lines[i])
        i++
      }
      out.push(parseTable(tableLines))
      continue
    }

    const h3 = line.match(/^### (.+)/)
    if (h3) {
      flushList()
      out.push(`<h3>${inlineMd(h3[1])}</h3>`)
      i++
      continue
    }
    const h2 = line.match(/^## (.+)/)
    if (h2) {
      flushList()
      const label = h2[1]
      const slide = label.match(/^Slide (\d+)/)
      const id = headingId(label)
      out.push(
        slide
          ? `<h2 class="slide-note" id="${id}"><span class="slide-num">Slide ${slide[1]}</span>${inlineMd(label.replace(/^Slide \d+ —\s*/, ''))}</h2>`
          : `<h2 id="${id}">${inlineMd(label)}</h2>`,
      )
      i++
      continue
    }
    const h1 = line.match(/^# (.+)/)
    if (h1) {
      flushList()
      out.push(`<h1>${inlineMd(h1[1])}</h1>`)
      i++
      continue
    }

    if (line === '---') {
      flushList()
      out.push('<hr />')
      i++
      continue
    }

    const bq = line.match(/^> (.+)/)
    if (bq) {
      flushList()
      out.push(`<blockquote>${inlineMd(bq[1])}</blockquote>`)
      i++
      continue
    }

    const ul = line.match(/^- (.+)/)
    if (ul) {
      if (listType !== 'ul') {
        flushList()
        out.push('<ul>')
        listType = 'ul'
      }
      out.push(`<li>${inlineMd(ul[1])}</li>`)
      i++
      continue
    }

    const ol = line.match(/^\d+\. (.+)/)
    if (ol) {
      if (listType !== 'ol') {
        flushList()
        out.push('<ol>')
        listType = 'ol'
      }
      out.push(`<li>${inlineMd(ol[1])}</li>`)
      i++
      continue
    }

    if (line.trim() === '') {
      flushList()
      i++
      continue
    }

    flushList()
    const presenter = line.match(/^\*\*Notes présentateur :\*\* (.+)/)
    if (presenter) {
      out.push(`<p class="presenter-note"><strong>Notes présentateur :</strong> ${inlineMd(presenter[1])}</p>`)
    } else {
      out.push(`<p>${inlineMd(line)}</p>`)
    }
    i++
  }
  flushList()
  return out.join('\n')
}

function baseStyles(extra = '') {
  return `
    :root {
      --green: #0b4a2c;
      --green-mist: #dceee4;
      --orange: #e85d04;
      --ink: #111827;
      --mute: #4b5563;
      --paper: #f6f5f2;
      --sans: "DM Sans", ui-sans-serif, system-ui, sans-serif;
      --display: "Fraunces", ui-serif, Georgia, serif;
    }
    * { box-sizing: border-box; }
    @page { size: A4; margin: 18mm 16mm 20mm; }
    body {
      margin: 0;
      font-family: var(--sans);
      font-size: 10.5pt;
      line-height: 1.55;
      color: var(--ink);
      background: #fff;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .doc-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 1rem;
      margin-bottom: 1rem;
      padding-bottom: 0.75rem;
      border-bottom: 2px solid var(--green);
    }
    .doc-header h1 {
      font-family: var(--display);
      font-size: 18pt;
      color: var(--green);
      margin: 0;
      line-height: 1.15;
    }
    .doc-header p { margin: 0.25rem 0 0; color: var(--mute); font-size: 9.5pt; }
    .badge {
      flex-shrink: 0;
      font-size: 8pt;
      font-weight: 700;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: #9a3412;
      background: #ffedd5;
      border: 1px solid #fdba74;
      border-radius: 999px;
      padding: 0.25rem 0.55rem;
    }
    .cover {
      page-break-after: always;
      min-height: 250mm;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      padding: 8mm 0 0;
      border-bottom: 4px solid var(--green);
    }
    .cover-mark {
      width: 52px; height: 52px; border-radius: 14px;
      background: var(--green); color: #fff;
      display: grid; place-items: center;
      font-family: var(--display); font-size: 28px; font-weight: 700;
    }
    .cover h1 {
      font-family: var(--display);
      font-size: 32pt; line-height: 1.08; color: var(--green);
      margin: 18mm 0 0.4rem; max-width: 14ch;
    }
    .cover .tagline { font-size: 13pt; color: var(--mute); max-width: 38ch; margin-bottom: 1rem; }
    .cover .pill-row { display: flex; flex-wrap: wrap; gap: 0.4rem; margin: 1rem 0 2rem; }
    .pill {
      font-size: 8.5pt; font-weight: 600; padding: 0.28rem 0.55rem;
      border-radius: 999px; background: var(--green-mist); color: var(--green);
    }
    .contact-card {
      margin-top: auto; padding: 1rem 1.1rem; border-radius: 12px;
      background: var(--paper); border: 1px solid rgba(11, 74, 44, 0.12);
    }
    .contact-card h2 { font-size: 11pt; margin: 0 0 0.65rem; color: var(--green); }
    .contact-card p { margin: 0.25rem 0; font-size: 10pt; }
    .contact-card a { color: var(--green); text-decoration: none; font-weight: 600; }
    main > h1:first-child { display: none; }
    h2 {
      font-family: var(--display);
      font-size: 15pt; color: var(--green);
      margin: 1.35rem 0 0.55rem;
      page-break-after: avoid;
    }
    h2.slide-note { display: flex; flex-wrap: wrap; align-items: baseline; gap: 0.5rem; }
    .slide-num {
      font-family: var(--sans);
      font-size: 8.5pt; font-weight: 700; letter-spacing: 0.08em;
      text-transform: uppercase; color: #fff; background: var(--orange);
      border-radius: 999px; padding: 0.15rem 0.5rem;
    }
    h3 { font-size: 11pt; margin: 1rem 0 0.35rem; page-break-after: avoid; }
    p { margin: 0.35rem 0 0.65rem; }
    p.presenter-note {
      margin: 0.5rem 0 0.85rem; padding: 0.55rem 0.75rem;
      border-left: 3px solid var(--orange); background: #fff7f0; font-size: 10pt;
    }
    hr { border: 0; border-top: 1px solid rgba(17, 24, 39, 0.1); margin: 1rem 0; }
    table {
      width: 100%; border-collapse: collapse; font-size: 9pt;
      margin: 0.5rem 0 1rem; page-break-inside: avoid;
    }
    th, td {
      border: 1px solid rgba(17, 24, 39, 0.12);
      padding: 0.35rem 0.45rem; vertical-align: top; text-align: left;
    }
    th { background: var(--green-mist); color: var(--green); font-weight: 600; }
    ul, ol { margin: 0.35rem 0 0.75rem 1.1rem; padding: 0; }
    li { margin: 0.2rem 0; }
    blockquote {
      margin: 0.5rem 0 0.85rem; padding: 0.55rem 0.75rem;
      border-left: 3px solid var(--orange); background: #fff7f0; font-size: 10pt;
    }
    pre {
      font-size: 8pt; background: var(--paper); padding: 0.65rem;
      border-radius: 8px; white-space: pre-wrap; page-break-inside: avoid;
    }
    code { font-size: 9pt; }
    a { color: var(--green); }
    h2#table-des-matieres + ol {
      columns: 2;
      column-gap: 1.5rem;
      font-size: 10pt;
      page-break-after: always;
    }
    h2#table-des-matieres + ol li { break-inside: avoid; }
    .footer-note {
      margin-top: 1.5rem; padding-top: 0.75rem;
      border-top: 1px solid rgba(17, 24, 39, 0.1);
      font-size: 8.5pt; color: var(--mute); text-align: center;
    }
    ${extra}
  `
}

function wrapClientHtml(body) {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <title>TraceO® — Fiche client</title>
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,600;9..40,700&family=Fraunces:opsz,wght@9..144,600;9..144,700&display=swap" rel="stylesheet" />
  <style>${baseStyles()}</style>
</head>
<body>
  <section class="cover">
    <div>
      <div class="cover-mark" aria-hidden="true">O</div>
      <h1>TraceO®</h1>
      <p class="tagline">La plateforme de traçabilité des opérations terrain.</p>
      <div class="pill-row">
        <span class="pill">Photos</span><span class="pill">Quantités déclarées</span>
        <span class="pill">Code SMS responsable</span><span class="pill">Certificat consultable</span>
      </div>
    </div>
    <div class="contact-card">
      <h2>${CONTACT.label}</h2>
      <p>E-mail · <a href="mailto:${CONTACT.email}">${CONTACT.email}</a></p>
      <p>Site · <a href="${CONTACT.site}">${CONTACT.siteLabel}</a></p>
      <p>Téléphone · <a href="${CONTACT.phoneHref}">${CONTACT.phone}</a></p>
    </div>
  </section>
  <main>${body}<p class="footer-note">Document commercial TraceO® — ${new Date().getFullYear()}</p></main>
</body>
</html>`
}

function wrapBtpExecutiveHtml(body) {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <title>TraceO BTP — Synthèse exécutive</title>
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,600;9..40,700&family=Fraunces:opsz,wght@9..144,600;9..144,700&display=swap" rel="stylesheet" />
  <style>${baseStyles(`
    .cover h1 { max-width: 20ch; font-size: 28pt; }
    .cover .tagline { max-width: 42ch; }
  `)}</style>
</head>
<body>
  <section class="cover">
    <div>
      <div class="cover-mark" aria-hidden="true">O</div>
      <h1>TraceO® BTP</h1>
      <p class="tagline">Synthèse exécutive — Approvisionnement, consommation et enveloppe chantier</p>
      <div class="pill-row">
        <span class="pill">Circuit achats</span>
        <span class="pill">F01 enveloppe CdG</span>
        <span class="pill">F02–F07 · F09</span>
        <span class="pill">Hors F08 · F10</span>
      </div>
    </div>
    <div class="contact-card">
      <h2>Document de décision — ${new Date().toLocaleDateString('fr-FR')}</h2>
      <p>Diagnostic AS-IS · CDC Fadym (sauf F08, F10) · Circuit pilote + F01.1 hors prod</p>
      <p>TraceO® · ${CONTACT.siteLabel}</p>
    </div>
  </section>
  <main>${body}<p class="footer-note">TraceO® BTP — Synthèse exécutive direction — ${new Date().getFullYear()}</p></main>
</body>
</html>`
}

function wrapBtpOptionsHtml(body) {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <title>TraceO BTP — Options digitalisation EB</title>
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,600;9..40,700&family=Fraunces:opsz,wght@9..144,600;9..144,700&display=swap" rel="stylesheet" />
  <style>${baseStyles(`
    .cover h1 { max-width: 22ch; font-size: 26pt; }
    .cover .tagline { max-width: 44ch; }
  `)}</style>
</head>
<body>
  <section class="cover">
    <div>
      <div class="cover-mark" aria-hidden="true">O</div>
      <h1>TraceO® BTP</h1>
      <p class="tagline">Options de digitalisation de l’EB — Document de décision board</p>
      <div class="pill-row">
        <span class="pill">A1 – A8 comparées</span>
        <span class="pill">Coûts FCFA</span>
        <span class="pill">Recommandation A2+A5</span>
        <span class="pill">Gates A6 / A7</span>
      </div>
    </div>
    <div class="contact-card">
      <h2>Arbitrage board — ${new Date().toLocaleDateString('fr-FR')}</h2>
      <p>Huit options stratégiques · Matrices · Phasage pilote J0–J90</p>
      <p>TraceO® · ${CONTACT.siteLabel}</p>
    </div>
  </section>
  <main>${body}<p class="footer-note">TraceO® BTP — Options digitalisation EB — ${new Date().getFullYear()}</p></main>
</body>
</html>`
}

function wrapDocHtml({ title, badge, body }) {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,600;9..40,700&family=Fraunces:opsz,wght@9..144,600;9..144,700&display=swap" rel="stylesheet" />
  <style>${baseStyles()}</style>
</head>
<body>
  <header class="doc-header">
    <div>
      <h1>${escapeHtml(title)}</h1>
      <p>TraceO® · ${CONTACT.siteLabel}</p>
    </div>
    ${badge ? `<span class="badge">${escapeHtml(badge)}</span>` : ''}
  </header>
  <main>${body}<p class="footer-note">TraceO® — généré le ${new Date().toLocaleDateString('fr-FR')}</p></main>
</body>
</html>`
}

async function renderMarkdownPdf(page, job) {
  const inputPath = path.join(docs, job.input)
  let md = fs.readFileSync(inputPath, 'utf8')
  if (job.transform) md = job.transform(md)

  const body = mdToHtml(md)
  const html =
    job.variant === 'client'
      ? wrapClientHtml(body)
      : job.variant === 'btp'
        ? wrapBtpExecutiveHtml(body)
        : job.variant === 'btp-options'
          ? wrapBtpOptionsHtml(body)
          : wrapDocHtml({
            title: job.title ?? job.input.replace('.md', ''),
            badge: job.badge,
            body,
          })

  const htmlPath = path.join(docs, job.html)
  fs.writeFileSync(htmlPath, html, 'utf8')

  await page.goto(`file://${htmlPath}`, { waitUntil: 'networkidle' })
  const pdfPath = path.join(docs, job.output)
  await page.pdf({
    path: pdfPath,
    format: 'A4',
    printBackground: true,
    margin: { top: '0', right: '0', bottom: '0', left: '0' },
  })
  return pdfPath
}

async function renderSalesDeckPdf(page) {
  const htmlPath = path.join(docs, 'traceo-sales-deck-premium.html')
  const shotsDir = path.join(docs, 'maquettes/salesdeck-preview/pdf-export')
  fs.mkdirSync(shotsDir, { recursive: true })

  await page.setViewportSize({ width: 1600, height: 900 })
  await page.goto(`file://${htmlPath}`, { waitUntil: 'networkidle' })

  const slideCount = await page.locator('.slide').count()
  const shotPaths = []

  for (let i = 0; i < slideCount; i++) {
    await page.evaluate((idx) => {
      const slides = [...document.querySelectorAll('.slide')]
      slides.forEach((slide, n) => {
        slide.classList.toggle('on', n === idx)
      })
    }, i)
    await page.waitForTimeout(200)
    const shotPath = path.join(shotsDir, `slide-${String(i + 1).padStart(2, '0')}.png`)
    await page.locator('.stage').screenshot({ path: shotPath })
    shotPaths.push(shotPath)
  }

  const listPath = path.join(shotsDir, 'pages.txt')
  fs.writeFileSync(listPath, shotPaths.map((p) => path.relative(root, p)).join('\n') + '\n')

  const pdfPath = path.join(docs, 'TraceO_SalesDeck_Premium.pdf')
  const swift = path.join(docs, 'maquettes/salesdeck-preview/pdf-flat/makepdf.swift')
  const { spawnSync } = await import('node:child_process')
  const res = spawnSync('swift', [swift, listPath, pdfPath], { cwd: root, stdio: 'inherit' })
  if (res.status !== 0) {
    throw new Error('Échec makepdf.swift — sales deck non généré')
  }
  return pdfPath
}

async function main() {
  const filterId = process.argv[2]
  const jobs = filterId ? MARKDOWN_JOBS.filter((j) => j.id === filterId) : MARKDOWN_JOBS
  if (filterId && jobs.length === 0) {
    console.error(`Job inconnu: ${filterId}`)
    process.exit(1)
  }

  const browser = await chromium.launch()
  const page = await browser.newPage()
  const written = []

  for (const job of jobs) {
    const pdf = await renderMarkdownPdf(page, job)
    written.push(pdf)
    console.log(`✓ ${path.basename(pdf)}`)
  }

  if (!filterId) {
    const deckPdf = await renderSalesDeckPdf(page)
    written.push(deckPdf)
    console.log(`✓ ${path.basename(deckPdf)}`)
  }

  await browser.close()
  console.log(`\n${written.length} PDF générés dans docs/`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

import { chromium } from 'playwright'

const base = 'http://localhost:3002'
const browser = await chromium.launch()

async function checkRole(email, label, screenshot) {
  const page = await browser.newPage()
  await page.request.post(base + '/api/auth/login-dashboard', {
    data: { email, password: 'admin1234' },
  })
  await page.goto(base + '/manager?tab=suiviChantier', { waitUntil: 'networkidle' })
  await page.waitForTimeout(5000)
  const info = await page.evaluate(() => ({
    rootEnfants: document.getElementById('root')?.children.length ?? -1,
    bodyText: document.body.innerText,
  }))
  console.log(`\n===== ${label} =====`)
  console.log('root enfants:', info.rootEnfants)
  console.log('matrice affichée:', info.bodyText.includes('Matrice des accès') ? 'OUI' : 'NON')
  const checks = {
    'Dossiers du jour': info.bodyText.includes('Dossier'),
    'Enveloppe/Budget': info.bodyText.includes('Enveloppe') || info.bodyText.includes('Budget'),
    'Stock réel': info.bodyText.includes('Stock réel'),
    'Affectation': info.bodyText.includes('Affectation'),
    'Historique': info.bodyText.includes('Historique des rapports'),
    'Photos': info.bodyText.includes('Photos'),
  }
  for (const [k, v] of Object.entries(checks)) console.log(`  ${v ? '✅' : '❌'} ${k}`)
  await page.screenshot({ path: screenshot })
  await page.close()
}

await checkRole('dt@btp-pilote.ci', 'DT (Directeur technique)', '/tmp/role-dt.png')
await checkRole('cdc@btp-pilote.ci', 'CDC (Chef de chantier)', '/tmp/role-cdc.png')
await checkRole('daf@btp-pilote.ci', 'DAF', '/tmp/role-daf.png')

async function dumpBody(email) {
  const page = await browser.newPage()
  await page.request.post(base + '/api/auth/login-dashboard', {
    data: { email, password: 'admin1234' },
  })
  await page.goto(base + '/manager?tab=suiviChantier', { waitUntil: 'networkidle' })
  await page.waitForTimeout(5000)
  const txt = await page.evaluate(() => document.body.innerText.slice(0, 500))
  console.log(`\n===== DUMP ${email} =====`)
  console.log('URL:', page.url())
  console.log(txt)
  await page.close()
}

await dumpBody('cdc@btp-pilote.ci')
await dumpBody('daf@btp-pilote.ci')

async function diagRole(email) {
  const page = await browser.newPage()
  const bad = []
  page.on('response', (r) => { if (r.status() >= 400) bad.push(`[${r.status()}] ${r.url().slice(0, 130)}`) })
  page.on('pageerror', (e) => bad.push(`[PAGEERROR] ${e.message.slice(0, 300)}`))
  await page.request.post(base + '/api/auth/login-dashboard', {
    data: { email, password: 'admin1234' },
  })
  await page.goto(base + '/manager?tab=suiviChantier', { waitUntil: 'networkidle' })
  await page.waitForTimeout(5000)
  console.log(`\n===== DIAG ${email} — URL: ${page.url()} =====`)
  bad.forEach((b) => console.log(b))
  await page.close()
}

await diagRole('cdc@btp-pilote.ci')
await browser.close()

import { chromium } from 'playwright'

const base = 'https://pwa-livreur-travail-production.up.railway.app'
const browser = await chromium.launch()
const context = await browser.newContext()
const page = await context.newPage()
const logs = []
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text().slice(0, 400)}`))
page.on('pageerror', (e) => logs.push(`[PAGEERROR] ${e.message.slice(0, 600)}`))
page.on('requestfailed', (r) => logs.push(`[REQFAIL] ${r.url().slice(0, 140)} — ${r.failure()?.errorText}`))
page.on('response', (r) => {
  const ct = r.headers()['content-type'] ?? ''
  if (ct.includes('html') || ct.includes('javascript') || r.status() >= 400) {
    logs.push(`[RESP ${r.status()}] ${ct.split(';')[0]} ${r.url().slice(0, 120)}`)
  }
})

const loginRes = await page.request.post(base + '/api/auth/login-dashboard', {
  data: { email: 'dt@btp-pilote.ci', password: 'admin1234' },
})
console.log('login API:', loginRes.status())
const cookies = await context.cookies(base)
console.log('cookies:', cookies.map((c) => c.name).join(', '))

// Piège à erreurs installé AVANT les scripts de la page
await context.addInitScript(() => {
  window.__errs = []
  window.addEventListener('error', (e) => window.__errs.push('ERROR: ' + String(e.message).slice(0, 400)))
  window.addEventListener('unhandledrejection', (e) =>
    window.__errs.push('REJECTION: ' + String(e.reason?.message ?? e.reason).slice(0, 400)),
  )
  const origError = console.error.bind(console)
  console.error = (...args) => {
    window.__errs.push('CONSOLE.ERROR: ' + args.map((a) => String(a).slice(0, 200)).join(' | '))
    origError(...args)
  }
})

await page.goto(base + '/manager?tab=suiviChantier', { waitUntil: 'networkidle' })
await page.waitForTimeout(6000)

const allReqs = []
page.on('request', (r) => allReqs.push(`${r.method()} ${r.url().slice(0, 130)}`))
// recharge la page pour capturer TOUTES les requêtes depuis le début
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(6000)
console.log('=== TOUTES LES REQUÊTES (reload) ===')
allReqs.slice(0, 40).forEach((l) => console.log(l))

const rootInfo = await page.evaluate(() => {
  const root = document.getElementById('root')
  const boot = document.getElementById('traceo-boot')
  return {
    rootExiste: Boolean(root),
    rootEnfants: root ? root.children.length : -1,
    rootHtml: root ? root.innerHTML.slice(0, 300) : '(pas de #root)',
    bootPresent: Boolean(boot),
    bodyText: document.body.innerText.slice(0, 200),
  }
})
console.log('=== ÉTAT DU ROOT ===')
console.log(JSON.stringify(rootInfo, null, 2))
const errs = await page.evaluate(() => window.__errs ?? [])
console.log('=== ERREURS PIÉGÉES ===')
errs.slice(0, 15).forEach((e) => console.log(e))
console.log('=== LOGS ===')
logs.slice(0, 25).forEach((l) => console.log(l))
await browser.close()

/**
 * Diagnostic ponctuel — reproduction du 500 « Erreur serveur » observé sur le
 * login sa@btp-pilote.ci à l'étape mobile (palier 390px) de la non-régression,
 * + smoke test du nouvel endpoint `GET /procurement/treasury/history` (I112).
 * Usage : npx tsx scripts/check-e2e-login.ts [port=8888]
 */
const base = `http://localhost:${process.argv[2] ?? '8888'}`
const ADMIN = { 'X-Admin-Token': 'e2e-admin-token-dev-only', 'Content-Type': 'application/json' }

const reset = await fetch(`${base}/api/admin/reset`, {
  method: 'POST',
  headers: ADMIN,
  body: JSON.stringify({ confirm: 'SUPPRIMER TOUTES LES DONNÉES' }),
})
console.log(`POST /api/admin/reset → ${reset.status}`)
if (!reset.ok) console.log((await reset.text()).slice(0, 300))

const seed = await fetch(`${base}/api/admin/seed`, { method: 'POST', headers: ADMIN })
console.log(`POST /api/admin/seed → ${seed.status}`)
if (!seed.ok) console.log((await seed.text()).slice(0, 300))

for (let i = 1; i <= 3; i++) {
  for (const email of [
    'dt@btp-pilote.ci',
    'sa@btp-pilote.ci',
    'cdg@btp-pilote.ci',
    'tresorerie@btp-pilote.ci',
  ]) {
    const res = await fetch(`${base}/api/v1/auth/login-dashboard`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'admin1234' }),
    })
    console.log(`login ${email} #${i} → ${res.status}`)
    if (email === 'tresorerie@btp-pilote.ci' && res.ok) {
      const cookie = (res.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ')
      const hist = await fetch(`${base}/api/v1/procurement/treasury/history`, {
        headers: cookie ? { cookie } : {},
      })
      const body = (await hist.json()) as { items?: unknown[]; message?: string }
      console.log(`  history → ${hist.status} · ${body.items?.length ?? '?'} item(s) ${body.message ?? ''}`)
    }
  }
}
process.exit(0)

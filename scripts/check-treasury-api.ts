/**
 * Diagnostic ponctuel — reproduit la connexion du poste Trésorerie puis
 * interroge la file `GET /procurement/treasury` sur le serveur de dev local.
 * Usage : npx tsx scripts/check-treasury-api.ts [port=8888]
 */
const base = `http://localhost:${process.argv[2] ?? '8888'}`

const login = await fetch(`${base}/api/v1/auth/login-dashboard`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: process.env.TREASURY_EMAIL ?? 'tresorerie@btp-pilote.ci',
    password: process.env.MANAGER_PASSWORD ?? 'admin1234',
  }),
})
console.log(`POST /auth/login-dashboard → ${login.status}`)
if (!login.ok) {
  console.log(await login.text())
  process.exit(1)
}
const cookies = (login.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ')
console.log(`Cookie de session : ${cookies ? 'reçu' : 'AUCUN'}`)

const res = await fetch(`${base}/api/v1/procurement/treasury`, {
  headers: cookies ? { cookie: cookies } : {},
})
console.log(`GET /procurement/treasury → ${res.status}`)
const body = (await res.json()) as { items?: unknown[]; message?: string }
console.log(`Éléments dans la file : ${body.items?.length ?? 0}`)
if (body.message) console.log(`Message : ${body.message}`)

// Le serveur qui tourne voit-il l'EB-2026-0031 dans la liste des demandes ?
const reqs = await fetch(`${base}/api/v1/procurement/requests`, {
  headers: cookies ? { cookie: cookies } : {},
})
const reqsBody = (await reqs.json()) as {
  requests?: Array<{ reference: string; status: string; id: string }>
}
console.log(`GET /procurement/requests → ${reqs.status} · ${reqsBody.requests?.length ?? 0} demande(s)`)
const target = reqsBody.requests?.find((r) => r.reference === 'EB-2026-0031')
console.log(
  target
    ? `EB-2026-0031 VUE PAR LE SERVEUR : id=${target.id} · status=${target.status}`
    : 'EB-2026-0031 ABSENTE de la liste renvoyée par le serveur qui tourne',
)
process.exit(0)

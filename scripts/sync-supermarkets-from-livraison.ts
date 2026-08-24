/**
 * Importe les points de livraison depuis l'API Livraison (port 3001)
 * vers la base pwa-livreur (Netlify DB / seed).
 *
 * Usage :
 *   LIVRAISON_API=http://localhost:3001/api/v1 \
 *   LIVRAISON_MANAGER_EMAIL=manager@ferme-dupont.fr \
 *   LIVRAISON_MANAGER_PASSWORD=password123 \
 *   npx tsx scripts/sync-supermarkets-from-livraison.ts
 */
import { upsertSupermarket } from '../server/db/queries.js'

const BASE = process.env.LIVRAISON_API ?? 'http://localhost:3001/api/v1'
const EMAIL = process.env.LIVRAISON_MANAGER_EMAIL ?? 'manager@ferme-dupont.fr'
const PASSWORD = process.env.LIVRAISON_MANAGER_PASSWORD ?? 'password123'

type LivraisonRow = {
  id: string
  name: string
  address: string
  manager_phone?: string | null
  phone?: string | null
  manager_name?: string | null
  manager_email?: string | null
  lat?: number | null
  lng?: number | null
  active?: boolean
}

async function main() {
  const loginRes = await fetch(`${BASE}/auth/login-dashboard`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  })
  if (!loginRes.ok) {
    throw new Error(`Login Livraison échoué (${loginRes.status})`)
  }
  const login = (await loginRes.json()) as { tokens: { accessToken: string } }
  const token = login.tokens.accessToken

  const res = await fetch(`${BASE}/dashboard/supermarkets?all=true`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) {
    throw new Error(`GET supermarkets échoué (${res.status})`)
  }
  const data = (await res.json()) as { supermarkets: LivraisonRow[] }
  const rows = data.supermarkets ?? []

  for (const row of rows) {
    await upsertSupermarket(row.id, {
      name: row.name,
      address: row.address,
      contactPhone: row.manager_phone ?? row.phone ?? '+2250000000000',
      contactName: row.manager_name ?? undefined,
      contactEmail: row.manager_email ?? undefined,
      lat: row.lat != null ? String(row.lat) : undefined,
      lng: row.lng != null ? String(row.lng) : undefined,
      active: row.active !== false,
    })
    console.log(`✓ ${row.name}`)
  }

  console.log(`\n${rows.length} point(s) de livraison importé(s).`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

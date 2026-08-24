#!/usr/bin/env node
/**
 * Onboarding CLI — entreprise pilote BTP Achats-Chantier.
 *
 * Usage :
 *   node scripts/onboard-btp-pilot.mjs
 *   node scripts/onboard-btp-pilot.mjs --seed-only
 *
 * Prérequis : netlify dev sur :8888, ALLOW_SEED=true, ADMIN_API_TOKEN si configuré.
 */

const API_BASE = process.env.API_BASE?.replace(/\/$/, '') || 'http://localhost:8888/api/v1'
const ADMIN_TOKEN = process.env.ADMIN_API_TOKEN?.trim()

async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) }
  if (ADMIN_TOKEN) headers['X-Admin-Token'] = ADMIN_TOKEN
  const res = await fetch(`${API_BASE}${path}`, { ...options, headers })
  const text = await res.text()
  let body
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    body = text
  }
  if (!res.ok) {
    throw new Error(`${res.status} ${path}: ${typeof body === 'object' ? JSON.stringify(body) : body}`)
  }
  return body
}

async function main() {
  const seedOnly = process.argv.includes('--seed-only')

  console.log('TraceO — onboarding BTP pilote')
  console.log(`API: ${API_BASE}`)

  if (!seedOnly) {
    const health = await api('/health')
    console.log('Health:', health)
  }

  const seed = await api('/admin/seed-btp', { method: 'POST', body: '{}' })
  console.log('Seed BTP OK:', seed)

  if (!seedOnly) {
    const sim = await api('/whatsapp/simulate', {
      method: 'POST',
      body: JSON.stringify({
        companyId: 'co-btp-pilote',
        fromPhone: '+2250700112233',
        fromName: 'Technicien chantier',
        text: '50 sacs ciment, 20 barres fer pour chantier',
        siteId: 'site-btp-pilote-1',
      }),
    })
    console.log('WhatsApp simulate OK:', sim)
  }

  console.log('Comptes pilote :')
  console.log('  DT  → dt@btp-pilote.ci / admin1234')
  console.log('  DAF → daf@btp-pilote.ci / admin1234')
  console.log('  SA  → sa@btp-pilote.ci / admin1234')
  console.log('  Chauffeur → +2250700998877 / PIN 1234')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

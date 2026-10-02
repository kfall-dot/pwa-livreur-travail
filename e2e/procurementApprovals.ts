import { request as newApiRequest, type APIRequestContext } from '@playwright/test'
import { API_BASE } from './helpers'

/**
 * Préparation des files d'approbation du module Achats, par l'API.
 *
 * Le seed ne crée aucune EB : les écrans d'approbation (CdG, DAF, PDG) seraient
 * vides, donc invérifiables. On déroule ici le circuit réel — DT colle et
 * soumet, SA chiffre et transmet, CdG puis DAF approuvent — en s'arrêtant à
 * chaque étape pour qu'il reste un dossier dans la file de chaque rôle.
 *
 * Comptes : `server/db/seedBtpPilot.ts:24-48` (seule entreprise à porter les
 * rôles d'approbation, avec son chantier `site-btp-pilote-1`).
 * NIP de signature : `server/services/ebSignature.ts:33-39`, indexés par
 * identifiant de gestionnaire — ils correspondent exactement au seed.
 * Mot de passe : `MANAGER_PASSWORD ?? 'admin1234'` (seedBtpPilot.ts:97).
 */
const BTP_PASSWORD = process.env.MANAGER_PASSWORD ?? 'admin1234'

export const BTP_ACCOUNTS = {
  dt: { email: 'dt@btp-pilote.ci', pin: '1234' },
  sa: { email: 'sa@btp-pilote.ci', pin: '0000' },
  cdg: { email: 'cdg@btp-pilote.ci', pin: '2468' },
  daf: { email: 'daf@btp-pilote.ci', pin: '5678' },
  pdg: { email: 'pdg@btp-pilote.ci', pin: '9999' },
  cmpt: { email: 'cmpt@btp-pilote.ci', pin: '' },
  chef: { email: 'cdc@btp-pilote.ci', pin: '' },
} as const

type ApprovalRole = keyof typeof BTP_ACCOUNTS

/** Étapes du circuit : un dossier est laissé à chacune pour remplir les files. */
const STAGES = ['submitted', 'cdg_review', 'daf_review', 'pdg_review'] as const

/**
 * Étape à préparer pour le rôle capturé. Fabriquer les quatre dossiers à chaque
 * run coûtait ~3 min de préparation pour n'en mesurer qu'un : on ne monte donc
 * que l'étape utile. DT et SA lisent la file `submitted` ; chaque approbateur a
 * la sienne. Le comptable et le chef de chantier voient toutes les demandes.
 */
const STAGE_BY_ROLE: Record<string, (typeof STAGES)[number]> = {
  dt: 'submitted',
  sa: 'submitted',
  cdg: 'cdg_review',
  daf: 'daf_review',
  pdg: 'pdg_review',
  cmpt: 'submitted',
  chef: 'submitted',
}

const BTP_SITE_ID = 'site-btp-pilote-1'

const EB_SAMPLE = `Besoins chantier :
50 sacs ciment CPA 50kg
20 barres fer a beton HA12 12m`

/** Lignes de repli si le parseur local ne reconnaît rien dans l'échantillon. */
const EB_FALLBACK_LINES = [
  { label: 'Ciment CPA 50 kg', quantity: 50, unit: 'sac' },
  { label: 'Fer à béton HA12 (12 m)', quantity: 20, unit: 'barre' },
]

/**
 * 25 000 FCFA par ligne : le total dépasse le seuil BT (défaut 1 000 000) pour
 * que le dossier passe aussi par le PDG — l'écran d'approbation le plus dense.
 * Mode « virement » : évite la branche trésorerie (comptant), qui ajoute une
 * seconde validation DAF sans rapport avec le responsive.
 */
const LINE_UNIT_PRICE = 25_000

/** PNG 1×1 : la pièce jointe est obligatoire sur chaque ligne (saFinanceGate). */
const ATTACHMENT = {
  fileName: 'devis-fournisseur.png',
  contentType: 'image/png',
  data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==',
}

async function getJson<T>(ctx: APIRequestContext, path: string): Promise<T | null> {
  const res = await ctx.get(`${API_BASE}/api/v1${path}`)
  return res.ok() ? ((await res.json()) as T) : null
}

/** Contexte API authentifié par compte : un cookie de session isolé par rôle. */
async function loginAs(role: ApprovalRole): Promise<APIRequestContext> {
  const ctx = await newApiRequest.newContext({ baseURL: API_BASE })
  const res = await ctx.post(`${API_BASE}/api/v1/auth/login-dashboard`, {
    data: { email: BTP_ACCOUNTS[role].email, password: BTP_PASSWORD },
  })
  if (res.ok()) return ctx
  await ctx.dispose()
  throw new Error(`connexion ${role} refusée (${res.status()})`)
}

/** DT : collage WhatsApp → brouillon → soumission signée (NIP). */
async function createSubmittedRequest(
  dt: APIRequestContext,
  siteId: string,
  notes: string[],
): Promise<string | null> {
  const paste = await dt.post(`${API_BASE}/api/v1/procurement/drafts/from-paste`, {
    data: { bodyText: EB_SAMPLE, siteId },
  })
  if (!paste.ok()) {
    notes.push(`collage DT refusé (${paste.status()})`)
    return null
  }
  const { draftId, lines } = (await paste.json()) as { draftId?: string; lines?: unknown[] }
  if (!draftId) return null
  if (!Array.isArray(lines) || lines.length === 0) {
    await dt.patch(`${API_BASE}/api/v1/procurement/drafts/${encodeURIComponent(draftId)}`, {
      data: { parsedLines: EB_FALLBACK_LINES, siteId },
    })
  }
  const submit = await dt.post(
    `${API_BASE}/api/v1/procurement/drafts/${encodeURIComponent(draftId)}/submit`,
    {
      data: {
        requesterName: 'Conducteur de travaux',
        objet: 'EB revue responsive',
        pin: BTP_ACCOUNTS.dt.pin,
      },
    },
  )
  if (!submit.ok()) {
    notes.push(`soumission DT refusée (${submit.status()})`)
    return null
  }
  const body = (await submit.json()) as { request?: { id?: string } }
  return body.request?.id ?? null
}

/** SA : chiffrage complet (PU + fournisseur + mode + pièce jointe) puis envoi CdG. */
async function priceAndSendToCdg(
  sa: APIRequestContext,
  requestId: string,
  notes: string[],
): Promise<boolean> {
  const detail = await getJson<{ lines?: { id: string; label?: string }[] }>(
    sa,
    `/procurement/requests/${encodeURIComponent(requestId)}`,
  )
  const lines = (detail?.lines ?? []).filter((l) => (l.label ?? '').trim())
  if (lines.length === 0) {
    notes.push('demande sans ligne exploitable')
    return false
  }
  const priced = await sa.patch(
    `${API_BASE}/api/v1/procurement/requests/${encodeURIComponent(requestId)}/pricing`,
    {
      data: {
        lines: lines.map((l) => ({
          id: l.id,
          unitPriceFcfa: LINE_UNIT_PRICE,
          supplierName: 'Fournisseur BTP',
          paymentMode: 'virement',
        })),
      },
    },
  )
  if (!priced.ok()) {
    notes.push(`chiffrage SA refusé (${priced.status()})`)
    return false
  }
  // Pièce jointe obligatoire sur chaque ligne — sans elle, l'envoi au CdG
  // renvoie 400 et les files CdG/DAF/PDG restent vides.
  for (const line of lines) {
    const upload = await sa.post(
      `${API_BASE}/api/v1/procurement/requests/${encodeURIComponent(requestId)}/lines/${encodeURIComponent(line.id)}/attachment`,
      { data: ATTACHMENT },
    )
    if (!upload.ok()) notes.push(`pièce jointe refusée (${upload.status()})`)
  }
  const sent = await sa.post(
    `${API_BASE}/api/v1/procurement/requests/${encodeURIComponent(requestId)}/submit-finance`,
    { data: {} },
  )
  if (!sent.ok()) {
    notes.push(`envoi au CdG refusé (${sent.status()}) — files CdG/DAF/PDG non remplies`)
    return false
  }
  return true
}

/** Approbation signée par NIP (obligatoire pour CdG, DAF et PDG). */
async function approveAs(
  ctx: APIRequestContext,
  requestId: string,
  role: 'cdg' | 'daf' | 'pdg',
  notes: string[],
): Promise<boolean> {
  const res = await ctx.post(
    `${API_BASE}/api/v1/procurement/requests/${encodeURIComponent(requestId)}/approve`,
    {
      data: {
        pin: BTP_ACCOUNTS[role].pin,
        comment: `Validation ${role.toUpperCase()} (revue responsive)`,
      },
    },
  )
  if (res.ok()) return true
  notes.push(`approbation ${role} refusée (${res.status()})`)
  return false
}

/**
 * Remplit la file d'approbation du rôle capturé (`role`) — ou toutes les files
 * si aucun rôle n'est fourni. Meilleure effort intégral : toute entrave est
 * consignée dans `notes` et affichée en fin de run, jamais un échec — une
 * donnée absente ne doit pas faire passer un test de layout pour cassé.
 */
export async function seedApprovalQueues(notes: string[], role?: string): Promise<void> {
  const opened = new Map<ApprovalRole, APIRequestContext>()
  const ctxFor = async (target: ApprovalRole): Promise<APIRequestContext> => {
    const existing = opened.get(target)
    if (existing) return existing
    const created = await loginAs(target)
    opened.set(target, created)
    return created
  }

  try {
    const dt = await ctxFor('dt')
    const sites = await getJson<{ sites?: { id: string }[] }>(dt, '/procurement/sites')
    const siteId = sites?.sites?.find((s) => s.id === BTP_SITE_ID)?.id ?? sites?.sites?.[0]?.id
    if (!siteId) {
      notes.push('aucun chantier BTP — files d’approbation non remplies')
      return
    }

    // Un brouillon conservé : c'est lui qui alimente la fiche EB du DT.
    await dt.post(`${API_BASE}/api/v1/procurement/drafts/from-paste`, {
      data: { bodyText: EB_SAMPLE, siteId },
    })

    const stages = role && STAGE_BY_ROLE[role] ? [STAGE_BY_ROLE[role]] : [...STAGES]
    for (const stage of stages) {
      const requestId = await createSubmittedRequest(dt, siteId, notes)
      if (!requestId) return
      if (stage === 'submitted') continue

      const sa = await ctxFor('sa')
      if (!(await priceAndSendToCdg(sa, requestId, notes))) continue
      if (stage === 'cdg_review') continue

      const cdg = await ctxFor('cdg')
      if (!(await approveAs(cdg, requestId, 'cdg', notes))) continue
      if (stage === 'daf_review') continue

      const daf = await ctxFor('daf')
      await approveAs(daf, requestId, 'daf', notes)
    }
  } catch (err) {
    notes.push(`préparation des files : ${err instanceof Error ? err.message : String(err)}`)
  } finally {
    for (const ctx of opened.values()) await ctx.dispose()
  }
}

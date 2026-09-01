import { authFetch, BASE as API_ROOT } from '../managerApi'
import type {
  ApproveRejectPayload,
  CreatePoPayload,
  DraftDetailResponse,
  DraftUpdatePayload,
  ParsedEbLine,
  ProcurementConfig,
  PurchaseRequestDraftRow,
  PurchaseRequestRow,
  RequestDetailResponse,
  ScheduleDeliveryPayload,
  SiteRow,
  SupplierRow,
  BcRegisterRow,
  SiteBudget,
  SiteIndicators,
} from './procurementTypes'

const BASE = '/procurement'

/**
 * Extrait le message d'erreur du serveur. Si la réponse n'est pas du JSON
 * (502/504 de la gateway pendant un redéploiement Railway), renvoie un
 * message actionnable au lieu d'un fallback générique incompréhensible.
 */
async function apiErrorMessage(res: Response, fallback: string): Promise<Error> {
  const err = (await res.json().catch(() => null)) as { message?: string } | null
  if (err == null) {
    return new Error('Serveur momentanément indisponible (redéploiement en cours ?) — réessayez dans 1 minute.')
  }
  return new Error(err.message ?? fallback)
}

export async function fetchProcurementConfig(): Promise<ProcurementConfig> {
  const res = await authFetch(`${BASE}/config`)
  if (!res.ok) throw new Error('Config achats indisponible')
  return res.json() as Promise<ProcurementConfig>
}

export async function patchBcRegisterFollowup(
  purchaseOrderId: string,
  patch: { invoice?: string; justifs?: string; observation?: string; verification?: string },
): Promise<BcRegisterRow> {
  const res = await authFetch(`${BASE}/bc-register/${encodeURIComponent(purchaseOrderId)}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })
  if (!res.ok) {
    throw await apiErrorMessage(res, 'Enregistrement suivi BC impossible')
  }
  const data = await res.json() as { row: BcRegisterRow }
  return data.row
}

export async function fetchSites(): Promise<SiteRow[]> {
  const res = await authFetch(`${BASE}/sites`)
  if (!res.ok) throw new Error('Chantiers indisponibles')
  const data = await res.json() as { sites: SiteRow[] }
  return data.sites ?? []
}

export async function fetchSiteIndicators(siteId: string): Promise<SiteIndicators> {
  const res = await authFetch(`${BASE}/sites/${encodeURIComponent(siteId)}/indicators`)
  if (res.status === 404) throw new Error('Chantier introuvable')
  if (!res.ok) throw new Error('Indicateurs chantier indisponibles')
  return res.json() as Promise<SiteIndicators>
}

export async function fetchSiteBudget(siteId: string): Promise<SiteBudget> {
  const res = await authFetch(`${BASE}/sites/${encodeURIComponent(siteId)}/budget`)
  if (res.status === 404) throw new Error('Chantier introuvable')
  if (!res.ok) throw new Error('Budget chantier indisponible')
  return res.json() as Promise<SiteBudget>
}

export async function fetchSiteBudgets(): Promise<SiteBudget[]> {
  const res = await authFetch(`${BASE}/site-budgets`)
  if (!res.ok) throw new Error('Budgets chantier indisponibles')
  const data = await res.json() as { budgets: SiteBudget[] }
  return data.budgets ?? []
}

/** Dépenses engagées du mois (YYYY-MM), ventilées par chantier. */
export async function fetchSiteMonthlyExpenses(
  month: string,
): Promise<{ siteId: string; amountFcfa: number }[]> {
  const res = await authFetch(`${BASE}/site-budgets/monthly?month=${encodeURIComponent(month)}`)
  if (!res.ok) throw new Error('Dépenses mensuelles indisponibles')
  const data = await res.json() as { expenses?: { siteId: string; amountFcfa: number }[] }
  return data.expenses ?? []
}

export async function freezeSiteBudget(siteId: string, amountFcfa: number, pin: string): Promise<SiteBudget> {
  const res = await authFetch(`${BASE}/sites/${encodeURIComponent(siteId)}/budget/freeze`, {
    method: 'POST',
    body: JSON.stringify({ amountFcfa, pin }),
  })
  const data = await res.json().catch(() => ({})) as SiteBudget & { message?: string }
  if (!res.ok) throw await apiErrorMessage(res, 'Gel de l’enveloppe impossible')
  return data
}

export async function createSiteBudgetAmendment(
  siteId: string,
  signedAmountFcfa: number,
  reason: string,
): Promise<SiteBudget> {
  const res = await authFetch(`${BASE}/sites/${encodeURIComponent(siteId)}/budget/amendments`, {
    method: 'POST',
    body: JSON.stringify({ signedAmountFcfa, reason }),
  })
  const data = await res.json().catch(() => ({})) as SiteBudget & { message?: string }
  if (!res.ok) throw await apiErrorMessage(res, 'Avenant impossible')
  return data
}

export async function decideSiteBudgetAmendment(
  siteId: string,
  amendmentId: string,
  decision: 'approve' | 'reject',
  pin: string,
  comment?: string,
): Promise<SiteBudget> {
  const res = await authFetch(
    `${BASE}/sites/${encodeURIComponent(siteId)}/budget/amendments/${encodeURIComponent(amendmentId)}/${decision}`,
    { method: 'POST', body: JSON.stringify({ pin, comment }) },
  )
  const data = await res.json().catch(() => ({})) as SiteBudget & { message?: string }
  if (!res.ok) throw await apiErrorMessage(res, 'Décision avenant impossible')
  return data
}

export async function fetchSuppliers(): Promise<SupplierRow[]> {
  const res = await authFetch(`${BASE}/suppliers`)
  if (!res.ok) throw new Error('Fournisseurs indisponibles')
  const data = await res.json() as { suppliers: SupplierRow[] }
  return data.suppliers ?? []
}

export async function fetchDrafts(needsReview?: boolean): Promise<PurchaseRequestDraftRow[]> {
  const q = needsReview ? '?needsReview=true' : ''
  const res = await authFetch(`${BASE}/drafts${q}`)
  if (!res.ok) throw new Error('Brouillons indisponibles')
  const data = await res.json() as { drafts: PurchaseRequestDraftRow[] }
  return data.drafts ?? []
}

export async function fetchDraftInboxCount(): Promise<number> {
  const res = await authFetch(`${BASE}/inbox-count`)
  if (!res.ok) {
    const fallback = await authFetch(`${BASE}/drafts?needsReview=true`)
    if (!fallback.ok) return 0
    const data = await fallback.json() as { count?: number; drafts?: PurchaseRequestDraftRow[] }
    return data.count ?? data.drafts?.length ?? 0
  }
  const data = await res.json() as { count?: number }
  return data.count ?? 0
}

export async function fetchDraft(id: string): Promise<DraftDetailResponse> {
  const res = await authFetch(`${BASE}/drafts/${encodeURIComponent(id)}`)
  if (!res.ok) {
    throw await apiErrorMessage(res, 'Brouillon introuvable')
  }
  return res.json() as Promise<DraftDetailResponse>
}

export async function updateDraft(id: string, payload: DraftUpdatePayload): Promise<PurchaseRequestDraftRow> {
  const res = await authFetch(`${BASE}/drafts/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    throw await apiErrorMessage(res, 'Mise à jour du brouillon échouée')
  }
  const data = await res.json() as { draft: PurchaseRequestDraftRow }
  return data.draft
}

/**
 * Suppression logique d’un brouillon d’EB (statut "deleted" + ebParseRuns "archived").
 */
export async function archiveDraft(id: string): Promise<void> {
  const res = await authFetch(`${BASE}/drafts/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
  if (!res.ok) {
    throw await apiErrorMessage(res, 'Suppression du brouillon impossible')
  }
}

export async function pasteWhatsappDraft(payload: {
  bodyText: string
  siteId?: string
}): Promise<{ draftId: string; lines: ParsedEbLine[]; confidenceScore: number }> {
  const res = await authFetch(`${BASE}/drafts/from-paste`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    throw await apiErrorMessage(res, 'Collage WhatsApp échoué')
  }
  return res.json() as Promise<{ draftId: string; lines: ParsedEbLine[]; confidenceScore: number }>
}

export async function createBlankEbFiche(payload?: { siteId?: string }): Promise<{ draftId: string; siteId: string | null }> {
  const res = await authFetch(`${BASE}/drafts/blank`, {
    method: 'POST',
    body: JSON.stringify(payload ?? {}),
  })
  if (!res.ok) {
    throw await apiErrorMessage(res, 'Création de fiche vierge échouée')
  }
  return res.json() as Promise<{ draftId: string; siteId: string | null }>
}

export async function submitDraft(
  id: string,
  payload?: { pin?: string; requesterName?: string; objet?: string; neededBy?: string },
): Promise<PurchaseRequestRow> {
  const res = await authFetch(`${BASE}/drafts/${encodeURIComponent(id)}/submit`, {
    method: 'POST',
    body: JSON.stringify(payload ?? {}),
  })
  if (!res.ok) {
    throw await apiErrorMessage(res, 'Soumission du brouillon échouée')
  }
  const data = await res.json() as { request: PurchaseRequestRow }
  return data.request
}

export async function fetchRequests(status?: string): Promise<PurchaseRequestRow[]> {
  const q = status ? `?status=${encodeURIComponent(status)}` : ''
  const res = await authFetch(`${BASE}/requests${q}`)
  if (!res.ok) throw new Error('Demandes indisponibles')
  const data = await res.json() as { requests: PurchaseRequestRow[] }
  return data.requests ?? []
}

export async function fetchRequest(id: string): Promise<RequestDetailResponse> {
  const res = await authFetch(`${BASE}/requests/${encodeURIComponent(id)}`)
  if (!res.ok) throw new Error('Demande introuvable')
  return res.json() as Promise<RequestDetailResponse>
}

export async function approveRequest(id: string, payload?: ApproveRejectPayload): Promise<RequestDetailResponse> {
  const res = await authFetch(`${BASE}/requests/${encodeURIComponent(id)}/approve`, {
    method: 'POST',
    body: JSON.stringify(payload ?? {}),
  })
  if (!res.ok) {
    throw await apiErrorMessage(res, 'Approbation échouée')
  }
  await res.json()
  return fetchRequest(id)
}

export async function rejectRequest(id: string, payload?: ApproveRejectPayload): Promise<RequestDetailResponse> {
  const res = await authFetch(`${BASE}/requests/${encodeURIComponent(id)}/reject`, {
    method: 'POST',
    body: JSON.stringify(payload ?? {}),
  })
  if (!res.ok) {
    throw await apiErrorMessage(res, 'Rejet échoué')
  }
  await res.json()
  return fetchRequest(id)
}

export async function createPurchaseOrder(id: string, payload: CreatePoPayload): Promise<RequestDetailResponse> {
  const res = await authFetch(`${BASE}/requests/${encodeURIComponent(id)}/create-po`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    throw await apiErrorMessage(res, 'Création BC échouée')
  }
  await res.json()
  return fetchRequest(id)
}

export async function scheduleDelivery(id: string, payload: ScheduleDeliveryPayload): Promise<RequestDetailResponse> {
  const res = await authFetch(`${BASE}/requests/${encodeURIComponent(id)}/schedule-delivery`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    throw await apiErrorMessage(res, 'Planification livraison échouée')
  }
  await res.json()
  return fetchRequest(id)
}

export async function updateRequestPricing(
  id: string,
  lines: Array<{
    id: string
    unitPriceFcfa: number
    supplierName?: string
    paymentMode?: string
    observation?: string
  }>,
): Promise<RequestDetailResponse> {
  const res = await authFetch(`${BASE}/requests/${encodeURIComponent(id)}/pricing`, {
    method: 'PATCH',
    body: JSON.stringify({ lines }),
  })
  if (!res.ok) {
    throw await apiErrorMessage(res, 'Enregistrement des prix échoué')
  }
  return res.json() as Promise<RequestDetailResponse>
}

export async function submitRequestFinance(id: string): Promise<{
  request: PurchaseRequestRow
  finance: { totalAmountFcfa: number; needsPdg: boolean; notifiedRoles: string[]; thresholdFcfa: number }
}> {
  const res = await authFetch(`${BASE}/requests/${encodeURIComponent(id)}/submit-finance`, {
    method: 'POST',
    body: JSON.stringify({}),
  })
  if (!res.ok) {
    throw await apiErrorMessage(res, 'Envoi au DAF échoué')
  }
  return res.json() as Promise<{
    request: PurchaseRequestRow
    finance: { totalAmountFcfa: number; needsPdg: boolean; notifiedRoles: string[]; thresholdFcfa: number }
  }>
}

export async function uploadRequestLineAttachment(
  requestId: string,
  lineId: string,
  file: File,
): Promise<RequestDetailResponse> {
  const buf = new Uint8Array(await file.arrayBuffer())
  const chunk = 8192
  let binary = ''
  for (let i = 0; i < buf.length; i += chunk) {
    binary += String.fromCharCode(...Array.from(buf.subarray(i, i + chunk)))
  }
  const data = btoa(binary)
  const res = await authFetch(`${BASE}/requests/${encodeURIComponent(requestId)}/lines/${encodeURIComponent(lineId)}/attachment`, {
    method: 'POST',
    body: JSON.stringify({
      fileName: file.name,
      contentType: file.type,
      data,
    }),
  })
  if (!res.ok) {
    throw await apiErrorMessage(res, 'Pièce jointe refusée')
  }
  return res.json() as Promise<RequestDetailResponse>
}

export async function removeRequestLineAttachment(
  requestId: string,
  lineId: string,
): Promise<RequestDetailResponse> {
  const res = await authFetch(`${BASE}/requests/${encodeURIComponent(requestId)}/lines/${encodeURIComponent(lineId)}/attachment`, {
    method: 'DELETE',
  })
  if (!res.ok) {
    throw await apiErrorMessage(res, 'Impossible de retirer la pièce jointe')
  }
  return res.json() as Promise<RequestDetailResponse>
}

export async function fetchRequestLineAttachment(
  requestId: string,
  lineId: string,
): Promise<{ blob: Blob; fileName: string | null; contentType: string }> {
  const res = await fetch(
    `${API_ROOT}${BASE}/requests/${encodeURIComponent(requestId)}/lines/${encodeURIComponent(lineId)}/attachment`,
    {
      credentials: 'include',
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
    },
  )
  if (!res.ok) {
    throw await apiErrorMessage(res, 'Pièce jointe introuvable')
  }
  const rawType = (res.headers.get('content-type') || 'application/octet-stream').split(';')[0].trim()
  const blob = new Blob([await res.arrayBuffer()], { type: rawType || 'application/octet-stream' })
  const named = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') || '')?.[1] ?? null
  return { blob, fileName: named, contentType: blob.type }
}

export function lineAttachmentUrl(requestId: string, lineId: string): string {
  const apiBase = (import.meta.env.VITE_API_URL as string | undefined)?.trim().replace(/\/$/, '') || '/api/v1'
  return `${apiBase}${BASE}/requests/${encodeURIComponent(requestId)}/lines/${encodeURIComponent(lineId)}/attachment`
}

export function documentHtmlUrl(poId: string): string {
  const apiBase = (import.meta.env.VITE_API_URL as string | undefined)?.trim().replace(/\/$/, '') || '/api/v1'
  return `${apiBase}${BASE}/documents/${encodeURIComponent(poId)}/html`
}

export function treasuryHtmlUrl(treasuryId: string): string {
  const apiBase = (import.meta.env.VITE_API_URL as string | undefined)?.trim().replace(/\/$/, '') || '/api/v1'
  return `${apiBase}${BASE}/documents/treasury/${encodeURIComponent(treasuryId)}/html`
}

export async function createTreasuryAdvance(id: string): Promise<RequestDetailResponse> {
  const res = await authFetch(`${BASE}/requests/${encodeURIComponent(id)}/create-bt`, {
    method: 'POST',
    body: JSON.stringify({}),
  })
  if (!res.ok) {
    throw await apiErrorMessage(res, 'Création du bon de trésorerie échouée')
  }
  await res.json()
  return fetchRequest(id)
}

export function ebFicheHtmlUrl(draftId: string): string {
  const apiBase = (import.meta.env.VITE_API_URL as string | undefined)?.trim().replace(/\/$/, '') || '/api/v1'
  return `${apiBase}${BASE}/drafts/${encodeURIComponent(draftId)}/html`
}

export function ebRequestFicheHtmlUrl(requestId: string): string {
  const apiBase = (import.meta.env.VITE_API_URL as string | undefined)?.trim().replace(/\/$/, '') || '/api/v1'
  return `${apiBase}${BASE}/requests/${encodeURIComponent(requestId)}/eb-html`
}

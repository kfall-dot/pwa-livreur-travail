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
} from './procurementTypes'

const BASE = '/procurement'

export async function fetchProcurementConfig(): Promise<ProcurementConfig> {
  const res = await authFetch(`${BASE}/config`)
  if (!res.ok) throw new Error('Config achats indisponible')
  return res.json() as Promise<ProcurementConfig>
}

export async function fetchSites(): Promise<SiteRow[]> {
  const res = await authFetch(`${BASE}/sites`)
  if (!res.ok) throw new Error('Chantiers indisponibles')
  const data = await res.json() as { sites: SiteRow[] }
  return data.sites ?? []
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
  if (!res.ok) throw new Error('Brouillon introuvable')
  return res.json() as Promise<DraftDetailResponse>
}

export async function updateDraft(id: string, payload: DraftUpdatePayload): Promise<PurchaseRequestDraftRow> {
  const res = await authFetch(`${BASE}/drafts/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { message?: string }
    throw new Error(err.message ?? 'Mise à jour du brouillon échouée')
  }
  const data = await res.json() as { draft: PurchaseRequestDraftRow }
  return data.draft
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
    const err = await res.json().catch(() => ({})) as { message?: string }
    throw new Error(err.message ?? 'Collage WhatsApp échoué')
  }
  return res.json() as Promise<{ draftId: string; lines: ParsedEbLine[]; confidenceScore: number }>
}

export async function createBlankEbFiche(payload?: { siteId?: string }): Promise<{ draftId: string; siteId: string | null }> {
  const res = await authFetch(`${BASE}/drafts/blank`, {
    method: 'POST',
    body: JSON.stringify(payload ?? {}),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { message?: string }
    throw new Error(err.message ?? 'Création de fiche vierge échouée')
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
    const err = await res.json().catch(() => ({})) as { message?: string }
    throw new Error(err.message ?? 'Soumission du brouillon échouée')
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
    const err = await res.json().catch(() => ({})) as { message?: string }
    throw new Error(err.message ?? 'Approbation échouée')
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
    const err = await res.json().catch(() => ({})) as { message?: string }
    throw new Error(err.message ?? 'Rejet échoué')
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
    const err = await res.json().catch(() => ({})) as { message?: string }
    throw new Error(err.message ?? 'Création BC échouée')
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
    const err = await res.json().catch(() => ({})) as { message?: string }
    throw new Error(err.message ?? 'Planification livraison échouée')
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
    const err = await res.json().catch(() => ({})) as { message?: string }
    throw new Error(err.message ?? 'Enregistrement des prix échoué')
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
    const err = await res.json().catch(() => ({})) as { message?: string }
    throw new Error(err.message ?? 'Envoi au DAF échoué')
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
    const err = await res.json().catch(() => ({})) as { message?: string }
    throw new Error(err.message ?? 'Pièce jointe refusée')
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
    const err = await res.json().catch(() => ({})) as { message?: string }
    throw new Error(err.message ?? 'Impossible de retirer la pièce jointe')
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
    const err = await res.json().catch(() => ({})) as { message?: string }
    throw new Error(err.message ?? 'Pièce jointe introuvable')
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

export function ebFicheHtmlUrl(draftId: string): string {
  const apiBase = (import.meta.env.VITE_API_URL as string | undefined)?.trim().replace(/\/$/, '') || '/api/v1'
  return `${apiBase}${BASE}/drafts/${encodeURIComponent(draftId)}/html`
}

export function ebRequestFicheHtmlUrl(requestId: string): string {
  const apiBase = (import.meta.env.VITE_API_URL as string | undefined)?.trim().replace(/\/$/, '') || '/api/v1'
  return `${apiBase}${BASE}/requests/${encodeURIComponent(requestId)}/eb-html`
}

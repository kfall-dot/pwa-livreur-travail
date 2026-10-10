import { getProcurementConfig } from '../config/procurement.js'
import {
  createPurchaseOrder,
  createTreasuryOrder,
  getActiveDocumentTemplate,
  getApprovalSteps,
  getCompanyName,
  getPurchaseRequestById,
  getPurchaseRequestLines,
  getRequestDetail,
  getSiteById,
  getSupplierById,
  getTreasuryOrderByRequest,
  listPurchaseOrdersForRequest,
  recordApprovalStep,
  recordPurchaseRequestVersion,
  setPurchaseOrderTour,
  setTourPurchaseOrder,
  updatePurchaseOrderHtml,
  updatePurchaseRequestStatus,
  updateRequestLineQuantities,
  updateTreasuryOrderAmount,
  updateTreasuryOrderHtml,
} from '../db/procurementQueries.js'
import type { ProcurementRole, PurchaseRequestStatus } from '../db/schema.js'
import { comptantLines, distinctSupplierNames, namesMatch } from '../lib/procurementLines.js'
import { hasComptantLines } from '../../shared/saFinanceGate.js'
import {
  buildBcDataFromRequest,
  buildBtDataFromRequest,
  generateBcHtml,
  generateBtHtml,
} from './pdfDocuments.js'
import { signoffFromApprovalSteps } from './ebFiche.js'
import {
  notifyPurchaseOrderReady,
  notifyRequestRevised,
  notifyRequestStatusChange,
} from './procurementNotifications.js'

export class ProcurementWorkflowError extends Error {
  constructor(
    message: string,
    public statusCode: number = 400,
  ) {
    super(message)
    this.name = 'ProcurementWorkflowError'
  }
}

const APPROVER_FOR_STATUS: Partial<Record<PurchaseRequestStatus, ProcurementRole>> = {
  cdg_review: 'controle_gestion',
  daf_review: 'daf',
  daf_bt_review: 'daf',
  pdg_review: 'pdg',
  sa_review: 'purchasing',
}

export function getRequiredApproverRole(status: PurchaseRequestStatus): ProcurementRole | null {
  return APPROVER_FOR_STATUS[status] ?? null
}

export async function approvePurchaseRequest(input: {
  companyId: string
  requestId: string
  managerId: string
  procurementRole: ProcurementRole
  comment?: string | null
  pinVerified?: boolean
  etape?: string | null
  ip?: string | null
}) {
  const request = await getPurchaseRequestById(input.companyId, input.requestId)
  if (!request) throw new ProcurementWorkflowError('Demande introuvable', 404)

  const required = getRequiredApproverRole(request.status)
  if (!required) {
    throw new ProcurementWorkflowError(`Aucune approbation attendue pour le statut ${request.status}`)
  }
  const pdgOverride =
    input.procurementRole === 'pdg' &&
    (request.status === 'daf_review' || request.status === 'daf_bt_review')
  if (input.procurementRole !== required && !pdgOverride) {
    throw new ProcurementWorkflowError(`Seul le rôle ${required} peut approuver à cette étape`)
  }

  await recordApprovalStep({
    purchaseRequestId: input.requestId,
    role: input.procurementRole,
    managerId: input.managerId,
    decision: 'approved',
    comment: input.comment,
    pinVerified: input.pinVerified,
    etape: input.etape,
    ip: input.ip,
  })

  const amount = Number(request.totalAmountFcfa ?? 0)
  const { btThresholdFcfa: pdgThresholdFcfa } = getProcurementConfig(input.companyId)
  const needsPdg = amount >= pdgThresholdFcfa

  let supplierHasAccount: boolean | null = null
  if (request.supplierId) {
    const supplier = await getSupplierById(input.companyId, request.supplierId)
    supplierHasAccount = supplier?.hasAccount ?? null
  }
  /** BT (trésorerie) : FADYM sans compte chez le fournisseur — retex finance août 2026 */
  const needsBt = supplierHasAccount === false

  let nextStatus: PurchaseRequestStatus
  let notifyRoles: ProcurementRole[]

  switch (request.status) {
    case 'cdg_review':
      nextStatus = 'daf_review'
      notifyRoles = needsPdg ? ['daf', 'pdg'] : ['daf']
      break
    case 'daf_review':
      if (needsBt) {
        await ensureTreasuryOrder(input.companyId, request.id, amount)
        nextStatus = needsPdg ? 'daf_bt_review' : 'sa_review'
        notifyRoles = needsPdg ? ['daf'] : ['purchasing']
      } else if (needsPdg) {
        nextStatus = 'pdg_review'
        notifyRoles = ['pdg']
      } else {
        nextStatus = 'sa_review'
        notifyRoles = ['purchasing']
      }
      break
    case 'daf_bt_review':
      nextStatus = needsPdg ? 'pdg_review' : 'sa_review'
      notifyRoles = needsPdg ? ['pdg'] : ['purchasing']
      break
    case 'pdg_review':
      nextStatus = 'sa_review'
      notifyRoles = ['purchasing']
      break
    case 'sa_review':
      throw new ProcurementWorkflowError('Utilisez create-po pour générer le bon de commande')
    default:
      throw new ProcurementWorkflowError(`Approbation impossible au statut ${request.status}`)
  }

  const updated = await updatePurchaseRequestStatus(input.companyId, input.requestId, nextStatus)
  const treasury = await getTreasuryOrderByRequest(input.companyId, input.requestId)
  if (treasury) {
    await ensureTreasuryAdvance(input.companyId, input.requestId)
  }
  if (notifyRoles.length > 0) {
    await notifyRequestStatusChange(input.companyId, request.reference, nextStatus, notifyRoles)
  }
  return updated
}

async function ensureTreasuryOrder(companyId: string, requestId: string, amount: number) {
  return ensureTreasuryAdvance(companyId, requestId, amount)
}

export async function ensureTreasuryAdvance(companyId: string, requestId: string, amountHint?: number) {
  const existing = await getTreasuryOrderByRequest(companyId, requestId)
  const request = await getPurchaseRequestById(companyId, requestId)
  if (!request) return existing
  const [site, lines, template, steps] = await Promise.all([
    getSiteById(companyId, request.siteId),
    getPurchaseRequestLines(requestId),
    getActiveDocumentTemplate(companyId, 'bt'),
    getApprovalSteps(requestId),
  ])
  if (!site) return existing

  const cash = comptantLines(lines)
  const amount = cash.length > 0
    ? cash.reduce((s, l) => s + (Number(l.amountFcfa ?? 0) || Number(l.unitPriceFcfa ?? 0) * Number(l.quantity ?? 0)), 0)
    : (amountHint ?? Number(request.totalAmountFcfa ?? 0))
  const signoff = signoffFromApprovalSteps(steps)

  if (existing) {
    const data = buildBtDataFromRequest(request, site, existing, lines)
    const pdfHtml = generateBtHtml(template, {
      ...data,
      ...signoff,
      reference: existing.reference,
      amountFcfa: amount || data.amountFcfa,
      avanceNumber: '',
    })
    const finalAmount = amount || data.amountFcfa
    await updateTreasuryOrderHtml(existing.id, pdfHtml)
    // `amount_fcfa` est une colonne distincte du HTML : sans cette écriture, un BT
    // déjà généré garderait l'ancien total après une révision PDG des quantités.
    await updateTreasuryOrderAmount(existing.id, finalAmount)
    return { ...existing, pdfHtml, amountFcfa: String(finalAmount) }
  }

  const draft = await createTreasuryOrder({
    companyId,
    purchaseRequestId: requestId,
    amountFcfa: amount,
    pdfHtml: generateBtHtml(template, {
      reference: 'BT-PENDING',
      siteName: site.name,
      amountFcfa: amount,
      requesterName: request.requestedByName ?? undefined,
      createdAt: new Date().toISOString().slice(0, 10),
      avanceNumber: '',
      ...signoff,
    }),
  })
  const data = buildBtDataFromRequest(request, site, draft, lines)
  const pdfHtml = generateBtHtml(template, {
    ...data,
    ...signoff,
    reference: draft.reference,
    avanceNumber: '',
  })
  await updateTreasuryOrderHtml(draft.id, pdfHtml)
  return { ...draft, pdfHtml }
}

export async function createTreasuryAdvanceForRequest(input: {
  companyId: string
  requestId: string
}) {
  const request = await getPurchaseRequestById(input.companyId, input.requestId)
  if (!request) throw new ProcurementWorkflowError('Demande introuvable', 404)
  if (request.status !== 'submitted') {
    throw new ProcurementWorkflowError('Le bon de trésorerie se génère avant l’envoi au CdG')
  }
  const lines = await getPurchaseRequestLines(request.id)
  if (!hasComptantLines(lines)) {
    throw new ProcurementWorkflowError('Le bon de trésorerie n’est requis que si le mode de paiement est COMPTANT')
  }
  const created = await ensureTreasuryAdvance(input.companyId, request.id)
  if (!created) throw new ProcurementWorkflowError('Impossible de générer le bon de trésorerie')
  return created
}

export async function rejectPurchaseRequest(input: {
  companyId: string
  requestId: string
  managerId: string
  procurementRole: ProcurementRole
  comment?: string | null
}) {
  const request = await getPurchaseRequestById(input.companyId, input.requestId)
  if (!request) throw new ProcurementWorkflowError('Demande introuvable', 404)

  const required = getRequiredApproverRole(request.status)
  if (required && input.procurementRole !== required) {
    const pdgOverride =
      input.procurementRole === 'pdg' &&
      (request.status === 'daf_review' || request.status === 'daf_bt_review')
    if (!pdgOverride) {
      throw new ProcurementWorkflowError(`Seul le rôle ${required} peut rejeter à cette étape`)
    }
  }

  await recordApprovalStep({
    purchaseRequestId: input.requestId,
    role: input.procurementRole,
    managerId: input.managerId,
    decision: 'rejected',
    comment: input.comment,
  })

  return updatePurchaseRequestStatus(input.companyId, input.requestId, 'rejected')
}

/**
 * Révision PDG des quantités (option A) — autorisée uniquement au statut `pdg_review`.
 * Enregistre l'étape `revised` (bloc signature PDG quand la route a vérifié le NIP),
 * snapshot les lignes dans l'historique, applique les nouvelles quantités, incrémente
 * version + eb_version, régénère le bon de trésorerie au nouveau montant, puis renvoie
 * la demande au SA. Le DT initiateur, le CdG et le DAF sont notifiés (l'EB révisée
 * reste visible par tous ceux qui avaient accès à la version initiale).
 */
export async function revisePurchaseRequest(input: {
  companyId: string
  requestId: string
  managerId: string
  procurementRole: ProcurementRole
  quantities: Array<{ id: string; quantity: number }>
  revisionComment?: string | null
  /** Bloc signature (formatSignatureBlock) — prime sur le motif brut. */
  comment?: string | null
  pinVerified?: boolean
  etape?: string | null
  ip?: string | null
}) {
  const request = await getPurchaseRequestById(input.companyId, input.requestId)
  if (!request) throw new ProcurementWorkflowError('Demande introuvable', 404)
  if (input.procurementRole !== 'pdg') {
    throw new ProcurementWorkflowError('Seul le PDG peut réviser les quantités')
  }
  if (request.status !== 'pdg_review') {
    throw new ProcurementWorkflowError(
      `La révision n'est autorisée qu'au statut pdg_review (actuel : ${request.status})`,
    )
  }
  if (!Array.isArray(input.quantities) || input.quantities.length === 0) {
    throw new ProcurementWorkflowError('Aucune quantité à réviser')
  }

  const lines = await getPurchaseRequestLines(input.requestId)
  // Snapshot AVANT révision → version courante
  await recordPurchaseRequestVersion({
    purchaseRequestId: input.requestId,
    version: request.version,
    lines,
    comment: input.revisionComment ?? null,
    createdByManagerId: input.managerId,
  })

  await recordApprovalStep({
    purchaseRequestId: input.requestId,
    role: input.procurementRole,
    managerId: input.managerId,
    decision: 'revised',
    comment: input.comment ?? input.revisionComment ?? null,
    pinVerified: input.pinVerified,
    etape: input.etape,
    ip: input.ip,
  })

  const detail = await updateRequestLineQuantities(input.companyId, input.requestId, input.quantities)
  if (!detail) throw new ProcurementWorkflowError('Demande introuvable', 404)

  const nextVersion = request.version + 1
  const nextEbVersion = request.ebVersion + 1
  const updated = await updatePurchaseRequestStatus(input.companyId, input.requestId, 'sa_review', {
    version: nextVersion,
    ebVersion: nextEbVersion,
    revisionComment: input.revisionComment ?? null,
    revisedAt: new Date(),
  })

  // Le BT (avance de trésorerie) suit la révision : quantités, total, bandeau
  // « version modifiée » et visa PDG sont régénérés. On ne crée jamais de BT ici,
  // seulement s'il avait déjà été émis (chiffrage SA / approbation DAF).
  const treasury = await getTreasuryOrderByRequest(input.companyId, input.requestId)
  if (treasury) {
    await ensureTreasuryAdvance(input.companyId, input.requestId)
  }

  // Notifie le DT initiateur (information) + le SA (poursuite du processus).
  await notifyRequestRevised({
    companyId: input.companyId,
    reference: request.reference,
    createdByManagerId: request.createdByManagerId,
    ebVersion: nextEbVersion,
    comment: input.revisionComment ?? null,
    btRegenerated: Boolean(treasury),
  })
  await notifyRequestStatusChange(input.companyId, request.reference, 'sa_review', ['purchasing'])

  return updated
}

export async function createPurchaseOrderForRequest(input: {
  companyId: string
  requestId: string
  managerId: string
  supplierId?: string | null
}) {
  const request = await getPurchaseRequestById(input.companyId, input.requestId)
  if (!request) throw new ProcurementWorkflowError('Demande introuvable', 404)
  if (request.status !== 'sa_review' && request.status !== 'po_ready') {
    throw new ProcurementWorkflowError('Le BC ne peut être créé qu’après validation DAF')
  }

  const lines = await getPurchaseRequestLines(request.id)
  const names = distinctSupplierNames(lines)
  let supplierId = input.supplierId ?? request.supplierId
  if (!supplierId && names.length === 1) {
    const detail = await getRequestDetail(input.companyId, request.id)
    const match = detail?.suppliers.find((s) => namesMatch(s.name, names[0]))
    supplierId = match?.id ?? null
  }
  if (!supplierId) throw new ProcurementWorkflowError('Précisez le fournisseur du BC')

  const existingPos = await listPurchaseOrdersForRequest(input.companyId, request.id)
  if (existingPos.some((p) => p.supplierId === supplierId)) {
    throw new ProcurementWorkflowError('Un BC existe déjà pour ce fournisseur')
  }

  const [site, supplier, template, companyName] = await Promise.all([
    getSiteById(input.companyId, request.siteId),
    getSupplierById(input.companyId, supplierId),
    getActiveDocumentTemplate(input.companyId, 'bc'),
    getCompanyName(input.companyId),
  ])
  if (!site || !supplier) throw new ProcurementWorkflowError('Chantier ou fournisseur introuvable')

  const bcData = buildBcDataFromRequest(request, site, supplier, lines, companyName)
  const amount = bcData.amountFcfa

  const po = await createPurchaseOrder({
    companyId: input.companyId,
    purchaseRequestId: request.id,
    supplierId,
    amountFcfa: amount,
    templateId: template?.id ?? null,
    pdfHtml: generateBcHtml(template, { ...bcData, reference: request.reference }),
  })
  const pdfHtml = generateBcHtml(template, { ...bcData, reference: po.reference })
  await updatePurchaseOrderHtml(po.id, pdfHtml)

  await updatePurchaseRequestStatus(input.companyId, request.id, 'po_ready', { supplierId })
  await notifyPurchaseOrderReady(input.companyId, request.reference, po.reference)

  return { ...po, pdfHtml, amountFcfa: String(amount) }
}

export async function createPurchaseOrdersForEb(input: {
  companyId: string
  requestId: string
  managerId: string
  supplierId?: string | null
  allSuppliers?: boolean
}) {
  if (input.supplierId && !input.allSuppliers) {
    const po = await createPurchaseOrderForRequest({
      companyId: input.companyId,
      requestId: input.requestId,
      managerId: input.managerId,
      supplierId: input.supplierId,
    })
    return [po]
  }

  const request = await getPurchaseRequestById(input.companyId, input.requestId)
  if (!request) throw new ProcurementWorkflowError('Demande introuvable', 404)
  const lines = await getPurchaseRequestLines(request.id)
  const names = distinctSupplierNames(lines)
  const detail = await getRequestDetail(input.companyId, request.id)
  const ids: string[] = []
  for (const name of names) {
    const match = detail?.suppliers.find((s) => namesMatch(s.name, name))
    if (match && !ids.includes(match.id)) ids.push(match.id)
  }
  const fallback = input.supplierId ?? request.supplierId
  if (ids.length === 0 && fallback) ids.push(fallback)
  if (ids.length === 0) throw new ProcurementWorkflowError('Précisez le fournisseur du BC')

  const created = []
  for (const supplierId of ids) {
    const existingPos = await listPurchaseOrdersForRequest(input.companyId, request.id)
    if (existingPos.some((p) => p.supplierId === supplierId)) continue
    created.push(
      await createPurchaseOrderForRequest({
        companyId: input.companyId,
        requestId: input.requestId,
        managerId: input.managerId,
        supplierId,
      }),
    )
  }
  if (created.length === 0) {
    throw new ProcurementWorkflowError('Tous les BC de cette EB existent déjà')
  }
  return created
}

export async function markDeliveryScheduled(
  companyId: string,
  requestId: string,
  tourId: string,
  purchaseOrderId?: string | null,
) {
  const request = await getPurchaseRequestById(companyId, requestId)
  if (!request) throw new ProcurementWorkflowError('Demande introuvable', 404)
  if (request.status !== 'po_ready' && request.status !== 'delivery_scheduled') {
    throw new ProcurementWorkflowError('La livraison ne peut être planifiée qu’après génération du BC')
  }
  const pos = await listPurchaseOrdersForRequest(companyId, requestId)
  const target =
    (purchaseOrderId ? pos.find((p) => p.id === purchaseOrderId) : null)
    ?? pos.find((p) => !p.tourId)
    ?? pos[pos.length - 1]
  if (target?.id) {
    await setPurchaseOrderTour(target.id, tourId)
    // Lien inverse : tours.purchase_order_id — sans lui, la replanification
    // perd le lien BC (verrou produits + re-liaison du BC à la nouvelle tournée).
    await setTourPurchaseOrder(tourId, target.id)
  }
  const refreshed = await listPurchaseOrdersForRequest(companyId, requestId)
  const allLinked = refreshed.length > 0 && refreshed.every((p) => p.tourId)
  if (allLinked) {
    return updatePurchaseRequestStatus(companyId, requestId, 'delivery_scheduled')
  }
  return updatePurchaseRequestStatus(companyId, requestId, 'po_ready')
}

export { getApprovalSteps }

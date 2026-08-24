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
  recordApprovalStep,
  setPurchaseOrderTour,
  updatePurchaseOrderHtml,
  updatePurchaseRequestStatus,
} from '../db/procurementQueries.js'
import type { ProcurementRole, PurchaseRequestStatus } from '../db/schema.js'
import {
  buildBcDataFromRequest,
  generateBcHtml,
  generateBtHtml,
} from './pdfDocuments.js'
import {
  notifyPurchaseOrderReady,
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
}) {
  const request = await getPurchaseRequestById(input.companyId, input.requestId)
  if (!request) throw new ProcurementWorkflowError('Demande introuvable', 404)

  const required = getRequiredApproverRole(request.status)
  if (!required) {
    throw new ProcurementWorkflowError(`Aucune approbation attendue pour le statut ${request.status}`)
  }
  if (input.procurementRole !== required && input.procurementRole !== 'pdg') {
    throw new ProcurementWorkflowError(`Seul le rôle ${required} peut approuver à cette étape`)
  }

  await recordApprovalStep({
    purchaseRequestId: input.requestId,
    role: input.procurementRole,
    managerId: input.managerId,
    decision: 'approved',
    comment: input.comment,
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
  if (notifyRoles.length > 0) {
    await notifyRequestStatusChange(input.companyId, request.reference, nextStatus, notifyRoles)
  }
  return updated
}

async function ensureTreasuryOrder(companyId: string, requestId: string, amount: number) {
  const existing = await getTreasuryOrderByRequest(companyId, requestId)
  if (existing) return existing

  const request = await getPurchaseRequestById(companyId, requestId)
  if (!request) return null
  const site = await getSiteById(companyId, request.siteId)
  if (!site) return null

  const template = await getActiveDocumentTemplate(companyId, 'bt')
  const pdfHtml = generateBtHtml(template, {
    reference: 'BT-PENDING',
    siteName: site.name,
    amountFcfa: amount,
    createdAt: new Date().toISOString().slice(0, 10),
  })

  return createTreasuryOrder({
    companyId,
    purchaseRequestId: requestId,
    amountFcfa: amount,
    pdfHtml,
  })
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
  if (required && input.procurementRole !== required && input.procurementRole !== 'pdg') {
    throw new ProcurementWorkflowError(`Seul le rôle ${required} peut rejeter à cette étape`)
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

export async function createPurchaseOrderForRequest(input: {
  companyId: string
  requestId: string
  managerId: string
  supplierId?: string | null
}) {
  const request = await getPurchaseRequestById(input.companyId, input.requestId)
  if (!request) throw new ProcurementWorkflowError('Demande introuvable', 404)
  if (request.status !== 'sa_review' && request.status !== 'po_ready') {
    throw new ProcurementWorkflowError('Le BC ne peut être créé qu’en sa_review')
  }

  const supplierId = input.supplierId ?? request.supplierId
  if (!supplierId) throw new ProcurementWorkflowError('Fournisseur requis')

  const [site, supplier, lines, template, companyName] = await Promise.all([
    getSiteById(input.companyId, request.siteId),
    getSupplierById(input.companyId, supplierId),
    getPurchaseRequestLines(request.id),
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

export async function markDeliveryScheduled(companyId: string, requestId: string, tourId: string) {
  const request = await getPurchaseRequestById(companyId, requestId)
  if (!request) throw new ProcurementWorkflowError('Demande introuvable', 404)
  if (request.status !== 'po_ready') {
    throw new ProcurementWorkflowError('La livraison ne peut être planifiée qu’après génération du BC')
  }
  const detail = await getRequestDetail(companyId, requestId)
  if (detail?.purchaseOrder?.id) {
    await setPurchaseOrderTour(detail.purchaseOrder.id, tourId)
  }
  return updatePurchaseRequestStatus(companyId, requestId, 'delivery_scheduled')
}

export { getApprovalSteps }

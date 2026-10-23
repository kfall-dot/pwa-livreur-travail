import { payMaterialInvoice } from './materialInvoicePayment.js'
import { getProcurementConfig } from '../config/procurement.js'
import { getManagerById } from '../db/queries.js'
import { db } from '../db/index.js'
import { purchaseRequests, purchaseOrders, approvalSteps } from '../db/schema.js'
import { randomUUID } from 'crypto'
import { hashEbContenu } from './ebSignature.js'
import { and, eq } from 'drizzle-orm'
import { canValidateSaAction, isValidSaSupervisor } from '../../shared/saTeamPolicy.js'
import {
  createPurchaseOrder,
  createTreasuryDisbursement,
  createTreasuryOrder,
  getActiveDocumentTemplate,
  getApprovalSteps,
  getCompanyName,
  getDisbursementByTreasuryOrder,
  getPurchaseRequestById,
  getPurchaseRequestLines,
  getRequestDetail,
  getSiteById,
  getSupplierById,
  getTreasuryOrderById,
  getTreasuryOrderByLine,
  getTreasuryOrderByRequest,
  linkDeliveryPointsToPurchaseOrder,
  listDisbursementsForRequest,
  listPurchaseOrdersForRequest,
  listTreasuryOrdersForRequest,
  recordApprovalStep,
  recordPurchaseRequestVersion,
  setPurchaseOrderTour,
  setTourPurchaseOrder,
  setTreasuryOrderPurchaseOrder,
  updatePurchaseOrderHtml,
  updatePurchaseRequestStatus,
  updateRequestLineQuantities,
  updateTreasuryOrderAmount,
  updateTreasuryOrderHtml,
  updateTreasuryOrderStatus,
} from '../db/procurementQueries.js'
import type {
  DisbursementMethod,
  ProcurementRole,
  PurchaseRequestStatus,
  TreasuryOrder,
} from '../db/schema.js'
import { comptantLines, distinctSupplierNames, namesMatch } from '../lib/procurementLines.js'
import { hasComptantLines } from '../../shared/saFinanceGate.js'
import { isHorsSaFlow } from '../../shared/chargeFlow.js'
import { versionSuffix } from '../../shared/requestVersion.js'
import {
  buildBcDataFromRequest,
  buildBtDataFromRequest,
  generateBcHtml,
  generateBtHtml,
} from './pdfDocuments.js'
import { signoffFromApprovalSteps } from './ebFiche.js'
import {
  notifyManagersByProcurementRole,
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
  dt_review: 'technical_director',
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

  // Routage par la **famille de charge** (F02 lot B — décision CdG 16/10/2026) :
  // une EB de main-d'œuvre / engins / frais **saute le SA**, et son BT est émis
  // **après** l'approbation DAF/PDG — jamais au moment du visa DAF.
  const lines = await getPurchaseRequestLines(request.id)
  const horsSa = isHorsSaFlow(lines)

  switch (request.status) {
    case 'cdg_review':
      nextStatus = 'daf_review'
      notifyRoles = needsPdg ? ['daf', 'pdg'] : ['daf']
      break
    case 'daf_review':
      if (horsSa) {
        // Même seuil PDG que le BC (500 000 F par défaut).
        nextStatus = needsPdg
          ? 'pdg_review'
          : await issueHorsSaTreasury(input.companyId, request.id, amount)
        notifyRoles = needsPdg ? ['pdg'] : ['treasury']
      } else if (needsBt) {
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
      if (horsSa) {
        nextStatus = await issueHorsSaTreasury(input.companyId, request.id, amount)
        notifyRoles = ['treasury']
      } else {
        nextStatus = 'sa_review'
        notifyRoles = ['purchasing']
      }
      break
    case 'dt_review':
      // EB terrain validée par le DT : matériaux → SA ; hors SA → CdG direct (I110)
      nextStatus = horsSa ? 'cdg_review' : 'submitted'
      notifyRoles = horsSa ? ['controle_gestion'] : ['purchasing']
      break
    case 'sa_review':
      throw new ProcurementWorkflowError('Utilisez create-po pour générer le bon de commande')
    default:
      throw new ProcurementWorkflowError(`Approbation impossible au statut ${request.status}`)
  }

  const updated = await updatePurchaseRequestStatus(input.companyId, input.requestId, nextStatus)
  // Régénération des BT existants — **circuit matériaux uniquement** : le circuit
  // hors SA a déjà émis ses BT par ligne dans `issueHorsSaTreasury`, et les
  // régénérer ici écraserait un BT de ligne avec le total de l'EB.
  if (!horsSa) {
    const treasury = await getTreasuryOrderByRequest(input.companyId, input.requestId)
    if (treasury) {
      await ensureTreasuryAdvance(input.companyId, input.requestId)
    }
  }
  if (notifyRoles.length > 0) {
    await notifyRequestStatusChange(input.companyId, request.reference, nextStatus, notifyRoles)
  }
  return updated
}

async function ensureTreasuryOrder(companyId: string, requestId: string, amount: number) {
  return ensureTreasuryAdvances(companyId, requestId, amount)
}

function treasuryLineAmount(line: { amountFcfa?: string | number | null; unitPriceFcfa?: string | number | null; quantity?: string | number | null }): number {
  return Number(line.amountFcfa ?? 0) || Number(line.unitPriceFcfa ?? 0) * Number(line.quantity ?? 0)
}

async function buildTreasuryPdf(
  request: NonNullable<Awaited<ReturnType<typeof getPurchaseRequestById>>>,
  site: NonNullable<Awaited<ReturnType<typeof getSiteById>>>,
  treasury: TreasuryOrder,
  lines: Awaited<ReturnType<typeof getPurchaseRequestLines>>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  template: any,
  steps: Awaited<ReturnType<typeof getApprovalSteps>>,
  reference: string,
  ebReference: string,
  lineSubset: Awaited<ReturnType<typeof getPurchaseRequestLines>> | null,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any> {
  const signoff = signoffFromApprovalSteps(steps)
  const data = buildBtDataFromRequest(request, site, treasury, lineSubset ?? lines)
  return generateBtHtml(template, {
    ...data,
    ...signoff,
    reference,
    ebReference,
    avanceNumber: '',
  })
}

/**
 * Lot 2 — un BT par ligne comptant.
 * Crée (ou régénère) un bon de trésorerie pour chaque ligne EB en COMPTANT,
 * avec le montant de la seule ligne. Idempotent par ligne : un second appel
 * régénère le HTML/montant sans créer de doublon (clé purchase_request_line_id).
 * Les BT agrégés historiques (ligne NULL) sont régénérés au total comme avant,
 * pour ne pas casser les EB déjà émises.
 */
export async function ensureTreasuryAdvances(
  companyId: string,
  requestId: string,
  amountHint?: number,
  options?: { allLines?: boolean },
) {
  const request = await getPurchaseRequestById(companyId, requestId)
  if (!request) return []
  const [site, lines, template, steps] = await Promise.all([
    getSiteById(companyId, request.siteId),
    getPurchaseRequestLines(requestId),
    getActiveDocumentTemplate(companyId, 'bt'),
    getApprovalSteps(requestId),
  ])
  if (!site) return []

  // Circuit hors SA : un BT par ligne (la main-d'œuvre se paie par bénéficiaire).
  // Circuit matériaux : un BT par ligne COMPTANT (comportement historique).
  const cash = options?.allLines
    ? lines.filter((l) => (l.label ?? '').trim().length > 0)
    : comptantLines(lines)
  const ebReference = `${request.reference}${versionSuffix(request.version)}`
  const linkedPos = await listPurchaseOrdersForRequest(companyId, requestId)
  const linkedBcId = linkedPos.length === 1 ? (linkedPos[0]?.id ?? null) : null

  // Sans ligne comptant : repli sur l'ancien comportement agrégé (hint ou total).
  const targets = cash.length > 0 ? cash : []
  if (targets.length === 0) {
    const existing = await getTreasuryOrderByRequest(companyId, requestId)
    const amount = amountHint ?? Number(request.totalAmountFcfa ?? 0)
    if (existing) {
      const pdfHtml = await buildTreasuryPdf(request, site, existing, lines, template, steps, existing.reference, ebReference, null)
      const finalAmount = amount || Number(existing.amountFcfa ?? 0)
      await updateTreasuryOrderHtml(existing.id, pdfHtml)
      await updateTreasuryOrderAmount(existing.id, finalAmount)
      if (linkedBcId) await setTreasuryOrderPurchaseOrder(existing.id, linkedBcId)
      return [{ ...existing, pdfHtml, amountFcfa: String(finalAmount), purchaseOrderId: linkedBcId ?? existing.purchaseOrderId }]
    }
    return []
  }

  const out = []
  for (const line of targets) {
    const amount = treasuryLineAmount(line)
    const existing = await getTreasuryOrderByLine(companyId, line.id)
    if (existing) {
      const pdfHtml = await buildTreasuryPdf(request, site, existing, lines, template, steps, existing.reference, ebReference, [line])
      await updateTreasuryOrderHtml(existing.id, pdfHtml)
      await updateTreasuryOrderAmount(existing.id, amount)
      if (linkedBcId) await setTreasuryOrderPurchaseOrder(existing.id, linkedBcId)
      out.push({ ...existing, pdfHtml, amountFcfa: String(amount), purchaseOrderId: linkedBcId ?? existing.purchaseOrderId })
      continue
    }
    const draft = await createTreasuryOrder({
      companyId,
      purchaseRequestId: requestId,
      purchaseRequestLineId: line.id,
      amountFcfa: amount,
      pdfHtml: generateBtHtml(template, {
        reference: 'BT-PENDING',
        siteName: site.name,
        amountFcfa: amount,
        requesterName: request.requestedByName ?? undefined,
        createdAt: new Date().toISOString().slice(0, 10),
        ebReference,
      }),
    })
    const pdfHtml = await buildTreasuryPdf(request, site, draft, lines, template, steps, draft.reference, ebReference, [line])
    await updateTreasuryOrderHtml(draft.id, pdfHtml)
    if (linkedBcId) await setTreasuryOrderPurchaseOrder(draft.id, linkedBcId)
    out.push({ ...draft, pdfHtml, purchaseOrderId: linkedBcId ?? draft.purchaseOrderId })
  }
  return out
}

export async function ensureTreasuryAdvance(companyId: string, requestId: string, amountHint?: number) {
  const created = await ensureTreasuryAdvances(companyId, requestId, amountHint)
  if (created.length > 0) return created[0]!
  return getTreasuryOrderByRequest(companyId, requestId)
}

/**
 * Circuit **hors SA** : émet les BT (un par ligne) **après** l'approbation
 * finance, puis les marque `issued`.
 *
 * Décision CdG 16/10/2026 : *« On utilisera le BT généré automatiquement suite
 * à l'approbation du DAF et/ou PDG »*. Le BT n'est donc **jamais** émis au
 * moment du visa DAF, contrairement au circuit matériaux.
 *
 * @returns `bt_ready` si au moins un BT a été émis, sinon `bt_pending`
 * (gabarit de document ou chantier manquant — le BT pourra être régénéré).
 */
async function issueHorsSaTreasury(
  companyId: string,
  requestId: string,
  amount: number,
): Promise<PurchaseRequestStatus> {
  const created = await ensureTreasuryAdvances(companyId, requestId, amount, { allLines: true })
  const treasury = created.length > 0 ? created : await listTreasuryOrdersForRequest(companyId, requestId)
  if (treasury.length === 0) return 'bt_pending'
  for (const t of treasury) {
    await updateTreasuryOrderStatus(t.id, 'issued')
  }
  return 'bt_ready'
}

/**
 * Déboursé d'un bon de trésorerie — action du rôle **Trésorerie** (F02 lot B).
 *
 * Règles validées en séance CdG :
 * - la **facture (ou le reçu) est exigée au déboursé** — invariant **I103** ;
 * - le mode de paiement est **Orange Money ou un autre reçu** (`method`) ;
 * - la facture est **rattachée à l'EB** (via ce déboursé) et y reste consultable ;
 * - **un seul déboursé par BT**.
 *
 * Statuts : le BT passe `deboursed` ; l'EB passe `deboursed` dès le premier
 * déboursé, puis `paid` quand **tous** ses BT sont déboursés.
 */
export async function disburseTreasuryOrder(input: {
  companyId: string
  treasuryOrderId: string
  managerId: string
  amountFcfa?: number
  method: DisbursementMethod
  transactionReference?: string | null
  paidAt: Date
  invoice: { blobKey: string; fileName: string; contentType: string } | null
}) {
  const treasury = await getTreasuryOrderById(input.companyId, input.treasuryOrderId)
  if (!treasury) throw new ProcurementWorkflowError('Bon de trésorerie introuvable', 404)
  if (treasury.purpose === 'material_invoice') {
    const result = await payMaterialInvoice(input)
    if (result.request) await notifyManagersByProcurementRole(input.companyId, ['treasury', 'accountant', 'purchasing', 'controle_gestion', 'daf'], `Paiement enregistré — ${result.request.reference}`, result.allPaid ? 'Tous les BC de cette EB sont payés.' : 'Un BC de cette EB est payé. Les autres règlements restent à traiter.', { refType: 'purchase_request', refId: result.request.id, notificationType: 'task_assigned' }).catch(err => console.error('[payment notify]', err))
    return result
  }

  const request = await getPurchaseRequestById(input.companyId, treasury.purchaseRequestId)
  if (!request) throw new ProcurementWorkflowError('Demande introuvable', 404)
  if (request.status !== 'bt_ready' && request.status !== 'deboursed') {
    throw new ProcurementWorkflowError(
      `Déboursé impossible au statut ${request.status} (attendu : bt_ready)`,
    )
  }

  if (await getDisbursementByTreasuryOrder(input.companyId, input.treasuryOrderId)) {
    throw new ProcurementWorkflowError('Ce bon de trésorerie a déjà été déboursé', 409)
  }

  // I103 — aucun déboursé sans pièce justificative.
  if (!input.invoice?.blobKey) {
    throw new ProcurementWorkflowError(
      'La facture (ou le reçu) est obligatoire pour enregistrer un déboursé',
    )
  }

  const due = Number(treasury.amountFcfa ?? 0)
  const amountFcfa = Math.round(input.amountFcfa && input.amountFcfa > 0 ? input.amountFcfa : due)
  if (amountFcfa <= 0) throw new ProcurementWorkflowError('Montant déboursé invalide')
  if (amountFcfa > due) {
    throw new ProcurementWorkflowError('Le déboursé dépasse le montant du bon de trésorerie')
  }

  const disbursement = await createTreasuryDisbursement({
    companyId: input.companyId,
    treasuryOrderId: input.treasuryOrderId,
    amountFcfa,
    method: input.method,
    transactionReference: input.transactionReference ?? null,
    paidAt: input.paidAt,
    recordedByManagerId: input.managerId,
    invoiceBlobKey: input.invoice.blobKey,
    invoiceFileName: input.invoice.fileName,
    invoiceContentType: input.invoice.contentType,
  })

  await updateTreasuryOrderStatus(input.treasuryOrderId, 'deboursed')

  // L'EB est `paid` quand tous ses BT sont déboursés, `deboursed` sinon.
  const [all, disbursed] = await Promise.all([
    listTreasuryOrdersForRequest(input.companyId, treasury.purchaseRequestId),
    listDisbursementsForRequest(input.companyId, treasury.purchaseRequestId),
  ])
  const paidIds = new Set(disbursed.map((d) => d.treasury.id))
  const allPaid = all.length > 0 && all.every((t) => paidIds.has(t.id))
  if (allPaid) {
    for (const t of all) await updateTreasuryOrderStatus(t.id, 'paid')
  }

  const nextStatus: PurchaseRequestStatus = allPaid ? 'paid' : 'deboursed'
  const updated = await updatePurchaseRequestStatus(
    input.companyId,
    treasury.purchaseRequestId,
    nextStatus,
  )
  await notifyRequestStatusChange(input.companyId, request.reference, nextStatus, [
    'treasury',
    'controle_gestion',
    'daf',
  ])

  return { disbursement, request: updated, allPaid }
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
  if (request.status !== 'sa_review' && request.status !== 'po_ready' && request.status !== 'bc_head_review') {
    throw new ProcurementWorkflowError('Le BC ne peut être créé qu’après validation DAF')
  }

  const lines = await getPurchaseRequestLines(request.id)
  const actor = await getManagerById(input.managerId)
  if (!actor || actor.companyId !== input.companyId || actor.procurementRole !== 'purchasing') throw new ProcurementWorkflowError('Compte SA requis', 403)
  if (actor.saSupervisorId && !isValidSaSupervisor(actor, await getManagerById(actor.saSupervisorId))) throw new ProcurementWorkflowError('Chef SA affecté invalide')
  if (request.status === 'bc_head_review' && actor.saSupervisorId && actor.saSupervisorId !== request.saReviewerId) throw new ProcurementWorkflowError('Cette émission est déjà confiée à une autre équipe SA', 403)
  const pendingSaHeadReview = Boolean(actor.saSupervisorId || request.status === 'bc_head_review')
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

  const bcData = { ...buildBcDataFromRequest(request, site, supplier, lines, companyName), pendingSaHeadReview }
  const amount = bcData.amountFcfa
  // Réfs. croisées imprimées sur le BC : EB d'origine + BT déjà générés (comptant).
  const chainRefs = {
    ebReference: `${request.reference}${versionSuffix(request.version)}`,
    btReferences: (await listTreasuryOrdersForRequest(input.companyId, request.id)).map((b) => b.reference),
  }

  const po = await createPurchaseOrder({
    saApprovalRequired: pendingSaHeadReview,
    companyId: input.companyId,
    purchaseRequestId: request.id,
    supplierId,
    amountFcfa: amount,
    templateId: template?.id ?? null,
    pdfHtml: generateBcHtml(template, { ...bcData, ...chainRefs, reference: request.reference }),
  })
  const pdfHtml = generateBcHtml(template, { ...bcData, ...chainRefs, reference: po.reference })
  await updatePurchaseOrderHtml(po.id, pdfHtml)

  await updatePurchaseRequestStatus(input.companyId, request.id, pendingSaHeadReview ? 'bc_head_review' : 'po_ready', { supplierId, saReviewerId: actor.saSupervisorId || request.saReviewerId })
  if (pendingSaHeadReview) {
    await recordApprovalStep({ purchaseRequestId: request.id, role: 'purchasing', managerId: actor.id, decision: 'approved', etape: 'preparation_bc_sa', comment: `${actor.name} — BC ${po.reference} préparé pour validation du chef SA` })
    await notifyRequestStatusChange(input.companyId, request.reference, 'bc_head_review', ['purchasing'], { managerIds: [actor.saSupervisorId || request.saReviewerId!] })
  } else {
    await notifyPurchaseOrderReady(input.companyId, request.reference, po.reference)
  }

  return { ...po, pdfHtml, amountFcfa: String(amount) }
}

export async function approveSaPreparedPurchaseOrders(input: {
  companyId: string
  requestId: string
  managerId: string
  signature: string
  ordersHash: string
  ip: string
}) {
  const [request, actor] = await Promise.all([
    getPurchaseRequestById(input.companyId, input.requestId), getManagerById(input.managerId),
  ])
  if (!request || !actor || actor.companyId !== input.companyId) throw new ProcurementWorkflowError('Dossier introuvable', 404)
  if (!canValidateSaAction(actor, request.saReviewerId)) throw new ProcurementWorkflowError('Validation réservée au chef SA désigné', 403)
  if (request.status !== 'bc_head_review') throw new ProcurementWorkflowError('Aucun BC en attente de validation du chef SA', 409)
  const [orders, lines, site, template, companyName, detail, treasury] = await Promise.all([
    listPurchaseOrdersForRequest(input.companyId, request.id), getPurchaseRequestLines(request.id),
    getSiteById(input.companyId, request.siteId), getActiveDocumentTemplate(input.companyId, 'bc'),
    getCompanyName(input.companyId), getRequestDetail(input.companyId, request.id),
    listTreasuryOrdersForRequest(input.companyId, request.id),
  ])
  if (!site || !orders.length || orders.some((po) => po.tourId)) throw new ProcurementWorkflowError('BC manquant ou déjà planifié', 409)
  if (hashEbContenu(orders.map((po) => ({ id: po.id, reference: po.reference, supplierId: po.supplierId, amount: po.amountFcfa, html: po.pdfHtml }))) !== input.ordersHash) throw new ProcurementWorkflowError('Les BC ont changé : rechargez avant de les signer', 409)
  for (const name of distinctSupplierNames(lines)) {
    const supplier = detail?.suppliers.find((s) => namesMatch(s.name, name))
    if (!supplier || !orders.some((po) => po.supplierId === supplier.id)) throw new ProcurementWorkflowError('Préparez tous les BC fournisseurs avant de les valider')
  }
  const documents: Array<{ id: string; html: string }> = []
  for (const po of orders) {
    const supplier = await getSupplierById(input.companyId, po.supplierId)
    if (!supplier) throw new ProcurementWorkflowError('Fournisseur introuvable')
    documents.push({ id: po.id, html: generateBcHtml(template, {
      ...buildBcDataFromRequest(request, site, supplier, lines, companyName),
      reference: po.reference, ebReference: `${request.reference}${versionSuffix(request.version)}`,
      btReferences: treasury.map((t) => t.reference), saHeadSignature: input.signature,
    }) })
  }
  await db.transaction(async (tx) => {
    const [current] = await tx.select().from(purchaseRequests).where(and(eq(purchaseRequests.id, request.id), eq(purchaseRequests.companyId, input.companyId))).for('update')
    if (!current || current.status !== 'bc_head_review' || current.saReviewerId !== input.managerId) throw new ProcurementWorkflowError('Cette validation a déjà été traitée', 409)
    const currentOrders = await tx.select().from(purchaseOrders).where(and(eq(purchaseOrders.purchaseRequestId, request.id), eq(purchaseOrders.companyId, input.companyId))).for('update')
    if (currentOrders.length !== orders.length || currentOrders.some((po) => !orders.some((snapshot) => snapshot.id === po.id && snapshot.pdfHtml === po.pdfHtml && snapshot.amountFcfa === po.amountFcfa))) throw new ProcurementWorkflowError('Les BC ont changé : rechargez avant de les signer', 409)
    for (const document of documents) {
      await tx.update(purchaseOrders).set({ pdfHtml: document.html, saHeadSignature: input.signature }).where(and(eq(purchaseOrders.id, document.id), eq(purchaseOrders.companyId, input.companyId)))
    }
    await tx.update(purchaseRequests).set({ status: 'po_ready', updatedAt: new Date() }).where(eq(purchaseRequests.id, request.id))
    await tx.insert(approvalSteps).values({ id: `apr-${randomUUID()}`, purchaseRequestId: request.id, role: 'purchasing', managerId: input.managerId, decision: 'approved', comment: input.signature, etape: 'validation_bc_sa', pinVerified: true, ip: input.ip })
  })
  for (const po of orders) await notifyPurchaseOrderReady(input.companyId, request.reference, po.reference)
  return getRequestDetail(input.companyId, request.id)
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
  if (pos.some((po) => po.saApprovalRequired && !po.saHeadSignature)) throw new ProcurementWorkflowError('Signature du chef SA requise avant la livraison', 409)
  const target =
    (purchaseOrderId ? pos.find((p) => p.id === purchaseOrderId) : null)
    ?? pos.find((p) => !p.tourId)
    ?? pos[pos.length - 1]
  if (target?.id) {
    await setPurchaseOrderTour(target.id, tourId)
    // Lien inverse : tours.purchase_order_id — sans lui, la replanification
    // perd le lien BC (verrou produits + re-liaison du BC à la nouvelle tournée).
    await setTourPurchaseOrder(tourId, target.id)
    // Chaîne EB → BC → BL : les arrêts de la tournée héritent du BC, ce qui
    // permet de retrouver le BL (certificat RCT-…) depuis le BC.
    await linkDeliveryPointsToPurchaseOrder(tourId, target.id)
  }
  const refreshed = await listPurchaseOrdersForRequest(companyId, requestId)
  const allLinked = refreshed.length > 0 && refreshed.every((p) => p.tourId)
  if (allLinked) {
    return updatePurchaseRequestStatus(companyId, requestId, 'delivery_scheduled')
  }
  return updatePurchaseRequestStatus(companyId, requestId, 'po_ready')
}

export { getApprovalSteps }

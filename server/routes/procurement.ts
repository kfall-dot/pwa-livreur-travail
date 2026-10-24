import { applyCompanyDocumentIdentity } from '../services/companyDocumentIdentity.js'
import { verifyBcRegister } from '../db/procurementQueries.js'
import { parseJsonAttachment } from '../lib/jsonAttachment.js'
import { procurementCorrectionsRouter } from './procurementCorrections.js'
import { CorrectionError } from '../services/procurementCorrections.js'
import { listStockConsumptionForSites } from '../db/dailyReportQueries.js'
import { buildSiteStockBalances } from '../../shared/siteStockBalance.js'
import { MaterialInvoiceError, transmitMaterialInvoice, materialPaymentStatuses } from '../services/materialInvoicePayment.js'
import { Router } from 'express'
import { procurementEditLock } from '../middleware/procurementEditLock.js'
import { isEbInitiator } from '../lib/ebOwnership.js'
import { ebDraftSubmissionStatus } from '../../shared/ebDraftSubmission.js'
import { canValidateSaAction, canReleaseSaPurchaseOrders, isValidSaSupervisor } from '../../shared/saTeamPolicy.js'
import { approveSaPreparedPurchaseOrders } from '../services/procurementWorkflow.js'
import { listPurchaseOrdersForRequest } from '../db/procurementQueries.js'
import { randomUUID } from 'crypto'
import { z } from 'zod'
import { getProcurementConfig } from '../config/procurement.js'
import { normalizeEbSpendCategory } from '../../shared/ebSpendCategory.js'
import { normalizeAllocations } from '../../shared/budgetAllocation.js'
import {
  parseCdgJournalRows,
  reconcileCdgJournal,
  resolveJournalSiteId,
  type ParsedCdgLine,
} from '../../shared/cdgJournal.js'
import { chargeNatureFamily, chargeNatureLabel } from '../../shared/chargeNatures.js'
import {
  createPurchaseRequestFromDraft,
  createSite,
  updateSiteAssignments,
  createSiteBudgetAmendment,
  createSupplier,
  decideSiteBudgetAmendment,
  freezeSiteBudget,
  getDraftDetail,
  getDraftById,
  getPurchaseOrderById,
  getTreasuryOrderById,
  getDisbursementByTreasuryOrder,
  getFamilyAllocations,
  setFamilyAllocations,
  importHistoricalExpenseLines,
  listHistoricalExpenseLines,
  listHistoricalImportBatches,
  deleteHistoricalImportBatch,
  listKnownPurchaseOrderReferences,
  getPurchaseRequestById,
  getPurchaseRequestLines,
  getRequestDetail,
  getSiteBudget,
  getSiteBySupermarketId,
  getSiteIndicators,
  listChantiersWithBc,
  listDisbursementsForRequest,
  listSiteBudgets,
  listSiteMonthlyExpenses,
  listSupervisedSiteIds,
  listTreasuryOrdersToDisburse,
  listTreasuryPaymentHistory,
  markDisbursementInvoicePrinted,
  setDisbursementInvoice,
  SiteBudgetError,
  linkDraftToRequest,
  listDrafts,
  listDeliveredBcRegister,
  updateBcRegisterFollowup,
  setBcInvoiceFile,
  getBcInvoiceFile,
  setBcBlFile,
  getBcBlFile,
  listSiteStock,
  listPlannedSiteDeliveries,
  listPurchaseRequests,
  listSites,
  listSuppliers,
  mergeDraftParseHints,
  recordApprovalStep,
  countRequestLinesByBlobKey,
  setRequestLineAttachment,
  setRequestLinesAttachment,
  updateDraft,
    softDeleteDraft,
  updatePurchaseRequestStatus,
  updateRequestLinePrices,
} from '../db/procurementQueries.js'
import type { ParsedEbLine, ProcurementRole, PurchaseRequestStatus } from '../db/schema.js'
import { managers } from '../db/schema.js'
import { db } from '../db/index.js'
import { and, eq } from 'drizzle-orm'
import { createTourWithStops, ensureCompanyUnit, ensureProductsFromEbLines, getManagerById, getVirtualSupplierDriver } from '../db/queries.js'
import { catalogUnitFromEb } from '../../shared/ebCatalog.js'
import { detachSupplierChangeAttachments, linesForSupplier } from '../lib/procurementLines.js'
import { hasComptantLines, saFinanceIncompleteMessage } from '../../shared/saFinanceGate.js'
import { parseBody } from '../lib/validation.js'
import { getLineAttachment, putLineAttachment, deleteLineAttachment } from '../lib/lineAttachmentStore.js'
import { LINE_ATTACHMENT_MAX_BYTES, resolveLineAttachmentMime } from '../lib/uploadMime.js'
import { requireManager, type ManagerRequest } from '../middleware/managerAuth.js'
import {
  requireProcurementRole,
  requireExactProcurementRole,
  loadProcurementRole,
  type ProcurementManagerRequest,
} from '../middleware/procurementAuth.js'
import { localTodayIso } from '../utils/dates.js'
import {
  approvePurchaseRequest,
  createPurchaseOrdersForEb,
  createTreasuryAdvanceForRequest,
  disburseTreasuryOrder,
  ensureTreasuryAdvance,
  markDeliveryScheduled,
  ProcurementWorkflowError,
  rejectPurchaseRequest,
  revisePurchaseRequest,
} from '../services/procurementWorkflow.js'
import { wrapPoDocument } from '../services/pdfDocuments.js'
import { getDocumentChain, resolveDocumentChain } from '../services/documentChain.js'
import {
  availableBcRegisterMonths,
  filterBcRegisterByMonth,
  recapBySupplier,
} from '../services/bcRegister.js'
import { createBlankEbDraft, createDraftFromPastedText } from '../services/ebPaste.js'
import { EB_FICHE_SERVICE, ficheLinesFromParsed, generateEbFicheHtml, signoffFromApprovalSteps } from '../services/ebFiche.js'
import { buildEbObjet } from '../services/ebParser.js'
import { needsPdgApproval, shouldDisplayPdgSignature, sumLineAmountsFcfa } from '../services/ebPricing.js'
import { notifyRequestStatusChange, notifyManagersByProcurementRole } from '../services/procurementNotifications.js'
import {
  assertEtapeForRole,
  clientIpFromReq,
  createApprobation,
  formatSignatureBlock,
  formatSignatureTimestamp,
  hashEbContenu,
  procurementRoleToSignatureRole,
  verifySignaturePin,
  type EbApprobation,
} from '../services/ebSignature.js'

export const procurementRouter = Router()
procurementRouter.use(requireManager)
procurementRouter.use(loadProcurementRole)

// Tous les accès directs (fiche, pièces jointes, chaîne, modifications) doivent
// respecter l'initiateur, même si le CdC connaît l'identifiant d'une autre EB.
procurementRouter.use('/drafts/:id', async (req, res, next) => {
  const { manager, procurementRole } = req as unknown as ProcurementManagerRequest
  if (procurementRole !== 'site_manager' && procurementRole !== 'purchasing') return next()
  if (req.params.id === 'blank' || req.params.id === 'from-paste') return next()
  const draft = await getDraftById(manager.companyId, String(req.params.id))
  if (!draft || draft.createdByManagerId !== manager.sub) {
    res.status(404).json({ message: 'Brouillon introuvable' })
    return
  }
  if (procurementRole === 'purchasing' && draft.purchaseRequestId && req.method !== 'GET') {
    res.status(409).json({ message: 'Cette EB est déjà créée : poursuivez depuis sa fiche de chiffrage' })
    return
  }
  next()
})

async function requestInitiatedBy(
  companyId: string,
  request: { sourceDraftId: string | null; createdByManagerId: string | null },
  managerId: string,
): Promise<boolean> {
  return isEbInitiator(request, managerId, (id) => getDraftById(companyId, id))
}

procurementRouter.use('/requests/:id', async (req, res, next) => {
  const { manager, procurementRole } = req as unknown as ProcurementManagerRequest
  if (procurementRole !== 'site_manager') return next()
  const request = await getPurchaseRequestById(manager.companyId, String(req.params.id))
  if (!request || !await requestInitiatedBy(manager.companyId, request, manager.sub)) {
    res.status(404).json({ message: 'Demande introuvable' })
    return
  }
  next()
})

procurementRouter.use('/drafts/:id', procurementEditLock('drafts'))
procurementRouter.use('/requests/:id', procurementEditLock('requests'))
procurementRouter.use('/requests/:id/correction', procurementCorrectionsRouter)

// Les pièces du registre BC ne doivent pas contourner l'affectation d'un retour.
procurementRouter.use('/bc-register/:poId', async (req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) { next(); return }
  const { manager } = req as unknown as ManagerRequest
  const po = await getPurchaseOrderById(manager.companyId, String(req.params.poId))
  if (!po) { res.status(404).json({ message: 'BC introuvable' }); return }
  if (po.correctionPending) { res.status(409).json({ message: 'Ce BC est archivé après correction.' }); return }
  const request = await getPurchaseRequestById(manager.companyId, po.purchaseRequestId)
  if (request?.correctionTargetId && request.correctionTargetId !== manager.sub) { res.status(403).json({ message: 'Ce dossier est en correction chez une autre personne.' }); return }
  next()
})


const siteSchema = z.object({
  name: z.string().min(1),
  address: z.string().min(1),
  lat: z.string().optional(),
  lng: z.string().optional(),
  managerId: z.string().optional(),
  whatsappGroupId: z.string().optional(),
})

const supplierSchema = z.object({
  name: z.string().min(1),
  contactPhone: z.string().optional(),
  contactEmail: z.string().email().optional().or(z.literal('')),
  hasAccount: z.boolean().optional(),
  address: z.string().optional(),
})

async function siteManagerSiteIds(companyId: string, managerId: string): Promise<string[]> {
  const companySites = await listSites(companyId)
  return companySites.filter((site) => site.managerId === managerId).map((site) => site.id)
}

function hasAssignedSite(siteId: string | null | undefined, assignedSiteIds: string[]): boolean {
  return Boolean(siteId && assignedSiteIds.includes(siteId))
}

const parsedLineSchema = z.object({
  label: z.string().min(1),
  quantity: z.coerce.number().positive(),
  unit: z.string().min(1),
  observation: z.string().optional(),
  supplierName: z.string().optional(),
  paymentMode: z.string().optional(),
  // Le DT chiffre à la saisie (PU × quantité, ou montant direct) — la couche
  // de persistance recopie déjà ces champs vers `purchase_request_lines`.
  unitPrice: z.coerce.number().nonnegative().optional(),
  amount: z.coerce.number().nonnegative().optional(),
  spendCategory: z.string().optional().transform((v) => (v ? normalizeEbSpendCategory(v) : undefined)),
})

const draftPatchSchema = z.object({
  parsedLines: z.array(parsedLineSchema).optional(),
  parsedUrgency: z.string().nullable().optional(),
  needsReview: z.boolean().optional(),
  siteId: z.string().min(1).nullable().optional(),
  requesterName: z.string().optional(),
  objet: z.string().optional(),
  neededBy: z.string().optional(),
})

const pasteDraftSchema = z.object({
  bodyText: z.string().min(1),
  siteId: z.string().optional(),
})

const submitDraftSchema = z.object({
  supplierId: z.string().optional(),
  totalAmountFcfa: z.number().nonnegative().optional(),
  notes: z.string().optional(),
  pin: z.string().optional(),
  requesterName: z.string().optional(),
  objet: z.string().optional(),
  neededBy: z.string().optional(),
})

const approveSchema = z.object({
  comment: z.string().optional(),
  pin: z.string().optional(),
})

const reviseSchema = z.object({
  quantities: z
    .array(
      z.object({
        id: z.string().min(1),
        quantity: z.number().nonnegative(),
      }),
    )
    .min(1, 'Au moins une ligne à réviser'),
  comment: z.string().optional(),
  /** NIP du PDG : la révision est un acte signé (visa porté sur le BT régénéré). */
  pin: z.string().optional(),
})

const createPoSchema = z.object({
  supplierId: z.string().optional(),
  allSuppliers: z.boolean().optional(),
})

/** F03 — ventilation de l'enveloppe par famille de charge (action CdG). */
const budgetAllocationsSchema = z.object({
  allocations: z.array(
    z.object({
      family: z.string(),
      amountFcfa: z.number().nonnegative(),
    }),
  ),
})

/**
 * T08 — lignes brutes du journal du CdG (feuille convertie en tableaux de cellules).
 *
 * Le **parsing** vit dans `shared/cdgJournal.ts` : le client se contente de lire
 * la feuille (`XLSX.utils.sheet_to_json(ws, { header: 1 })`) et d'envoyer les
 * cellules. Le serveur reste la **seule autorité** sur ce qui entre en base —
 * les lignes sont re-parsées et re-rapprochées ici, jamais reçues « prêtes ».
 */
const cdgJournalRowsSchema = z.object({
  rows: z.array(z.array(z.unknown())).min(1).max(5000),
  /**
   * Chantier désigné par le CdG, appliqué aux lignes dont le libellé du journal
   * n'est pas reconnu. Le journal réel porte le nom de **la société**
   * (« DG CI ENERGIE ») : sans ce champ, rien ne serait imputable.
   */
  siteId: z.string().trim().min(1).optional(),
})

/** Déboursé d'un BT (rôle Trésorerie) — la facture est exigée (invariant I103). */
const disburseSchema = z.object({
  amountFcfa: z.number().nonnegative().optional(),
  method: z.enum(['orange_money', 'cash', 'bank', 'cheque']).default('orange_money'),
  transactionReference: z.string().trim().max(120).optional(),
  paidAt: z.string().optional(),
  /** Pièce justificative — même format que les PJ de ligne EB (`parseJsonAttachment`). */
  data: z.string().optional(),
  fileName: z.string().optional(),
  contentType: z.string().optional(),
})

const pricingSchema = z.object({
  lines: z.array(
    z.object({
      id: z.string().min(1),
      unitPriceFcfa: z.number().nonnegative(),
      supplierName: z.string().optional(),
      paymentMode: z.string().optional(),
      observation: z.string().optional(),
    }),
  ).min(1),
})

/** Facture partagée : les champs fichier (data/fileName/contentType) restent lus par `parseJsonAttachment`. */
const bulkLinesAttachmentSchema = z.object({
  lineIds: z.array(z.string().min(1)).min(1).max(500),
})

const scheduleSchema = z.object({
  driverId: z.string().min(1).optional(),
  deliverySource: z.enum(['driver', 'supplier']).optional(),
  date: z.string().optional(),
  purchaseOrderId: z.string().optional(),
})

function handleWorkflowError(err: unknown, res: import('express').Response): boolean {
  if (err instanceof ProcurementWorkflowError || err instanceof MaterialInvoiceError || err instanceof CorrectionError) {
    res.status(err.statusCode).json({ message: err.message })
    return true
  }
  return false
}

function handleSiteBudgetError(err: unknown, res: import('express').Response): boolean {
  if (err instanceof SiteBudgetError) {
    res.status(err.status).json({ message: err.message })
    return true
  }
  return false
}

async function requireValidPin(managerId: string, pin: string): Promise<string | null> {
  const dbManager = await getManagerById(managerId)
  if (!dbManager) return 'NIP incorrect ou utilisateur inconnu'
  const pinOk = await verifySignaturePin({
    managerId,
    pin,
    passwordHash: dbManager.passwordHash,
  })
  return pinOk ? null : 'NIP incorrect ou utilisateur inconnu'
}

function asApprobation(raw: unknown): EbApprobation | null {
  if (!raw || typeof raw !== 'object') return null
  const s = raw as Partial<EbApprobation>
  if (!s.approbateur || !s.etape) return null
  return s as EbApprobation
}

async function currentManagerName(managerId: string, fallbackEmail: string): Promise<string> {
  const row = await getManagerById(managerId)
  return row?.name?.trim() || fallbackEmail
}

procurementRouter.get('/config', (_req, res) => {
  const { manager } = _req as unknown as ManagerRequest
  res.json(getProcurementConfig(manager.companyId))
})

procurementRouter.get(
  '/bc-register',
  requireProcurementRole('purchasing', 'daf', 'pdg', 'accountant'),
  async (req, res) => {
    const { manager } = req as unknown as ManagerRequest
    try {
      const all = await listDeliveredBcRegister(manager.companyId)
      const months = availableBcRegisterMonths(all)
      const requested = typeof req.query.month === 'string' ? req.query.month.trim() : ''
      const month = requested === 'all' ? 'all' : months.some((m) => m.key === requested) ? requested : (months[0]?.key ?? null)
      const rows = month === 'all' ? all : month ? filterBcRegisterByMonth(all, month) : []
      const recap = recapBySupplier(rows)
      res.json({ months, month, rows, recap })
    } catch (err) {
      console.error('[procurement] bc-register error', err)
      res.status(500).json({ message: 'Erreur registre BC' })
    }
  },
)

procurementRouter.post('/bc-register/:poId/verify', requireExactProcurementRole('controle_gestion'), async (req, res) => {
  const body = parseBody(z.object({ comment: z.string().trim().max(500).optional() }).strict(), req.body, res)
  if (!body) return
  const { manager } = req as unknown as ProcurementManagerRequest
  try {
    const row = await verifyBcRegister(manager.companyId, String(req.params.poId), manager.sub, body.comment ?? '')
    if (!row) { res.status(404).json({ message: 'BC introuvable dans le registre' }); return }
    res.json({ row })
  } catch (err) {
    console.error('[procurement] verification BC', err)
    res.status(500).json({ message: 'Vérification du BC impossible' })
  }
})

const bcRegisterFollowupSchema = z.object({
  invoice: z.string().max(200).optional(),
  justifs: z.string().max(500).optional(),
  observation: z.string().max(500).optional(),
  verification: z.string().max(500).optional(),
  invoicePaid: z.boolean().optional(),
  invoiceTransmitted: z.boolean().optional(),
})

procurementRouter.patch(
  '/bc-register/:poId',
  requireProcurementRole('purchasing', 'accountant'),
  async (req, res) => {
    const body = parseBody(bcRegisterFollowupSchema, req.body, res)
    if (!body) return
    const { manager, procurementRole } = req as unknown as ProcurementManagerRequest
    if (body.verification !== undefined) { res.status(403).json({ message: 'La vérification est réservée au CdG via l’action dédiée.' }); return }
    if (body.invoicePaid !== undefined) { res.status(403).json({ message: 'Seule la Trésorerie enregistre le paiement depuis son poste.' }); return }
    if (body.invoiceTransmitted !== undefined && (procurementRole !== 'purchasing' || !body.invoiceTransmitted)) { res.status(403).json({ message: 'Seul le SA peut transmettre une facture.' }); return }
    if (body.invoiceTransmitted && Object.keys(body).length !== 1) { res.status(400).json({ message: 'Enregistrez les informations de facture avant de la transmettre.' }); return }
    try {
      const poId = String(req.params.poId)
      if (body.invoiceTransmitted) {
        const registerRow = (await listDeliveredBcRegister(manager.companyId)).find(row => row.purchaseOrderId === poId)
        if (!registerRow) { res.status(404).json({ message: 'BC introuvable dans le registre des livraisons' }); return }
        await transmitMaterialInvoice(manager.companyId, poId, registerRow.amountFcfa)
        await notifyManagersByProcurementRole(manager.companyId, ['accountant', 'treasury'],
          'Facture transmise — à payer', 'Le SA a transmis un dossier matériaux. L’EB et ses pièces sont consultables avant paiement.',
          { refType: 'purchase_order', refId: poId, notificationType: 'task_assigned' }).catch(err => console.error('[invoice notify]', err))
      }
      const { invoiceTransmitted: _transmitted, ...followup } = body
      const row = await updateBcRegisterFollowup(manager.companyId, poId, followup)
      if (!row) {
        res.status(404).json({ message: 'BC introuvable dans le registre' })
        return
      }
      res.json({ row })
    } catch (err) {
      if (handleWorkflowError(err, res)) return
      console.error('[procurement] bc-register patch error', err)
      res.status(500).json({ message: 'Enregistrement suivi BC impossible' })
    }
  },
)

// ── Transmission de la facture (copie) du SA vers le comptable ────────────────

const MAX_BC_INVOICE_BYTES = LINE_ATTACHMENT_MAX_BYTES

procurementRouter.post(
  '/bc-register/:poId/invoice-file',
  requireProcurementRole('purchasing'),
  async (req, res) => {
    const { manager } = req as unknown as ManagerRequest
    const poId = String(req.params.poId)
    const file = parseJsonAttachment(req.body)
    if ('error' in file) {
      res.status(400).json({ message: file.error })
      return
    }
    if (file.buffer.length === 0 || file.buffer.length > MAX_BC_INVOICE_BYTES) {
      res.status(400).json({ message: 'Fichier trop volumineux (max. 5 Mo)' })
      return
    }
    const contentType = resolveLineAttachmentMime(file.originalname, file.mimetype)
    if (!contentType) {
      res.status(400).json({ message: 'Type de fichier non autorisé (PDF ou image attendu)' })
      return
    }
    const key = `sa-invoice/${poId}/${randomUUID()}`
    try {
      await putLineAttachment(key, file.buffer, { contentType, fileName: file.originalname })
    } catch (err) {
      console.error('[procurement] bc invoice store', err)
      res.status(503).json({ message: 'Stockage des pièces jointes indisponible' })
      return
    }
    const ok = await setBcInvoiceFile(manager.companyId, poId, {
      blobKey: key,
      fileName: file.originalname,
      contentType,
    })
    if (!ok) {
      await deleteLineAttachment(key).catch(() => undefined)
      res.status(404).json({ message: 'BC introuvable dans le registre' })
      return
    }
    res.json({ ok: true, fileName: file.originalname })
  },
)

procurementRouter.get(
  '/bc-register/:poId/invoice-file',
  requireProcurementRole('purchasing', 'accountant', 'treasury'),
  async (req, res) => {
    const { manager } = req as unknown as ManagerRequest
    const stored = await getBcInvoiceFile(manager.companyId, String(req.params.poId))
    if (!stored) {
      res.status(404).json({ message: 'Aucune facture transmise pour ce BC' })
      return
    }
    let blob: { data: Buffer } | null
    try {
      blob = await getLineAttachment(stored.blobKey)
    } catch (err) {
      console.error('[procurement] bc invoice read', err)
      res.status(503).json({ message: 'Stockage des pièces jointes indisponible' })
      return
    }
    if (!blob?.data?.length) {
      res.status(404).json({ message: 'Fichier introuvable' })
      return
    }
    res.setHeader('Content-Type', stored.contentType || 'application/octet-stream')
    if (stored.fileName) {
      res.setHeader('Content-Disposition', `inline; filename="${stored.fileName.replace(/"/g, '')}"`)
    }
    res.send(blob.data)
  },
)

// ── Bon de livraison fournisseur rattaché au BC (chaîne EB → BC → BL) ─────────

const MAX_BC_BL_BYTES = LINE_ATTACHMENT_MAX_BYTES

procurementRouter.post(
  '/bc-register/:poId/bl-file',
  requireProcurementRole('purchasing'),
  async (req, res) => {
    const { manager } = req as unknown as ManagerRequest
    const poId = String(req.params.poId)
    const file = parseJsonAttachment(req.body)
    if ('error' in file) {
      res.status(400).json({ message: file.error })
      return
    }
    if (file.buffer.length === 0 || file.buffer.length > MAX_BC_BL_BYTES) {
      res.status(400).json({ message: 'Fichier trop volumineux (max. 5 Mo)' })
      return
    }
    const contentType = resolveLineAttachmentMime(file.originalname, file.mimetype)
    if (!contentType) {
      res.status(400).json({ message: 'Type de fichier non autorisé (PDF ou image attendu)' })
      return
    }
    const key = `sa-bl/${poId}/${randomUUID()}`
    try {
      await putLineAttachment(key, file.buffer, { contentType, fileName: file.originalname })
    } catch (err) {
      console.error('[procurement] bc bl store', err)
      res.status(503).json({ message: 'Stockage des pièces jointes indisponible' })
      return
    }
    const ok = await setBcBlFile(manager.companyId, poId, {
      blobKey: key,
      fileName: file.originalname,
      contentType,
    })
    if (!ok) {
      res.status(404).json({ message: 'BC introuvable dans le registre' })
      return
    }
    res.json({ ok: true, fileName: file.originalname })
  },
)

procurementRouter.get(
  '/bc-register/:poId/bl-file',
  requireProcurementRole('purchasing', 'accountant', 'treasury'),
  async (req, res) => {
    const { manager } = req as unknown as ManagerRequest
    const stored = await getBcBlFile(manager.companyId, String(req.params.poId))
    if (!stored) {
      res.status(404).json({ message: 'Aucun bon de livraison joint à ce BC' })
      return
    }
    let blob: { data: Buffer } | null
    try {
      blob = await getLineAttachment(stored.blobKey)
    } catch (err) {
      console.error('[procurement] bc bl read', err)
      res.status(503).json({ message: 'Stockage des pièces jointes indisponible' })
      return
    }
    if (!blob?.data?.length) {
      res.status(404).json({ message: 'Fichier introuvable' })
      return
    }
    res.setHeader('Content-Type', stored.contentType || 'application/octet-stream')
    if (stored.fileName) {
      res.setHeader('Content-Disposition', `inline; filename="${stored.fileName.replace(/"/g, '')}"`)
    }
    res.send(blob.data)
  },
)

procurementRouter.get(
  '/site-stock',
  requireProcurementRole('site_manager', 'technical_director', 'purchasing', 'daf', 'pdg', 'controle_gestion'),
  async (req, res) => {
    const { manager, procurementRole } = req as unknown as ProcurementManagerRequest
    try {
      let rows = await listSiteStock(manager.companyId)
      let chefSiteIds: string[] = []
      // DT : uniquement le stock de ses chantiers assignés.
      if (procurementRole === 'site_manager') {
        const assigned = new Set(await siteManagerSiteIds(manager.companyId, manager.sub))
        if (req.query.siteId && !assigned.has(String(req.query.siteId))) { res.status(403).json({ message: 'Ce chantier ne vous est pas affecté.' }); return }
        rows = rows.filter(row => assigned.has(row.siteId))
        chefSiteIds = req.query.siteId ? [String(req.query.siteId)] : [...assigned]
      } else if (procurementRole === 'technical_director') {
        const supervised = new Set(await listSupervisedSiteIds(manager.companyId, manager.sub))
        if (req.query.siteId && !supervised.has(String(req.query.siteId))) { res.status(403).json({ message: 'Ce chantier ne vous est pas affecté.' }); return }
        rows = rows.filter((r) => supervised.has(r.siteId))
      }
      if (req.query.siteId) rows = rows.filter(row => row.siteId === String(req.query.siteId))
      const deliveries = req.query.siteId ? await listPlannedSiteDeliveries(manager.companyId, String(req.query.siteId)) : []
      const stock = procurementRole === 'site_manager' ? buildSiteStockBalances(rows, await listStockConsumptionForSites(manager.companyId, chefSiteIds)) : rows
      res.json({ rows: stock, deliveries })
    } catch (err) {
      console.error('[procurement] site-stock error', err)
      res.status(500).json({ message: 'Erreur stock chantier' })
    }
  },
)

// ─── Sites ───────────────────────────────────────────────────────────────────

procurementRouter.get('/sites', async (req, res) => {
  const { manager, procurementRole } = req as unknown as ProcurementManagerRequest
  let rows = await listSites(manager.companyId)
  if (procurementRole === 'site_manager') {
    rows = rows.filter((site) => site.managerId === manager.sub)
  }
  res.json({ sites: rows })
})

// GET /sites/with-bc — chantiers ayant au moins un BC émis (filtre « Chantier »
// de la page Livraisons, vue mois). Déclaré AVANT /sites/:id pour ne pas être
// capturé par une route paramétrée.
procurementRouter.get('/sites/with-bc', async (req, res) => {
  const { manager } = req as unknown as ManagerRequest
  try {
    const sites = await listChantiersWithBc(manager.companyId)
    res.json({ sites })
  } catch (err) {
    console.error('[procurement] sites with-bc error', err)
    res.status(500).json({ message: 'Erreur serveur' })
  }
})

// GET /sites/by-supermarket/:supermarketId — chantier achats relié à un point du catalogue.
// Utilisé par la fiche chantier du catalogue (modale) : renvoie `site: null` quand
// le point n'est pas rattaché au suivi achats (aucune erreur).
procurementRouter.get('/sites/by-supermarket/:supermarketId', async (req, res) => {
  const { manager } = req as unknown as ManagerRequest
  const site = await getSiteBySupermarketId(manager.companyId, String(req.params.supermarketId))
  res.json({ site })
})

procurementRouter.post('/sites', requireProcurementRole('technical_director', 'daf'), async (req, res) => {
  const body = parseBody(siteSchema, req.body, res)
  if (!body) return
  const { manager } = req as unknown as ManagerRequest
  const site = await createSite({ companyId: manager.companyId, ...body })
  res.status(201).json({ site })
})

const siteAssignSchema = z.object({
  managerId: z.string().nullable().optional(),
  supervisorManagerId: z.string().nullable().optional(),
})

// PATCH /sites/:id/assignments — affecte chef de chantier / DT superviseur
// Le chef de chantier doit DÉJÀ posséder le profil « chef de chantier »
// (procurement_role = site_manager) : aucune promotion automatique pour ce poste.
// Le DT superviseur conserve la promotion automatique (technical_director).
procurementRouter.patch(
  '/sites/:id/assignments',
  requireProcurementRole('technical_director'),
  async (req, res) => {
    const body = parseBody(siteAssignSchema, req.body, res)
    if (!body) return
    const { manager } = req as unknown as ManagerRequest
    const clean: { managerId?: string | null; supervisorManagerId?: string | null } = {}
    if ('managerId' in body) clean.managerId = body.managerId || null
    if ('supervisorManagerId' in body) clean.supervisorManagerId = body.supervisorManagerId || null

    // Contrôle métier : seuls les employés avec le profil « chef de chantier »
    // peuvent être affectés comme chef de chantier d'un site.
    if (clean.managerId) {
      const [chef] = await db
        .select({ id: managers.id, procurementRole: managers.procurementRole })
        .from(managers)
        .where(and(eq(managers.companyId, manager.companyId), eq(managers.id, clean.managerId)))
        .limit(1)
      if (!chef) {
        res.status(404).json({ message: 'Gestionnaire introuvable' })
        return
      }
      if (chef.procurementRole !== 'site_manager') {
        res.status(400).json({
          message:
            "Seuls les employés avec le profil « chef de chantier » peuvent être affectés à un chantier.",
        })
        return
      }
    }

    const site = await updateSiteAssignments(manager.companyId, String(req.params.id), clean)
    if (!site) {
      res.status(404).json({ message: 'Chantier introuvable' })
      return
    }
    // Promotion implicite réservée au DT superviseur pour que la page
    // « Ma journée » / supervision fonctionne.
    const promotions: { id: string; role: ProcurementRole }[] = []
    if (clean.supervisorManagerId) promotions.push({ id: clean.supervisorManagerId, role: 'technical_director' })
    for (const p of promotions) {
      const [row] = await db
        .select({ id: managers.id })
        .from(managers)
        .where(and(eq(managers.companyId, manager.companyId), eq(managers.id, p.id)))
        .limit(1)
      if (row) {
        await db.update(managers).set({ procurementRole: p.role }).where(eq(managers.id, p.id))
      }
    }
    res.json({ site })
  },
)

const freezeBudgetSchema = z.object({
  amountFcfa: z.number().int().positive(),
  pin: z.string().min(1),
})
const amendmentSchema = z.object({
  signedAmountFcfa: z.number().int(),
  reason: z.string().min(10),
})
const decideAmendmentSchema = z.object({
  pin: z.string().min(1),
  comment: z.string().optional(),
})

procurementRouter.get('/site-budgets', async (req, res) => {
  const { manager } = req as unknown as ManagerRequest
  // DT : uniquement les chantiers qui lui sont assignés (demande métier).
  const supervised =
    manager.procurementRole === 'technical_director'
      ? await listSupervisedSiteIds(manager.companyId, manager.sub)
      : null
  const budgets = await listSiteBudgets(
    manager.companyId,
    supervised ? { supervisedSiteIds: supervised } : undefined,
  )
  res.json({ budgets })
})

// GET /site-budgets/monthly?month=YYYY-MM — dépenses engagées du mois par chantier
procurementRouter.get('/site-budgets/monthly', async (req, res) => {
  const { manager } = req as unknown as ManagerRequest
  const month = /^\d{4}-\d{2}$/.test(String(req.query.month ?? '')) ? String(req.query.month) : null
  if (!month) {
    res.status(400).json({ message: 'Paramètre month (YYYY-MM) requis' })
    return
  }
  const expenses = await listSiteMonthlyExpenses(
    manager.companyId,
    month,
    manager.procurementRole === 'technical_director'
      ? { supervisedSiteIds: await listSupervisedSiteIds(manager.companyId, manager.sub) }
      : undefined,
  )
  res.json({ month, expenses })
})

procurementRouter.get('/sites/:id/budget', async (req, res) => {
  const { manager } = req as unknown as ManagerRequest
  const budget = await getSiteBudget(manager.companyId, String(req.params.id))
  if (!budget) {
    res.status(404).json({ message: 'Chantier introuvable' })
    return
  }
  res.json(budget)
})

/**
 * F03 — **ventilation de l'enveloppe par famille de charge**.
 *
 * Lecture ouverte à tous les rôles achats (l'enveloppe est déjà visible) ;
 * écriture réservée au **CdG**, même acteur que le gel du budget initial
 * (D-F01-1). Écriture **complète** : les familles absentes sont remises à zéro.
 */
procurementRouter.get('/sites/:id/budget/allocations', async (req, res) => {
  const { manager } = req as unknown as ManagerRequest
  const allocations = await getFamilyAllocations(manager.companyId, String(req.params.id))
  res.json({ allocations })
})

procurementRouter.put(
  '/sites/:id/budget/allocations',
  requireExactProcurementRole('controle_gestion'),
  async (req, res) => {
    const body = parseBody(budgetAllocationsSchema, req.body, res)
    if (!body) return
    const { manager } = req as unknown as ManagerRequest
    try {
      const allocations = await setFamilyAllocations({
        companyId: manager.companyId,
        siteId: String(req.params.id),
        allocations: normalizeAllocations(body.allocations),
        managerId: manager.sub,
      })
      // L'écart est recalculé côté serveur : source unique (I100 — le réalisé
      // intègre BC livrés ET EB hors SA payées).
      const indicators = await getSiteIndicators(manager.companyId, String(req.params.id))
      res.json({ allocations, familyVariance: indicators?.familyVariance ?? null })
    } catch (err) {
      if (err instanceof SiteBudgetError) {
        res.status(err.status).json({ message: err.message })
        return
      }
      console.error('[procurement] budget allocations error', err)
      res.status(500).json({ message: 'Erreur enregistrement de la ventilation' })
    }
  },
)

// ─── T08 — Rejeu de l'historique du CdG ─────────────────────────────────────

/** Répartition du rejeu par **nature** de charge (aperçu F02/F03). */
function summarizeJournalByNature(lines: ParsedCdgLine[]) {
  const map = new Map<
    string,
    { nature: string; label: string; family: string; lines: number; fcfa: number }
  >()
  for (const line of lines) {
    let entry = map.get(line.nature)
    if (!entry) {
      entry = {
        nature: line.nature,
        label: chargeNatureLabel(line.nature),
        family: chargeNatureFamily(line.nature) ?? 'inconnue',
        lines: 0,
        fcfa: 0,
      }
      map.set(line.nature, entry)
    }
    entry.lines += 1
    entry.fcfa += line.amountFcfa
  }
  return [...map.values()].sort((a, b) => b.fcfa - a.fcfa)
}

/**
 * Assemble l'aperçu du rejeu : parsing, rapprochement (I100 / I106) et sort de
 * chaque libellé de chantier. **Fonction pure** — elle n'écrit rien, elle décrit.
 */
function buildJournalPreview(
  rows: unknown[][],
  sites: Array<{ id: string; name: string }>,
  knownBcReferences: string[],
  fallbackSiteId?: string | null,
) {
  const parsed = parseCdgJournalRows(rows)
  const recon = reconcileCdgJournal(parsed.lines, knownBcReferences)

  // Sort de chaque libellé de chantier du journal : imputé ou non. Un libellé
  // inconnu n'est **jamais deviné** — il est montré comme tel, et c'est au CdG
  // de désigner le chantier cible (`fallbackSiteId`).
  const bySite = new Map<
    string,
    { journalName: string; siteId: string | null; siteName: string | null; lines: number; fcfa: number }
  >()
  let unassignedLines = 0
  let unassignedFcfa = 0
  for (const line of recon.toImport) {
    const key = line.siteName || '(vide)'
    let entry = bySite.get(key)
    if (!entry) {
      const resolved = line.siteName ? resolveJournalSiteId(line.siteName, sites) : null
      const siteId = resolved ?? fallbackSiteId ?? null
      entry = {
        journalName: key,
        siteId,
        siteName: siteId ? (sites.find((s) => s.id === siteId)?.name ?? null) : null,
        lines: 0,
        fcfa: 0,
      }
      bySite.set(key, entry)
    }
    entry.lines += 1
    entry.fcfa += line.amountFcfa
    if (!entry.siteId) {
      unassignedLines += 1
      unassignedFcfa += line.amountFcfa
    }
  }

  return {
    /** Lignes exploitables lues dans le fichier. */
    parsedLines: parsed.lines.length,
    /** Lignes illisibles — jamais importées avec une valeur inventée. */
    rejected: parsed.rejected,
    totalFcfa: recon.totalFcfa,
    /** Lignes portant un n° de BC : **déjà dans TraceO**, exclues (I100). */
    excluded: { lines: recon.excluded.length, fcfa: recon.excludedFcfa },
    /** Lignes hors BC : le rejeu réel. */
    toImport: { lines: recon.toImport.length, fcfa: recon.toImportFcfa },
    unmappedBcReferences: recon.unmappedBcReferences,
    matchRatePct: recon.matchRatePct,
    sites: [...bySite.values()].sort((a, b) => b.fcfa - a.fcfa),
    /**
     * Lignes qu'**aucun** chantier n'absorbe. Sans désignation, elles seraient
     * importées mais ne compteraient dans le réalisé d'aucun chantier : le CdG
     * doit le voir **avant** d'importer.
     */
    unassigned: { lines: unassignedLines, fcfa: unassignedFcfa },
    byNature: summarizeJournalByNature(recon.toImport),
  }
}

/**
 * Aperçu du rapprochement journal ↔ TraceO — **n'écrit rien** (I106).
 *
 * Le CdG voit avant d'importer : la part du fichier **déjà connue** (lignes
 * portant un n° de BC, exclues par I100), la part à rejouer, les lignes
 * illisibles, le sort de chaque libellé de chantier et la répartition par
 * nature. Un miroir, pas une promesse : seul `/import` écrit.
 */
procurementRouter.post(
  '/historical-expenses/preview',
  requireExactProcurementRole('controle_gestion'),
  async (req, res) => {
    const body = parseBody(cdgJournalRowsSchema, req.body, res)
    if (!body) return
    const { manager } = req as unknown as ManagerRequest
    try {
      const [sites, knownRefs] = await Promise.all([
        listSites(manager.companyId),
        listKnownPurchaseOrderReferences(manager.companyId),
      ])
      res.json(buildJournalPreview(body.rows, sites, knownRefs, body.siteId))
    } catch (err) {
      console.error('[procurement] historical expenses preview error', err)
      res.status(500).json({ message: 'Erreur lecture du journal' })
    }
  },
)

/**
 * Rejeu effectif du journal — **seules les lignes hors BC** sont écrites (I100).
 *
 * Idempotent (I99) : l'unicité `(company, source, source_ref)` est appliquée par
 * la base, rejouer deux fois le même fichier n'ajoute rien. Le lot est
 * identifiable (`batchId`) et **annulable** (`DELETE`).
 *
 * Un fichier dont **toutes** les lignes portent un n° de BC est refusé : il n'y
 * a rien à rejouer, et l'accepter créerait un doublon silencieux.
 */
procurementRouter.post(
  '/historical-expenses/import',
  requireExactProcurementRole('controle_gestion'),
  async (req, res) => {
    const body = parseBody(cdgJournalRowsSchema, req.body, res)
    if (!body) return
    const { manager } = req as unknown as ManagerRequest
    try {
      const [sites, knownRefs] = await Promise.all([
        listSites(manager.companyId),
        listKnownPurchaseOrderReferences(manager.companyId),
      ])
      const parsed = parseCdgJournalRows(body.rows)
      const recon = reconcileCdgJournal(parsed.lines, knownRefs)
      const preview = buildJournalPreview(body.rows, sites, knownRefs, body.siteId)

      if (recon.toImport.length === 0) {
        res.status(400).json({
          message: 'Aucune ligne hors BC dans ce fichier — rien à rejouer (I100).',
          preview,
        })
        return
      }

      // Le journal réel nomme `DG CI ENERGIE`, qui correspond déjà au chantier
      // `site-xlsx-dg-ci-energie` — mais 5 lignes portent `CI ENERGIE DG` (ordre
      // inversé) et ne sont reconnues par personne. Importer sans désignation
      // créerait des lignes qui ne comptent dans le réalisé d'**aucun** chantier :
      // on refuse plutôt que de produire du vide.
      if (preview.unassigned.lines === recon.toImport.length && !body.siteId) {
        res.status(400).json({
          message:
            'Aucun chantier reconnu dans ce fichier : désignez le chantier à imputer avant de rejouer.',
          preview,
        })
        return
      }

      const result = await importHistoricalExpenseLines({
        companyId: manager.companyId,
        managerId: manager.sub,
        fallbackSiteId: body.siteId ?? null,
        sites: sites.map((s) => ({ id: s.id, name: s.name })),
        lines: recon.toImport.map((line) => ({
          occurredOn: line.occurredOn,
          label: line.label,
          nature: line.nature,
          natureLabel: line.natureLabel,
          supplierName: line.supplierName,
          amountFcfa: line.amountFcfa,
          siteName: line.siteName,
          sourceRef: line.sourceRef,
        })),
      })

      res.json({
        ...result,
        totalFcfa: recon.totalFcfa,
        excluded: { lines: recon.excluded.length, fcfa: recon.excludedFcfa },
        rejected: parsed.rejected,
        matchRatePct: recon.matchRatePct,
      })
    } catch (err) {
      console.error('[procurement] historical expenses import error', err)
      res.status(500).json({ message: 'Erreur import du journal' })
    }
  },
)

/**
 * Lots déjà rejoués et dernières lignes historiques (T08) — **lecture seule**.
 * Ouvert à tous les rôles achats : l'historique fait partie du réalisé, donc de
 * l'écran que chacun consulte déjà.
 */
procurementRouter.get('/historical-expenses', async (req, res) => {
  const { manager } = req as unknown as ManagerRequest
  const [batches, lines] = await Promise.all([
    listHistoricalImportBatches(manager.companyId),
    listHistoricalExpenseLines(manager.companyId, { limit: 200 }),
  ])
  res.json({ batches, lines })
})

/** Annule un lot de rejeu (T08) — le rejeu est **réversible** (rôle CdG). */
procurementRouter.delete(
  '/historical-expenses/:batchId',
  requireExactProcurementRole('controle_gestion'),
  async (req, res) => {
    const { manager } = req as unknown as ManagerRequest
    const deleted = await deleteHistoricalImportBatch({
      companyId: manager.companyId,
      batchId: String(req.params.batchId),
    })
    res.json({ deleted })
  },
)

procurementRouter.get('/sites/:id/indicators', async (req, res) => {
  const { manager } = req as unknown as ManagerRequest
  const indicators = await getSiteIndicators(manager.companyId, String(req.params.id))
  if (!indicators) {
    res.status(404).json({ message: 'Chantier introuvable' })
    return
  }
  res.json(indicators)
})

procurementRouter.post(
  '/sites/:id/budget/freeze',
  requireExactProcurementRole('controle_gestion'),
  async (req, res) => {
    const body = parseBody(freezeBudgetSchema, req.body, res)
    if (!body) return
    const { manager } = req as unknown as ManagerRequest
    const pinErr = await requireValidPin(manager.sub, body.pin)
    if (pinErr) {
      res.status(401).json({ message: pinErr })
      return
    }
    try {
      const budget = await freezeSiteBudget({
        companyId: manager.companyId,
        siteId: String(req.params.id),
        amountFcfa: body.amountFcfa,
        managerId: manager.sub,
      })
      res.json(budget)
    } catch (err) {
      if (handleSiteBudgetError(err, res)) return
      console.error('[procurement] budget freeze error', err)
      res.status(500).json({ message: 'Erreur gel enveloppe' })
    }
  },
)

procurementRouter.post(
  '/sites/:id/budget/amendments',
  requireExactProcurementRole('technical_director'),
  async (req, res) => {
    const body = parseBody(amendmentSchema, req.body, res)
    if (!body) return
    const { manager } = req as unknown as ManagerRequest
    try {
      const budget = await createSiteBudgetAmendment({
        companyId: manager.companyId,
        siteId: String(req.params.id),
        signedAmountFcfa: body.signedAmountFcfa,
        reason: body.reason,
        managerId: manager.sub,
      })
      res.status(201).json(budget)
    } catch (err) {
      if (handleSiteBudgetError(err, res)) return
      console.error('[procurement] budget amendment error', err)
      res.status(500).json({ message: 'Erreur avenant' })
    }
  },
)

procurementRouter.post(
  '/sites/:id/budget/amendments/:amdId/approve',
  requireExactProcurementRole('daf'),
  async (req, res) => {
    const body = parseBody(decideAmendmentSchema, req.body, res)
    if (!body) return
    const { manager } = req as unknown as ManagerRequest
    const pinErr = await requireValidPin(manager.sub, body.pin)
    if (pinErr) {
      res.status(401).json({ message: pinErr })
      return
    }
    try {
      const budget = await decideSiteBudgetAmendment({
        companyId: manager.companyId,
        siteId: String(req.params.id),
        amendmentId: String(req.params.amdId),
        decision: 'approved',
        managerId: manager.sub,
        comment: body.comment,
      })
      res.json(budget)
    } catch (err) {
      if (handleSiteBudgetError(err, res)) return
      console.error('[procurement] budget approve error', err)
      res.status(500).json({ message: 'Erreur approbation avenant' })
    }
  },
)

procurementRouter.post(
  '/sites/:id/budget/amendments/:amdId/reject',
  requireExactProcurementRole('daf'),
  async (req, res) => {
    const body = parseBody(decideAmendmentSchema, req.body, res)
    if (!body) return
    const { manager } = req as unknown as ManagerRequest
    const pinErr = await requireValidPin(manager.sub, body.pin)
    if (pinErr) {
      res.status(401).json({ message: pinErr })
      return
    }
    try {
      const budget = await decideSiteBudgetAmendment({
        companyId: manager.companyId,
        siteId: String(req.params.id),
        amendmentId: String(req.params.amdId),
        decision: 'rejected',
        managerId: manager.sub,
        comment: body.comment,
      })
      res.json(budget)
    } catch (err) {
      if (handleSiteBudgetError(err, res)) return
      console.error('[procurement] budget reject error', err)
      res.status(500).json({ message: 'Erreur rejet avenant' })
    }
  },
)

// ─── Suppliers ───────────────────────────────────────────────────────────────

procurementRouter.get('/suppliers', async (req, res) => {
  const { manager } = req as unknown as ManagerRequest
  const rows = await listSuppliers(manager.companyId)
  res.json({ suppliers: rows })
})

procurementRouter.post(
  '/suppliers',
  requireProcurementRole('purchasing', 'daf'),
  async (req, res) => {
    const body = parseBody(supplierSchema, req.body, res)
    if (!body) return
    const { manager } = req as unknown as ManagerRequest
    const supplier = await createSupplier({
      companyId: manager.companyId,
      name: body.name,
      contactPhone: body.contactPhone,
      contactEmail: body.contactEmail || null,
      hasAccount: body.hasAccount,
      address: body.address,
    })
    res.status(201).json({ supplier })
  },
)

// ─── Drafts ──────────────────────────────────────────────────────────────────

procurementRouter.post(
  '/drafts/from-paste',
  requireProcurementRole('technical_director', 'site_manager', 'purchasing'),
  async (req, res) => {
    const body = parseBody(pasteDraftSchema, req.body, res)
    if (!body) return
    const { manager, procurementRole } = req as unknown as ProcurementManagerRequest
    try {
      let siteId = body.siteId
      if (procurementRole === 'site_manager') {
        const assignedSiteIds = await siteManagerSiteIds(manager.companyId, manager.sub)
        if (assignedSiteIds.length === 0) {
          res.status(403).json({ message: 'Aucun chantier ne vous est affecté' })
          return
        }
        siteId = siteId || (assignedSiteIds.length === 1 ? assignedSiteIds[0] : undefined)
        if (!siteId || !hasAssignedSite(siteId, assignedSiteIds)) {
          res.status(403).json({ message: 'Sélectionnez un chantier qui vous est affecté' })
          return
        }
      }
      const result = await createDraftFromPastedText({
        companyId: manager.companyId,
        bodyText: body.bodyText,
        siteId,
        pastedByManagerId: manager.sub,
        pastedByName: (await currentManagerName(manager.sub, '')).trim() || null,
      })
      res.status(201).json({
        draftId: result.draftId,
        messageId: result.messageId,
        lines: result.lines,
        confidenceScore: result.confidenceScore,
        siteId: result.siteId,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Collage impossible'
      res.status(400).json({ message })
    }
  },
)

procurementRouter.post(
  '/drafts/blank',
  requireProcurementRole('technical_director', 'site_manager', 'purchasing'),
  async (req, res) => {
    const { manager, procurementRole } = req as unknown as ProcurementManagerRequest
    let siteId = typeof req.body?.siteId === 'string' ? req.body.siteId : undefined
    try {
      if (procurementRole === 'site_manager') {
        const assignedSiteIds = await siteManagerSiteIds(manager.companyId, manager.sub)
        if (assignedSiteIds.length === 0) {
          res.status(403).json({ message: 'Aucun chantier ne vous est affecté' })
          return
        }
        siteId = siteId || (assignedSiteIds.length === 1 ? assignedSiteIds[0] : undefined)
        if (!siteId || !hasAssignedSite(siteId, assignedSiteIds)) {
          res.status(403).json({ message: 'Sélectionnez un chantier qui vous est affecté' })
          return
        }
      }
      const result = await createBlankEbDraft({
        companyId: manager.companyId,
        createdByManagerId: manager.sub,
        siteId,
      })
      res.status(201).json({ draftId: result.draftId, siteId: result.siteId, blank: true })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Création de fiche impossible'
      res.status(400).json({ message })
    }
  },
)

procurementRouter.get('/drafts', async (req, res) => {
  const { manager, procurementRole } = req as unknown as ProcurementManagerRequest
  if (procurementRole !== 'technical_director' && procurementRole !== 'site_manager' && procurementRole !== 'purchasing') {
    res.json({ drafts: [], count: 0 })
    return
  }
  const assignedSiteIds = procurementRole === 'site_manager'
    ? await siteManagerSiteIds(manager.companyId, manager.sub)
    : undefined
  let drafts = await listDrafts(manager.companyId, assignedSiteIds, procurementRole === 'site_manager' || procurementRole === 'purchasing' ? manager.sub : undefined)
  if (procurementRole === 'purchasing') drafts = drafts.filter((draft) => !draft.purchaseRequestId)
  if (req.query.needsReview === 'true') {
    drafts = drafts.filter((d) => d.needsReview && !d.purchaseRequestId)
  }
  res.json({ drafts, count: drafts.length })
})

procurementRouter.get('/inbox-count', async (req, res) => {
  const { manager, procurementRole } = req as unknown as ProcurementManagerRequest
  const threshold = getProcurementConfig(manager.companyId).btThresholdFcfa
  if (procurementRole === 'technical_director') {
    const drafts = (await listDrafts(manager.companyId)).filter((d) => d.needsReview && !d.purchaseRequestId)
    const pendingApprovalCount = (await listPurchaseRequests(manager.companyId))
      .filter((request) => request.status === 'dt_review').length
    res.json({ count: drafts.length + pendingApprovalCount })
    return
  }
  if (procurementRole === 'site_manager') {
    const assignedSiteIds = await siteManagerSiteIds(manager.companyId, manager.sub)
    const drafts = (await listDrafts(manager.companyId, assignedSiteIds, manager.sub))
      .filter((draft) => !draft.purchaseRequestId)
    res.json({ count: drafts.length })
    return
  }
  const requests = await listPurchaseRequests(manager.companyId)
  if (procurementRole === 'purchasing') {
    res.json({ count: requests.filter((r) => r.status === 'submitted' || (r.saReviewerId === manager.sub && (r.status === 'sa_head_review' || r.status === 'bc_head_review'))).length })
    return
  }
  if (procurementRole === 'controle_gestion') {
    res.json({ count: requests.filter((r) => r.status === 'cdg_review').length })
    return
  }
  if (procurementRole === 'daf') {
    res.json({
      count: requests.filter(
        (r) => r.status === 'daf_review' || r.status === 'daf_bt_review',
      ).length,
    })
    return
  }
  if (procurementRole === 'pdg') {
    res.json({
      count: requests.filter(
        (r) =>
          r.status === 'pdg_review' ||
          (r.status === 'daf_review' && Number(r.totalAmountFcfa ?? 0) >= threshold),
      ).length,
    })
    return
  }
  res.json({ count: 0 })
})

procurementRouter.get('/drafts/:id', async (req, res) => {
  const { manager, procurementRole } = req as unknown as ProcurementManagerRequest
  if (procurementRole !== 'technical_director' && procurementRole !== 'site_manager' && procurementRole !== 'purchasing') {
    res.status(403).json({ message: 'Accès aux brouillons réservé au DT, au Chef de chantier et au Service achats' })
    return
  }
  const detail = await getDraftDetail(manager.companyId, String(req.params.id))
  if (!detail) {
    res.status(404).json({ message: 'Brouillon introuvable' })
    return
  }
  if (procurementRole === 'site_manager') {
    const assignedSiteIds = await siteManagerSiteIds(manager.companyId, manager.sub)
    if (!hasAssignedSite(detail.draft.siteId, assignedSiteIds) || detail.draft.purchaseRequestId) {
      res.status(404).json({ message: 'Brouillon introuvable' })
      return
    }
    detail.sites = detail.sites.filter((site) => assignedSiteIds.includes(site.id))
  }
  res.json(detail)
})

procurementRouter.get('/drafts/:id/html', async (req, res) => {
  const { manager, procurementRole } = req as unknown as ProcurementManagerRequest
  const detail = await getDraftDetail(manager.companyId, String(req.params.id))
  if (!detail) {
    res.status(404).json({ message: 'Brouillon introuvable' })
    return
  }
  if (procurementRole !== 'technical_director' && procurementRole !== 'site_manager' && procurementRole !== 'purchasing') {
    res.status(403).json({ message: 'Accès à la fiche EB réservé au DT, au Chef de chantier et au Service achats' })
    return
  }
  if (procurementRole === 'site_manager') {
    const assignedSiteIds = await siteManagerSiteIds(manager.companyId, manager.sub)
    if (!hasAssignedSite(detail.draft.siteId, assignedSiteIds)) {
      res.status(404).json({ message: 'Brouillon introuvable' })
      return
    }
  }
  const lines = (detail.draft.parsedLines as ParsedEbLine[] | null) ?? []
  const requester =
    detail.parseHints?.requesterName && detail.parseHints.requesterName !== 'À identifier'
      ? detail.parseHints.requesterName
      : ''
  const stored = asApprobation(detail.parseHints?.signature)
  const dtName =
    procurementRole === 'technical_director'
      ? await currentManagerName(manager.sub, manager.email)
      : stored?.approbateur ?? ''
  const html = generateEbFicheHtml({
    companyId: manager.companyId,
    reference: `Brouillon ${detail.draft.id.slice(-8)}`,
    siteName: detail.site?.name ?? detail.parseHints?.destination ?? '',
    service: EB_FICHE_SERVICE,
    objet: detail.parseHints?.objet || buildEbObjet(lines, detail.parseHints?.destination),
    requesterName: requester,
    treatmentDate: new Date(detail.draft.createdAt).toLocaleDateString('fr-FR'),
    neededBy: detail.parseHints?.neededBy,
    urgency: detail.draft.parsedUrgency,
    lines: ficheLinesFromParsed(lines),
    validatedByName: dtName,
    validatedByDate: stored?.timestamp?.slice(0, 10) || formatSignatureTimestamp().slice(0, 10),
    validatedBySignature: formatSignatureBlock(stored),
  })
  res.type('html').send(html)
})

procurementRouter.patch(
  '/drafts/:id',
  requireProcurementRole('technical_director', 'site_manager', 'purchasing'),
  async (req, res) => {
    const body = parseBody(draftPatchSchema, req.body, res)
    if (!body) return
    const { manager, procurementRole } = req as unknown as ProcurementManagerRequest
    const draftId = String(req.params.id)
    if (procurementRole === 'site_manager') {
      const assignedSiteIds = await siteManagerSiteIds(manager.companyId, manager.sub)
      const existing = await getDraftById(manager.companyId, draftId)
      if (!existing || existing.purchaseRequestId || !hasAssignedSite(existing.siteId, assignedSiteIds)) {
        res.status(404).json({ message: 'Brouillon introuvable' })
        return
      }
      if (body.siteId !== undefined && !hasAssignedSite(body.siteId, assignedSiteIds)) {
        res.status(403).json({ message: 'Vous ne pouvez pas déplacer une EB vers un chantier non affecté' })
        return
      }
    }
    const draft = await updateDraft(manager.companyId, draftId, {
      parsedLines: body.parsedLines as ParsedEbLine[] | undefined,
      parsedUrgency: body.parsedUrgency,
      needsReview: body.needsReview,
      siteId: body.siteId,
      status: 'draft_review',
    })
    if (!draft) {
      res.status(404).json({ message: 'Brouillon introuvable' })
      return
    }
    const hints: Record<string, unknown> = {}
    if (body.requesterName !== undefined) hints.demandeur = body.requesterName.trim()
    if (body.objet !== undefined) hints.objet = body.objet.trim() || 'BESOIN'
    if (body.neededBy !== undefined) hints.dateBesoin = body.neededBy.trim() || 'À préciser'
    if (procurementRole === 'technical_director') {
      hints.validatedByName = await currentManagerName(manager.sub, manager.email)
    }
    if (Object.keys(hints).length > 0) {
      await mergeDraftParseHints(draftId, hints)
    }
    res.json({ draft })
  },
)

procurementRouter.delete(
  '/drafts/:id',
  requireProcurementRole('technical_director', 'site_manager', 'purchasing'),
  async (req, res) => {
    const { manager, procurementRole } = req as unknown as ProcurementManagerRequest
    try {
      if (procurementRole === 'site_manager') {
        const assignedSiteIds = await siteManagerSiteIds(manager.companyId, manager.sub)
        const existing = await getDraftById(manager.companyId, String(req.params.id))
        if (!existing || existing.purchaseRequestId || !hasAssignedSite(existing.siteId, assignedSiteIds)) {
          res.status(404).json({ message: 'Brouillon introuvable' })
          return
        }
      }
      const ok = await softDeleteDraft(manager.companyId, String(req.params.id), manager.sub)
      if (!ok) {
        res.status(404).json({ message: 'Brouillon introuvable' })
        return
      }
      res.status(204).end()
    } catch (err) {
      console.error('[procurement] soft-delete draft error', err)
      res.status(500).json({ message: 'Suppression du brouillon impossible' })
    }
  },
)

procurementRouter.post(
  '/drafts/:id/submit',
  requireProcurementRole('technical_director', 'site_manager', 'purchasing'),
  async (req, res) => {
    const body = parseBody(submitDraftSchema, req.body, res)
    if (!body) return
    const { manager, procurementRole } = req as unknown as ProcurementManagerRequest
    const draftId = String(req.params.id)
    const draft = await getDraftById(manager.companyId, draftId)
    if (!draft) {
      res.status(404).json({ message: 'Brouillon introuvable' })
      return
    }
    if (draft.purchaseRequestId || draft.status === 'deleted') {
      res.status(409).json({ message: 'Ce brouillon a déjà été transmis ou supprimé' })
      return
    }
    if (procurementRole === 'site_manager') {
      const assignedSiteIds = await siteManagerSiteIds(manager.companyId, manager.sub)
      if (!hasAssignedSite(draft.siteId, assignedSiteIds)) {
        res.status(404).json({ message: 'Brouillon introuvable' })
        return
      }
    }
    if (!draft.siteId) {
      res.status(400).json({ message: 'Chantier requis sur le brouillon' })
      return
    }
    const lines = (draft.parsedLines as ParsedEbLine[] | null) ?? []
    if (lines.length === 0) {
      res.status(400).json({ message: 'Aucune ligne à soumettre' })
      return
    }

    // ── Routage à la soumission ───────────────────────────────────────────────
    // Une EB est **homogène** : soit 100 % matériaux (circuit SA), soit 100 %
    // hors SA (main d'œuvre / engins / frais → CdG direct, décision CdG du
    // 16/10/2026). Une EB mixte est refusée : le DT crée des EB distinctes
    // par famille (I111 — remplace le routage « mixte → circuit SA » de I105).
    const lineFamilies = new Set(
      lines.map((l) => chargeNatureFamily(normalizeEbSpendCategory(l.spendCategory)) ?? 'materiaux'),
    )
    const hasMaterials = lineFamilies.has('materiaux')
    const hasHorsSa = [...lineFamilies].some((f) => f !== 'materiaux')
    if (hasMaterials && hasHorsSa) {
      res.status(400).json({
        message:
          "EB mixte interdite : les lignes matériaux et les lignes de main d'œuvre/engins/frais suivent des circuits distincts — créez deux EB séparées.",
      })
      return
    }
    const horsSaOnly = !hasMaterials

    // Le DT chiffre à la saisie : le total de l'EB est dérivé des lignes
    // (PU × quantité, ou montant saisi directement) quand il n'est pas fourni.
    const linesTotalFcfa = lines.reduce(
      (sum, l) =>
        sum +
        (l.unitPrice != null
          ? Math.round(Math.max(0, l.unitPrice) * Number(l.quantity))
          : l.amount != null
            ? Math.round(l.amount)
            : 0),
      0,
    )

    const detail = await getDraftDetail(manager.companyId, draftId)
    const requesterName = (body.requesterName ?? detail?.parseHints?.requesterName ?? '').trim()
    if (procurementRole === 'technical_director' && (!requesterName || requesterName === 'À identifier')) {
      res.status(400).json({ message: 'Nom du demandeur requis' })
      return
    }

    let signature: EbApprobation | null = asApprobation(detail?.parseHints?.signature)
    const sigRole = procurementRoleToSignatureRole(procurementRole)
    if (procurementRole === 'technical_director') {
      const pin = body.pin?.trim() ?? ''
      if (!pin) {
        res.status(400).json({ message: 'Code PIN de signature requis' })
        return
      }
      const dbManager = await getManagerById(manager.sub)
      if (!dbManager) {
        res.status(401).json({ message: 'Compte introuvable' })
        return
      }
      const pinOk = await verifySignaturePin({
        managerId: manager.sub,
        pin,
        passwordHash: dbManager.passwordHash,
      })
      if (!pinOk) {
        res.status(401).json({ message: 'PIN incorrect ou utilisateur inconnu' })
        return
      }
      if (!sigRole) {
        res.status(403).json({ message: 'Rôle de signature inconnu' })
        return
      }
      const etapeErr = assertEtapeForRole(sigRole, 'validation_dt')
      if (etapeErr) {
        res.status(403).json({ message: etapeErr })
        return
      }
      const approbateur = dbManager.name
      signature = createApprobation({
        ebReference: `draft:${draftId}`,
        etape: 'validation_dt',
        approbateur,
        role: sigRole,
        ipAddress: clientIpFromReq(req),
        contenuHash: hashEbContenu({
          siteId: draft.siteId,
          requesterName,
          lines,
        }),
      })
      await mergeDraftParseHints(draftId, {
        demandeur: requesterName,
        validatedByName: approbateur,
        signature,
        ...(body.objet !== undefined ? { objet: body.objet.trim() || 'BESOIN' } : {}),
        ...(body.neededBy !== undefined ? { dateBesoin: body.neededBy.trim() } : {}),
      })
    } else if (requesterName) {
      await mergeDraftParseHints(draftId, { demandeur: requesterName })
    }

    const initialStatus = ebDraftSubmissionStatus(
      procurementRole as 'technical_director' | 'site_manager' | 'purchasing',
      horsSaOnly,
    )
    const request = await createPurchaseRequestFromDraft({
      companyId: manager.companyId,
      siteId: draft.siteId,
      draftId,
      lines,
      urgency: draft.parsedUrgency,
      requestedByName: requesterName || null,
      supplierId: body.supplierId ?? null,
      totalAmountFcfa: body.totalAmountFcfa ?? (linesTotalFcfa > 0 ? linesTotalFcfa : null),
      notes: body.notes ?? null,
      createdByManagerId: manager.sub,
      // EB terrain soumise par le DT → CdG direct ; sinon étape de revue DT (I110).
      initialStatus,
    })
    await ensureProductsFromEbLines(manager.companyId, lines)
    if (signature) {
      await recordApprovalStep({
        purchaseRequestId: request.id,
        role: 'technical_director',
        managerId: manager.sub,
        decision: 'approved',
        comment: formatSignatureBlock(signature),
        ip: signature.ipAddress,
        etape: signature.etape,
        pinVerified: true,
      })
    }
    await linkDraftToRequest(draftId, request.id)
    const notifiedRoles: ProcurementRole[] = initialStatus === 'dt_review'
      ? ['technical_director']
      : initialStatus === 'cdg_review' ? ['controle_gestion'] : ['purchasing']
    await notifyRequestStatusChange(
      manager.companyId,
      request.reference,
      initialStatus,
      notifiedRoles,
    )
    res.status(201).json({ request, notifiedRoles })
  },
)

// ─── Requests ────────────────────────────────────────────────────────────────

function requestVisibleToRole(
  role: ProcurementRole | null,
  status: PurchaseRequestStatus,
  totalAmountFcfa: number | null | undefined,
  thresholdFcfa: number,
): boolean {
  if (!role || role === 'technical_director' || role === 'purchasing' || role === 'controle_gestion') return true
  if (role === 'daf') {
    if (status === 'submitted' || status === 'cdg_review') return false
    return true
  }
  if (role === 'pdg') {
    if (status === 'submitted' || status === 'cdg_review') return false
    if (status === 'daf_review') return Number(totalAmountFcfa ?? 0) >= thresholdFcfa
    return true
  }
  return true
}

procurementRouter.get('/requests', async (req, res) => {
  const { manager, procurementRole } = req as unknown as ProcurementManagerRequest
  const threshold = getProcurementConfig(manager.companyId).btThresholdFcfa
  let requests = (await listPurchaseRequests(manager.companyId, procurementRole === 'site_manager' ? manager.sub : undefined)).filter((r) =>
    requestVisibleToRole(procurementRole, r.status, r.totalAmountFcfa != null ? Number(r.totalAmountFcfa) : null, threshold),
  )
  if (procurementRole === 'site_manager') {
    const assignedSiteIds = await siteManagerSiteIds(manager.companyId, manager.sub)
    requests = requests.filter((request) => assignedSiteIds.includes(request.siteId))
  }
  // numeric Postgres → string via le driver : normaliser en nombre, sinon le front
  // concatène les totaux au lieu de les additionner (bug du montant pipeline hors BC).
  const payments = await materialPaymentStatuses(manager.companyId)
  res.json({
    requests: requests.map((r) => ({
      ...r,
      lifecycleStatus: r.status,
      status: r.correctionTargetId ? r.correctionReviewRequired ? 'correction_head_review' : 'correction_required' : r.status,
      paymentStatus: payments.get(r.id) ?? (r.status === 'paid' ? 'paid' : null),
      totalAmountFcfa: r.totalAmountFcfa != null ? Number(r.totalAmountFcfa) : null,
    })),
  })
})

procurementRouter.get('/requests/:id', async (req, res) => {
  const { manager, procurementRole } = req as unknown as ProcurementManagerRequest
  const detail = await getRequestDetail(manager.companyId, String(req.params.id))
  if (!detail) {
    res.status(404).json({ message: 'Demande introuvable' })
    return
  }
  if (procurementRole === 'site_manager') {
    const assignedSiteIds = await siteManagerSiteIds(manager.companyId, manager.sub)
    if (!assignedSiteIds.includes(detail.request.siteId)) {
      res.status(404).json({ message: 'Demande introuvable' })
      return
    }
  }
  res.json({ ...detail, request: { ...detail.request, lifecycleStatus: detail.request.status, status: detail.request.correctionTargetId ? detail.request.correctionReviewRequired ? 'correction_head_review' : 'correction_required' : detail.request.status, paymentStatus: (await materialPaymentStatuses(manager.companyId)).get(detail.request.id) ?? (detail.request.status === 'paid' ? 'paid' : null) } })
})

// GET /requests/:id/chain — chaîne documentaire EB → BT → BC → BL → facture.
// Ouvert à tous les rôles achats : c'est la vue de navigation entre les pièces.
procurementRouter.get('/requests/:id/chain', async (req, res) => {
  const { manager, procurementRole } = req as unknown as ProcurementManagerRequest
  try {
    if (procurementRole === 'site_manager') {
      const request = await getPurchaseRequestById(manager.companyId, String(req.params.id))
      const assignedSiteIds = await siteManagerSiteIds(manager.companyId, manager.sub)
      if (!request || !assignedSiteIds.includes(request.siteId) || !await requestInitiatedBy(manager.companyId, request, manager.sub)) {
        res.status(404).json({ message: 'Demande introuvable' })
        return
      }
    }
    const chain = await getDocumentChain(manager.companyId, String(req.params.id))
    if (!chain) {
      res.status(404).json({ message: 'Demande introuvable' })
      return
    }
    res.json({ chain })
  } catch (err) {
    console.error('[procurement] request chain error', err)
    res.status(500).json({ message: 'Chaîne documentaire indisponible' })
  }
})

// GET /document-chain?ref=… — résolveur : n'importe quel identifiant de la
// chaîne (EB-…, BT-…/AV-…, BC-…, RCT-… ou id technique) → la pièce trouvée
// (`matched`) et sa chaîne complète. Ouvert à tous les rôles achats : c'est de
// la navigation entre pièces, comme /requests/:id/chain.
procurementRouter.get('/document-chain', async (req, res) => {
  const { manager, procurementRole } = req as unknown as ProcurementManagerRequest
  const ref = String(req.query.ref ?? '').trim()
  if (!ref) {
    res.status(400).json({ message: 'Identifiant manquant' })
    return
  }
  try {
    const resolved = await resolveDocumentChain(manager.companyId, ref)
    if (resolved === 'invalid') {
      res.status(422).json({
        message: 'Identifiant non reconnu — attendu : EB-…, BT-…, BC-…, RCT-… ou un id technique',
      })
      return
    }
    if (!resolved) {
      res.status(404).json({ message: 'Aucune pièce ne correspond à cet identifiant' })
      return
    }
    if (procurementRole === 'site_manager') {
      const request = resolved.requestId
        ? await getPurchaseRequestById(manager.companyId, resolved.requestId)
        : null
      const assignedSiteIds = await siteManagerSiteIds(manager.companyId, manager.sub)
      if (!request || !assignedSiteIds.includes(request.siteId) || !await requestInitiatedBy(manager.companyId, request, manager.sub)) {
        res.status(404).json({ message: 'Aucune pièce ne correspond à cet identifiant' })
        return
      }
    }
    res.json(resolved)
  } catch (err) {
    console.error('[procurement] document chain resolve error', err)
    res.status(500).json({ message: 'Résolution de la chaîne indisponible' })
  }
})

procurementRouter.patch(
  '/requests/:id/pricing',
  requireProcurementRole('purchasing'),
  async (req, res) => {
    const body = parseBody(pricingSchema, req.body, res)
    if (!body) return
    const { manager } = req as unknown as ManagerRequest
    const requestId = String(req.params.id)
    const request = await getPurchaseRequestById(manager.companyId, requestId)
    if (!request) {
      res.status(404).json({ message: 'Demande introuvable' })
      return
    }
    if (request.status !== 'submitted') {
      res.status(400).json({ message: 'Les lignes ne peuvent être modifiées qu’avant envoi au CdG' })
      return
    }
    // Réaffectation d'un fournisseur : les lignes qui changent de fournisseur et
    // portent une pièce jointe voient cette pièce détachée (elle ne vaut que
    // pour l'ancien fournisseur ; le blob survit s'il est partagé ailleurs).
    const currentLines = await getPurchaseRequestLines(requestId)
    const detachedKeys = await detachSupplierChangeAttachments(
      currentLines,
      body.lines,
      (lineId) => setRequestLineAttachment(manager.companyId, requestId, lineId, null),
    )

    const detail = await updateRequestLinePrices(manager.companyId, requestId, body.lines)
    if (detachedKeys.length > 0) {
      await cleanupDetachedBlobKeys(manager.companyId, detachedKeys, '')
    }
    if (detail) {
      await ensureProductsFromEbLines(manager.companyId, detail.lines)
    }
    res.json(detail)
  },
)

procurementRouter.post(
  '/requests/:id/submit-finance',
  requireProcurementRole('purchasing'),
  async (req, res) => {
    const { manager } = req as unknown as ManagerRequest
    const requestId = String(req.params.id)
    const request = await getPurchaseRequestById(manager.companyId, requestId)
    if (!request) {
      res.status(404).json({ message: 'Demande introuvable' })
      return
    }
    if (request.status !== 'submitted' && request.status !== 'sa_head_review') {
      res.status(400).json({ message: 'Cette EB ne peut pas être soumise à cette étape' })
      return
    }
    const actor = await getManagerById(manager.sub)
    if (!actor || actor.companyId !== manager.companyId || actor.procurementRole !== 'purchasing') {
      res.status(403).json({ message: 'Compte SA requis' })
      return
    }
    let headSignature: EbApprobation | null = null
    if (request.status === 'sa_head_review') {
      if (!canValidateSaAction(actor, request.saReviewerId)) {
        res.status(403).json({ message: 'Validation réservée au chef SA désigné' })
        return
      }
      const pin = typeof req.body?.pin === 'string' ? req.body.pin : ''
      if (!await verifySignaturePin({ managerId: actor.id, passwordHash: actor.passwordHash, pin })) {
        res.status(401).json({ message: 'NIP de signature incorrect ou manquant' })
        return
      }
      headSignature = createApprobation({ ebReference: request.reference, etape: 'validation_chiffrage_sa', approbateur: actor.name, role: 'SA', ipAddress: clientIpFromReq(req), contenuHash: hashEbContenu(await getPurchaseRequestLines(requestId)) })
    }
    const lines = await getPurchaseRequestLines(requestId)
    const incomplete = saFinanceIncompleteMessage(lines)
    if (incomplete) {
      res.status(400).json({ message: incomplete })
      return
    }
    const priced = lines.filter((l) => l.label.trim())
    const totalAmountFcfa = sumLineAmountsFcfa(
      priced.map((l) => ({
        unitPriceFcfa: l.unitPriceFcfa,
        amountFcfa: l.amountFcfa,
        quantity: l.quantity,
      })),
    )
    const threshold = getProcurementConfig(manager.companyId).btThresholdFcfa
    if (request.status === 'submitted' && actor.saSupervisorId) {
      const supervisor = await getManagerById(actor.saSupervisorId)
      if (!isValidSaSupervisor(actor, supervisor)) {
        res.status(400).json({ message: 'Le chef SA affecté à cette ressource est indisponible : vérifiez son équipe' })
        return
      }
      const pending = await updatePurchaseRequestStatus(manager.companyId, requestId, 'sa_head_review', { totalAmountFcfa, saReviewerId: actor.saSupervisorId })
      await recordApprovalStep({ purchaseRequestId: requestId, role: 'purchasing', managerId: actor.id, decision: 'approved', etape: 'preparation_chiffrage_sa', comment: `${actor.name} — chiffrage soumis au chef SA` })
      await notifyRequestStatusChange(manager.companyId, request.reference, 'sa_head_review', ['purchasing'], { managerIds: [actor.saSupervisorId] })
      res.json({ request: pending, treasuryOrder: null, finance: { totalAmountFcfa, needsPdg: false, notifiedRoles: ['purchasing'], thresholdFcfa: threshold } })
      return
    }
    const needsPdg = needsPdgApproval(totalAmountFcfa, threshold)
    const notifiedRoles: ProcurementRole[] = ['controle_gestion']
    const saName = await currentManagerName(manager.sub, manager.email)
    await recordApprovalStep({
      purchaseRequestId: requestId,
      role: 'purchasing',
      managerId: manager.sub,
      decision: 'approved',
      comment: headSignature ? formatSignatureBlock(headSignature) : `${saName}\nChiffrage SA`,
      etape: headSignature ? 'validation_chiffrage_sa' : 'traitement_sa',
      pinVerified: Boolean(headSignature),
      ip: clientIpFromReq(req),
    })
    let treasuryOrder = null
    if (hasComptantLines(priced)) {
      treasuryOrder = await ensureTreasuryAdvance(manager.companyId, requestId, totalAmountFcfa)
    }
    const updated = await updatePurchaseRequestStatus(manager.companyId, requestId, 'cdg_review', {
      totalAmountFcfa,
    })
    await notifyRequestStatusChange(manager.companyId, request.reference, 'cdg_review', notifiedRoles)
    res.json({
      request: updated,
      treasuryOrder,
      finance: { totalAmountFcfa, needsPdg, notifiedRoles, thresholdFcfa: threshold },
    })
  },
)

/**
 * Supprime du stockage les blobs qui viennent d'être détachés et que plus
 * aucune ligne de l'entreprise ne référence. `keep` exclut la clé qui vient
 * d'être posée (remplacement d'une facture partagée par elle-même).
 */
async function cleanupDetachedBlobKeys(companyId: string, keys: Iterable<string>, keep: string) {
  for (const key of keys) {
    if (!key || key === keep) continue
    try {
      const remaining = await countRequestLinesByBlobKey(companyId, key)
      if (remaining === 0) await deleteLineAttachment(key)
    } catch (err) {
      console.warn('[procurement] attachment cleanup skipped', err)
    }
  }
}

// Facture partagée : un seul blob, référencé par toutes les lignes cochées —
// le Service achats joint la facture d'un fournisseur en un seul envoi au
// lieu d'un par ligne. Le retrait d'une ligne ne détache que SA référence ;
// le fichier disparaît quand la dernière ligne le lâche.
procurementRouter.post(
  '/requests/:id/lines-attachment',
  requireProcurementRole('purchasing'),
  async (req, res) => {
    const { manager } = req as unknown as ManagerRequest
    const requestId = String(req.params.id)
    const body = parseBody(bulkLinesAttachmentSchema, req.body, res)
    if (!body) return
    const request = await getPurchaseRequestById(manager.companyId, requestId)
    if (!request) {
      res.status(404).json({ message: 'Demande introuvable' })
      return
    }
    if (request.status !== 'submitted') {
      res.status(400).json({ message: 'Pièce jointe possible uniquement avant envoi au CdG' })
      return
    }
    const file = parseJsonAttachment(req.body)
    if ('error' in file) {
      res.status(400).json({ message: file.error })
      return
    }
    if (file.buffer.length === 0 || file.buffer.length > LINE_ATTACHMENT_MAX_BYTES) {
      res.status(400).json({ message: 'Fichier trop volumineux (max. 5 Mo)' })
      return
    }
    // Identifiants inconnus (détail rechargé entre-temps) ignorés : seules les
    // lignes réellement rattachées à la demande reçoivent la facture.
    const requestLines = await getPurchaseRequestLines(requestId)
    const targets = requestLines.filter((l) => body.lineIds.includes(l.id))
    if (targets.length === 0) {
      res.status(404).json({ message: 'Lignes introuvables' })
      return
    }
    // Clés détachées par l'opération, dédupliquées (une facture partagée ne
    // compte qu'une fois) puis nettoyées après la mise à jour en base.
    const replacedKeys = new Set(
      targets.map((l) => l.attachmentBlobKey?.trim() || '').filter(Boolean),
    )
    const contentType = file.mimetype
    const key = `eb-line/${requestId}/${randomUUID()}`
    try {
      await putLineAttachment(key, file.buffer, { contentType, fileName: file.originalname })
    } catch (err) {
      console.error('[procurement] attachment store', err)
      res.status(503).json({ message: 'Stockage des pièces jointes indisponible' })
      return
    }
    const detail = await setRequestLinesAttachment(manager.companyId, requestId, targets.map((l) => l.id), {
      blobKey: key,
      fileName: file.originalname,
      contentType,
    })
    if (!detail) {
      res.status(404).json({ message: 'Ligne introuvable' })
      return
    }
    await cleanupDetachedBlobKeys(manager.companyId, replacedKeys, key)
    res.status(201).json(detail)
  },
)

procurementRouter.post(
  '/requests/:id/lines/:lineId/attachment',
  requireProcurementRole('purchasing'),
  async (req, res) => {
    const { manager } = req as unknown as ManagerRequest
    const requestId = String(req.params.id)
    const lineId = String(req.params.lineId)
    const request = await getPurchaseRequestById(manager.companyId, requestId)
    if (!request) {
      res.status(404).json({ message: 'Demande introuvable' })
      return
    }
    if (request.status !== 'submitted') {
      res.status(400).json({ message: 'Pièce jointe possible uniquement avant envoi au CdG' })
      return
    }
    const file = parseJsonAttachment(req.body)
    if ('error' in file) {
      res.status(400).json({ message: file.error })
      return
    }
    if (file.buffer.length === 0 || file.buffer.length > LINE_ATTACHMENT_MAX_BYTES) {
      res.status(400).json({ message: 'Fichier trop volumineux (max. 5 Mo)' })
      return
    }
    const requestLines = await getPurchaseRequestLines(requestId)
    const line = requestLines.find((l) => l.id === lineId)
    if (!line) {
      res.status(404).json({ message: 'Ligne introuvable' })
      return
    }
    // Clé détachée par le remplacement : elle peut être partagée par d'autres
    // lignes (facture partagée), le blob ne disparaît que si plus personne ne
    // la référence.
    const previousKey = line.attachmentBlobKey?.trim() || ''
    const contentType = file.mimetype
    const key = `eb-line/${requestId}/${lineId}/${randomUUID()}`
    try {
      await putLineAttachment(key, file.buffer, { contentType, fileName: file.originalname })
    } catch (err) {
      console.error('[procurement] attachment store', err)
      res.status(503).json({ message: 'Stockage des pièces jointes indisponible' })
      return
    }
    const detail = await setRequestLineAttachment(manager.companyId, requestId, lineId, {
      blobKey: key,
      fileName: file.originalname,
      contentType,
    })
    if (!detail) {
      res.status(404).json({ message: 'Ligne introuvable' })
      return
    }
    await cleanupDetachedBlobKeys(manager.companyId, [previousKey], key)
    res.status(201).json(detail)
  },
)

procurementRouter.delete(
  '/requests/:id/lines/:lineId/attachment',
  requireProcurementRole('purchasing'),
  async (req, res) => {
    const { manager } = req as unknown as ManagerRequest
    const requestId = String(req.params.id)
    const lineId = String(req.params.lineId)
    const request = await getPurchaseRequestById(manager.companyId, requestId)
    if (!request) {
      res.status(404).json({ message: 'Demande introuvable' })
      return
    }
    if (request.status !== 'submitted') {
      res.status(400).json({ message: 'Pièce jointe modifiable uniquement avant envoi au CdG' })
      return
    }
    const lines = await getPurchaseRequestLines(requestId)
    const line = lines.find((l) => l.id === lineId)
    if (!line) {
      res.status(404).json({ message: 'Ligne introuvable' })
      return
    }
    // Déréférencement compté : la ligne est d'abord détachée en base, puis le
    // blob n'est supprimé du stockage que si plus aucune ligne ne le référence
    // — une facture partagée survit au retrait d'une seule de ses lignes.
    const previousKey = line.attachmentBlobKey?.trim() || ''
    const detail = await setRequestLineAttachment(manager.companyId, requestId, lineId, null)
    if (!detail) {
      res.status(404).json({ message: 'Ligne introuvable' })
      return
    }
    await cleanupDetachedBlobKeys(manager.companyId, [previousKey], '')
    res.json(detail)
  },
)

procurementRouter.get('/requests/:id/lines/:lineId/attachment', async (req, res) => {
  const { manager } = req as unknown as ManagerRequest
  const requestId = String(req.params.id)
  const lineId = String(req.params.lineId)
  const request = await getPurchaseRequestById(manager.companyId, requestId)
  if (!request) {
    res.status(404).json({ message: 'Demande introuvable' })
    return
  }
  const lines = await getPurchaseRequestLines(requestId)
  const line = lines.find((l) => l.id === lineId)
  const blobKey = line?.attachmentBlobKey?.trim() || null
  if (!line || !blobKey) {
    res.status(404).json({ message: 'Pièce jointe introuvable' })
    return
  }
  let stored: { data: Buffer } | null
  try {
    stored = await getLineAttachment(blobKey)
  } catch (err) {
    console.error('[procurement] attachment read', err)
    res.status(503).json({ message: 'Stockage des pièces jointes indisponible' })
    return
  }
  if (!stored?.data?.length) {
    res.status(404).json({ message: 'Fichier introuvable' })
    return
  }
  const type = line.attachmentContentType || 'application/octet-stream'
  res.setHeader('Content-Type', type)
  if (line.attachmentFileName) {
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${line.attachmentFileName.replace(/"/g, '')}"`,
    )
  }
  res.send(stored.data)
})

procurementRouter.get('/requests/:id/eb-html', async (req, res) => {
  const { manager } = req as unknown as ManagerRequest
  const detail = await getRequestDetail(manager.companyId, String(req.params.id))
  if (!detail) {
    res.status(404).json({ message: 'Demande introuvable' })
    return
  }
  const lines = detail.lines.map((l) => ({
    label: l.label,
    quantity: Number(l.quantity),
    unit: l.unit,
    observation: l.observation ?? undefined,
    supplierName: l.supplierName ?? undefined,
    paymentMode: l.paymentMode ?? undefined,
    unitPrice: l.unitPriceFcfa != null ? Number(l.unitPriceFcfa) : undefined,
    amount: l.amountFcfa != null ? Number(l.amountFcfa) : undefined,
  }))
  // Le visa PDG conditionne l'affichage de la case PDG (cf. shouldDisplayPdgSignature).
  const signoff = signoffFromApprovalSteps(detail.approvalSteps)
  const html = generateEbFicheHtml({
    companyId: manager.companyId,
    reference: detail.request.reference,
    siteName: detail.site?.name ?? '',
    service: EB_FICHE_SERVICE,
    objet: buildEbObjet(lines, detail.site?.name),
    requesterName: detail.request.requestedByName ?? '',
    treatmentDate: new Date(detail.request.createdAt).toLocaleDateString('fr-FR'),
    urgency: detail.request.urgency,
    version: detail.request.version ?? 1,
    revisionComment: detail.request.revisionComment ?? null,
    revisedAt: detail.request.revisedAt ?? null,
    lines: ficheLinesFromParsed(lines),
    showPdg: shouldDisplayPdgSignature(
      sumLineAmountsFcfa(
        detail.lines.map((l) => ({
          unitPriceFcfa: l.unitPriceFcfa,
          amountFcfa: l.amountFcfa,
          quantity: l.quantity,
        })),
      ),
      getProcurementConfig(manager.companyId).btThresholdFcfa,
      Boolean(signoff.pdgName),
    ),
    ...signoff,
  })
  res.type('html').send(html)
})

procurementRouter.post('/requests/:id/approve', async (req, res) => {
  const body = parseBody(approveSchema, req.body, res)
  if (!body) return
  const { manager, procurementRole } = req as unknown as ProcurementManagerRequest
  if (!procurementRole) {
    res.status(403).json({ message: 'Rôle achats non défini sur ce compte' })
    return
  }
  try {
    let comment = body.comment
    let pinVerified = false
    let etape: string | undefined
    const pin = body.pin?.trim() ?? ''
    if (procurementRole === 'daf' || procurementRole === 'pdg' || procurementRole === 'controle_gestion') {
      if (!pin) {
        res.status(400).json({ message: 'NIP de signature requis' })
        return
      }
      const dbManager = await getManagerById(manager.sub)
      if (!dbManager) {
        res.status(401).json({ message: 'Compte introuvable' })
        return
      }
      const pinOk = await verifySignaturePin({
        managerId: manager.sub,
        pin,
        passwordHash: dbManager.passwordHash,
      })
      if (!pinOk) {
        res.status(401).json({ message: 'NIP incorrect ou utilisateur inconnu' })
        return
      }
      const sigRole = procurementRoleToSignatureRole(procurementRole)
      if (!sigRole) {
        res.status(403).json({ message: 'Rôle de signature inconnu' })
        return
      }
      const current = await getPurchaseRequestById(manager.companyId, String(req.params.id))
      etape = procurementRole === 'pdg'
        ? 'validation_pdg'
        : procurementRole === 'controle_gestion'
          ? 'validation_cdg'
          : current?.status === 'daf_bt_review'
            ? 'validation_daf_2'
            : 'approbation_daf_1'
      const etapeErr = assertEtapeForRole(sigRole, etape)
      if (etapeErr) {
        res.status(403).json({ message: etapeErr })
        return
      }
      const signature = createApprobation({
        ebReference: current?.reference ?? String(req.params.id),
        etape,
        approbateur: dbManager.name,
        role: sigRole,
        ipAddress: clientIpFromReq(req),
        contenuHash: hashEbContenu({ requestId: String(req.params.id), status: current?.status }),
        commentaire: body.comment,
      })
      comment = formatSignatureBlock(signature)
      pinVerified = true
    }
    const updated = await approvePurchaseRequest({
      companyId: manager.companyId,
      requestId: String(req.params.id),
      managerId: manager.sub,
      procurementRole,
      comment,
      pinVerified,
      etape,
      ip: clientIpFromReq(req),
    })
    res.json({ request: updated })
  } catch (err) {
    if (handleWorkflowError(err, res)) return
    console.error('[procurement] approve error', err)
    res.status(500).json({ message: 'Erreur approbation' })
  }
})

procurementRouter.post('/requests/:id/approve-sa-bc', requireProcurementRole('purchasing'), async (req, res) => {
  const { manager } = req as unknown as ManagerRequest
  const body = parseBody(approveSchema, req.body, res)
  if (!body) return
  try {
    const actor = await getManagerById(manager.sub)
    const request = await getPurchaseRequestById(manager.companyId, String(req.params.id))
    if (!actor || !request || actor.companyId !== manager.companyId || !canValidateSaAction(actor, request.saReviewerId)) {
      res.status(403).json({ message: 'Validation réservée au chef SA désigné' })
      return
    }
    if (!await verifySignaturePin({ managerId: actor.id, passwordHash: actor.passwordHash, pin: body.pin ?? '' })) {
      res.status(401).json({ message: 'NIP de signature incorrect ou manquant' })
      return
    }
    const orders = await listPurchaseOrdersForRequest(manager.companyId, request.id)
    const signature = createApprobation({ ebReference: request.reference, etape: 'validation_bc_sa', approbateur: actor.name, role: 'SA', ipAddress: clientIpFromReq(req), contenuHash: hashEbContenu(orders.map((po) => ({ id: po.id, reference: po.reference, supplierId: po.supplierId, amount: po.amountFcfa, html: po.pdfHtml }))) })
    res.json(await approveSaPreparedPurchaseOrders({ companyId: manager.companyId, requestId: request.id, managerId: actor.id, signature: formatSignatureBlock(signature), ordersHash: signature.contenuHash, ip: clientIpFromReq(req) }))
  } catch (err) {
    if (handleWorkflowError(err, res)) return
    console.error('[procurement] validation BC chef SA', err)
    res.status(500).json({ message: 'Validation du BC impossible' })
  }
})

procurementRouter.post('/requests/:id/reject', async (req, res) => {
  const body = parseBody(approveSchema, req.body, res)
  if (!body) return
  const { manager, procurementRole } = req as unknown as ProcurementManagerRequest
  if (!procurementRole) {
    res.status(403).json({ message: 'Rôle achats non défini sur ce compte' })
    return
  }
  try {
    if (procurementRole !== 'daf' && procurementRole !== 'pdg') { res.status(403).json({ message: 'Refus définitif réservé au DAF et au PDG' }); return }
    const pinError = await requireValidPin(manager.sub, body.pin ?? '')
    if (pinError) { res.status(401).json({ message: pinError }); return }
    const updated = await rejectPurchaseRequest({
      companyId: manager.companyId,
      requestId: String(req.params.id),
      managerId: manager.sub,
      procurementRole,
      comment: body.comment, pinVerified: true, ip: clientIpFromReq(req),
    })
    res.json({ request: updated })
  } catch (err) {
    if (handleWorkflowError(err, res)) return
    console.error('[procurement] reject error', err)
    res.status(500).json({ message: 'Erreur rejet' })
  }
})

/**
 * Révision PDG des quantités (option A). Autorisée uniquement au statut
 * `pdg_review` (contrôlé dans le service). Enregistre la version, incrémente
 * eb_version, renvoie la demande au SA et notifie le DT initiateur.
 */
procurementRouter.post(
  '/requests/:id/revise-quantities',
  requireProcurementRole('pdg'),
  async (req, res) => {
    const body = parseBody(reviseSchema, req.body, res)
    if (!body) return
    const { manager } = req as unknown as ProcurementManagerRequest
    try {
      // La révision vaut visa du PDG : elle est signée par NIP, comme /approve.
      const pin = body.pin?.trim() ?? ''
      if (!pin) {
        res.status(400).json({ message: 'NIP de signature requis' })
        return
      }
      const dbManager = await getManagerById(manager.sub)
      if (!dbManager) {
        res.status(401).json({ message: 'Compte introuvable' })
        return
      }
      const pinOk = await verifySignaturePin({
        managerId: manager.sub,
        pin,
        passwordHash: dbManager.passwordHash,
      })
      if (!pinOk) {
        res.status(401).json({ message: 'NIP incorrect ou utilisateur inconnu' })
        return
      }
      const sigRole = procurementRoleToSignatureRole('pdg')
      if (!sigRole) {
        res.status(403).json({ message: 'Rôle de signature inconnu' })
        return
      }
      const etape = 'validation_pdg'
      const etapeErr = assertEtapeForRole(sigRole, etape)
      if (etapeErr) {
        res.status(403).json({ message: etapeErr })
        return
      }
      const current = await getPurchaseRequestById(manager.companyId, String(req.params.id))
      const signature = createApprobation({
        ebReference: current?.reference ?? String(req.params.id),
        etape,
        approbateur: dbManager.name,
        role: sigRole,
        ipAddress: clientIpFromReq(req),
        contenuHash: hashEbContenu({ requestId: String(req.params.id), status: current?.status }),
        commentaire: body.comment,
      })
      const updated = await revisePurchaseRequest({
        companyId: manager.companyId,
        requestId: String(req.params.id),
        managerId: manager.sub,
        procurementRole: 'pdg',
        quantities: body.quantities,
        revisionComment: body.comment ?? null,
        comment: formatSignatureBlock(signature),
        pinVerified: true,
        etape,
        ip: clientIpFromReq(req),
      })
      res.json({ request: updated })
    } catch (err) {
      if (handleWorkflowError(err, res)) return
      console.error('[procurement] revise-quantities error', err)
      res.status(500).json({ message: 'Erreur révision' })
    }
  },
)

procurementRouter.post(
  '/requests/:id/create-bt',
  requireProcurementRole('purchasing'),
  async (req, res) => {
    const { manager } = req as unknown as ManagerRequest
    try {
      const treasuryOrder = await createTreasuryAdvanceForRequest({
        companyId: manager.companyId,
        requestId: String(req.params.id),
      })
      const detail = await getRequestDetail(manager.companyId, String(req.params.id))
      res.status(201).json({ treasuryOrder, ...detail })
    } catch (err) {
      if (handleWorkflowError(err, res)) return
      console.error('[procurement] create-bt error', err)
      res.status(500).json({ message: 'Erreur création bon de trésorerie' })
    }
  },
)

procurementRouter.post(
  '/requests/:id/create-po',
  requireProcurementRole('purchasing'),
  async (req, res) => {
    const body = parseBody(createPoSchema, req.body, res)
    if (!body) return
    const { manager } = req as unknown as ManagerRequest
    try {
      const created = await createPurchaseOrdersForEb({
        companyId: manager.companyId,
        requestId: String(req.params.id),
        managerId: manager.sub,
        supplierId: body.supplierId,
        allSuppliers: body.allSuppliers || !body.supplierId,
      })
      const detail = await getRequestDetail(manager.companyId, String(req.params.id))
      const budget = detail?.request.siteId
        ? await getSiteBudget(manager.companyId, detail.request.siteId)
        : null
      res.status(201).json({
        ...detail,
        purchaseOrder: created[created.length - 1],
        purchaseOrders: created,
        overBudget: budget?.overBudget ?? false,
        budget,
      })
    } catch (err) {
      if (handleWorkflowError(err, res)) return
      console.error('[procurement] create-po error', err)
      res.status(500).json({ message: 'Erreur création BC' })
    }
  },
)

procurementRouter.post(
  '/requests/:id/schedule-delivery',
  requireProcurementRole('purchasing', 'technical_director'),
  async (req, res) => {
    const body = parseBody(scheduleSchema, req.body, res)
    if (!body) return
    const { manager } = req as unknown as ManagerRequest
    const requestId = String(req.params.id)

    try {
      const detail = await getRequestDetail(manager.companyId, requestId)
      const pos = detail?.purchaseOrders ?? []
      if (!detail || !canReleaseSaPurchaseOrders(detail.request.status, pos)) {
        res.status(409).json({ message: 'Les BC doivent être validés avant de planifier la livraison' })
        return
      }
      const targetPo =
        (body.purchaseOrderId ? pos.find((p) => p.id === body.purchaseOrderId) : null)
        ?? pos.find((p) => !p.tourId)
        ?? pos[pos.length - 1]
        ?? detail?.purchaseOrder
        ?? null
      const supplier =
        (targetPo ? detail?.suppliers.find((s) => s.id === targetPo.supplierId) : null)
        ?? detail?.supplier
        ?? null
      if (!detail?.site || !supplier) {
        res.status(400).json({ message: 'Chantier et fournisseur requis' })
        return
      }

      const isSupplierDelivery = body.deliverySource === 'supplier'
      const driverId = isSupplierDelivery
        ? (await getVirtualSupplierDriver(manager.companyId)).id
        : body.driverId
      if (!driverId) {
        res.status(400).json({ message: 'Livreur requis' })
        return
      }

      const poLines = linesForSupplier(detail.lines, supplier.name)
      const date = body.date ?? localTodayIso()
      for (const line of poLines) {
        await ensureCompanyUnit(manager.companyId, catalogUnitFromEb(line.unit), line.unit)
      }
      const { tourId } = await createTourWithStops({
        companyId: manager.companyId,
        driverId,
        deliverySource: isSupplierDelivery ? 'supplier' : 'driver',
        date,
        depotName: supplier.name,
        depotAddress: supplier.address ?? '—',
        depotLat: '5.3600',
        depotLng: '-4.0083',
        stops: [
          {
            name: detail.site.name,
            address: detail.site.address,
            instructions: `Livraison matériaux — ${detail.request.reference}`,
            units: poLines.reduce((sum, l) => sum + (Number(l.quantity) || 0), 0) || 1,
            unitType: catalogUnitFromEb(poLines[0]?.unit),
            weightKg: '0',
            orderRef: targetPo?.reference ?? detail.request.reference,
            contactPhone: detail.site.managerId ?? undefined,
            supermarketId: detail.site.supermarketId ?? undefined,
            lat: detail.site.lat ?? '5.3600',
            lng: detail.site.lng ?? '-4.0083',
            requiredPhotos: isSupplierDelivery ? 2 : 1,
            products: poLines.map((l: { label: string; quantity: string | number; unit: string }) => ({
              label: l.label,
              qty: Number(l.quantity),
              unit: catalogUnitFromEb(l.unit),
            })),
          },
        ],
      })

      await markDeliveryScheduled(manager.companyId, requestId, tourId, targetPo?.id ?? body.purchaseOrderId)
      const updated = await getRequestDetail(manager.companyId, requestId)
      res.status(201).json({ tourId, requestId, ...updated })
    } catch (err) {
      if (handleWorkflowError(err, res)) return
      console.error('[procurement] schedule-delivery error', err)
      res.status(500).json({ message: 'Erreur planification livraison' })
    }
  },
)

procurementRouter.get('/documents/treasury/:id/html', async (req, res) => {
  const { manager } = req as unknown as ManagerRequest
  const row = await getTreasuryOrderById(manager.companyId, String(req.params.id))
  if (!row?.pdfHtml) {
    res.status(404).json({ message: 'Bon de trésorerie introuvable' })
    return
  }
  if (row.status === 'cancelled') { res.status(409).json({ message: 'BT archivé : consultez l’historique de l’EB.' }); return }
  res.type('html').send(applyCompanyDocumentIdentity(row.pdfHtml, row.companyId))
})

procurementRouter.get('/documents/:poId/html', async (req, res) => {
  const { manager } = req as unknown as ManagerRequest
  const po = await getPurchaseOrderById(manager.companyId, String(req.params.poId))
  if (!po) {
    res.status(404).json({ message: 'Document introuvable' })
    return
  }
  if (po.correctionPending) { res.status(409).json({ message: 'BC archivé après correction : consultez l’historique de l’EB.' }); return }
  if (po.pdfHtml) {
    res.type('html').send(applyCompanyDocumentIdentity(po.pdfHtml, po.companyId))
    return
  }
  res.json(wrapPoDocument(po))
})

// ─── F02 lot B — poste Trésorerie (circuit hors SA) ──────────────────────────

/**
 * File du poste Trésorerie : BT émis restant à débourser, avec leur EB.
 * Le CdG / DAF / PDG la consultent en lecture ; seul `treasury` agit.
 */
procurementRouter.get(
  '/treasury',
  requireProcurementRole('treasury', 'controle_gestion', 'daf', 'pdg'),
  async (req, res) => {
    const { manager } = req as unknown as ManagerRequest
    try {
      const rows = await listTreasuryOrdersToDisburse(manager.companyId)
      const items = []
      for (const row of rows) {
        const disbursement = await getDisbursementByTreasuryOrder(manager.companyId, row.treasury.id)
        items.push({
          treasuryId: row.treasury.id,
          purpose: row.treasury.purpose,
          purchaseOrderId: row.treasury.purchaseOrderId,
          reference: row.treasury.reference,
          amountFcfa: Number(row.treasury.amountFcfa ?? 0),
          status: row.treasury.status,
          lineId: row.treasury.purchaseRequestLineId,
          requestId: row.request.id,
          requestReference: row.request.reference,
          requestStatus: row.request.status,
          siteId: row.request.siteId,
          disbursement,
        })
      }
      res.json({ items })
    } catch (err) {
      console.error('[procurement] treasury list error', err)
      res.status(500).json({ message: 'Erreur chargement trésorerie' })
    }
  },
)

/**
 * Historique des paiements (déboursés) **par chantier** — onglet Trésorerie
 * (« Historique des paiements par chantier », à la manière du tableau de bord
 * Comptabilité). Lecture : le poste `treasury` + CdG/DAF/PDG, même visibilité
 * que la file.
 */
procurementRouter.get(
  '/treasury/history',
  requireProcurementRole('treasury', 'controle_gestion', 'daf', 'pdg'),
  async (req, res) => {
    const { manager } = req as unknown as ManagerRequest
    try {
      const rows = await listTreasuryPaymentHistory(manager.companyId)
      res.json({
        items: rows.map((r) => ({
          treasuryId: r.treasuryId,
          treasuryReference: r.treasuryReference,
          treasuryStatus: r.treasuryStatus,
          requestId: r.requestId,
          requestReference: r.requestReference,
          requestStatus: r.requestStatus,
          siteId: r.siteId,
          siteName: r.siteName,
          amountFcfa: Number(r.amountFcfa ?? 0),
          method: r.method,
          transactionReference: r.transactionReference,
          paidAt: r.paidAt,
          invoiceFileName: r.invoiceFileName,
          hasInvoice: Boolean(r.invoiceBlobKey),
          invoicePrintedAt: r.invoicePrintedAt,
        })),
      })
    } catch (err) {
      console.error('[procurement] treasury history error', err)
      res.status(500).json({ message: 'Erreur historique trésorerie' })
    }
  },
)

/**
 * Enregistre le déboursé d'un BT : montant, mode, n° de transaction et
 * **facture obligatoire** (invariant **I103**).
 *
 * L'EB passe en `deboursed`, puis `paid` quand **tous** ses BT sont déboursés.
 * Si l'enregistrement échoue, la pièce qui vient d'être stockée est supprimée
 * pour ne pas laisser de blob orphelin.
 */
procurementRouter.post(
  '/treasury/:treasuryId/disburse',
  requireProcurementRole('treasury'),
  async (req, res) => {
    const body = parseBody(disburseSchema, req.body, res)
    if (!body) return
    const { manager } = req as unknown as ManagerRequest
    const treasuryId = String(req.params.treasuryId)

    // I103 — la pièce justificative est exigée AVANT tout enregistrement.
    const file = parseJsonAttachment({
      data: body.data,
      fileName: body.fileName,
      contentType: body.contentType,
    })
    if ('error' in file) {
      res.status(400).json({ message: `${file.error} — facture ou reçu exigé au déboursé` })
      return
    }
    if (file.buffer.length === 0 || file.buffer.length > LINE_ATTACHMENT_MAX_BYTES) {
      res.status(400).json({ message: 'Fichier trop volumineux (max. 5 Mo)' })
      return
    }

    const proofType = resolveLineAttachmentMime(file.originalname, file.mimetype)
    if (!proofType) { res.status(400).json({ message: 'Justificatif PDF ou image attendu' }); return }
    const key = `treasury-disbursement/${treasuryId}/${randomUUID()}`
    try {
      await putLineAttachment(key, file.buffer, {
        contentType: proofType,
        fileName: file.originalname,
      })
    } catch (err) {
      console.error('[procurement] disbursement invoice store', err)
      res.status(503).json({ message: 'Stockage des pièces jointes indisponible' })
      return
    }

    const paidAt =
      body.paidAt && /^\d{4}-\d{2}-\d{2}/.test(body.paidAt) ? new Date(body.paidAt) : new Date()
    try {
      const result = await disburseTreasuryOrder({
        companyId: manager.companyId,
        treasuryOrderId: treasuryId,
        managerId: manager.sub,
        amountFcfa: body.amountFcfa,
        method: body.method,
        transactionReference: body.transactionReference ?? null,
        paidAt,
        invoice: { blobKey: key, fileName: file.originalname, contentType: proofType },
      })
      res.status(201).json(result)
    } catch (err) {
      await deleteLineAttachment(key).catch(() => undefined)
      if (handleWorkflowError(err, res)) return
      console.error('[procurement] disburse error', err)
      res.status(500).json({ message: 'Erreur enregistrement du déboursé' })
    }
  },
)

/**
 * Facture / reçu du déboursé — **consultable depuis l'EB** (décision CdG :
 * *« il faut juste rattacher la facture du paiement à l'EB »*).
 */
procurementRouter.get('/treasury/:treasuryId/invoice', async (req, res) => {
  const { manager } = req as unknown as ManagerRequest
  const treasuryId = String(req.params.treasuryId)
  const disbursement = await getDisbursementByTreasuryOrder(manager.companyId, treasuryId)
  const blobKey = disbursement?.invoiceBlobKey?.trim() || null
  if (!disbursement || !blobKey) {
    res.status(404).json({ message: 'Facture introuvable' })
    return
  }
  let stored: { data: Buffer } | null
  try {
    stored = await getLineAttachment(blobKey)
  } catch (err) {
    console.error('[procurement] disbursement invoice read', err)
    res.status(503).json({ message: 'Stockage des pièces jointes indisponible' })
    return
  }
  if (!stored?.data?.length) {
    res.status(404).json({ message: 'Fichier introuvable' })
    return
  }
  res.setHeader('Content-Type', disbursement.invoiceContentType || 'application/octet-stream')
  if (disbursement.invoiceFileName) {
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${disbursement.invoiceFileName.replace(/"/g, '')}"`,
    )
  }
  res.send(stored.data)
})

/** Remplace la facture d'un déboursé (mauvaise pièce jointe). */
procurementRouter.post(
  '/treasury/:treasuryId/invoice',
  requireProcurementRole('treasury'),
  async (req, res) => {
    const { manager } = req as unknown as ManagerRequest
    const treasuryId = String(req.params.treasuryId)
    const existing = await getDisbursementByTreasuryOrder(manager.companyId, treasuryId)
    if (!existing) {
      res.status(404).json({ message: 'Déboursé introuvable' })
      return
    }
    const file = parseJsonAttachment(req.body)
    if ('error' in file) {
      res.status(400).json({ message: file.error })
      return
    }
    if (file.buffer.length === 0 || file.buffer.length > LINE_ATTACHMENT_MAX_BYTES) {
      res.status(400).json({ message: 'Fichier trop volumineux (max. 5 Mo)' })
      return
    }
    const previousKey = existing.invoiceBlobKey?.trim() || ''
    const key = `treasury-disbursement/${treasuryId}/${randomUUID()}`
    try {
      await putLineAttachment(key, file.buffer, {
        contentType: file.mimetype,
        fileName: file.originalname,
      })
    } catch (err) {
      console.error('[procurement] disbursement invoice store', err)
      res.status(503).json({ message: 'Stockage des pièces jointes indisponible' })
      return
    }
    const row = await setDisbursementInvoice(manager.companyId, treasuryId, {
      blobKey: key,
      fileName: file.originalname,
      contentType: file.mimetype,
    })
    if (!row) {
      await deleteLineAttachment(key).catch(() => undefined)
      res.status(404).json({ message: 'Déboursé introuvable' })
      return
    }
    if (previousKey && previousKey !== key) {
      await deleteLineAttachment(previousKey).catch(() => undefined)
    }
    res.json(row)
  },
)

/** Trace l'impression physique de la facture (Q56 — un seul justificatif). */
procurementRouter.post(
  '/treasury/:treasuryId/invoice-printed',
  requireProcurementRole('treasury'),
  async (req, res) => {
    const { manager } = req as unknown as ManagerRequest
    const row = await markDisbursementInvoicePrinted(
      manager.companyId,
      String(req.params.treasuryId),
      new Date(),
    )
    if (!row) {
      res.status(404).json({ message: 'Déboursé introuvable' })
      return
    }
    res.json(row)
  },
)

/**
 * Déboursés d'une EB — chaîne `EB → BT → déboursé → facture`.
 * Permet au CdG de vérifier le paiement et la pièce depuis l'EB elle-même.
 */
procurementRouter.get('/requests/:id/disbursements', async (req, res) => {
  const { manager } = req as unknown as ManagerRequest
  try {
    const rows = await listDisbursementsForRequest(manager.companyId, String(req.params.id))
    res.json({
      items: rows.map((r) => ({
        treasuryId: r.treasury.id,
        treasuryReference: r.treasury.reference,
        amountFcfa: Number(r.disbursement.amountFcfa ?? 0),
        method: r.disbursement.method,
        transactionReference: r.disbursement.transactionReference,
        paidAt: r.disbursement.paidAt,
        invoiceFileName: r.disbursement.invoiceFileName,
        invoicePrintedAt: r.disbursement.invoicePrintedAt,
        hasInvoice: Boolean(r.disbursement.invoiceBlobKey),
      })),
    })
  } catch (err) {
    console.error('[procurement] disbursements list error', err)
    res.status(500).json({ message: 'Erreur chargement des déboursés' })
  }
})

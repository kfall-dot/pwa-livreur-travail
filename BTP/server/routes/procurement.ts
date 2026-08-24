import { Router } from 'express'
import { randomUUID } from 'crypto'
import { z } from 'zod'
import { getProcurementConfig } from '../config/procurement.js'
import {
  createPurchaseRequestFromDraft,
  createSite,
  createSupplier,
  getDraftDetail,
  getDraftById,
  getPurchaseOrderById,
  getPurchaseRequestById,
  getPurchaseRequestLines,
  getRequestDetail,
  linkDraftToRequest,
  listDrafts,
  listPurchaseRequests,
  listSites,
  listSuppliers,
  mergeDraftParseHints,
  recordApprovalStep,
  setRequestLineAttachment,
  updateDraft,
  updatePurchaseRequestStatus,
  updateRequestLinePrices,
} from '../db/procurementQueries.js'
import type { ParsedEbLine, ProcurementRole, PurchaseRequestStatus } from '../db/schema.js'
import { createTourWithStops, getManagerById } from '../db/queries.js'
import { linesForSupplier } from '../lib/procurementLines.js'
import { saFinanceIncompleteMessage } from '../../shared/saFinanceGate.js'
import { parseBody } from '../lib/validation.js'
import { getLineAttachment, putLineAttachment, deleteLineAttachment } from '../lib/lineAttachmentStore.js'
import { LINE_ATTACHMENT_MAX_BYTES, resolveLineAttachmentMime } from '../lib/uploadMime.js'
import { requireManager, type ManagerRequest } from '../middleware/managerAuth.js'
import {
  requireProcurementRole,
  loadProcurementRole,
  type ProcurementManagerRequest,
} from '../middleware/procurementAuth.js'
import { localTodayIso } from '../utils/dates.js'
import {
  approvePurchaseRequest,
  createPurchaseOrderForRequest,
  markDeliveryScheduled,
  ProcurementWorkflowError,
  rejectPurchaseRequest,
} from '../services/procurementWorkflow.js'
import { wrapPoDocument } from '../services/pdfDocuments.js'
import { createBlankEbDraft, createDraftFromPastedText } from '../services/ebPaste.js'
import { EB_FICHE_SERVICE, ficheLinesFromParsed, generateEbFicheHtml, signoffFromApprovalSteps } from '../services/ebFiche.js'
import { buildEbObjet } from '../services/ebParser.js'
import { needsPdgApproval, sumLineAmountsFcfa } from '../services/ebPricing.js'
import { notifyRequestStatusChange } from '../services/procurementNotifications.js'
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

function parseJsonAttachment(body: unknown): { buffer: Buffer; originalname: string; mimetype: string } | { error: string } {
  if (!body || typeof body !== 'object' || Buffer.isBuffer(body)) {
    return { error: 'Fichier requis (PDF, image ou Excel)' }
  }
  const rec = body as { data?: unknown; fileName?: unknown; contentType?: unknown }
  if (typeof rec.data !== 'string' || !rec.data.trim()) {
    return { error: 'Fichier requis (PDF, image ou Excel)' }
  }
  const originalname = String(rec.fileName ?? 'piece-jointe').trim() || 'piece-jointe'
  const mimetype = resolveLineAttachmentMime(originalname, String(rec.contentType ?? ''))
  if (!mimetype) {
    return { error: 'Type de fichier non accepté (PDF, image ou Excel)' }
  }
  return { buffer: Buffer.from(rec.data, 'base64'), originalname, mimetype }
}

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

const parsedLineSchema = z.object({
  label: z.string().min(1),
  quantity: z.number().positive(),
  unit: z.string().min(1),
  observation: z.string().optional(),
  supplierName: z.string().optional(),
  paymentMode: z.string().optional(),
})

const draftPatchSchema = z.object({
  parsedLines: z.array(parsedLineSchema).optional(),
  parsedUrgency: z.string().nullable().optional(),
  needsReview: z.boolean().optional(),
  siteId: z.string().optional(),
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
})

const createPoSchema = z.object({
  supplierId: z.string().optional(),
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

const scheduleSchema = z.object({
  driverId: z.string().min(1),
  date: z.string().optional(),
})

function handleWorkflowError(err: unknown, res: import('express').Response): boolean {
  if (err instanceof ProcurementWorkflowError) {
    res.status(err.statusCode).json({ message: err.message })
    return true
  }
  return false
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

// ─── Sites ───────────────────────────────────────────────────────────────────

procurementRouter.get('/sites', async (req, res) => {
  const { manager } = req as unknown as ManagerRequest
  const rows = await listSites(manager.companyId)
  res.json({ sites: rows })
})

procurementRouter.post('/sites', requireProcurementRole('technical_director', 'daf'), async (req, res) => {
  const body = parseBody(siteSchema, req.body, res)
  if (!body) return
  const { manager } = req as unknown as ManagerRequest
  const site = await createSite({ companyId: manager.companyId, ...body })
  res.status(201).json({ site })
})

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
  requireProcurementRole('technical_director'),
  async (req, res) => {
    const body = parseBody(pasteDraftSchema, req.body, res)
    if (!body) return
    const { manager } = req as unknown as ManagerRequest
    try {
      const result = await createDraftFromPastedText({
        companyId: manager.companyId,
        bodyText: body.bodyText,
        siteId: body.siteId,
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
  requireProcurementRole('technical_director'),
  async (req, res) => {
    const { manager } = req as unknown as ManagerRequest
    const siteId = typeof req.body?.siteId === 'string' ? req.body.siteId : undefined
    try {
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
  if (procurementRole && procurementRole !== 'technical_director') {
    res.json({ drafts: [], count: 0 })
    return
  }
  let drafts = await listDrafts(manager.companyId)
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
    res.json({ count: drafts.length })
    return
  }
  const requests = await listPurchaseRequests(manager.companyId)
  if (procurementRole === 'purchasing') {
    res.json({ count: requests.filter((r) => r.status === 'submitted').length })
    return
  }
  if (procurementRole === 'daf') {
    res.json({
      count: requests.filter(
        (r) => r.status === 'submitted' || r.status === 'daf_review' || r.status === 'daf_bt_review',
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
  if (procurementRole && procurementRole !== 'technical_director') {
    res.status(403).json({ message: 'Les brouillons non soumis sont réservés au Directeur technique' })
    return
  }
  const detail = await getDraftDetail(manager.companyId, String(req.params.id))
  if (!detail) {
    res.status(404).json({ message: 'Brouillon introuvable' })
    return
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
  requireProcurementRole('technical_director'),
  async (req, res) => {
    const body = parseBody(draftPatchSchema, req.body, res)
    if (!body) return
    const { manager, procurementRole } = req as unknown as ProcurementManagerRequest
    const draftId = String(req.params.id)
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

procurementRouter.post(
  '/drafts/:id/submit',
  requireProcurementRole('technical_director'),
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
    if (!draft.siteId) {
      res.status(400).json({ message: 'Chantier requis sur le brouillon' })
      return
    }
    const lines = (draft.parsedLines as ParsedEbLine[] | null) ?? []
    if (lines.length === 0) {
      res.status(400).json({ message: 'Aucune ligne à soumettre' })
      return
    }

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

    const request = await createPurchaseRequestFromDraft({
      companyId: manager.companyId,
      siteId: draft.siteId,
      draftId,
      lines,
      urgency: draft.parsedUrgency,
      requestedByName: requesterName || null,
      supplierId: body.supplierId ?? null,
      totalAmountFcfa: body.totalAmountFcfa ?? null,
      notes: body.notes ?? null,
      createdByManagerId: manager.sub,
    })
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
    const notifiedRoles: ProcurementRole[] = ['purchasing', 'daf']
    await notifyRequestStatusChange(manager.companyId, request.reference, 'submitted', notifiedRoles)
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
  if (!role || role === 'technical_director' || role === 'purchasing' || role === 'daf') return true
  if (role === 'pdg') {
    if (status === 'submitted') return false
    if (status === 'daf_review') return Number(totalAmountFcfa ?? 0) >= thresholdFcfa
    return true
  }
  return true
}

procurementRouter.get('/requests', async (req, res) => {
  const { manager, procurementRole } = req as unknown as ProcurementManagerRequest
  const threshold = getProcurementConfig(manager.companyId).btThresholdFcfa
  const requests = (await listPurchaseRequests(manager.companyId)).filter((r) =>
    requestVisibleToRole(procurementRole, r.status, r.totalAmountFcfa != null ? Number(r.totalAmountFcfa) : null, threshold),
  )
  res.json({ requests })
})

procurementRouter.get('/requests/:id', async (req, res) => {
  const { manager } = req as unknown as ManagerRequest
  const detail = await getRequestDetail(manager.companyId, String(req.params.id))
  if (!detail) {
    res.status(404).json({ message: 'Demande introuvable' })
    return
  }
  res.json(detail)
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
      res.status(400).json({ message: 'Les lignes ne peuvent être modifiées qu’avant envoi au DAF' })
      return
    }
    const detail = await updateRequestLinePrices(manager.companyId, requestId, body.lines)
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
    if (request.status !== 'submitted') {
      res.status(400).json({ message: 'Cette EB a déjà été envoyée au circuit finance' })
      return
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
    const needsPdg = needsPdgApproval(totalAmountFcfa, threshold)
    const notifiedRoles: ProcurementRole[] = needsPdg ? ['daf', 'pdg'] : ['daf']
    const saName = await currentManagerName(manager.sub, manager.email)
    await recordApprovalStep({
      purchaseRequestId: requestId,
      role: 'purchasing',
      managerId: manager.sub,
      decision: 'approved',
      comment: `${saName}\nChiffrage SA`,
      etape: 'traitement_sa',
    })
    const updated = await updatePurchaseRequestStatus(manager.companyId, requestId, 'daf_review', {
      totalAmountFcfa,
    })
    await notifyRequestStatusChange(manager.companyId, request.reference, 'daf_review', notifiedRoles)
    res.json({
      request: updated,
      finance: { totalAmountFcfa, needsPdg, notifiedRoles, thresholdFcfa: threshold },
    })
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
      res.status(400).json({ message: 'Pièce jointe possible uniquement avant envoi au DAF' })
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
      res.status(400).json({ message: 'Pièce jointe modifiable uniquement avant envoi au DAF' })
      return
    }
    const lines = await getPurchaseRequestLines(requestId)
    const line = lines.find((l) => l.id === lineId)
    if (!line) {
      res.status(404).json({ message: 'Ligne introuvable' })
      return
    }
    if (line.attachmentBlobKey) {
      await deleteLineAttachment(line.attachmentBlobKey)
    }
    const detail = await setRequestLineAttachment(manager.companyId, requestId, lineId, null)
    if (!detail) {
      res.status(404).json({ message: 'Ligne introuvable' })
      return
    }
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
  const html = generateEbFicheHtml({
    reference: detail.request.reference,
    siteName: detail.site?.name ?? '',
    service: EB_FICHE_SERVICE,
    objet: buildEbObjet(lines, detail.site?.name),
    requesterName: detail.request.requestedByName ?? '',
    treatmentDate: new Date(detail.request.createdAt).toLocaleDateString('fr-FR'),
    urgency: detail.request.urgency,
    lines: ficheLinesFromParsed(lines),
    ...signoffFromApprovalSteps(detail.approvalSteps),
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
    const updated = await approvePurchaseRequest({
      companyId: manager.companyId,
      requestId: String(req.params.id),
      managerId: manager.sub,
      procurementRole,
      comment: body.comment,
    })
    res.json({ request: updated })
  } catch (err) {
    if (handleWorkflowError(err, res)) return
    console.error('[procurement] approve error', err)
    res.status(500).json({ message: 'Erreur approbation' })
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
    const updated = await rejectPurchaseRequest({
      companyId: manager.companyId,
      requestId: String(req.params.id),
      managerId: manager.sub,
      procurementRole,
      comment: body.comment,
    })
    res.json({ request: updated })
  } catch (err) {
    if (handleWorkflowError(err, res)) return
    console.error('[procurement] reject error', err)
    res.status(500).json({ message: 'Erreur rejet' })
  }
})

procurementRouter.post(
  '/requests/:id/create-po',
  requireProcurementRole('purchasing'),
  async (req, res) => {
    const body = parseBody(createPoSchema, req.body, res)
    if (!body) return
    const { manager } = req as unknown as ManagerRequest
    try {
      const po = await createPurchaseOrderForRequest({
        companyId: manager.companyId,
        requestId: String(req.params.id),
        managerId: manager.sub,
        supplierId: body.supplierId,
      })
      const detail = await getRequestDetail(manager.companyId, String(req.params.id))
      res.status(201).json({ purchaseOrder: po, ...detail })
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
      if (!detail?.site || !detail.supplier) {
        res.status(400).json({ message: 'Chantier et fournisseur requis' })
        return
      }

      const poLines = detail.supplier
        ? linesForSupplier(detail.lines, detail.supplier.name)
        : detail.lines
      const date = body.date ?? localTodayIso()
      const { tourId } = await createTourWithStops({
        companyId: manager.companyId,
        driverId: body.driverId,
        date,
        depotName: detail.supplier.name,
        depotAddress: detail.supplier.address ?? '—',
        depotLat: '5.3600',
        depotLng: '-4.0083',
        stops: [
          {
            name: detail.site.name,
            address: detail.site.address,
            instructions: `Livraison matériaux — ${detail.request.reference}`,
            units: poLines.length,
            unitType: 'colis',
            weightKg: '0',
            orderRef: detail.request.reference,
            contactPhone: detail.site.managerId ?? undefined,
            lat: detail.site.lat ?? '5.3600',
            lng: detail.site.lng ?? '-4.0083',
            requiredPhotos: 1,
            products: poLines.map((l: { label: string; quantity: string | number; unit: string }) => ({
              label: l.label,
              qty: Number(l.quantity),
              unit: l.unit,
            })),
          },
        ],
      })

      await markDeliveryScheduled(manager.companyId, requestId, tourId)
      const updated = await getRequestDetail(manager.companyId, requestId)
      res.status(201).json({ tourId, requestId, ...updated })
    } catch (err) {
      if (handleWorkflowError(err, res)) return
      console.error('[procurement] schedule-delivery error', err)
      res.status(500).json({ message: 'Erreur planification livraison' })
    }
  },
)

procurementRouter.get('/documents/:poId/html', async (req, res) => {
  const { manager } = req as unknown as ManagerRequest
  const po = await getPurchaseOrderById(manager.companyId, String(req.params.poId))
  if (!po) {
    res.status(404).json({ message: 'Document introuvable' })
    return
  }
  if (po.pdfHtml) {
    res.type('html').send(po.pdfHtml)
    return
  }
  res.json(wrapPoDocument(po))
})

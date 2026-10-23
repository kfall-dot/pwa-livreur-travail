import { and, eq, inArray, isNull, ne } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { db } from '../db/index.js'
import { managers, sites, suppliers, purchaseRequests, purchaseRequestDrafts, purchaseRequestLines, purchaseRequestVersions, purchaseOrders, treasuryOrders, treasuryDisbursements, approvalSteps, procurementCorrections, type ProcurementRole, type PurchaseRequestStatus } from '../db/schema.js'
import { canRequestCorrection, canDefinitivelyRefuse, correctionResumeStatus, type CorrectionKind } from '../../shared/procurementCorrectionPolicy.js'
import { hasMixedFamilies, isHorsSaFlow } from '../../shared/chargeFlow.js'
import { saFinanceIncompleteMessage } from '../../shared/saFinanceGate.js'
import { lineAmountFcfa } from './ebPricing.js'
import { buildBcDataFromRequest, generateBcHtml } from './pdfDocuments.js'
import { getActiveDocumentTemplate, getCompanyName } from '../db/procurementQueries.js'

export class CorrectionError extends Error {
  constructor(message: string, public statusCode = 400) { super(message) }
}
type Actor = { id: string; companyId: string; procurementRole: ProcurementRole | null; saSupervisorId: string | null }
export type CorrectedLine = { id: string; label: string; quantity: number; unit: string; unitPriceFcfa: number; supplierName?: string | null; paymentMode?: string | null; spendCategory: string; observation?: string | null; attachmentBlobKey?: string | null; attachmentFileName?: string | null; attachmentContentType?: string | null }

async function source(companyId: string, requestId: string) {
  const [request] = await db.select().from(purchaseRequests).where(and(eq(purchaseRequests.id, requestId), eq(purchaseRequests.companyId, companyId)))
  if (!request) throw new CorrectionError('Demande introuvable', 404)
  const [lines, steps, people, orders, treasuries, siteRows] = await Promise.all([
    db.select().from(purchaseRequestLines).where(eq(purchaseRequestLines.purchaseRequestId, requestId)),
    db.select().from(approvalSteps).where(eq(approvalSteps.purchaseRequestId, requestId)).orderBy(approvalSteps.createdAt),
    db.select().from(managers).where(eq(managers.companyId, companyId)),
    db.select().from(purchaseOrders).where(eq(purchaseOrders.purchaseRequestId, requestId)),
    db.select().from(treasuryOrders).where(eq(treasuryOrders.purchaseRequestId, requestId)),
    db.select().from(sites).where(eq(sites.id, request.siteId)),
  ])
  let creatorId = request.createdByManagerId
  if (request.sourceDraftId) {
    const [draft] = await db.select().from(purchaseRequestDrafts).where(eq(purchaseRequestDrafts.id, request.sourceDraftId))
    creatorId = draft?.createdByManagerId ?? creatorId
  }
  return { request, lines, steps, people, orders, treasuries, site: siteRows[0], creatorId }
}

function targets(data: Awaited<ReturnType<typeof source>>, actor: Actor, kind: CorrectionKind) {
  const creator = data.people.find(m => m.id === data.creatorId)
  const headReturn = data.request.correctionReviewRequired || ['sa_head_review', 'bc_head_review'].includes(data.request.status)
  let candidates = data.people
  let recommended: string | null = null
  if (headReturn) {
    candidates = candidates.filter(m => m.procurementRole === 'purchasing' && m.saSupervisorId === actor.id)
    const step = [...data.steps].reverse().find(s => ['preparation_bc_sa', 'preparation_chiffrage_sa'].includes(s.etape ?? ''))
    recommended = step?.managerId ?? null
  } else if (data.request.status === 'dt_review') {
    candidates = candidates.filter(m => m.id === data.creatorId)
  } else if (kind === 'need' || isHorsSaFlow(data.lines)) {
    if (creator?.procurementRole === 'purchasing' && !isHorsSaFlow(data.lines)) candidates = candidates.filter(m => m.id === creator.id)
    else {
      const dtId = [...data.steps].reverse().find(s => s.role === 'technical_director' && s.decision === 'approved')?.managerId
        ?? (creator?.procurementRole === 'technical_director' ? creator.id : data.site?.supervisorManagerId)
      candidates = candidates.filter(m => m.procurementRole === 'technical_director' && (!dtId || m.id === dtId))
    }
  } else {
    candidates = candidates.filter(m => m.procurementRole === 'purchasing')
    recommended = [...data.steps].reverse().find(s => s.role === 'purchasing' && ['traitement_sa', 'preparation_chiffrage_sa'].includes(s.etape ?? ''))?.managerId
      ?? (creator?.procurementRole === 'purchasing' ? creator.id : null)
  }
  if (candidates.length === 1) recommended = candidates[0].id
  return { candidates, recommended: candidates.some(m => m.id === recommended) ? recommended : null }
}

function allowedKinds(data: Awaited<ReturnType<typeof source>>, actor: Actor): CorrectionKind[] {
  const delivered = data.orders.some(po => po.tourId) || ['delivered', 'delivery_scheduled'].includes(data.request.status)
  if (delivered) return ['documents'] // Aucun changement rétroactif du stock/livraison.
  if (actor.procurementRole === 'technical_director') return ['need', 'documents']
  if (data.request.status === 'bc_head_review') return ['bc', 'commercial', 'documents']
  if (data.request.status === 'sa_head_review') return ['commercial', 'documents']
  return ['need', 'commercial', 'documents']
}

export async function correctionContext(companyId: string, requestId: string, actor: Actor) {
  const data = await source(companyId, requestId)
  const history = await db.select().from(procurementCorrections).where(and(eq(procurementCorrections.companyId, companyId), eq(procurementCorrections.requestId, requestId))).orderBy(procurementCorrections.createdAt)
  const current = history.find(c => c.state === 'open' || c.state === 'head_review')
  const payable = actor.procurementRole !== 'treasury' || (await db.select().from(treasuryOrders).where(and(eq(treasuryOrders.companyId, companyId), eq(treasuryOrders.purchaseRequestId, requestId), inArray(treasuryOrders.status, ['issued', 'pending'])))).length > 0
  const headReturn = current?.state === 'head_review' && data.request.correctionTargetId === actor.id && actor.procurementRole === 'purchasing' && !actor.saSupervisorId
  const canAsk = headReturn || (!data.request.correctionTargetId && payable && canRequestCorrection(data.request.status, actor.procurementRole, !actor.saSupervisorId && data.request.saReviewerId === actor.id))
  return {
    requiresPin: ['technical_director', 'controle_gestion', 'daf', 'pdg'].includes(actor.procurementRole ?? '') || actor.procurementRole === 'purchasing' && !actor.saSupervisorId,
    canAsk, canEdit: current?.state === 'open' && data.request.correctionTargetId === actor.id,
    canApprove: current?.state === 'head_review' && data.request.correctionTargetId === actor.id && actor.procurementRole === 'purchasing' && !actor.saSupervisorId,
    kinds: canAsk ? allowedKinds(data, actor).map(kind => { const result = targets(data, actor, kind); return { kind, recommendedId: result.recommended, targets: result.candidates.map(m => ({ id: m.id, name: m.name, role: m.procurementRole })) } }) : [],
    history: history.map(({ snapshot, uploadedKeys: _keys, ...c }) => ({ ...c,
      requestedByName: data.people.find(m => m.id === c.requestedById)?.name,
      targetName: data.people.find(m => m.id === c.targetManagerId)?.name,
      documents: [...((snapshot as { orders?: Array<{ id: string; reference: string }> }).orders ?? []), ...((snapshot as { treasuries?: Array<{ id: string; reference: string }> }).treasuries ?? [])].map(d => ({ id: d.id, reference: d.reference })),
    })),
  }
}

export async function requestCorrection(input: { companyId: string; requestId: string; actor: Actor; kind: CorrectionKind; reason: string; targetManagerId: string; pinVerified: boolean; ip: string }) {
  if (!input.reason.trim()) throw new CorrectionError('Motif de correction obligatoire')
  const data = await source(input.companyId, input.requestId)
  const headReturn = data.request.correctionReviewRequired && data.request.correctionTargetId === input.actor.id && input.actor.procurementRole === 'purchasing' && !input.actor.saSupervisorId
  if (!headReturn && !canRequestCorrection(data.request.status, input.actor.procurementRole, !input.actor.saSupervisorId && data.request.saReviewerId === input.actor.id)) throw new CorrectionError('Ce rôle ne peut pas demander de correction à cette étape', 403)
  if (input.actor.procurementRole !== 'treasury' && !input.pinVerified) throw new CorrectionError('NIP de signature requis', 401)
  if (input.actor.procurementRole === 'treasury' && !data.treasuries.some(t => ['issued', 'pending'].includes(t.status))) throw new CorrectionError('Aucun paiement en attente pour cette demande', 409)
  if (!allowedKinds(data, input.actor).includes(input.kind)) throw new CorrectionError('Une demande déjà planifiée ou livrée ne peut recevoir qu’un complément documentaire', 409)
  if (!targets(data, input.actor, input.kind).candidates.some(m => m.id === input.targetManagerId)) throw new CorrectionError('Destinataire non autorisé pour cette correction', 403)
  return db.transaction(async tx => {
    const [locked] = await tx.select().from(purchaseRequests).where(eq(purchaseRequests.id, input.requestId)).for('update')
    if ((locked.correctionTargetId && !headReturn) || locked.correctionTargetId !== data.request.correctionTargetId || locked.status !== data.request.status || locked.version !== data.request.version) throw new CorrectionError('La demande a changé : rechargez la fiche', 409)
    let fromStatus = locked.status
    if (headReturn) {
      const [previous] = await tx.select().from(procurementCorrections).where(and(eq(procurementCorrections.requestId, input.requestId), eq(procurementCorrections.state, 'head_review'))).for('update')
      if (!previous) throw new CorrectionError('La correction a déjà été traitée', 409)
      fromStatus = previous.resumeStatus as PurchaseRequestStatus
      await tx.update(procurementCorrections).set({ state: 'closed' }).where(eq(procurementCorrections.id, previous.id))
    }
    const disbursed = await tx.select({ id: treasuryDisbursements.id }).from(treasuryDisbursements).innerJoin(treasuryOrders, eq(treasuryOrders.id, treasuryDisbursements.treasuryOrderId)).where(eq(treasuryOrders.purchaseRequestId, input.requestId))
    if (disbursed.length || data.orders.some(po => po.saInvoicePaid)) throw new CorrectionError('Un paiement existe déjà : utilisez une régularisation, pas un retour de validation', 409)
    const [correction] = await tx.insert(procurementCorrections).values({ id: `corr-${randomUUID()}`, companyId: input.companyId, requestId: input.requestId,
      requestedById: input.actor.id, targetManagerId: input.targetManagerId, targetRole: data.people.find(m => m.id === input.targetManagerId)!.procurementRole!, kind: input.kind, reason: input.reason.trim(),
      fromStatus, sourceVersion: locked.version, snapshot: { request: data.request, lines: data.lines, steps: data.steps, orders: data.orders, treasuries: data.treasuries } }).returning()
    await tx.insert(approvalSteps).values({ id: `ap-${randomUUID()}`, purchaseRequestId: input.requestId, role: input.actor.procurementRole!, managerId: input.actor.id,
      decision: 'revised', etape: 'correction_requested', comment: input.reason.trim(), pinVerified: input.pinVerified, ip: input.ip })
    await tx.update(purchaseRequests).set({ correctionTargetId: input.targetManagerId, correctionReviewRequired: false, updatedAt: new Date() }).where(eq(purchaseRequests.id, input.requestId))
    return correction
  })
}

export async function registerCorrectionUpload(companyId: string, requestId: string, managerId: string, lineId: string, key: string) {
  return db.transaction(async tx => {
    const [request] = await tx.select().from(purchaseRequests).where(and(eq(purchaseRequests.id, requestId), eq(purchaseRequests.companyId, companyId))).for('update')
    if (!request || !request.correctionTargetId || request.correctionTargetId !== managerId) throw new CorrectionError('Correction réservée au destinataire désigné', 403)
    const [line] = await tx.select().from(purchaseRequestLines).where(and(eq(purchaseRequestLines.id, lineId), eq(purchaseRequestLines.purchaseRequestId, requestId)))
    if (!line) throw new CorrectionError('Ligne introuvable', 404)
    const [c] = await tx.select().from(procurementCorrections).where(and(eq(procurementCorrections.requestId, requestId), eq(procurementCorrections.state, 'open'))).for('update')
    if (!c) throw new CorrectionError('Aucune correction en cours', 409)
    await tx.update(procurementCorrections).set({ uploadedKeys: [...c.uploadedKeys, key] }).where(eq(procurementCorrections.id, c.id))
  })
}

export async function resubmitCorrection(input: { companyId: string; requestId: string; actor: Actor; lines: CorrectedLine[]; comment: string; pinVerified: boolean; ip: string }) {
  if (!input.comment.trim()) throw new CorrectionError('Décrivez les corrections effectuées')
  if ((input.actor.procurementRole === 'technical_director' || input.actor.procurementRole === 'purchasing' && !input.actor.saSupervisorId) && !input.pinVerified) throw new CorrectionError('NIP de signature requis', 401)
  return db.transaction(async tx => {
    const [request] = await tx.select().from(purchaseRequests).where(and(eq(purchaseRequests.id, input.requestId), eq(purchaseRequests.companyId, input.companyId))).for('update')
    if (!request || !request.correctionTargetId || request.correctionTargetId !== input.actor.id) throw new CorrectionError('Correction réservée au destinataire désigné', 403)
    const [c] = await tx.select().from(procurementCorrections).where(and(eq(procurementCorrections.requestId, request.id), eq(procurementCorrections.state, 'open'))).for('update')
    if (!c) throw new CorrectionError('Aucune correction à soumettre', 409)
    if (c.targetRole !== input.actor.procurementRole) throw new CorrectionError('Le profil du destinataire a changé : vérifiez son affectation', 403)
    const original = await tx.select().from(purchaseRequestLines).where(eq(purchaseRequestLines.purchaseRequestId, request.id))
    if (original.length !== input.lines.length || new Set(input.lines.map(l => l.id)).size !== original.length || input.lines.some(l => !original.some(o => o.id === l.id))) throw new CorrectionError('Les lignes doivent correspondre à celles de l’EB')
    const allowedKeys = new Set([...original.map(l => l.attachmentBlobKey).filter(Boolean), ...c.uploadedKeys])
    const corrected = input.lines.map(line => {
      const old = original.find(l => l.id === line.id)!
      if (!line.label.trim() || line.quantity <= 0 || line.unitPriceFcfa < 0 || !line.unit.trim()) throw new CorrectionError('Désignation, unité, quantité et prix positifs requis sur chaque ligne')
      if (line.attachmentBlobKey && !allowedKeys.has(line.attachmentBlobKey)) throw new CorrectionError('Pièce jointe non autorisée', 403)
      if ((line.supplierName ?? '') !== (old.supplierName ?? '') && line.attachmentBlobKey && line.attachmentBlobKey === old.attachmentBlobKey) throw new CorrectionError('Joignez une nouvelle pièce justificative après un changement de fournisseur')
      if (c.kind !== 'need' && (line.label !== old.label || line.quantity !== Number(old.quantity) || line.unit !== old.unit || line.spendCategory !== old.spendCategory)) throw new CorrectionError('Ce retour ne permet pas de modifier le besoin ou les quantités')
      if (c.kind === 'documents' && (line.unitPriceFcfa !== Number(old.unitPriceFcfa) || (line.supplierName ?? '') !== (old.supplierName ?? '') || (line.paymentMode ?? '') !== (old.paymentMode ?? ''))) throw new CorrectionError('Un retour documentaire ne permet pas de modifier les montants, fournisseurs ou paiements')
      if (input.actor.procurementRole === 'site_manager' && (line.unitPriceFcfa !== Number(old.unitPriceFcfa) || (line.supplierName ?? '') !== (old.supplierName ?? '') || (line.paymentMode ?? '') !== (old.paymentMode ?? ''))) throw new CorrectionError('Le chef de chantier corrige le besoin ; le chiffrage reste réservé aux responsables métier', 403)
      if (c.kind !== 'bc' && (line.observation ?? '') !== (old.observation ?? '')) throw new CorrectionError('Les observations du BC se corrigent dans un retour de préparation du BC')
      return { ...line, label: line.label.trim(), amountFcfa: lineAmountFcfa(line.unitPriceFcfa, line.quantity), paymentMode: isHorsSaFlow([line]) ? 'COMPTANT' : line.paymentMode }
    })
    if (hasMixedFamilies(corrected)) throw new CorrectionError('Matériaux et main d’œuvre doivent rester sur des EB distinctes')
    const horsSa = isHorsSaFlow(corrected)
    if (!horsSa && input.actor.procurementRole === 'purchasing') {
      const incomplete = saFinanceIncompleteMessage(corrected)
      if (incomplete) throw new CorrectionError(incomplete)
    }
    const economic = (lines: Array<{ id: string; label: string; quantity: string | number; unit: string; unitPriceFcfa?: string | number | null; supplierName?: string | null; paymentMode?: string | null; spendCategory: string }>) => JSON.stringify(lines.map(l => [l.id, l.label, Number(l.quantity), l.unit, Number(l.unitPriceFcfa), l.supplierName ?? '', l.paymentMode ?? '', l.spendCategory]).sort((a, b) => String(a).localeCompare(String(b))))
    const changed = economic(original) !== economic(corrected)
    const orders = await tx.select().from(purchaseOrders).where(eq(purchaseOrders.purchaseRequestId, request.id))
    if (changed && (orders.some(po => po.tourId) || ['delivered', 'delivery_scheduled'].includes(request.status))) throw new CorrectionError('Le besoin livré ou planifié ne peut plus être modifié', 409)
    await tx.insert(purchaseRequestVersions).values({ id: `prv-${randomUUID()}`, purchaseRequestId: request.id, version: request.version, lines: original, comment: c.reason, createdByManagerId: input.actor.id })
    for (const line of corrected) await tx.update(purchaseRequestLines).set({
      label: line.label, quantity: String(line.quantity), unit: line.unit, unitPriceFcfa: String(line.unitPriceFcfa), amountFcfa: String(line.amountFcfa),
      supplierName: line.supplierName, paymentMode: line.paymentMode, spendCategory: line.spendCategory, observation: line.observation,
      attachmentBlobKey: line.attachmentBlobKey ?? null, attachmentFileName: line.attachmentFileName ?? null, attachmentContentType: line.attachmentContentType ?? null,
    }).where(eq(purchaseRequestLines.id, line.id))
    const nextStatus = correctionResumeStatus({ kind: c.kind as CorrectionKind, changed, fromStatus: c.fromStatus, targetRole: input.actor.procurementRole!, horsSa, isSaResource: Boolean(input.actor.saSupervisorId) }) as PurchaseRequestStatus
    if (changed) {
      const needChanged = corrected.some(l => { const old = original.find(o => o.id === l.id)!; return l.label !== old.label || l.quantity !== Number(old.quantity) || l.unit !== old.unit || l.spendCategory !== old.spendCategory })
      // Un changement commercial repasse par les financiers ; le visa DT du
      // besoin inchangé reste valable. Un besoin modifié exige un nouveau visa DT.
      await tx.update(approvalSteps).set({ invalidatedAt: new Date() }).where(and(eq(approvalSteps.purchaseRequestId, request.id), isNull(approvalSteps.invalidatedAt), needChanged || horsSa ? undefined : ne(approvalSteps.role, 'technical_director')))
      await tx.update(purchaseOrders).set({ correctionPending: true, saHeadSignature: null, saInvoiceTransmitted: false }).where(eq(purchaseOrders.purchaseRequestId, request.id))
      await tx.update(treasuryOrders).set({ status: 'cancelled' }).where(eq(treasuryOrders.purchaseRequestId, request.id))
    }
    const headReview = input.actor.procurementRole === 'purchasing' && Boolean(input.actor.saSupervisorId)
    if (headReview) {
      const [head] = await tx.select().from(managers).where(eq(managers.id, input.actor.saSupervisorId!))
      if (!head || head.companyId !== input.companyId || head.procurementRole !== 'purchasing' || head.saSupervisorId) throw new CorrectionError('Chef SA indisponible', 409)
    }
    const [updated] = await tx.update(purchaseRequests).set({ status: headReview ? request.status : nextStatus, correctionTargetId: headReview ? input.actor.saSupervisorId : null, correctionReviewRequired: headReview, totalAmountFcfa: String(corrected.reduce((sum, l) => sum + l.amountFcfa, 0)),
      version: request.version + 1, ebVersion: request.ebVersion + 1, revisionComment: input.comment.trim(), revisedAt: new Date(), updatedAt: new Date() }).where(eq(purchaseRequests.id, request.id)).returning()
    if (c.kind === 'bc' && !changed) {
      const [site] = await tx.select().from(sites).where(eq(sites.id, request.siteId))
      const template = await getActiveDocumentTemplate(input.companyId, 'bc')
      const companyName = await getCompanyName(input.companyId)
      if (!site) throw new CorrectionError('Chantier introuvable', 404)
      for (const po of orders.filter(po => !po.correctionPending)) {
        const [supplier] = await tx.select().from(suppliers).where(eq(suppliers.id, po.supplierId))
        if (!supplier) throw new CorrectionError('Fournisseur introuvable', 404)
        const lines = corrected.map(l => ({ ...original.find(o => o.id === l.id)!, ...l, supplierName: l.supplierName ?? null, paymentMode: l.paymentMode ?? null, observation: l.observation ?? null, attachmentBlobKey: l.attachmentBlobKey ?? null, attachmentFileName: l.attachmentFileName ?? null, attachmentContentType: l.attachmentContentType ?? null, quantity: String(l.quantity), unitPriceFcfa: String(l.unitPriceFcfa), amountFcfa: String(l.amountFcfa), purchaseRequestId: request.id, displayOrder: 0 }))
        const data = buildBcDataFromRequest(updated, site, supplier, lines, companyName)
        await tx.update(purchaseOrders).set({ pdfHtml: generateBcHtml(template, { ...data, reference: po.reference, ebReference: `${request.reference} — V${updated.version}`, pendingSaHeadReview: true }), saHeadSignature: null }).where(eq(purchaseOrders.id, po.id))
      }
    }
    if (input.actor.procurementRole === 'technical_director' && changed) await tx.insert(approvalSteps).values({ id: `ap-${randomUUID()}`, purchaseRequestId: request.id, managerId: input.actor.id, role: 'technical_director', decision: 'approved', etape: 'validation_dt', pinVerified: input.pinVerified, ip: input.ip, comment: 'NIP vérifié — correction du besoin' })
    await tx.insert(approvalSteps).values({ id: `ap-${randomUUID()}`, purchaseRequestId: request.id, managerId: input.actor.id, role: input.actor.procurementRole!, decision: 'revised', etape: 'correction_resubmitted', pinVerified: input.pinVerified, ip: input.ip, comment: input.comment.trim() })
    await tx.update(procurementCorrections).set({ state: headReview ? 'head_review' : 'resubmitted', resumeStatus: nextStatus, responseComment: input.comment.trim(), resubmittedAt: new Date() }).where(eq(procurementCorrections.id, c.id))
    return { request: updated, changed, nextStatus: headReview ? 'correction_head_review' : nextStatus, returningToId: headReview ? input.actor.saSupervisorId : changed ? null : c.requestedById, sourceStatus: c.fromStatus }
  })
}

export async function finalRefusal(input: { companyId: string; requestId: string; managerId: string; procurementRole: ProcurementRole; comment?: string | null; pinVerified?: boolean; ip?: string }) {
  if (!input.comment?.trim()) throw new CorrectionError('Motif du refus définitif obligatoire')
  if (!input.pinVerified) throw new CorrectionError('NIP de signature requis', 401)
  return db.transaction(async tx => {
    const [request] = await tx.select().from(purchaseRequests).where(and(eq(purchaseRequests.id, input.requestId), eq(purchaseRequests.companyId, input.companyId))).for('update')
    if (!request) throw new CorrectionError('Demande introuvable', 404)
    if (request.correctionTargetId) throw new CorrectionError('Terminez la correction avant une décision définitive', 409)
    if (!canDefinitivelyRefuse(request.status, input.procurementRole)) throw new CorrectionError('Seuls le DAF et le PDG peuvent refuser définitivement à leur étape de validation', 403)
    await tx.insert(approvalSteps).values({ id: `ap-${randomUUID()}`, purchaseRequestId: request.id, managerId: input.managerId, role: input.procurementRole, decision: 'rejected', etape: 'definitive_refusal', comment: input.comment!.trim(), pinVerified: input.pinVerified, ip: input.ip })
    await tx.update(treasuryOrders).set({ status: 'cancelled' }).where(eq(treasuryOrders.purchaseRequestId, request.id))
    const [updated] = await tx.update(purchaseRequests).set({ status: 'rejected', updatedAt: new Date() }).where(eq(purchaseRequests.id, request.id)).returning()
    return updated
  })
}

export async function archivedCorrectionDocument(companyId: string, requestId: string, correctionId: string, documentId: string) {
  const [c] = await db.select().from(procurementCorrections).where(and(eq(procurementCorrections.id, correctionId), eq(procurementCorrections.companyId, companyId), eq(procurementCorrections.requestId, requestId)))
  if (!c) throw new CorrectionError('Archive introuvable', 404)
  const snapshot = c.snapshot as { orders?: Array<{ id: string; pdfHtml: string }>; treasuries?: Array<{ id: string; pdfHtml: string }> }
  const doc = [...(snapshot.orders ?? []), ...(snapshot.treasuries ?? [])].find(d => d.id === documentId)
  if (!doc?.pdfHtml) throw new CorrectionError('Document archivé indisponible', 404)
  return `<div style="padding:16px;background:#fff3cd;font-weight:bold">ARCHIVE — version ${c.sourceVersion} avant correction — ne pas utiliser pour commander ou payer</div>${doc.pdfHtml}`
}

export async function approveCorrection(companyId: string, requestId: string, actor: Actor, ip: string) {
  return db.transaction(async tx => {
    const [request] = await tx.select().from(purchaseRequests).where(and(eq(purchaseRequests.id, requestId), eq(purchaseRequests.companyId, companyId))).for('update')
    const [c] = await tx.select().from(procurementCorrections).where(and(eq(procurementCorrections.requestId, requestId), eq(procurementCorrections.state, 'head_review'))).for('update')
    if (!request || !c || request.correctionTargetId !== actor.id || actor.procurementRole !== 'purchasing' || actor.saSupervisorId) throw new CorrectionError('Validation réservée au chef SA désigné', 403)
    await tx.insert(approvalSteps).values({ id: `ap-${randomUUID()}`, purchaseRequestId: requestId, managerId: actor.id, role: 'purchasing', decision: 'approved', etape: 'validation_correction_sa', pinVerified: true, ip, comment: 'NIP vérifié — correction préparée par la ressource SA' })
    await tx.update(procurementCorrections).set({ state: 'resubmitted' }).where(eq(procurementCorrections.id, c.id))
    const [updated] = await tx.update(purchaseRequests).set({ status: c.resumeStatus as PurchaseRequestStatus, correctionTargetId: null, correctionReviewRequired: false, updatedAt: new Date() }).where(eq(purchaseRequests.id, requestId)).returning()
    return { request: updated, notifyId: c.requestedById }
  })
}

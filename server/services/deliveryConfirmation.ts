import { randomUUID } from 'crypto'
import {
  createDeliveryConfirmedTask,
  createPartialDeliveryTask,
  getDeclaration,
  getStopWithDriverContext,
  resolvePendingCancelledForDelivery,
  resolvePendingMissedForDelivery,
  runInTransaction,
  saveCertificate,
  updateDeliveryStatus,
  type StopWithTourDate,
} from '../db/queries.js'
import { buildCertificatePublicUrl } from '../config/public.js'
import { signCertificateAccessToken } from '../middleware/certificateAccess.js'
import { formatEmailLineForTask, sendDeliveryNotes } from './deliveryNotifications.js'
import { syncPurchaseRequestsAfterTourDelivery } from '../db/procurementQueries.js'

export interface DeliveryConfirmationResult {
  receiptId: string
  certificateUrl: string
  declarationOutcome: string
  isPartial: boolean
  isRejected: boolean
}

/** Finalise une livraison (certificat, tâches manager, e-mails) — partagé livreur OTP et validation manager. */
export async function finalizeDeliveryConfirmation(
  stop: Pick<StopWithTourDate, 'id'>,
  opts?: { confirmationNote?: string },
): Promise<DeliveryConfirmationResult> {
  const receiptId = `RCT-${randomUUID().slice(0, 8).toUpperCase()}`
  const certAccess = signCertificateAccessToken(receiptId)
  const certificateUrl = buildCertificatePublicUrl(receiptId, certAccess)
  const decl = await getDeclaration(stop.id)
  const outcome = decl?.outcome ?? 'full'

  // Atomique : le certificat et le passage à « livré » doivent tenir ensemble
  // (jamais de certificat sans statut livré, ni l'inverse).
  await runInTransaction(async (tx) => {
    await saveCertificate(
      receiptId,
      stop.id,
      certificateUrl,
      { isPartial: outcome === 'partial', isRejected: outcome === 'rejected' },
      tx,
    )
    await updateDeliveryStatus(stop.id, { status: 'delivered', receiptId }, tx)
  })
  // Best-effort : résolution des tâches en attente (idempotent, hors transaction).
  await Promise.all([
    resolvePendingMissedForDelivery(stop.id),
    resolvePendingCancelledForDelivery(stop.id),
  ])

  const ctx = await getStopWithDriverContext(stop.id)
  if (ctx?.tourId) {
    try {
      await syncPurchaseRequestsAfterTourDelivery(ctx.tourId)
    } catch (err) {
      console.error('[deliveryConfirmation] sync statut EB après livraison', err)
    }
  }
  if (ctx) {
    let notifyResult: Awaited<ReturnType<typeof sendDeliveryNotes>>
    try {
      notifyResult = await Promise.race([
        sendDeliveryNotes(ctx, receiptId, certificateUrl, outcome, decl?.lines ?? null),
        new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('Timeout envoi e-mail bon de livraison')), 12_000)
        }),
      ])
    } catch (mailErr) {
      console.error('[deliveryConfirmation] envoi bon de livraison échoué', mailErr)
      notifyResult = {
        sent: 0,
        failed: 1,
        errors: [{ to: 'all', error: mailErr instanceof Error ? mailErr.message : String(mailErr) }],
        recipients: [],
        emails: [],
        certificateUrl,
      }
    }
    const emailLine = formatEmailLineForTask(notifyResult)
    const noteSuffix = opts?.confirmationNote ? ` ${opts.confirmationNote}` : ''
    await createDeliveryConfirmedTask(ctx, receiptId, outcome, `${emailLine}${noteSuffix}`)
    if (outcome === 'partial' || outcome === 'rejected') {
      await createPartialDeliveryTask(ctx, receiptId, (decl?.lines ?? []) as unknown[], outcome)
    }
  }

  return {
    receiptId,
    certificateUrl,
    declarationOutcome: outcome,
    isPartial: outcome === 'partial',
    isRejected: outcome === 'rejected',
  }
}

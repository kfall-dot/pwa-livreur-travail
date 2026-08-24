import { resolveOtpCode } from '../config/production.js'
import {
  getDeclaration,
  getOtpForDelivery,
  getPhotoCount,
  linkDeliveryPointToSupermarket,
  setOtp,
  updateDeliveryPointContactPhone,
  updateDeliveryStatus,
  type StopWithTourDate,
} from '../db/queries.js'
import { resolveOtpContactPhone } from '../lib/resolveOtpContactPhone.js'
import { sendOtpSms } from './sms.js'
import { formatOrderDetailForOtpSms } from './smsMessages.js'
import { smsConfig } from '../config/sms.js'
import type { Declaration } from '../db/schema.js'
import { otpAssistStatusBlock } from './deliveryOtpAssistLogic.js'

export { isTourDatePast } from './deliveryOtpAssistLogic.js'

export interface ManagerOtpAssistResult {
  ok: true
  otpCode: string
  smsTo: string
  sent: boolean
  smsProvider: string
  expiresAt: string
  smsWarning?: string
  smsNotice?: string
}

export async function assertReadyForOtpAssist(stop: StopWithTourDate): Promise<string | null> {
  const statusBlock = otpAssistStatusBlock(stop.status, stop.tourDate)
  if (statusBlock) return statusBlock
  const decl = await getDeclaration(stop.id)
  if (!decl) {
    return 'Déclaration produit manquante — le livreur doit compléter la déclaration d’abord.'
  }
  const photoCount = await getPhotoCount(stop.id)
  if (photoCount < stop.requiredPhotos) {
    return `Photos insuffisantes (${photoCount}/${stop.requiredPhotos}).`
  }
  return null
}

/** Renvoie le SMS OTP et retourne toujours le code au manager (relai vocal magasin). */
export async function resendOtpForManager(stop: StopWithTourDate): Promise<ManagerOtpAssistResult> {
  const block = await assertReadyForOtpAssist(stop)
  if (block) throw new Error(block)

  const { recipient, catalog } = await resolveOtpContactPhone(stop)
  if (!recipient) {
    throw new Error(
      `Téléphone responsable manquant pour « ${stop.name} » — corrigez le point dans le catalogue.`,
    )
  }
  if (catalog && !stop.supermarketId) {
    await linkDeliveryPointToSupermarket(stop.id, catalog.id, recipient)
  } else if (recipient !== String(stop.contactPhone ?? '').trim()) {
    await updateDeliveryPointContactPhone(stop.id, recipient)
  }

  const decl = await getDeclaration(stop.id)
  const outcome = (decl?.outcome ?? 'full') as Declaration['outcome']
  const code = resolveOtpCode()
  await setOtp(stop.id, code)

  const smsResult = await sendOtpSms(recipient, code, {
    pointName: stop.name,
    orderRef: stop.orderRef,
    orderDetail: formatOrderDetailForOtpSms(
      stop.products as Array<{ label: string; qty: number; unit: string }> | null,
      stop.units,
      stop.unitType,
    ),
    outcome,
  })

  let smsWarning: string | undefined
  if (!smsResult.success) {
    smsWarning = smsResult.details ?? smsResult.error ?? 'SMS_SEND_FAILED'
    console.warn(`[OTP manager] SMS non envoyé (${smsWarning}) — code conservé pour relai vocal.`)
  }

  await updateDeliveryStatus(stop.id, { status: 'otp_sent' })

  const otpRow = await getOtpForDelivery(stop.id)
  const expiresAt = otpRow?.expiresAt ?? new Date(Date.now() + 10 * 60_000)

  return {
    ok: true,
    otpCode: code,
    smsTo: recipient,
    sent: smsResult.success,
    smsProvider: smsConfig.provider,
    expiresAt: expiresAt.toISOString(),
    ...(smsWarning ? { smsWarning: `SMS non envoyé : ${smsWarning}` } : {}),
    ...(smsConfig.provider === 'textbee' && smsResult.success
      ? {
          smsNotice:
            'SMS transmis à Textbee. Si le magasin ne reçoit rien, appelez le responsable et dictez le code affiché ci-dessous.',
        }
      : {}),
  }
}

export async function readOtpStatusForManager(
  stop: StopWithTourDate,
): Promise<{ hasOtp: boolean; expiresAt: string | null; expired: boolean }> {
  const row = await getOtpForDelivery(stop.id)
  if (!row) return { hasOtp: false, expiresAt: null, expired: false }
  const expired = row.expiresAt < new Date()
  return { hasOtp: true, expiresAt: row.expiresAt.toISOString(), expired }
}

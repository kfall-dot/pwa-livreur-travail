import { renderEmailTemplate } from './emailTemplates.js'
import { eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import { managers } from '../db/schema.js'
import type { Declaration } from '../db/schema.js'
import type { StopWithDriverContext } from '../db/queries.js'
import { enqueueNotifications } from './notificationOutbox.js'
import { getTourById } from '../db/queries.js'
import { buildEmailBody } from './deliveryNotificationBody.js'

export { buildEmailBody } from './deliveryNotificationBody.js'

export interface DeliveryNotifyResult {
  sent: number
  queued?: number
  failed: number
  errors: Array<{ to: string; error: string }>
  recipients: Array<{ email: string; role: string; name?: string }>
  emails: string[]
  certificateUrl?: string
}

async function findManagerRecipients(companyId: string): Promise<Array<{ email: string; name: string; role: string }>> {
  const rows = await db.select({ email: managers.email, name: managers.name }).from(managers).where(eq(managers.companyId, companyId))
  return rows
    .filter((r) => r.email?.trim())
    .map((r) => ({ email: r.email.trim().toLowerCase(), name: r.name, role: 'gerant' }))
}

export function formatEmailLineForTask(notifyResult: DeliveryNotifyResult | null): string {
  if (!notifyResult) {
    return 'Aucun e-mail envoyé : renseignez les adresses gérant ou configurez SMTP (EMAIL_PROVIDER=smtp).'
  }
  if (notifyResult.queued !== undefined) return notifyResult.queued > 0 ? `E-mails de réception enregistrés pour envoi en arrière-plan : ${notifyResult.queued}.` : 'Aucun nouvel e-mail de réception à programmer.'
  const emailedTo = notifyResult.recipients.map((r) => {
    const label = r.role === 'site_manager' ? 'responsable du lieu' : 'gérant'
    return `${label} : ${r.email}`
  })
  const failedEmails = notifyResult.errors.map((e) => `${e.to} (${e.error})`).join(' ; ')
  if (emailedTo.length > 0) {
    return (
      `E-mails envoyés : ${emailedTo.join(' ; ')}.` +
      (failedEmails ? ` Échec partiel : ${failedEmails}.` : '')
    )
  }
  if (failedEmails) return `Échec envoi e-mail : ${failedEmails}.`
  return 'Aucun e-mail envoyé : renseignez l’adresse du compte manager.'
}

export async function sendDeliveryNotes(
  ctx: StopWithDriverContext,
  receiptId: string,
  certificateUrlOrPath: string,
  outcome: Declaration['outcome'] | null,
  declarationLines?: unknown,
): Promise<DeliveryNotifyResult> {
  const companyId = ctx.companyId ?? (await getTourById(ctx.tourId))?.companyId
  if (!companyId) throw new Error('Compagnie de livraison introuvable')
  const recipients = await findManagerRecipients(companyId)
  const { subject, text } = buildEmailBody(
    {
      name: ctx.name,
      address: ctx.address,
      units: ctx.units,
      unitType: ctx.unitType,
      orderRef: ctx.orderRef,
      products: Array.isArray(ctx.products)
        ? (ctx.products as Array<{ label: string; qty: number; unit: string }>)
        : null,
      tourDate: ctx.tourDate,
      driverName: ctx.driverName,
    },
    receiptId,
    outcome,
    declarationLines,
    certificateUrlOrPath,
  )
  const html=renderEmailTemplate({subject,text,actionUrl:certificateUrlOrPath,actionLabel:'Voir le certificat de livraison'})
  const queued=await enqueueNotifications(companyId,recipients.map(recipient=>({channel:'email' as const,to:recipient.email,subject,text,html,dedupeKey:`receipt:${receiptId}:email:${recipient.email}`})))
  return {sent:0,queued,failed:0,errors:[],emails:recipients.map(r=>r.email),recipients,certificateUrl:certificateUrlOrPath}
}

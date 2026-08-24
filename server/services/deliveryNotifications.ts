import { db } from '../db/index.js'
import { managers } from '../db/schema.js'
import type { Declaration } from '../db/schema.js'
import type { StopWithDriverContext } from '../db/queries.js'
import { sendEmail } from './email.js'
import { buildEmailBody } from './deliveryNotificationBody.js'

export { buildEmailBody } from './deliveryNotificationBody.js'

export interface DeliveryNotifyResult {
  sent: number
  failed: number
  errors: Array<{ to: string; error: string }>
  recipients: Array<{ email: string; role: string; name?: string }>
  emails: string[]
  certificateUrl?: string
}

async function findManagerRecipients(): Promise<Array<{ email: string; name: string; role: string }>> {
  const rows = await db.select({ email: managers.email, name: managers.name }).from(managers)
  return rows
    .filter((r) => r.email?.trim())
    .map((r) => ({ email: r.email.trim().toLowerCase(), name: r.name, role: 'gerant' }))
}

export function formatEmailLineForTask(notifyResult: DeliveryNotifyResult | null): string {
  if (!notifyResult) {
    return 'Aucun e-mail envoyé : renseignez les adresses gérant ou configurez SMTP (EMAIL_PROVIDER=smtp).'
  }
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
  const recipients = await findManagerRecipients()
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
  const emailResults: DeliveryNotifyResult['recipients'] = []
  const emailErrors: DeliveryNotifyResult['errors'] = []

  if (recipients.length === 0) {
    console.warn(`[deliveryNotifications] Aucun destinataire e-mail pour ${ctx.id}`)
  } else {
    for (const recipient of recipients) {
      try {
        await sendEmail({ to: recipient.email, subject, text })
        emailResults.push(recipient)
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        emailErrors.push({ to: recipient.email, error: message })
        console.error(`[deliveryNotifications] Échec e-mail vers ${recipient.email}:`, message)
      }
    }
  }

  return {
    sent: emailResults.length,
    failed: emailErrors.length,
    errors: emailErrors,
    emails: emailResults.map((r) => r.email),
    recipients: emailResults,
    certificateUrl: certificateUrlOrPath,
  }
}

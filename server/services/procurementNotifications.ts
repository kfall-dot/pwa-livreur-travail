import { eq } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { db } from '../db/index.js'
import { managers, notifications, type ProcurementRole } from '../db/schema.js'
import { sendEmail } from './email.js'
import { sendSmsMessage } from './sms.js'

const ROLE_LABELS: Record<ProcurementRole, string> = {
  site_controller: 'Conducteur de travaux',
  technical_director: 'Directeur technique',
  daf: 'DAF',
  purchasing: 'Service achats',
  pdg: 'PDG',
  controle_gestion: 'Contrôle de gestion',
  site_manager: 'Chef de chantier',
  accountant: 'Comptabilité',
}

/**
 * Crée une notification in-app pour un manager.
 */
async function createInAppNotification(params: {
  managerId: string
  companyId: string
  type: 'approval_required' | 'bc_to_validate' | 'bt_to_validate' | 'task_assigned' | 'delivery_issue' | 'budget_alert'
  title: string
  message: string
  link?: string
  refType?: string
  refId?: string
}) {
  await db.insert(notifications).values({
    id: randomUUID(),
    companyId: params.companyId,
    managerId: params.managerId,
    type: params.type,
    title: params.title,
    message: params.message,
    link: params.link,
    refType: params.refType,
    refId: params.refId,
    smsSent: false,
    read: false,
  })
}

/**
 * Envoie un SMS à un manager (si numéro présent).
 */
async function sendManagerSms(phone: string | undefined, title: string, message: string) {
  if (!phone) return
  const body = `[TraceO] ${title}\n${message}`
  try {
    await sendSmsMessage(phone, body)
  } catch (err) {
    console.warn(`[procurement-notify] SMS échoué:`, err instanceof Error ? err.message : err)
  }
}

export async function notifyManagersByProcurementRole(
  companyId: string,
  roles: ProcurementRole[],
  subject: string,
  text: string,
  options?: {
    link?: string
    refType?: string
    refId?: string
    notificationType?: 'approval_required' | 'bc_to_validate' | 'bt_to_validate' | 'task_assigned' | 'delivery_issue' | 'budget_alert'
  },
): Promise<{ notified: number }> {
  const rows = await db
    .select({ id: managers.id, email: managers.email, name: managers.name, phone: managers.phone, procurementRole: managers.procurementRole })
    .from(managers)
    .where(eq(managers.companyId, companyId))

  const targets = rows.filter(
    (m) => m.procurementRole && roles.includes(m.procurementRole),
  )

  let notified = 0
  for (const target of targets) {
    console.log(
      `[procurement-notify] ${ROLE_LABELS[target.procurementRole!]} ${target.name} <${target.email}>: ${subject}`,
    )
    try {
      await sendEmail({ to: target.email, subject, text })
      notified++
    } catch (err) {
      console.error(
        `[procurement-notify] Échec envoi à ${target.email} (${subject}):`,
        err instanceof Error ? err.message : err,
      )
    }

    // Notification in-app
    if (options?.notificationType) {
      await createInAppNotification({
        managerId: target.id,
        companyId,
        type: options.notificationType,
        title: subject,
        message: text,
        link: options.link,
        refType: options.refType,
        refId: options.refId,
      })
    }

    // SMS si numéro
    await sendManagerSms(target.phone ?? undefined, subject, text)
  }
  return { notified }
}

export async function notifyDraftReadyForReview(
  companyId: string,
  draftId: string,
  siteName: string,
): Promise<void> {
  await notifyManagersByProcurementRole(
    companyId,
    ['technical_director'],
    `EB à valider — ${siteName}`,
    `Un nouvel expression de besoin (brouillon ${draftId}) est prête pour relecture DT.\nChantier : ${siteName}`,
    {
      link: `/manager/procurement/drafts/${draftId}`,
      refType: 'draft',
      refId: draftId,
      notificationType: 'approval_required',
    },
  )
}

export async function notifyRequestStatusChange(
  companyId: string,
  reference: string,
  status: string,
  targetRoles: ProcurementRole[],
  options?: { lines?: string },
): Promise<void> {
  const statusDetail = status === 'submitted' ? ' (Service achats)' : status === 'cdg_review' ? ' (Contrôle de gestion)' : ''
  const linesDetail = options?.lines ? `\n\nDétail :\n${options.lines}` : ''
  await notifyManagersByProcurementRole(
    companyId,
    targetRoles,
    `EB ${reference} — ${status}`,
    `La demande ${reference} est passée au statut « ${status} » et nécessite votre action${statusDetail}.${linesDetail}`,
    {
      notificationType: 'approval_required',
    },
  )
}

export async function notifyPurchaseOrderReady(
  companyId: string,
  reference: string,
  poReference: string,
): Promise<void> {
  await notifyManagersByProcurementRole(
    companyId,
    ['purchasing', 'technical_director'],
    `BC prêt — ${poReference}`,
    `Le bon de commande ${poReference} a été généré pour la demande ${reference}.`,
    {
      link: `/manager/procurement/bc/${poReference}`,
      refType: 'purchase_order',
      refId: poReference,
      notificationType: 'bc_to_validate',
    },
  )
}

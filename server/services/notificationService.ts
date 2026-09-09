import { randomUUID } from 'node:crypto'
import { desc, eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import { managers, notifications } from '../db/schema.js'
import { sendSmsMessage } from './sms.js'

export type NotificationType =
  | 'approval_required'
  | 'bc_to_validate'
  | 'bt_to_validate'
  | 'task_assigned'
  | 'delivery_issue'
  | 'budget_alert'

export interface NotifyManagerInput {
  managerId: string
  companyId: string
  type: NotificationType
  title: string
  message: string
  link?: string
  refType?: string
  refId?: string
  sendSms?: boolean
}

/**
 * Crée une notification in-app et envoie un SMS si demandé et si le manager a un numéro.
 */
export async function notifyManager(input: NotifyManagerInput): Promise<string> {
  const id = randomUUID()

  await db.insert(notifications).values({
    id,
    companyId: input.companyId,
    managerId: input.managerId,
    type: input.type,
    title: input.title,
    message: input.message,
    link: input.link,
    refType: input.refType,
    refId: input.refId,
    smsSent: false,
    read: false,
  })

  // SMS si demandé
  if (input.sendSms !== false) {
    const manager = await db.query.managers.findFirst({
      where: eq(managers.id, input.managerId),
    })
    if (manager?.phone) {
      const smsBody = `[TraceO] ${input.title}\n${input.message}${input.link ? `\n${input.link}` : ''}`
      try {
        await sendSmsMessage(manager.phone, smsBody)
        await db.update(notifications).set({ smsSent: true }).where(eq(notifications.id, id))
      } catch (err) {
        console.warn(`[notification] SMS échoué pour ${input.managerId}:`, err)
      }
    }
  }

  return id
}

/**
 * Notifie tous les managers d'un rôle donné.
 */
export async function notifyManagersByRole(params: {
  companyId: string
  procurementRole: string
  type: NotificationType
  title: string
  message: string
  link?: string
  refType?: string
  refId?: string
}): Promise<string[]> {
  const targets = await db.query.managers.findMany({
    where: eq(managers.procurementRole, params.procurementRole as never),
  })

  const ids: string[] = []
  for (const m of targets) {
    const id = await notifyManager({
      managerId: m.id,
      companyId: params.companyId,
      type: params.type,
      title: params.title,
      message: params.message,
      link: params.link,
      refType: params.refType,
      refId: params.refId,
    })
    ids.push(id)
  }
  return ids
}

/**
 * Liste les notifications non lues d'un manager.
 */
export async function listUnreadNotifications(managerId: string, limit = 50) {
  return db.query.notifications.findMany({
    where: eq(notifications.managerId, managerId),
    orderBy: [desc(notifications.createdAt)],
    limit,
  })
}

/**
 * Marque une notification comme lue.
 */
export async function markNotificationRead(notificationId: string) {
  await db.update(notifications).set({ read: true }).where(eq(notifications.id, notificationId))
}

/**
 * Marque toutes les notifications d'un manager comme lues.
 */
export async function markAllNotificationsRead(managerId: string) {
  await db.update(notifications).set({ read: true }).where(eq(notifications.managerId, managerId))
}

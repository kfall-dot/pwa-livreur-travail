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
    const rows = await db
      .select({ phone: managers.phone })
      .from(managers)
      .where(eq(managers.id, input.managerId))
    const phone = rows[0]?.phone
    if (phone) {
      const smsBody = `[TraceO] ${input.title}\n${input.message}${input.link ? `\n${input.link}` : ''}`
      try {
        await sendSmsMessage(phone, smsBody)
        await db.update(notifications).set({ smsSent: true }).where(eq(notifications.id, id))
      } catch (err) {
        console.warn(`[notification] SMS échoué pour ${input.managerId}:`, err)
      }
    }
  }

  return id
}

/**
 * Liste les notifications non lues d'un manager.
 */
export async function listUnreadNotifications(managerId: string, limit = 50) {
  return db
    .select()
    .from(notifications)
    .where(eq(notifications.managerId, managerId))
    .orderBy(desc(notifications.createdAt))
    .limit(limit)
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

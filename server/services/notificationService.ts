import { buildNotificationSmsBody } from './smsMessages.js'
import { randomUUID } from 'node:crypto'
import { and, desc, eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import { managers, notifications, notificationOutbox } from '../db/schema.js'
import { notificationOutboxValues, wakeNotificationWorker, type OutboxMessage } from './notificationOutbox.js'

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
 * Crée une notification in-app et programme un SMS si demandé et si le manager a un numéro.
 */
export async function notifyManager(input: NotifyManagerInput): Promise<string> {
  const id = randomUUID()

  const [manager] = await db.select({phone:managers.phone}).from(managers).where(and(eq(managers.id,input.managerId),eq(managers.companyId,input.companyId)))
  if(!manager)throw new Error('Gestionnaire introuvable dans cette compagnie')
  const messages:OutboxMessage[]=[]
  if(input.sendSms!==false&&manager.phone)messages.push({channel:'sms',to:manager.phone,text:buildNotificationSmsBody(input.title,input.message),notificationId:id,dedupeKey:`${id}:sms`})
  await db.transaction(async tx=>{
   await tx.insert(notifications).values({id,companyId:input.companyId,managerId:input.managerId,type:input.type,title:input.title,message:input.message,link:input.link,refType:input.refType,refId:input.refId,smsSent:false,read:false})
   if(messages.length)await tx.insert(notificationOutbox).values(notificationOutboxValues(input.companyId,messages))
  })

  if(messages.length)wakeNotificationWorker()
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

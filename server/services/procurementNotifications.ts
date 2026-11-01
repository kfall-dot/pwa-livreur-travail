import { buildNotificationSmsBody } from './smsMessages.js'
import { readableEmailText, renderEmailTemplate, emailActionUrl } from './emailTemplates.js'
import { eq } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { db } from '../db/index.js'
import { managers, notifications, notificationOutbox, type ProcurementRole } from '../db/schema.js'
import { notificationOutboxValues, wakeNotificationWorker, type OutboxMessage } from './notificationOutbox.js'

export async function notifyManagersByProcurementRole(
 companyId:string,roles:ProcurementRole[],subject:string,text:string,
 options?:{managerIds?:string[];link?:string;refType?:string;refId?:string;notificationType?:'approval_required'|'bc_to_validate'|'bt_to_validate'|'task_assigned'|'delivery_issue'|'budget_alert'}
):Promise<{notified:number;queued:number}>{
 subject=readableEmailText(subject)
 text=readableEmailText(text)
 const html=renderEmailTemplate({subject,text,actionUrl:emailActionUrl('/manager?tab=achats'),actionLabel:'Consulter les demandes'})
 const rows=await db.select({id:managers.id,email:managers.email,phone:managers.phone,procurementRole:managers.procurementRole}).from(managers).where(eq(managers.companyId,companyId))
 const targets=rows.filter(m=>m.procurementRole&&roles.includes(m.procurementRole)&&(!options?.managerIds||options.managerIds.includes(m.id)))
 if(!targets.length)return {notified:0,queued:0}
 const notificationType=options?.notificationType
 const appRows=notificationType?targets.map(target=>({id:randomUUID(),companyId,managerId:target.id,type:notificationType,title:subject,message:text,link:options.link,refType:options.refType,refId:options.refId,smsSent:false,read:false})):[]
 const messages:OutboxMessage[]=[]
 targets.forEach((target,index)=>{
  const notificationId=appRows[index]?.id
  if(target.email?.trim())messages.push({channel:'email',to:target.email.trim(),subject,text,html,notificationId,dedupeKey:notificationId?`${notificationId}:email`:undefined})
  if(target.phone?.trim())messages.push({channel:'sms',to:target.phone.trim(),text:buildNotificationSmsBody(subject,text),notificationId,dedupeKey:notificationId?`${notificationId}:sms`:undefined})
 })
 await db.transaction(async tx=>{
  if(appRows.length)await tx.insert(notifications).values(appRows)
  if(messages.length)await tx.insert(notificationOutbox).values(notificationOutboxValues(companyId,messages))
 })
 wakeNotificationWorker()
 // « notified » signifie désormais notification enregistrée, pas livrée par e-mail.
 return {notified:targets.length,queued:messages.length}
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
    `Une nouvelle expression de besoin (brouillon ${draftId}) est prête pour relecture DT.\nChantier : ${siteName}`,
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
  options?: { lines?: string; managerIds?: string[] },
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
      managerIds: options?.managerIds,
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

/**
 * Notifie une révision PDG d'une EB : le DT initiateur, le contrôle de gestion et
 * le DAF (parties prenantes du chiffrage et du bon de trésorerie) reçoivent
 * l'information, et le Service achats est invité à poursuivre le processus sur la
 * version révisée. L'EB révisée reste accessible par tous ceux qui avaient accès à
 * la version initiale.
 */
export async function notifyRequestRevised(params: {
  companyId: string
  reference: string
  createdByManagerId?: string | null
  ebVersion: number
  comment?: string | null
  /** Le BT (avance de trésorerie) a été régénéré au nouveau montant. */
  btRegenerated?: boolean
}): Promise<void> {
  const commentDetail = params.comment ? `\nMotif de la révision : ${params.comment}` : ''
  const body =
    `La demande ${params.reference} a été révisée par le PDG (version EB n° ${params.ebVersion}).` +
    `${commentDetail}\nLes quantités ont été modifiées ; la demande a été renvoyée au Service achats pour suite.` +
    (params.btRegenerated
      ? '\nLe bon de trésorerie a été régénéré au nouveau montant (bandeau « version modifiée »).'
      : '')

  // Information au DT initiateur, au CdG et au DAF ; le SA poursuit via
  // notifyRequestStatusChange.
  await notifyManagersByProcurementRole(
    params.companyId,
    ['technical_director', 'controle_gestion', 'daf'],
    `EB ${params.reference} révisée — version ${params.ebVersion}`,
    body,
    {
      link: `/manager/procurement/requests`,
      refType: 'purchase_request',
      notificationType: 'approval_required',
    },
  )
}

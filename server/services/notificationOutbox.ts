import { randomUUID } from 'node:crypto'
import { db, getPool } from '../db/index.js'
import { notificationOutbox } from '../db/schema.js'
import { sendEmail, type EmailPayload } from './email.js'
import { sendSmsMessage } from './sms.js'

export type OutboxMessage = { channel:'email'|'sms'; to:string; text:string; subject?:string; html?:string; notificationId?:string; dedupeKey?:string }
export const OUTBOX_MAX_ATTEMPTS=8
const LEASE_SECONDS=300
export function retryDelayMs(attempt:number){return Math.min(3600000,30000*2**Math.max(0,attempt-1))}
export function notificationOutboxValues(companyId:string,messages:OutboxMessage[]){
 const testOnly=process.env.NODE_ENV!=='production'&&process.env.NOTIFICATION_OUTBOX_TEST_MODE==='1'
 return messages.map(message=>({id:randomUUID(),companyId,notificationId:message.notificationId,channel:message.channel,payload:{to:message.to,text:message.text,subject:message.subject,html:message.html},dedupeKey:message.dedupeKey,testOnly}))
}
let wakeWorker:(()=>void)|null=null
export function wakeNotificationWorker(){wakeWorker?.()}
export async function enqueueNotifications(companyId:string,messages:OutboxMessage[]){
 if(!messages.length)return 0
 const rows=await db.insert(notificationOutbox).values(notificationOutboxValues(companyId,messages)).onConflictDoNothing().returning({id:notificationOutbox.id})
 wakeNotificationWorker()
 return rows.length
}
type Job={id:string;company_id:string;notification_id:string|null;channel:'email'|'sms';payload:{to:string;text:string;subject?:string;html?:string};attempts:number;claim_token:string}
export type NotificationTransports={email:(payload:EmailPayload)=>Promise<{success:boolean}>;sms:(to:string,text:string)=>Promise<{success:boolean}>}
const defaultTransports:NotificationTransports={email:sendEmail,sms:sendSmsMessage}
/** Une réservation courte, puis réseau hors transaction. Les baux expirés reprennent après redémarrage. */
export type NotificationBatchOptions={companyId?:string;testOnly?:boolean;transports?:NotificationTransports}
export async function processNotificationBatch(options:NotificationBatchOptions={}){
 if(options.testOnly&&!options.transports)throw new Error('Les jobs de test exigent des transports simulés explicites')
 const pool=getPool(),token=randomUUID(),testOnly=options.testOnly??false
 // Un dernier essai interrompu ne doit pas rester éternellement en traitement.
 await pool.query(`update notification_outbox set status='failed',last_error='LEASE_EXPIRED_MAX_ATTEMPTS',claim_token=null,lease_until=null where status='processing' and lease_until<=now() and attempts>=$1 and test_only=$2 and ($3::text is null or company_id=$3)`,[OUTBOX_MAX_ATTEMPTS,testOnly,options.companyId??null])
 const claimed=await pool.query<Job>(`with due as (
 select id from notification_outbox where test_only=$1 and ($2::text is null or company_id=$2) and attempts<$3
 and ((status='pending' and next_attempt_at<=now()) or (status='processing' and lease_until<=now()))
 order by next_attempt_at,created_at for update skip locked limit 4
 ) update notification_outbox j set status='processing',attempts=j.attempts+1,claim_token=$4,lease_until=now()+($5::int*interval '1 second')
 from due where j.id=due.id returning j.id,j.company_id,j.notification_id,j.channel,j.payload,j.attempts,j.claim_token`,[testOnly,options.companyId??null,OUTBOX_MAX_ATTEMPTS,token,LEASE_SECONDS])
 const transports=options.transports??defaultTransports
 const results=await Promise.all(claimed.rows.map(async job=>{
  try{
   const sent=job.channel==='email'?await transports.email({to:job.payload.to,subject:job.payload.subject??'',text:job.payload.text,...(job.payload.html?{html:job.payload.html}:{})}):await transports.sms(job.payload.to,job.payload.text)
   if(!sent.success)throw new Error('PROVIDER_REJECTED')
   // La notification in-app n'indique « SMS envoyé » qu'après acceptation fournisseur.
   const client=await pool.connect()
   try{await client.query('begin');const marked=await client.query(`update notification_outbox set status='sent',sent_at=now(),claim_token=null,lease_until=null,last_error=null where id=$1 and claim_token=$2 returning id`,[job.id,job.claim_token]);
    if(!marked.rowCount){await client.query('commit');return 'lease_lost'}
    if(job.channel==='sms'&&job.notification_id)await client.query('update notifications set sms_sent=true where id=$1 and company_id=$2',[job.notification_id,job.company_id]);
    await client.query('commit')
   }catch(err){await client.query('rollback');throw err}finally{client.release()}
   return 'sent'
  }catch{
   await pool.query(`update notification_outbox set status=$3,next_attempt_at=now()+($4::int*interval '1 millisecond'),lease_until=null,claim_token=null,last_error=$5 where id=$1 and claim_token=$2`,[job.id,job.claim_token,job.attempts>=OUTBOX_MAX_ATTEMPTS?'failed':'pending',retryDelayMs(job.attempts),job.channel==='email'?'EMAIL_DELIVERY_FAILED':'SMS_DELIVERY_FAILED'])
   console.warn(`[notification-outbox] ${job.id}: tentative ${job.attempts}/${OUTBOX_MAX_ATTEMPTS} en échec`)
   return 'retry'
  }
 }))
 return {claimed:claimed.rows.length,sent:results.filter(r=>r==='sent').length,retry:results.filter(r=>r==='retry').length}
}
export function startNotificationWorker(options:NotificationBatchOptions={}){
 if(options.testOnly&&!options.transports)throw new Error('Les jobs de test exigent des transports simulés explicites')
 if(process.env.NOTIFICATION_WORKER_DISABLED==='1')return()=>{}
 let running=false,stopped=false,wakeRequested=false
 let timer:ReturnType<typeof setTimeout>|undefined
 let inFlight:Promise<void>|null=null
 const schedule=(delay:number)=>{if(stopped)return;if(timer)clearTimeout(timer);timer=setTimeout(()=>{inFlight=tick()},delay);timer.unref()}
 const tick=async()=>{
  if(running||stopped)return
  running=true;wakeRequested=false
  let delay=600000
  try{
   await processNotificationBatch(options)
   if(stopped)return
   const {rows}=await getPool().query<{next_due:Date|null}>("select min(case when status='pending' then next_attempt_at else lease_until end) as next_due from notification_outbox where test_only=$1 and ($2::text is null or company_id=$2) and status in ('pending','processing')",[options.testOnly??false,options.companyId??null])
   if(rows[0]?.next_due)delay=Math.min(600000,Math.max(1000,rows[0].next_due.getTime()-Date.now()))
  }catch(err){console.error('[notification-outbox] traitement indisponible',err instanceof Error?err.name:'Error');delay=10000}
  finally{running=false;schedule(wakeRequested?0:delay)}
 }
 const wake=()=>{if(stopped)return;wakeRequested=true;if(!running)schedule(0)}
 wakeWorker=wake;schedule(0)
 return()=>{stopped=true;if(timer)clearTimeout(timer);if(wakeWorker===wake)wakeWorker=null;return inFlight??Promise.resolve()}
}
export async function notificationQueueStatus(){
 const {rows}=await getPool().query<{status:string;count:string}>("select status,count(*)::text as count from notification_outbox where test_only=false group by status")
 return Object.fromEntries(['pending','processing','sent','failed'].map(status=>[status,Number(rows.find(r=>r.status===status)?.count??0)]))
}

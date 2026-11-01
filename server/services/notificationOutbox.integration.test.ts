import express from 'express'
import { procurementRouter } from '../routes/procurement.js'
import { signManagerToken } from '../middleware/managerAuth.js'
import {test} from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {readFileSync} from 'node:fs'
import {eq} from 'drizzle-orm'
import {db,getPool} from '../db/index.js'
import {companies,managers,notifications,notificationOutbox,sites,suppliers,purchaseRequests,purchaseRequestLines,purchaseOrders} from '../db/schema.js'
import {createPurchaseOrdersForEb} from './procurementWorkflow.js'
import {notifyManagersByProcurementRole} from './procurementNotifications.js'
import {notifyManager} from './notificationService.js'
import {sendDeliveryNotes,formatEmailLineForTask} from './deliveryNotifications.js'
import type {StopWithDriverContext} from '../db/queries.js'
import {enqueueNotifications,processNotificationBatch,startNotificationWorker,OUTBOX_MAX_ATTEMPTS} from './notificationOutbox.js'

test('notifications persistantes : BC rapides, canaux indépendants, reprises, baux et isolation', {skip:process.env.RUN_OUTBOX_INTEGRATION!=='1'},async()=>{
 const id='test-outbox-'+randomUUID(),outside=id+'-outside',previous=process.env.NOTIFICATION_OUTBOX_TEST_MODE
 process.env.NOTIFICATION_OUTBOX_TEST_MODE='1'
 const app=express();app.use(express.json());app.use('/procurement',procurementRouter)
 const server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));const port=(server.address() as {port:number}).port
 const sent:Array<{to:string;channel:string}>=[]
 const transports={email:async(p:{to:string})=>{sent.push({to:p.to,channel:'email'});return{success:true}},sms:async(to:string)=>{sent.push({to,channel:'sms'});return{success:true}}}
 try{
  await getPool().query(readFileSync('server/db/migrations/20261025010000_notification_outbox/migration.sql','utf8'))
  for(const companyId of [id,outside])await db.insert(companies).values({id:companyId,name:companyId,slug:companyId})
  for(const [suffix,role,companyId] of [['sa','purchasing',id],['dt','technical_director',id],['foreign','technical_director',outside]] as const)await db.insert(managers).values({id:id+'-'+suffix,companyId,email:`${id}-${suffix}@example.invalid`,name:suffix,passwordHash:'test',procurementRole:role,phone:'+2250700000000'})
  await db.insert(sites).values({id:id+'-site',companyId:id,name:'Chantier test',address:'Test'})
  await db.insert(purchaseRequests).values({id:id+'-eb',companyId:id,siteId:id+'-site',reference:id+'-EB',status:'sa_review',totalAmountFcfa:'12000'})
  for(const suffix of ['1','2']){
   await db.insert(suppliers).values({id:id+'-supplier'+suffix,companyId:id,name:'Fournisseur '+suffix})
   await db.insert(purchaseRequestLines).values({id:id+'-line'+suffix,purchaseRequestId:id+'-eb',label:'Ciment '+suffix,quantity:'1',unit:'sac',supplierName:'Fournisseur '+suffix,amountFcfa:'6000',unitPriceFcfa:'6000',spendCategory:'autres_materiaux'})
  }
  const start=performance.now()
  const orders=await createPurchaseOrdersForEb({companyId:id,requestId:id+'-eb',managerId:id+'-sa',allSuppliers:true})
  console.log(`Deux BC avec notifications persistées : ${Math.round(performance.now()-start)} ms (base de test)`)
  assert.equal(orders.length,2);assert.notEqual(orders[0].reference,orders[1].reference)
  for(const order of orders)assert.ok(order.pdfHtml?.includes(order.reference),'le document est enregistré directement avec sa référence définitive')
  const token=signManagerToken(id+'-sa',`${id}-sa@example.invalid`,id,'manager','purchasing')
  const headers={Authorization:'Bearer '+token}
  const response=await fetch(`http://127.0.0.1:${port}/procurement/requests/${id}-eb`,{headers})
  assert.equal(response.status,200,await response.clone().text())
  const clientDetail=await response.json();assert.equal(clientDetail.purchaseOrders.length,2);assert.ok(clientDetail.purchaseOrders.every((p:{pdfHtml?:string})=>p.pdfHtml===undefined))
  const document=await fetch(`http://127.0.0.1:${port}/procurement/documents/${orders[0].id}/html`,{headers})
  assert.equal(document.status,200);assert.match(await document.text(),new RegExp(orders[0].reference))
  const queued=await db.select().from(notificationOutbox).where(eq(notificationOutbox.companyId,id))
  assert.equal(queued.length,8);assert.ok(queued.every(j=>j.testOnly&&j.status==='pending'));assert.equal(sent.length,0)
  const internal=await db.select().from(notifications).where(eq(notifications.companyId,id));assert.equal(internal.length,4);assert.ok(internal.every(n=>!n.smsSent))
  const ignored=await processNotificationBatch({companyId:id,transports});assert.equal(ignored.claimed,0,'le worker normal ignore les messages de tests')
  const concurrent=await Promise.all([processNotificationBatch({companyId:id,testOnly:true,transports}),processNotificationBatch({companyId:id,testOnly:true,transports})])
  assert.equal(concurrent.reduce((s,r)=>s+r.sent,0),8);assert.equal(sent.length,8)
  assert.ok((await db.select().from(notificationOutbox).where(eq(notificationOutbox.companyId,id))).every(j=>j.attempts===1&&j.status==='sent'))
  assert.ok(sent.every(s=>!s.to.includes('foreign')))
  const ctx={companyId:id,id:id+'-delivery',tourId:'not-required',name:'Chantier test',address:'Test',units:1,unitType:'sac',orderRef:'BC-TEST',products:[],tourDate:'2026-10-25',driverName:'Livreur test'} as StopWithDriverContext
  const receipt=await sendDeliveryNotes(ctx,'RCT-TEST','https://example.invalid/cert', 'full')
  assert.equal(receipt.queued,2);assert.equal(receipt.sent,0);assert.ok(receipt.recipients.every(r=>!r.email.includes('foreign')));assert.match(formatEmailLineForTask(receipt),/arrière-plan/)
  assert.equal((await sendDeliveryNotes(ctx,'RCT-TEST','https://example.invalid/cert','full')).queued,0,'même reçu : pas de nouvel envoi dupliqué')
  await processNotificationBatch({companyId:id,testOnly:true,transports})
  const notificationId=await notifyManager({companyId:id,managerId:id+'-sa',type:'task_assigned',title:'Reprise test',message:'Test'})
  const failure=await processNotificationBatch({companyId:id,testOnly:true,transports:{...transports,sms:async()=>({success:false})}})
  assert.equal(failure.retry,1)
  const [retry]=await db.select().from(notificationOutbox).where(eq(notificationOutbox.notificationId,notificationId));assert.equal(retry.status,'pending');assert.equal(retry.attempts,1);assert.ok(retry.nextAttemptAt.getTime()>Date.now())
  let [note]=await db.select().from(notifications).where(eq(notifications.id,notificationId));assert.equal(note.smsSent,false)
  await getPool().query('update notification_outbox set next_attempt_at=now() where id=$1',[retry.id])
  await processNotificationBatch({companyId:id,testOnly:true,transports});[note]=await db.select().from(notifications).where(eq(notifications.id,notificationId));assert.equal(note.smsSent,true)
  await enqueueNotifications(id,[{channel:'email',to:'lease@example.invalid',subject:'Reprise bail',text:'Test',dedupeKey:'lease'}])
  await getPool().query("update notification_outbox set status='processing',attempts=1,lease_until=now()-interval '1 minute',claim_token='dead' where company_id=$1 and dedupe_key='lease'",[id])
  assert.equal((await processNotificationBatch({companyId:id,testOnly:true,transports})).sent,1,'un redémarrage ne perd pas un message réservé')
  await enqueueNotifications(id,[{channel:'email',to:'failed@example.invalid',subject:'Échec final',text:'Test',dedupeKey:'failed'}])
  await getPool().query("update notification_outbox set attempts=$2 where company_id=$1 and dedupe_key='failed'",[id,OUTBOX_MAX_ATTEMPTS-1])
  await processNotificationBatch({companyId:id,testOnly:true,transports:{...transports,email:async()=>{throw new Error('Simulated')}}})
  const failed=await getPool().query("select status,attempts,last_error from notification_outbox where company_id=$1 and dedupe_key='failed'",[id]);assert.equal(failed.rows[0].status,'failed');assert.equal(failed.rows[0].attempts,OUTBOX_MAX_ATTEMPTS)
  assert.equal((await processNotificationBatch({companyId:id,testOnly:true,transports})).claimed,0)
  const stopWorker=startNotificationWorker({companyId:id,testOnly:true,transports})
  try{
   await enqueueNotifications(id,[{channel:'email',to:'wake@example.invalid',subject:'Réveil',text:'Test',dedupeKey:'wake'}])
   let status='pending'
   for(let attempt=0;attempt<30;attempt++){
    const {rows}=await getPool().query("select status from notification_outbox where company_id=$1 and dedupe_key='wake'",[id]);status=rows[0]?.status
    if(status==='sent')break
    await new Promise(resolve=>setTimeout(resolve,30))
   }
   assert.equal(status,'sent','la mise en file réveille le worker sans attendre le cycle de secours')
  }finally{await stopWorker()}
  assert.equal((await notifyManagersByProcurementRole(outside,['technical_director'],'Périmètre test','Test',{notificationType:'task_assigned',managerIds:[id+'-sa']})).queued,0)
 }finally{
  await new Promise<void>(resolve=>server.close(()=>resolve()))
  await db.delete(notificationOutbox).where(eq(notificationOutbox.companyId,id));await db.delete(notificationOutbox).where(eq(notificationOutbox.companyId,outside))
  await db.delete(notifications).where(eq(notifications.companyId,id));await db.delete(notifications).where(eq(notifications.companyId,outside));await db.delete(purchaseOrders).where(eq(purchaseOrders.companyId,id));await db.delete(purchaseRequests).where(eq(purchaseRequests.companyId,id));await db.delete(suppliers).where(eq(suppliers.companyId,id));await db.delete(sites).where(eq(sites.companyId,id));await db.delete(managers).where(eq(managers.companyId,id));await db.delete(managers).where(eq(managers.companyId,outside));await db.delete(companies).where(eq(companies.id,id));await db.delete(companies).where(eq(companies.id,outside));await getPool().end()
  if(previous===undefined)delete process.env.NOTIFICATION_OUTBOX_TEST_MODE;else process.env.NOTIFICATION_OUTBOX_TEST_MODE=previous
 }
})

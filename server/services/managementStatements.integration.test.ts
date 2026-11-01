import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import express from 'express'
import bcrypt from 'bcryptjs'
import { eq } from 'drizzle-orm'
import { db, getPool } from '../db/index.js'
import { companies, managers, managementStatements, sites } from '../db/schema.js'
import { procurementRouter } from '../routes/procurement.js'
import { signManagerToken } from '../middleware/managerAuth.js'
import { saveManagementStatement } from './managementStatements.js'
import { todayDateString } from '../db/dailyReportQueries.js'

test('arrêté : droits, NIP, lecture périmée, versions immuables et concurrence', {skip:process.env.RUN_MANAGEMENT_STATEMENT_INTEGRATION!=='1'},async()=>{
 const id='test-statement-'+randomUUID(),month='2026-01'
 const app=express();app.use(express.json());app.use('/procurement',procurementRouter)
 const server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));const port=(server.address() as {port:number}).port
 const request=(role:string,path:string,method='GET',body?:object,company=id)=>fetch(`http://127.0.0.1:${port}/procurement/management-statements${path}`,{method,headers:{Authorization:'Bearer '+signManagerToken(id+'-'+role,`${role}@example.invalid`,company,role==='pdg'?'admin':'manager',role as 'daf'),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})})
 try{
  await getPool().query(readFileSync('server/db/migrations/20261024230000_management_statements/migration.sql','utf8'))
  await db.insert(companies).values({id,name:'Arrêté test',slug:id})
  for(const role of ['daf','pdg','accountant','purchasing'] as const)await db.insert(managers).values({id:id+'-'+role,companyId:id,email:`${id}-${role}@example.invalid`,name:'DAF <test>',passwordHash:await bcrypt.hash('2468',4),procurementRole:role})
  assert.equal((await request('purchasing',`?month=${month}`)).status,403)
  const read=await request('daf',`?month=${month}`);assert.equal(read.status,200,await read.clone().text());const live=await read.json()
  const body={month,pin:'2468',reviewed:true,sourceHash:live.sourceHash,comment:''}
  assert.equal((await request('pdg','','POST',body)).status,403)
  assert.equal((await request('accountant','','POST',body)).status,403)
  assert.equal((await request('daf','','POST',{...body,pin:'faux'})).status,403)
  assert.equal((await request('daf','','POST',{...body,sourceHash:'0'.repeat(64)})).status,409)
  assert.equal((await request('daf','','POST',{...body,month:todayDateString().slice(0,7)})).status,409)
  assert.equal((await request('daf','','POST',{...body,reviewed:false})).status,400)
  const saved=await request('daf','','POST',body);assert.equal(saved.status,201,await saved.clone().text());const first=(await saved.json()).statement
  const concurrent=await Promise.all([saveManagementStatement({companyId:id,month,managerId:id+'-daf',managerName:'DAF',comment:'',...live}),saveManagementStatement({companyId:id,month,managerId:id+'-daf',managerName:'DAF',comment:'',...live})])
  assert.deepEqual(concurrent.map(s=>s.id),[first.id,first.id])
  await db.insert(sites).values({id:id+'-site',companyId:id,name:'Nouveau chantier',address:'Test'})
  const updated=await(await request('daf',`?month=${month}`)).json()
  assert.notEqual(updated.sourceHash,live.sourceHash)
  assert.equal((await request('daf','','POST',{...body,sourceHash:updated.sourceHash})).status,400)
  const revised=await request('daf','','POST',{...body,sourceHash:updated.sourceHash,comment:'Contexte budgétaire actualisé'})
  assert.equal(revised.status,201,await revised.clone().text());assert.equal((await revised.json()).statement.version,2)
  const [old]=await db.select().from(managementStatements).where(eq(managementStatements.id,first.id));assert.equal(old.version,1);assert.deepEqual(old.snapshot.budgetsAtReading,[])
  assert.equal((await request('daf',`/${first.id}/html`,'GET',undefined,id+'-foreign')).status,404)
  const html=await request('pdg',`/${first.id}/html`);assert.equal(html.status,200);assert.match(await html.text(),/DAF &lt;test&gt;/)
 }finally{
  await new Promise<void>(resolve=>server.close(()=>resolve()))
  await db.delete(managementStatements).where(eq(managementStatements.companyId,id));await db.delete(sites).where(eq(sites.companyId,id));await db.delete(managers).where(eq(managers.companyId,id));await db.delete(companies).where(eq(companies.id,id));await getPool().end()
 }
})

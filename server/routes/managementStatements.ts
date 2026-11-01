import { rateLimitByIp } from '../middleware/rateLimit.js'
import { Router } from 'express'
import { z } from 'zod'
import { and,eq } from 'drizzle-orm'
import { requireExactProcurementRole, type ProcurementManagerRequest } from '../middleware/procurementAuth.js'
import { getManagerById } from '../db/queries.js'
import { verifySignaturePin } from '../services/ebSignature.js'
import { listManagementStatements, managementStatementHtml, readManagementSnapshot, saveManagementStatement } from '../services/managementStatements.js'
import { todayDateString } from '../db/dailyReportQueries.js'
import { db } from '../db/index.js'
import { managementStatements } from '../db/schema.js'
export const managementStatementsRouter=Router()
managementStatementsRouter.use(requireExactProcurementRole('daf','pdg','accountant'))
const monthSchema=z.string().regex(/^20\d{2}-(0[1-9]|1[0-2])$/)
managementStatementsRouter.get('/',async(req,res)=>{
 const month=monthSchema.safeParse(req.query.month)
 if(!month.success){res.status(400).json({message:'Mois invalide (AAAA-MM)'});return}
 const {manager}=req as unknown as ProcurementManagerRequest
 try{const [live,statements]=await Promise.all([readManagementSnapshot(manager.companyId,month.data),listManagementStatements(manager.companyId,month.data)]);res.json({...live,statements,readAt:new Date().toISOString()})}catch(err){console.error('[management statement]',err);res.status(500).json({message:'Lecture de l’arrêté impossible'})}
})
managementStatementsRouter.post('/',requireExactProcurementRole('daf'),rateLimitByIp(10,15*60_000,'management-statement-validate'),async(req,res)=>{
 const body=z.object({month:monthSchema,pin:z.string().min(1).max(128),sourceHash:z.string().regex(/^[a-f0-9]{64}$/),comment:z.string().trim().max(1000).default(''),reviewed:z.literal(true)}).strict().safeParse(req.body)
 if(!body.success){res.status(400).json({message:'Mois, NIP, contrôle du dossier et empreinte de lecture requis.'});return}
 if(body.data.month>=todayDateString().slice(0,7)){res.status(409).json({message:'Seuls les mois terminés peuvent être arrêtés.'});return}
 const {manager}=req as unknown as ProcurementManagerRequest
 try{
  const actor=await getManagerById(manager.sub)
  if(!actor||actor.companyId!==manager.companyId||!await verifySignaturePin({managerId:actor.id,passwordHash:actor.passwordHash,pin:body.data.pin})){res.status(403).json({message:'NIP incorrect'});return}
  const live=await readManagementSnapshot(manager.companyId,body.data.month)
  if(live.sourceHash!==body.data.sourceHash){res.status(409).json({message:'Les données ont changé depuis votre lecture. Actualisez puis vérifiez à nouveau.'});return}
  const statement=await saveManagementStatement({companyId:manager.companyId,month:body.data.month,managerId:actor.id,managerName:actor.name||actor.email,comment:body.data.comment,...live})
  res.status(201).json({statement})
 }catch(err){if(err instanceof Error&&err.message==='REVISION_REASON_REQUIRED'){res.status(400).json({message:'Un motif de révision de 10 caractères minimum est requis.'});return}console.error('[management statement save]',err);res.status(500).json({message:'Validation de l’arrêté impossible'})}
})
managementStatementsRouter.get('/:id/html',async(req,res)=>{
 const {manager}=req as unknown as ProcurementManagerRequest
 const [row]=await db.select().from(managementStatements).where(and(eq(managementStatements.id,String(req.params.id)),eq(managementStatements.companyId,manager.companyId)))
 if(!row){res.status(404).json({message:'Arrêté introuvable'});return}
 res.type('html').send(managementStatementHtml(row))
})

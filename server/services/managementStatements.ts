import { APP_TIMEZONE } from '../db/dailyReportQueries.js'
import { createHash, randomUUID } from 'node:crypto'
import { and, desc, eq, sql } from 'drizzle-orm'
import { db } from '../db/index.js'
import { managementStatements } from '../db/schema.js'
import { listDeliveredBcRegister, listSiteBudgets, listTreasuryPaymentHistory } from '../db/procurementQueries.js'
import { filterBcRegisterByMonth } from './bcRegister.js'
import { applyCompanyDocumentIdentity } from './companyDocumentIdentity.js'
import { withPrintBar } from '../lib/htmlPrint.js'
import { statementTotals, type ManagementSnapshot } from '../../shared/managementStatement.js'
export async function readManagementSnapshot(companyId:string,month:string) {
 const [rows,budgets,payments]=await Promise.all([listDeliveredBcRegister(companyId),listSiteBudgets(companyId),listTreasuryPaymentHistory(companyId)])
 const unique=new Map(filterBcRegisterByMonth(rows,month).map(row=>[row.purchaseOrderId,row]))
 const snapshot:ManagementSnapshot={month,paymentsInMonth:payments.filter(p=>p.paidAt.toLocaleDateString('sv-SE',{timeZone:APP_TIMEZONE}).slice(0,7)===month).map(p=>({id:p.paymentId,treasuryReference:p.treasuryReference,requestReference:p.requestReference,siteName:p.siteName??'Non renseigné',amountFcfa:Number(p.amountFcfa),paidAt:p.paidAt.toISOString(),method:p.method,transactionReference:p.transactionReference,invoiceFileName:p.invoiceFileName})).sort((a,b)=>a.id.localeCompare(b.id)),receivedOrders:[...unique.values()].map(r=>({id:r.purchaseOrderId,requestId:r.purchaseRequestId,reference:r.bon,date:r.date,siteName:r.siteName,supplierName:r.supplierName,amountFcfa:r.amountFcfa,invoice:r.invoice,invoicePaid:r.invoicePaid,invoiceTransmitted:r.invoiceTransmitted,invoiceFileName:r.invoiceFile?.fileName??null,verification:r.verification})).sort((a,b)=>a.id.localeCompare(b.id)),budgetsAtReading:budgets.map(b=>({siteId:b.siteId,siteName:b.siteName,budgetTotalFcfa:b.budgetTotalFcfa,engagedFcfa:b.engagedFcfa,realizedFcfa:b.realizedFcfa,remainingFcfa:b.remainingFcfa})).sort((a,b)=>a.siteId.localeCompare(b.siteId))}
 return {snapshot,sourceHash:createHash('sha256').update(JSON.stringify(snapshot)).digest('hex')}
}
export async function listManagementStatements(companyId:string,month:string) {
 return db.select().from(managementStatements).where(and(eq(managementStatements.companyId,companyId),eq(managementStatements.month,month))).orderBy(desc(managementStatements.version))
}
export async function saveManagementStatement(input:{companyId:string;month:string;managerId:string;managerName:string;comment:string;snapshot:ManagementSnapshot;sourceHash:string}) {
 return db.transaction(async tx=>{
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${input.companyId+'|statement|'+input.month}))`)
  const [last]=await tx.select().from(managementStatements).where(and(eq(managementStatements.companyId,input.companyId),eq(managementStatements.month,input.month))).orderBy(desc(managementStatements.version)).limit(1)
  if(last?.sourceHash===input.sourceHash)return last
  if(last&&input.comment.trim().length<10)throw new Error('REVISION_REASON_REQUIRED')
  const [saved]=await tx.insert(managementStatements).values({id:'stmt-'+randomUUID(),companyId:input.companyId,month:input.month,version:(last?.version??0)+1,snapshot:input.snapshot,sourceHash:input.sourceHash,validatedByManagerId:input.managerId,validatedByName:input.managerName,comment:input.comment.trim()}).returning()
  return saved
 })
}
const esc=(v:unknown)=>String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
export function managementStatementHtml(row:typeof managementStatements.$inferSelect) {
 const totals=statementTotals(row.snapshot)
 const money=(v:number)=>new Intl.NumberFormat('fr-FR').format(v)+' FCFA'
 return withPrintBar(applyCompanyDocumentIdentity(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Arrêté ${esc(row.month)} v${row.version}</title><style>body{font:12px Arial;color:#253142;margin:24px}.sheet{max-width:1000px;margin:auto}table{width:100%;border-collapse:collapse}td,th{padding:8px;border:1px solid #ddd;text-align:left}p{line-height:1.7}@media print{@page{size:A4 landscape;margin:12mm}body{margin:0}}</style></head><body><main class="sheet"><h1>Arrêté mensuel de gestion — ${esc(row.month)} · version ${row.version}</h1><p>Validé par ${esc(row.validatedByName)} le ${esc(row.validatedAt.toISOString())}. ${esc(row.comment)}</p><p>Lecture enregistrée à la validation. Registre des BC réceptionnés rattachés au mois de réception ; paiements et justificatifs dans leur état à la lecture. Ce document ne reconstitue pas l’état du dernier jour du mois et ne constitue pas une clôture comptable.</p><p>${totals.count} BC · Réceptionné : ${esc(money(totals.receivedAmount))} · Factures transmises non marquées payées : ${esc(money(totals.unpaidAmount))} · ${totals.missingInvoices} BC à compléter côté facture.</p><table><thead><tr><th>BC / réception</th><th>Chantier</th><th>Fournisseur</th><th>Montant du registre</th><th>Facture</th><th>Paiement à la lecture</th></tr></thead><tbody>${row.snapshot.receivedOrders.map(r=>`<tr><td>${esc(r.reference)}<br>${esc(r.date)}</td><td>${esc(r.siteName)}</td><td>${esc(r.supplierName)}</td><td>${esc(money(r.amountFcfa))}</td><td>${esc(r.invoice||'Non renseignée')}<br>${esc(r.invoiceFileName||'Pièce non jointe')}</td><td>${r.invoicePaid?'Payé':r.invoiceTransmitted?'À payer':'Non transmise'}</td></tr>`).join('')}</tbody></table><h2>Paiements enregistrés dans le mois</h2><p>${totals.paidCount} paiement(s) · ${esc(money(totals.paidAmount))}. Rattachement par date de paiement, selon le fuseau métier. Ne pas additionner ce total aux réceptions.</p><table><tr><th>BT / EB</th><th>Chantier</th><th>Date de paiement</th><th>Montant payé</th><th>Mode / transaction</th></tr>${(row.snapshot.paymentsInMonth??[]).map(p=>`<tr><td>${esc(p.treasuryReference)} / ${esc(p.requestReference)}</td><td>${esc(p.siteName)}</td><td>${esc(p.paidAt)}</td><td>${esc(money(p.amountFcfa))}</td><td>${esc(p.method)} ${esc(p.transactionReference)}</td></tr>`).join('')}</table><h2>Budgets cumulés à la date de lecture — hors total mensuel</h2><table><tr><th>Chantier</th><th>Enveloppe</th><th>Engagé</th><th>Réalisé</th></tr>${row.snapshot.budgetsAtReading.map(b=>`<tr><td>${esc(b.siteName)}</td><td>${b.budgetTotalFcfa==null?'Non renseignée':esc(money(b.budgetTotalFcfa))}</td><td>${esc(money(b.engagedFcfa))}</td><td>${esc(money(b.realizedFcfa))}</td></tr>`).join('')}</table></main></body></html>`,row.companyId))
}

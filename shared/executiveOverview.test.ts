import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildExecutiveOverview } from './executiveOverview.js'
const now = Date.parse('2026-10-24T12:00:00Z')
test('pilotage : budget inconnu distinct de zéro et dépassements prioritaires', () => {
 const result=buildExecutiveOverview([
 {siteId:'a',siteName:'A',budgetTotalFcfa:null,engagedFcfa:200,realizedFcfa:100,remainingFcfa:null},
 {siteId:'b',siteName:'B',budgetTotalFcfa:1000,engagedFcfa:1200,realizedFcfa:900,remainingFcfa:-200},
 {siteId:'c',siteName:'C',budgetTotalFcfa:1000,engagedFcfa:900,realizedFcfa:500,remainingFcfa:100},
 ],[],[],'daf',now)
 assert.equal(result.knownBudget,2000);assert.equal(result.engaged,2300);assert.equal(result.realized,1500)
 assert.equal(result.budgetedSites,2);assert.equal(result.alerts.length,3);assert.equal(result.alerts[0].siteId,'b');assert.equal(result.alerts[0].severity,'alert')
 assert.equal(buildExecutiveOverview([],[],[],'daf',now).knownBudget,null)
})
test('pilotage : file propre au rôle, ancienneté expliquée et factures dédupliquées', () => {
 const request={id:'r',reference:'EB-1',status:'daf_review',updatedAt:'2026-10-10T12:00:00Z',urgency:'urgent'}
 const invoice={purchaseOrderId:'bc',purchaseRequestId:'r',bon:'BC-1',invoice:'F-1',siteName:'A',amountFcfa:200,invoiceTransmitted:true,invoicePaid:false}
 const result=buildExecutiveOverview([], [request,{...request,id:'paid',status:'delivered'},{...request,id:'bad',status:'pdg_review',updatedAt:'invalide'}],[invoice,invoice,{...invoice,purchaseOrderId:'paid',invoicePaid:true},{...invoice,purchaseOrderId:'draft',invoiceTransmitted:false}],'daf',now)
 assert.equal(result.pending.length,1);assert.equal(result.unpaidAmount,200);assert.equal(result.unpaid.length,1)
 assert.equal(result.alerts.length,2);assert.ok(result.alerts.some(a=>a.id==='idle-r'));assert.ok(result.alerts.some(a=>a.id==='urgent-r'))
 const pdg=buildExecutiveOverview([],[request],[],'pdg',now);assert.equal(pdg.pending.length,0)
})

test('pilotage DAF : la validation des BT fait partie de ses décisions', () => {
 const requests=[{id:'bt',reference:'EB-BT',status:'daf_bt_review',updatedAt:'2026-10-24T11:00:00Z'}]
 assert.equal(buildExecutiveOverview([],requests,[],'daf',now).pending.length,1)
 assert.equal(buildExecutiveOverview([],requests,[],'pdg',now).pending.length,0)
})

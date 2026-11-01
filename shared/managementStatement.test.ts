import { test } from 'node:test'
import assert from 'node:assert/strict'
import { compareStatement, statementTotals, type ManagementSnapshot } from './managementStatement.js'
test('arrêté : totaux du registre, ajouts/retraits/modifications et budgets séparés',()=>{
 const row={id:'a',requestId:'r',reference:'BC-A',date:'01/01/2026',siteName:'A',supplierName:'F',amountFcfa:100,invoice:'F-1',invoicePaid:false,invoiceTransmitted:true,invoiceFileName:null,verification:''}
 const old:ManagementSnapshot={month:'2026-01',receivedOrders:[row,{...row,id:'b',invoicePaid:true}],budgetsAtReading:[]}
 assert.deepEqual(statementTotals(old),{paidCount:0,paidAmount:0,count:2,receivedAmount:200,unpaidCount:1,unpaidAmount:100,missingInvoices:2})
 const current={...old,receivedOrders:[{...row,invoicePaid:true},{...row,id:'c'}]}
 assert.deepEqual(compareStatement(old,current),{paymentChanges:0,added:1,removed:1,changed:1})
 assert.equal(old.receivedOrders[0].invoicePaid,false)
})

test('arrêté : les paiements restent une lecture distincte des réceptions',()=>{
 const snapshot:ManagementSnapshot={month:'2026-01',receivedOrders:[],budgetsAtReading:[],paymentsInMonth:[{id:'p',treasuryReference:'BT-1',requestReference:'EB-1',siteName:'A',amountFcfa:300,paidAt:'2026-01-10T12:00:00Z',method:'cash',transactionReference:null,invoiceFileName:'facture.pdf'}]}
 assert.equal(statementTotals(snapshot).paidAmount,300)
 assert.equal(statementTotals(snapshot).receivedAmount,0)
 assert.equal(compareStatement(snapshot,{...snapshot,paymentsInMonth:[]}).paymentChanges,1)
})

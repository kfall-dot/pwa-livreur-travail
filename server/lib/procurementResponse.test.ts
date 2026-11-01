import {test} from 'node:test'
import assert from 'node:assert/strict'
import {stripStoredDocumentHtml} from './procurementResponse.js'
test('JSON achats : les documents restent sur leurs endpoints et ne gonflent plus les dossiers',()=>{
 const date=new Date('2026-10-25T10:00:00Z')
 const input={request:{id:'r'},purchaseOrder:{id:'bc',pdfHtml:'<html>'+ 'x'.repeat(500000)+'</html>',createdAt:date},treasuryOrders:[{id:'bt',pdfHtml:'document',amount:100}],html:'un autre champ conservé'}
 const output=stripStoredDocumentHtml(input) as typeof input
 assert.equal(output.purchaseOrder.id,'bc');assert.equal(output.purchaseOrder.createdAt,date)
 assert.equal(output.purchaseOrder.pdfHtml,undefined);assert.equal(output.treasuryOrders[0].pdfHtml,undefined)
 assert.equal(output.html,input.html);assert.ok(input.purchaseOrder.pdfHtml)
 assert.ok(JSON.stringify(output).length<JSON.stringify(input).length/100)
})

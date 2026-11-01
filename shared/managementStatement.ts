export type ManagementSnapshot = {
 month: string
 paymentsInMonth?: Array<{ id: string; treasuryReference: string; requestReference: string; siteName: string; amountFcfa: number; paidAt: string; method: string; transactionReference: string | null; invoiceFileName: string | null }>
 receivedOrders: Array<{ id: string; requestId: string; reference: string; date: string; siteName: string; supplierName: string; amountFcfa: number; invoice: string; invoicePaid: boolean; invoiceTransmitted: boolean; invoiceFileName: string | null; verification: string }>
 budgetsAtReading: Array<{ siteId: string; siteName: string; budgetTotalFcfa: number | null; engagedFcfa: number; realizedFcfa: number; remainingFcfa: number | null }>
}
export type ManagementStatement = { id: string; month: string; version: number; snapshot: ManagementSnapshot; sourceHash: string; validatedByName: string; validatedAt: string; comment: string }
export function statementTotals(snapshot: ManagementSnapshot) {
 return { paidCount:(snapshot.paymentsInMonth??[]).length, paidAmount:(snapshot.paymentsInMonth??[]).reduce((s,r)=>s+r.amountFcfa,0), count: snapshot.receivedOrders.length, receivedAmount: snapshot.receivedOrders.reduce((s,r)=>s+r.amountFcfa,0), unpaidCount:snapshot.receivedOrders.filter(r=>r.invoiceTransmitted&&!r.invoicePaid).length, unpaidAmount:snapshot.receivedOrders.filter(r=>r.invoiceTransmitted&&!r.invoicePaid).reduce((s,r)=>s+r.amountFcfa,0),missingInvoices:snapshot.receivedOrders.filter(r=>!r.invoice||!r.invoiceFileName).length }
}
export function compareStatement(saved: ManagementSnapshot, current: ManagementSnapshot) {
 const old=new Map(saved.receivedOrders.map(r=>[r.id,r])), next=new Map(current.receivedOrders.map(r=>[r.id,r]))
 const oldPayments=new Map((saved.paymentsInMonth??[]).map(r=>[r.id,r])),nextPayments=new Map((current.paymentsInMonth??[]).map(r=>[r.id,r]))
 return { paymentChanges:[...new Set([...oldPayments.keys(),...nextPayments.keys()])].filter(id=>JSON.stringify(oldPayments.get(id))!==JSON.stringify(nextPayments.get(id))).length, added:[...next.keys()].filter(id=>!old.has(id)).length, removed:[...old.keys()].filter(id=>!next.has(id)).length, changed:[...next].filter(([id,row])=>old.has(id)&&JSON.stringify(old.get(id))!==JSON.stringify(row)).length }
}

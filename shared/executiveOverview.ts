export type OverviewBudget = { siteId: string; siteName: string; budgetTotalFcfa: number | null; engagedFcfa: number; realizedFcfa: number; remainingFcfa: number | null }
export type OverviewRequest = { id: string; reference: string; siteName?: string | null; status: string; urgency?: string | null; totalAmountFcfa?: number | null; updatedAt: string }
export type OverviewInvoice = { purchaseOrderId: string; purchaseRequestId: string; bon: string; invoice: string; siteName: string; amountFcfa: number; invoiceTransmitted: boolean; invoicePaid: boolean }
export type OverviewAlert = { id: string; severity: 'alert' | 'watch'; title: string; detail: string; requestId?: string; siteId?: string }
export const OVERVIEW_RULES = { budgetWatchPct: 90, inactivityDays: 7 }
const reviewStatuses = new Set(['dt_review', 'sa_review', 'submitted', 'daf_bt_review', 'correction_required', 'correction_head_review', 'sa_head_review', 'bc_head_review', 'cdg_review', 'daf_review', 'pdg_review'])
export function buildExecutiveOverview(budgets: OverviewBudget[], requests: OverviewRequest[], invoices: OverviewInvoice[], role: 'daf' | 'pdg', now = Date.now()) {
  const alerts: OverviewAlert[] = []
  let knownBudget = 0, budgetedSites = 0, engaged = 0, realized = 0
  for (const site of budgets) {
    engaged += site.engagedFcfa
    realized += site.realizedFcfa
    if (site.budgetTotalFcfa == null || site.budgetTotalFcfa <= 0) {
      if (site.engagedFcfa > 0 || site.realizedFcfa > 0) alerts.push({ id: `budget-missing-${site.siteId}`, severity: 'watch', title: `${site.siteName} : enveloppe non renseignée`, detail: 'Des dépenses sont enregistrées, mais leur couverture budgétaire ne peut pas être évaluée.', siteId: site.siteId })
      continue
    }
    knownBudget += site.budgetTotalFcfa; budgetedSites++
    const ratio = site.engagedFcfa / site.budgetTotalFcfa * 100
    if (ratio >= OVERVIEW_RULES.budgetWatchPct) alerts.push({ id: `budget-${site.siteId}`, severity: ratio > 100 ? 'alert' : 'watch', title: `${site.siteName} : ${ratio > 100 ? 'enveloppe dépassée' : 'enveloppe proche de sa limite'}`, detail: `${Math.round(ratio)} % de l’enveloppe engagé. Seuil indicatif : ${OVERVIEW_RULES.budgetWatchPct} %.`, siteId: site.siteId })
  }
  const isPending = (status: string) => status === `${role}_review` || (role === 'daf' && status === 'daf_bt_review')
  const pending = requests.filter(row => isPending(row.status))
  for (const row of requests) {
    if (!reviewStatuses.has(row.status)) continue
    const stamp = Date.parse(row.updatedAt)
    const days = Number.isFinite(stamp) ? Math.max(0, Math.floor((now - stamp) / 86400000)) : null
    if (days != null && days >= OVERVIEW_RULES.inactivityDays) alerts.push({ id: `idle-${row.id}`, severity: 'watch', title: `${row.reference} : sans mise à jour depuis ${days} jours`, detail: 'Dossier en préparation ou validation. Ancienneté calculée depuis la dernière modification ; ce n’est pas un délai contractuel.', requestId: row.id })
    if (row.urgency === 'urgent' && isPending(row.status)) alerts.push({ id: `urgent-${row.id}`, severity: 'watch', title: `${row.reference} : demande urgente à examiner`, detail: row.siteName ?? 'Chantier non renseigné', requestId: row.id })
  }
  // Le registre peut contenir plusieurs arrêts pour un BC ; ne pas compter deux fois une facture.
  const unique = new Map(invoices.map(row => [row.purchaseOrderId, row]))
  const unpaid = [...unique.values()].filter(row => row.invoiceTransmitted && !row.invoicePaid)
  alerts.sort((a, b) => Number(b.severity === 'alert') - Number(a.severity === 'alert') || a.title.localeCompare(b.title, 'fr'))
  return { knownBudget: budgetedSites ? knownBudget : null, budgetedSites, siteCount: budgets.length, engaged, realized, pending, unpaid, unpaidAmount: unpaid.reduce((sum, row) => sum + row.amountFcfa, 0), alerts }
}

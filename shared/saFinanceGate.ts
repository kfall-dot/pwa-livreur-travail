/** Contrôle SA avant envoi CdG : PU, fournisseur, mode de paiement et PJ par ligne. */

export type SaFinanceLine = {
  label?: string | null
  unitPriceFcfa?: string | number | null
  supplierName?: string | null
  paymentMode?: string | null
  attachmentFileName?: string | null
  attachmentBlobKey?: string | null
}

export const SA_FINANCE_REQUIRED_MESSAGE =
  'Fournisseur, mode de paiement et pièce jointe sont obligatoires sur chaque ligne.'

export function isComptantPayment(mode?: string | null): boolean {
  const n = (mode ?? '').trim().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  return n === 'COMPTANT' || n === 'ESPECE' || n === 'ESPECES'
}

export function hasComptantLines(lines: Array<{ paymentMode?: string | null; label?: string | null }>): boolean {
  return lines.some((l) => (l.label ?? '').trim() && isComptantPayment(l.paymentMode))
}

export function saFinanceIncompleteMessage(lines: SaFinanceLine[]): string | null {
  const priced = lines.filter((l) => (l.label ?? '').trim())
  if (priced.length === 0) return 'Aucune ligne à chiffrer'
  if (priced.some((l) => Number(l.unitPriceFcfa ?? 0) <= 0)) {
    return 'Saisissez le prix unitaire de chaque produit'
  }
  const incomplete = priced.some(
    (l) =>
      !(l.supplierName ?? '').trim() ||
      !(l.paymentMode ?? '').trim() ||
      (!(l.attachmentFileName ?? '').trim() && !(l.attachmentBlobKey ?? '').trim()),
  )
  if (incomplete) return SA_FINANCE_REQUIRED_MESSAGE
  return null
}

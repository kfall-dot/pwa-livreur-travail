import { DEFAULT_BT_THRESHOLD_FCFA } from '../config/procurement.js'

/** Montant ligne = prix unitaire × quantité, arrondi à l’unité XOF. */
export function lineAmountFcfa(unitPriceFcfa: number, quantity: number): number {
  if (!Number.isFinite(unitPriceFcfa) || !Number.isFinite(quantity) || quantity < 0) return 0
  return Math.round(Math.max(0, unitPriceFcfa) * quantity)
}

export function sumLineAmountsFcfa(
  lines: Array<{ unitPriceFcfa?: number | string | null; amountFcfa?: number | string | null; quantity?: number | string | null }>,
): number {
  return lines.reduce((sum, line) => {
    const qty = Number(line.quantity ?? 0)
    const pu = Number(line.unitPriceFcfa ?? 0)
    const stored = Number(line.amountFcfa ?? 0)
    const amount = pu > 0 ? lineAmountFcfa(pu, qty) : stored
    return sum + (Number.isFinite(amount) ? amount : 0)
  }, 0)
}

/** Seuil inclus : ≥ 500 000 XOF → DAF + PDG ; sinon DAF seul. */
export function needsPdgApproval(
  totalAmountFcfa: number,
  thresholdFcfa: number = DEFAULT_BT_THRESHOLD_FCFA,
): boolean {
  return Number.isFinite(totalAmountFcfa) && totalAmountFcfa >= thresholdFcfa
}

export function unitPriceFromAmount(amountFcfa: number, quantity: number): number {
  if (!Number.isFinite(amountFcfa) || !Number.isFinite(quantity) || quantity <= 0) return 0
  return Math.round((amountFcfa / quantity) * 100) / 100
}

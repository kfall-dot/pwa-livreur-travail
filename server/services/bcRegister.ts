/** Lignes du registre « POINTS FOURNISSEURS DES BC » après livraison confirmée. */

import { isComptantPayment } from '../../shared/saFinanceGate.js'

export type BcRegisterLine = {
  label: string
  quantity: number
  unit: string
  unitPriceFcfa: number
  paymentMode?: string | null
  attachmentFileName?: string | null
  spendCategory?: string | null
}

export type BcRegisterDeclaration = {
  outcome?: string | null
  lines?: unknown
  declaredAt?: Date | string | null
} | null

export type DeclaredQty = {
  productLabel: string
  unit: string
  quantityAccepted: number
}

export function parseDeclaredQuantities(declaration: BcRegisterDeclaration): DeclaredQty[] {
  if (!Array.isArray(declaration?.lines)) return []
  return declaration.lines.flatMap((raw) => {
    if (!raw || typeof raw !== 'object') return []
    const rec = raw as {
      productLabel?: unknown
      unit?: unknown
      quantityAccepted?: unknown
    }
    const productLabel = String(rec.productLabel ?? '').trim()
    const quantityAccepted = Number(rec.quantityAccepted ?? 0)
    if (!productLabel || !Number.isFinite(quantityAccepted) || quantityAccepted <= 0) return []
    return [{ productLabel, unit: String(rec.unit ?? '').trim() || 'unité', quantityAccepted }]
  })
}

export function paymentModeFromLines(lines: BcRegisterLine[]): string {
  const modes = [
    ...new Set(
      lines
        .map((l) => (l.paymentMode ?? '').trim().toUpperCase())
        .filter(Boolean),
    ),
  ]
  return modes[0] ?? '—'
}

export function formatBcRegisterQuantities(
  lines: Array<{ label: string; quantity: number; unit: string }>,
): string {
  const parts = lines
    .filter((l) => l.label.trim() && Number(l.quantity) > 0)
    .map((l) => `${Number(l.quantity)} ${l.unit} ${l.label}`.trim())
  return parts.join(', ') || '—'
}

export function quantitiesFromDelivery(
  ebLines: BcRegisterLine[],
  declaration: BcRegisterDeclaration,
): string {
  const declared = parseDeclaredQuantities(declaration)
  if (declared.length > 0) {
    return formatBcRegisterQuantities(
      declared.map((d) => ({ label: d.productLabel, quantity: d.quantityAccepted, unit: d.unit })),
    )
  }
  return formatBcRegisterQuantities(
    ebLines.map((l) => ({ label: l.label, quantity: l.quantity, unit: l.unit })),
  )
}

export function deliveredAmountFcfa(
  poAmountFcfa: number,
  lines: BcRegisterLine[],
  declaration: BcRegisterDeclaration,
): number {
  const declared = parseDeclaredQuantities(declaration)
  if (declaration?.outcome === 'partial' && declared.length > 0) {
    return declared.reduce((sum, d) => {
      const match = lines.find(
        (l) => l.label.trim().toLowerCase() === d.productLabel.trim().toLowerCase(),
      )
      return sum + d.quantityAccepted * (match?.unitPriceFcfa ?? 0)
    }, 0)
  }
  return poAmountFcfa
}

export function formatBcRegisterAmount(amountFcfa: number): string {
  return Math.round(amountFcfa).toLocaleString('fr-FR')
}

export function bcRegisterInvoice(paymentMode: string): string {
  return isComptantPayment(paymentMode) ? 'N/A' : 'reçu'
}

export function bcRegisterAttachments(lines: BcRegisterLine[]): string {
  const names = [...new Set(lines.map((l) => (l.attachmentFileName ?? '').trim()).filter(Boolean))]
  return names.join(', ') || '—'
}

export function bcRegisterDate(
  declaration: BcRegisterDeclaration,
  tourDate?: string | null,
): string {
  if (declaration?.declaredAt) {
    return new Date(declaration.declaredAt).toLocaleDateString('fr-FR')
  }
  if (tourDate) {
    const [y, m, d] = tourDate.split('-')
    if (y && m && d) return `${d}/${m}/${y}`
  }
  return '—'
}

const FR_MONTHS = [
  'JANVIER',
  'FÉVRIER',
  'MARS',
  'AVRIL',
  'MAI',
  'JUIN',
  'JUILLET',
  'AOÛT',
  'SEPTEMBRE',
  'OCTOBRE',
  'NOVEMBRE',
  'DÉCEMBRE',
] as const

export type BcRegisterMonth = { key: string; label: string }

export type BcRegisterAttachment = {
  lineId: string
  fileName: string
}

export type BcRegisterRecapLine = {
  date: string
  bon: string
  amountFcfa: number
  amountLabel: string
  siteName: string
  observation: string
}

export type BcRegisterRecapGroup = {
  supplierName: string
  totalFcfa: number
  totalLabel: string
  rows: BcRegisterRecapLine[]
}

/** @deprecated alias — même forme que BcRegisterRecapGroup pour l’ancien recap agrégé */
export type BcRegisterRecapRow = BcRegisterRecapGroup & {
  date: string
  bon: string
  amountFcfa: number
  amountLabel: string
  sites: string
  observation: string
}

type MonthableRow = {
  date: string
  supplierName: string
  bon: string
  paymentMode: string
  amountFcfa: number
  amountLabel: string
  siteName: string
  observation?: string
}

export function monthKeyFromFrDate(date: string): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(date.trim())
  if (!m) return null
  return `${m[3]}-${m[2]}`
}

export function frenchMonthSheetLabel(monthKey: string): string {
  const mm = Number(monthKey.slice(5, 7))
  if (!Number.isInteger(mm) || mm < 1 || mm > 12) return monthKey
  return FR_MONTHS[mm - 1]!
}

export function availableBcRegisterMonths(rows: Array<{ date: string }>): BcRegisterMonth[] {
  const keys = [...new Set(rows.map((r) => monthKeyFromFrDate(r.date)).filter((k): k is string => Boolean(k)))]
  keys.sort((a, b) => b.localeCompare(a))
  return keys.map((key) => ({ key, label: frenchMonthSheetLabel(key) }))
}

export function filterBcRegisterByMonth<T extends { date: string }>(rows: T[], monthKey: string): T[] {
  return rows.filter((r) => monthKeyFromFrDate(r.date) === monthKey)
}

export function recapBySupplier(rows: MonthableRow[]): BcRegisterRecapGroup[] {
  const groups = new Map<string, MonthableRow[]>()
  for (const row of rows) {
    const key = row.supplierName.trim().toLowerCase() || '—'
    const list = groups.get(key) ?? []
    list.push(row)
    groups.set(key, list)
  }
  return [...groups.values()].map((list) => {
    const totalFcfa = list.reduce((s, r) => s + r.amountFcfa, 0)
    return {
      supplierName: list[0]!.supplierName,
      totalFcfa,
      totalLabel: formatBcRegisterAmount(totalFcfa),
      rows: list.map((r) => ({
        date: r.date,
        bon: r.bon,
        amountFcfa: r.amountFcfa,
        amountLabel: formatBcRegisterAmount(r.amountFcfa),
        siteName: r.siteName,
        observation: (r.observation ?? '').trim() || 'RAS',
      })),
    }
  })
}

/** Recap crédit uniquement (feuille Excel historique). */
export function recapCreditBySupplier(rows: MonthableRow[]): BcRegisterRecapGroup[] {
  return recapBySupplier(rows.filter((r) => /CR[EÉ]DIT/i.test(r.paymentMode)))
}

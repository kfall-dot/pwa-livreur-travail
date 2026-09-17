/** Indicateurs CdG type Koestrem — réalisé = livraisons confirmées, pas l’engagé BC. */

import { deliveredAmountFcfa, parseDeclaredQuantities, type BcRegisterDeclaration, type BcRegisterLine } from './bcRegister.js'
import { roundPct } from './siteBudget.js'
import {
  DEFAULT_EB_SPEND_CATEGORY,
  ebSpendCategoryLabel,
  isMaterialsSpendCategory,
  normalizeEbSpendCategory,
  type EbSpendCategory,
} from '../../shared/ebSpendCategory.js'

export type IndicatorProduct = {
  label: string
  amountFcfa: number
  shareOfInitialPct: number | null
  category?: EbSpendCategory
}

export type IndicatorCategory = {
  category: EbSpendCategory
  label: string
  amountFcfa: number
  shareOfBudgetPct: number | null
}

export type DeliveryExpenseEvent = {
  date: string
  amountFcfa: number
  products: Array<{ label: string; amountFcfa: number; category?: string | null }>
}

export type IndicatorDay = {
  date: string
  realizedFcfa: number
  varianceFcfa: number | null
  materialsFcfa: number
  materialsSharePct: number | null
  byCategory: IndicatorCategory[]
  top3: IndicatorProduct[]
}

export type SiteIndicatorsSnapshot = {
  asOf: string
  firstExpenseOn: string | null
  budgetInitialFcfa: number | null
  budgetTotalFcfa: number | null
  realizedFcfa: number
  realizedPct: number | null
  varianceFcfa: number | null
  variancePct: number | null
  materialsFcfa: number
  materialsSharePct: number | null
  top3: IndicatorProduct[]
  byCategory: IndicatorCategory[]
  daily: IndicatorDay[]
}

export function todayIsoLocal(now = new Date()): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function expenseDateIso(
  tourDate?: string | null,
  declaredAt?: Date | string | null,
): string | null {
  const tour = (tourDate ?? '').trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(tour)) return tour
  if (!declaredAt) return null
  const d = declaredAt instanceof Date ? declaredAt : new Date(declaredAt)
  if (!Number.isFinite(d.getTime())) return null
  return todayIsoLocal(d)
}

function parseUtcDay(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number)
  return Date.UTC(y, (m ?? 1) - 1, d ?? 1)
}

export function isoDaysInclusive(from: string, to: string): string[] {
  const start = parseUtcDay(from)
  const end = parseUtcDay(to)
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end) return []
  const out: string[] = []
  for (let t = start; t <= end; t += 86_400_000) {
    const d = new Date(t)
    out.push(
      `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`,
    )
  }
  return out
}

export function productAmountsFromDelivery(
  lines: BcRegisterLine[],
  declaration: BcRegisterDeclaration,
  realizedFcfa: number,
): Array<{ label: string; amountFcfa: number; category: EbSpendCategory }> {
  const declared = parseDeclaredQuantities(declaration)
  const raw: Array<{ label: string; amountFcfa: number; category?: string | null }> = []
  if (declaration?.outcome === 'partial' && declared.length > 0) {
    for (const d of declared) {
      const match = lines.find((l) => l.label.trim().toLowerCase() === d.productLabel.trim().toLowerCase())
      raw.push({
        label: d.productLabel.trim(),
        amountFcfa: d.quantityAccepted * (match?.unitPriceFcfa ?? 0),
        category: normalizeEbSpendCategory(match?.spendCategory),
      })
    }
  } else if (lines.length > 0) {
    for (const l of lines) {
      const label = l.label.trim()
      if (!label) continue
      raw.push({
        label,
        amountFcfa: Number(l.quantity) * Number(l.unitPriceFcfa ?? 0),
        category: normalizeEbSpendCategory(l.spendCategory),
      })
    }
  }
  const merged = mergeProductAmounts(raw)
  const sum = merged.reduce((s, p) => s + p.amountFcfa, 0)
  if (sum <= 0) {
    return realizedFcfa > 0
      ? [{ label: 'Livraison', amountFcfa: Math.round(realizedFcfa), category: DEFAULT_EB_SPEND_CATEGORY }]
      : []
  }
  return merged.map((p) => ({
    label: p.label,
    amountFcfa: Math.round(p.amountFcfa * (realizedFcfa / sum)),
    category: normalizeEbSpendCategory(p.category),
  }))
}

export function mergeProductAmounts(
  products: Array<{ label: string; amountFcfa: number; category?: string | null }>,
): Array<{ label: string; amountFcfa: number; category: EbSpendCategory }> {
  const map = new Map<string, { label: string; amountFcfa: number; category: EbSpendCategory }>()
  for (const p of products) {
    const label = p.label.trim()
    if (!label) continue
    const category = normalizeEbSpendCategory(p.category)
    const key = `${category}|${label.toLowerCase()}`
    const prev = map.get(key)
    if (prev) prev.amountFcfa += p.amountFcfa
    else map.set(key, { label, amountFcfa: p.amountFcfa, category })
  }
  return [...map.values()]
}

function shareOfBudget(amount: number, budgetFcfa: number | null): number | null {
  if (budgetFcfa == null || budgetFcfa <= 0) return null
  return roundPct((amount / budgetFcfa) * 100)
}

export function rankCategories(
  totals: Map<EbSpendCategory, number>,
  budgetTotalFcfa: number | null,
): IndicatorCategory[] {
  return [...totals.entries()]
    .filter(([, amount]) => amount > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([category, amountFcfa]) => ({
      category,
      label: ebSpendCategoryLabel(category),
      amountFcfa: Math.round(amountFcfa),
      shareOfBudgetPct: shareOfBudget(amountFcfa, budgetTotalFcfa),
    }))
}

export function rankTopMaterialPosts(
  totals: Map<EbSpendCategory, number>,
  budgetInitialFcfa: number | null,
  topN = 3,
): IndicatorProduct[] {
  return [...totals.entries()]
    .filter(([category, amount]) => amount > 0 && isMaterialsSpendCategory(category))
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, topN)
    .map(([category, amountFcfa]) => ({
      label: ebSpendCategoryLabel(category),
      amountFcfa: Math.round(amountFcfa),
      category,
      shareOfInitialPct:
        budgetInitialFcfa != null && budgetInitialFcfa > 0
          ? roundPct((amountFcfa / budgetInitialFcfa) * 100)
          : null,
    }))
}

export function rankTopProducts(
  totals: Map<string, { label: string; amountFcfa: number; category?: EbSpendCategory }>,
  budgetInitialFcfa: number | null,
  topN = 3,
): IndicatorProduct[] {
  const byPost = new Map<EbSpendCategory, number>()
  for (const p of totals.values()) {
    if (p.amountFcfa <= 0) continue
    const category = normalizeEbSpendCategory(p.category)
    if (!isMaterialsSpendCategory(category)) continue
    byPost.set(category, (byPost.get(category) ?? 0) + p.amountFcfa)
  }
  return rankTopMaterialPosts(byPost, budgetInitialFcfa, topN)
}

export function buildSiteIndicators(input: {
  asOf: string
  budgetInitialFcfa: number | null
  budgetTotalFcfa: number | null
  events: DeliveryExpenseEvent[]
}): SiteIndicatorsSnapshot {
  const events = [...input.events]
    .filter((e) => /^\d{4}-\d{2}-\d{2}$/.test(e.date) && e.date <= input.asOf)
    .sort((a, b) => a.date.localeCompare(b.date))

  const firstExpenseOn = events[0]?.date ?? null
  const days = firstExpenseOn ? isoDaysInclusive(firstExpenseOn, input.asOf) : []
  const byDate = new Map<string, DeliveryExpenseEvent[]>()
  for (const e of events) {
    const list = byDate.get(e.date) ?? []
    list.push(e)
    byDate.set(e.date, list)
  }

  const runningCategories = new Map<EbSpendCategory, number>()
  let realized = 0
  const daily: IndicatorDay[] = []

  for (const date of days) {
    for (const e of byDate.get(date) ?? []) {
      realized += e.amountFcfa
      for (const p of mergeProductAmounts(e.products)) {
        runningCategories.set(p.category, (runningCategories.get(p.category) ?? 0) + p.amountFcfa)
      }
    }
    const materialsFcfa = Math.round(
      [...runningCategories.entries()].reduce(
        (sum, [category, amount]) => (isMaterialsSpendCategory(category) ? sum + amount : sum),
        0,
      ),
    )
    const varianceFcfa = input.budgetTotalFcfa == null ? null : realized - input.budgetTotalFcfa
    daily.push({
      date,
      realizedFcfa: Math.round(realized),
      varianceFcfa,
      materialsFcfa,
      materialsSharePct: shareOfBudget(materialsFcfa, input.budgetTotalFcfa),
      byCategory: rankCategories(runningCategories, input.budgetTotalFcfa),
      top3: rankTopMaterialPosts(runningCategories, input.budgetInitialFcfa),
    })
  }

  const last = daily[daily.length - 1]
  const realizedFcfa = last?.realizedFcfa ?? 0
  const varianceFcfa = last?.varianceFcfa ?? (input.budgetTotalFcfa == null ? null : 0 - input.budgetTotalFcfa)
  const realizedPct =
    input.budgetTotalFcfa != null && input.budgetTotalFcfa > 0
      ? roundPct((realizedFcfa / input.budgetTotalFcfa) * 100)
      : null
  const variancePct =
    input.budgetTotalFcfa != null && input.budgetTotalFcfa > 0 && varianceFcfa != null
      ? roundPct((varianceFcfa / input.budgetTotalFcfa) * 100)
      : null

  return {
    asOf: input.asOf,
    firstExpenseOn,
    budgetInitialFcfa: input.budgetInitialFcfa,
    budgetTotalFcfa: input.budgetTotalFcfa,
    realizedFcfa,
    realizedPct,
    varianceFcfa,
    variancePct,
    materialsFcfa: last?.materialsFcfa ?? 0,
    materialsSharePct: last?.materialsSharePct ?? null,
    top3: last?.top3 ?? [],
    byCategory: last?.byCategory ?? [],
    daily,
  }
}

export function eventFromDeliveredBc(input: {
  tourDate?: string | null
  declaredAt?: Date | string | null
  poAmountFcfa: number
  lines: BcRegisterLine[]
  declaration: BcRegisterDeclaration
}): DeliveryExpenseEvent | null {
  const date = expenseDateIso(input.tourDate, input.declaredAt)
  if (!date) return null
  const amountFcfa = Math.round(
    deliveredAmountFcfa(input.poAmountFcfa, input.lines, input.declaration),
  )
  return {
    date,
    amountFcfa,
    products: productAmountsFromDelivery(input.lines, input.declaration, amountFcfa),
  }
}

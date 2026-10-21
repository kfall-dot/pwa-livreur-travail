/**
 * F03 — Budget vs réalisé : **tableau à double entrée par famille de charge**.
 *
 * F01 fournit l'**enveloppe** (`budget_total`) et F02 le **réalisé** par famille
 * (BC livrés + EB hors SA payées). Il manquait le maillon : la **ventilation de
 * l'enveloppe par famille**, décidée par le CdG. C'est elle qui rend l'écart
 * lisible — *« où l'argent était prévu »* face à *« où il est parti »*.
 *
 * Logique pure, sans base : testable et réutilisable côté serveur et client.
 */

import {
  BUDGET_ALERT_PCT,
  BUDGET_TOLERANCE_PCT,
  roundPct,
  type BudgetTrafficLight,
} from './budgetTrafficLight.js'
import {
  CHARGE_FAMILIES,
  chargeFamilyLabel,
  chargeNatureFamily,
  chargeNatureLabel,
  type ChargeFamily,
} from './chargeNatures.js'

export type FamilyAllocation = { family: ChargeFamily; amountFcfa: number }
export type FamilyRealized = { family: ChargeFamily; amountFcfa: number }

export type FamilyVarianceRow = {
  family: ChargeFamily
  label: string
  /** Enveloppe allouée à cette famille (saisie CdG). */
  allocatedFcfa: number
  /** Réalisé imputé à cette famille (F02). */
  realizedFcfa: number
  /** `alloué − réalisé` — positif = marge restante, négatif = dépassement. */
  varianceFcfa: number
  /** Réalisé / alloué, en %. `null` si aucune allocation. */
  consumedPct: number | null
  overrun: boolean
  trafficLight: BudgetTrafficLight
}

export type FamilyVariance = {
  rows: FamilyVarianceRow[]
  allocatedFcfa: number
  realizedFcfa: number
  varianceFcfa: number
  /** Enveloppe **non encore ventilée** (`budget_total − Σ allocations`). */
  unallocatedFcfa: number | null
  /** La ventilation dépasse-t-elle l'enveloppe ? (alerte, jamais blocage) */
  allocationOverBudget: boolean
  /** Familles en dépassement, de la plus grave à la moins grave. */
  overrunFamilies: ChargeFamily[]
}

/** Sévérité d'une ligne, du plus grave au plus sain — pour trier l'affichage. */
const SEVERITY: Record<BudgetTrafficLight, number> = { alert: 0, watch: 1, none: 2, ok: 3 }

/**
 * Construit le tableau d'écarts par famille.
 *
 * **Toutes** les familles du référentiel sont présentes, même sans allocation ni
 * dépense : une famille oubliée doit se **voir**, pas disparaître.
 *
 * Règle d'alerte (même barème que F01 — D-F01-3) : un dépassement est un
 * **warning**, jamais un blocage. Une famille **allouée à 0 mais dépensée**
 * passe directement en `alert` (dépassement infini, non calculable en %).
 */
export function computeFamilyVariance(input: {
  allocations: FamilyAllocation[]
  realized: FamilyRealized[]
  budgetTotalFcfa?: number | null
}): FamilyVariance {
  const allocatedByFamily = new Map<ChargeFamily, number>()
  for (const a of input.allocations) {
    allocatedByFamily.set(a.family, (allocatedByFamily.get(a.family) ?? 0) + Math.trunc(a.amountFcfa))
  }
  const realizedByFamily = new Map<ChargeFamily, number>()
  for (const r of input.realized) {
    realizedByFamily.set(r.family, (realizedByFamily.get(r.family) ?? 0) + Math.trunc(r.amountFcfa))
  }

  const rows: FamilyVarianceRow[] = CHARGE_FAMILIES.map((f) => {
    const allocatedFcfa = Math.max(0, allocatedByFamily.get(f.value) ?? 0)
    const realizedFcfa = Math.max(0, realizedByFamily.get(f.value) ?? 0)
    const varianceFcfa = allocatedFcfa - realizedFcfa
    const consumedPct = allocatedFcfa > 0 ? roundPct((realizedFcfa / allocatedFcfa) * 100) : null
    const overrun = realizedFcfa > allocatedFcfa
    let trafficLight: BudgetTrafficLight
    if (allocatedFcfa <= 0) {
      // Aucune enveloppe : sain si rien n'est dépensé, alerte sinon.
      trafficLight = realizedFcfa > 0 ? 'alert' : 'none'
    } else {
      const variancePct = (varianceFcfa / allocatedFcfa) * 100
      trafficLight =
        variancePct >= -BUDGET_TOLERANCE_PCT
          ? 'ok'
          : variancePct > -BUDGET_ALERT_PCT
            ? 'watch'
            : 'alert'
    }
    return {
      family: f.value,
      label: chargeFamilyLabel(f.value),
      allocatedFcfa,
      realizedFcfa,
      varianceFcfa,
      consumedPct,
      overrun,
      trafficLight,
    }
  })

  const allocatedFcfa = rows.reduce((sum, r) => sum + r.allocatedFcfa, 0)
  const realizedFcfa = rows.reduce((sum, r) => sum + r.realizedFcfa, 0)
  const budgetTotalFcfa =
    input.budgetTotalFcfa == null ? null : Math.trunc(input.budgetTotalFcfa)

  return {
    rows: [...rows].sort(
      (a, b) =>
        SEVERITY[a.trafficLight] - SEVERITY[b.trafficLight] ||
        b.realizedFcfa - a.realizedFcfa ||
        a.family.localeCompare(b.family),
    ),
    allocatedFcfa,
    realizedFcfa,
    varianceFcfa: allocatedFcfa - realizedFcfa,
    unallocatedFcfa: budgetTotalFcfa == null ? null : budgetTotalFcfa - allocatedFcfa,
    allocationOverBudget: budgetTotalFcfa != null && allocatedFcfa > budgetTotalFcfa,
    overrunFamilies: rows.filter((r) => r.overrun).map((r) => r.family),
  }
}

/**
 * Normalise des allocations reçues du client : familles connues uniquement,
 * montants entiers ≥ 0, familles dupliquées fusionnées.
 */
export function normalizeAllocations(input: unknown): FamilyAllocation[] {
  if (!Array.isArray(input)) return []
  const byFamily = new Map<ChargeFamily, number>()
  for (const raw of input) {
    if (!raw || typeof raw !== 'object') continue
    const rec = raw as { family?: unknown; amountFcfa?: unknown }
    const family = CHARGE_FAMILIES.find((f) => f.value === rec.family)?.value
    if (!family) continue
    const amount = Number(rec.amountFcfa)
    if (!Number.isFinite(amount) || amount < 0) continue
    byFamily.set(family, (byFamily.get(family) ?? 0) + Math.trunc(amount))
  }
  return [...byFamily.entries()].map(([family, amountFcfa]) => ({ family, amountFcfa }))
}

/** Réalisé agrégé par nature — `SiteIndicators.byCategory` alimente directement ce format. */
export type NatureRealized = { category: string; label: string; amountFcfa: number }

/**
 * Détail du réalisé d'une famille, ventilé **par nature** (demande CdG —
 * présentation façon Feuil2 du journal DG CI ENERGIE, où chaque rubrique de
 * dépense a sa ligne sous son sous-total).
 */
export type NatureRealizedRow = NatureRealized & {
  /** Part du réalisé **de la famille**, en % (`null` si la famille est à 0). */
  shareOfFamilyPct: number | null
}

/**
 * Drill-down : réalisé par nature, regroupé **par famille de charge**.
 *
 * La ligne famille reste le sous-total exact de ses natures (Σ = réalisé
 * famille, invariant I113) : les natures inconnues du référentiel sont donc
 * **écartées du détail** (le sous-total famille, lui, est inchangé — il vient
 * de `computeFamilyVariance`, pas d'ici). Les montants ≤ 0 sont ignorés.
 * Tri par montant décroissant au sein de chaque famille.
 *
 * L'enveloppe n'étant ventilée que **par famille** (F03), aucune enveloppe ni
 * écart par nature n'est calculé ici — c'est la règle d'honnêteté budgétaire.
 */
export function groupRealizedByNature(
  categories: ReadonlyArray<NatureRealized>,
): Map<ChargeFamily, NatureRealizedRow[]> {
  const byNature = new Map<string, number>()
  const realizedByFamily = new Map<ChargeFamily, number>()
  for (const c of categories) {
    const amount = Number(c.amountFcfa)
    if (!Number.isFinite(amount) || amount <= 0) continue
    const family = chargeNatureFamily(c.category)
    if (!family) continue
    byNature.set(c.category, (byNature.get(c.category) ?? 0) + amount)
    realizedByFamily.set(family, (realizedByFamily.get(family) ?? 0) + amount)
  }

  const out = new Map<ChargeFamily, NatureRealizedRow[]>()
  for (const [category, amountFcfa] of byNature) {
    const family = chargeNatureFamily(category)!
    const familyTotal = realizedByFamily.get(family) ?? 0
    const row: NatureRealizedRow = {
      category,
      label: chargeNatureLabel(category),
      amountFcfa,
      shareOfFamilyPct: familyTotal > 0 ? roundPct((amountFcfa / familyTotal) * 100) : null,
    }
    const list = out.get(family) ?? []
    list.push(row)
    out.set(family, list)
  }
  for (const list of out.values()) {
    list.sort((a, b) => b.amountFcfa - a.amountFcfa || a.category.localeCompare(b.category))
  }
  return out
}

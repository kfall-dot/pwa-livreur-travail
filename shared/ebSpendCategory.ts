/**
 * Catégorie de dépense par ligne d'EB — **vue « matériaux » du référentiel**.
 *
 * Depuis F02 lot A, la source de vérité est `shared/chargeNatures.ts` : ce
 * module n'est plus qu'une façade rétro-compatible pour le code et les
 * données existants (`purchase_request_lines.spend_category`).
 *
 * Le comportement qui change (et c'est le but) : `isMaterialsSpendCategory`
 * ne retourne plus `true` pour **toute** valeur. Les familles main-d'œuvre,
 * engins et frais sont désormais reconnues comme telles — la « part des
 * matériaux » du CdG redevient juste.
 */

import {
  CHARGE_NATURES,
  DEFAULT_CHARGE_NATURE,
  chargeNatureLabel,
  inferChargeNature,
  isChargeNature,
  isMaterialsNature,
  type ChargeNatureEntry,
  type ChargeNatureValue,
} from './chargeNatures.js'

/** Postes **matériaux** du référentiel (tableau 5.1 Koestrem + rapport CdG). */
export const EB_SPEND_CATEGORIES: readonly ChargeNatureEntry[] = CHARGE_NATURES.filter(
  (n) => n.family === 'materiaux',
)

/** Conservé pour compatibilité de type : la catégorie est une nature de charge. */
export type EbSpendCategory = ChargeNatureValue

export const EB_SPEND_CATEGORY_VALUES: ChargeNatureValue[] = EB_SPEND_CATEGORIES.map((c) => c.value)

export const DEFAULT_EB_SPEND_CATEGORY: EbSpendCategory = DEFAULT_CHARGE_NATURE

/**
 * Anciennes familles (`materiaux`, `main_oeuvre`, `services`,
 * `sous_traitance`, `autres`) écrites avant la migration 20260821200000.
 *
 * **Correction F02-A :** `main_oeuvre` était aplatie en `autres_materiaux`,
 * donc comptée comme matériaux. Elle pointe désormais vers une nature de
 * famille `main_oeuvre`, et `services` / `sous_traitance` vers `frais`.
 */
const LEGACY_SPEND_CATEGORY: Record<string, EbSpendCategory> = {
  materiaux: 'autres_materiaux',
  main_oeuvre: 'mo_divers',
  services: 'frais_divers',
  sous_traitance: 'frais_divers',
  autres: 'autres_materiaux',
}

export function isEbSpendCategory(value: unknown): value is EbSpendCategory {
  return isChargeNature(value)
}

export function normalizeEbSpendCategory(value?: string | null): EbSpendCategory {
  if (isEbSpendCategory(value)) return value
  if (value && LEGACY_SPEND_CATEGORY[value]) return LEGACY_SPEND_CATEGORY[value]!
  return DEFAULT_EB_SPEND_CATEGORY
}

/**
 * `true` uniquement pour la famille **matériaux** — c'est ce que consomme le
 * KPI « part des matériaux » (`server/services/siteIndicators.ts`).
 */
export function isMaterialsSpendCategory(value?: string | null): boolean {
  return isMaterialsNature(normalizeEbSpendCategory(value))
}

export function inferEbSpendCategory(label?: string | null): EbSpendCategory {
  return inferChargeNature(label)
}

export function ebSpendCategoryLabel(value?: string | null): string {
  return chargeNatureLabel(normalizeEbSpendCategory(value))
}

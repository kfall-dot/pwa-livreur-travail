/**
 * Routage du circuit par la **famille de charge** — F02 lot B.
 *
 * Règle validée en séance CdG (16/10/2026) : *« une EB main-d'œuvre saute
 * toujours le SA »* et *« le routage se fait par la nature de charge, mais
 * pour changer dans le futur »*.
 *
 * - famille `materiaux`                        → circuit **SA → BC** (inchangé)
 * - familles `main_oeuvre` / `engins` / `frais` → circuit **hors SA**
 *   (`submitted → cdg_review → daf_review → [pdg_review] → bt_pending → bt_ready`)
 *
 * Module séparé de `chargeNatures.ts` pour éviter un import circulaire avec
 * `ebSpendCategory.ts` (qui, lui, dépend de `chargeNatures.ts`).
 */

import { chargeNatureFamily, isMaterialsNature } from './chargeNatures.js'
import { normalizeEbSpendCategory } from './ebSpendCategory.js'

export type ChargeFlowLine = {
  label?: string | null
  spendCategory?: string | null
}

/** Familles hors SA : tout sauf les matériaux (invariant I102). */
export function isHorsSaFamily(family?: string | null): boolean {
  return family != null && family !== 'materiaux'
}

/**
 * Nature **normalisée** d'une ligne (tolère les anciennes familles aplaties
 * `main_oeuvre` / `services` / `sous_traitance`).
 */
export function lineNature(line: ChargeFlowLine): string {
  return normalizeEbSpendCategory(line.spendCategory)
}

/** Une ligne est retenue si elle porte un libellé — même règle que le chiffrage SA. */
export function isPricedLine(line: ChargeFlowLine): boolean {
  return (line.label ?? '').trim().length > 0
}

/**
 * Une EB suit le circuit **hors SA** si elle porte au moins une ligne chiffrée
 * **et qu'aucune** de ses lignes n'est de famille `materiaux`.
 *
 * Volontairement **strict** : une EB mixte (matériaux + main d'œuvre) reste sur
 * le circuit SA/BC et doit être **scindée** par le DT (invariant I105, alerte
 * via `hasMixedFamilies`). Cela évite qu'une ligne de matériaux se retrouve
 * sans BC — sans jamais casser le circuit matériaux existant.
 */
export function isHorsSaFlow(lines: ChargeFlowLine[]): boolean {
  const priced = lines.filter(isPricedLine)
  if (priced.length === 0) return false
  return priced.every((l) => !isMaterialsNature(lineNature(l)))
}

/**
 * L'EB mélange-t-elle des familles matériaux **et** hors SA ?
 * Sert à afficher l'alerte « scindez cette EB » sans bloquer la soumission.
 */
export function hasMixedFamilies(lines: ChargeFlowLine[]): boolean {
  const priced = lines.filter(isPricedLine)
  if (priced.length === 0) return false
  const hasMaterials = priced.some((l) => isMaterialsNature(lineNature(l)))
  const hasHorsSa = priced.some((l) => isHorsSaFamily(chargeNatureFamily(lineNature(l))))
  return hasMaterials && hasHorsSa
}

/** Libellé du circuit, pour l'affichage et les tests. */
export function chargeFlowLabel(lines: ChargeFlowLine[]): 'sa' | 'hors_sa' {
  return isHorsSaFlow(lines) ? 'hors_sa' : 'sa'
}

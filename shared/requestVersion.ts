/**
 * Identification de la version révisée d'une EB (demande d'achat).
 *
 * Le numéro de référence (ex. `EB-2026-004351`) reste **stable** : il n'est pas
 * régénéré lors d'une révision PDG. C'est le compteur `version` qui signale
 * qu'une révision a modifié les quantités (v2, v3, …).
 */

/**
 * Suffixe à concaténer après une référence : « — v2 ».
 * Retourne une chaîne vide quand la demande n'a pas été révisée (version ≤ 1).
 */
export function versionSuffix(version?: number | null): string {
  return typeof version === 'number' && version > 1 ? ` — v${version}` : ''
}

/**
 * Libellé court de badge : « v2 ».
 * Retourne `null` quand la demande n'a pas été révisée (version ≤ 1).
 */
export function versionBadge(version?: number | null): string | null {
  return typeof version === 'number' && version > 1 ? `v${version}` : null
}

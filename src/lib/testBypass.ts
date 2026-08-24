/**
 * Contournements de validation pour les tests manuels et E2E.
 * Voir VALIDATIONS-TESTS.md pour la liste complète et la réactivation en prod.
 *
 * VITE_GEOFENCE_BYPASS peut être activé en build production (pilote terrain).
 * Les autres bypass (photos, GPS fixe) restent réservés au non-prod / E2E.
 */

import { isDemoSession } from './demoSession'

const truthy = (v: string | undefined) => v === 'true' || v === '1'

const devBypassEnabled =
  !import.meta.env.PROD ||
  truthy(import.meta.env.VITE_E2E)

export const testBypass = {
  /** Ignore les contrôles de distance GPS (200 m démarrage, 100 m confirmation). */
  geofence:
    truthy(import.meta.env.VITE_GEOFENCE_BYPASS) ||
    (devBypassEnabled && truthy(import.meta.env.VITE_E2E)),

  /** Position GPS fixe (Abidjan, dev/E2E) au lieu du navigateur. */
  fixedGps: devBypassEnabled && (truthy(import.meta.env.VITE_E2E) || truthy(import.meta.env.VITE_GEOFENCE_BYPASS)),

  /** Bouton « Simuler photo » sans caméra (dev / tests). */
  simulatePhotos:
    devBypassEnabled &&
    (truthy(import.meta.env.VITE_E2E) || truthy(import.meta.env.VITE_PHOTOS_BYPASS)),

  /** Ne bloque pas si la précision GPS est > 100 m. */
  relaxGpsAccuracy:
    truthy(import.meta.env.VITE_GEOFENCE_BYPASS) ||
    (devBypassEnabled && truthy(import.meta.env.VITE_E2E)),

  /** Une seule photo suffit (au lieu d’une par unité / produit). */
  minPhotosOnly:
    isDemoSession() ||
    (devBypassEnabled &&
      (truthy(import.meta.env.VITE_PHOTOS_BYPASS) ||
        truthy(import.meta.env.VITE_GEOFENCE_BYPASS) ||
        truthy(import.meta.env.VITE_E2E))),
} as const

export function shouldSkipGeofence(isMockApi: boolean): boolean {
  return isMockApi || testBypass.geofence || isDemoSession()
}

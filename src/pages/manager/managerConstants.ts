import { appTodayString } from '../../lib/appDate'

export const UNIT_TYPES = [
  { value: 'palette', label: 'Palette' },
  { value: 'kg',      label: 'Kg' },
  { value: 'colis',   label: 'Colis' },
  { value: 'carton',  label: 'Carton' },
  { value: 'caisse',  label: 'Caisse' },
  { value: 'plateau', label: 'Plateau' },
  { value: 'sac',     label: 'Sac' },
  { value: 'bidon',   label: 'Bidon' },
  { value: 'unite',   label: 'Unité' },
  { value: 'tonne',   label: 'Tonne' },
  { value: 'botte',   label: 'Botte' },
  { value: 'seau',    label: 'Seau' },
  { value: 'metre',   label: 'Mètre' },
  { value: 'litre',   label: 'Litre' },
  { value: 'rouleau', label: 'Rouleau' },
  { value: 'camion',  label: 'Camion' },
] as const

export type UnitType = (typeof UNIT_TYPES)[number]['value']

/** Unités autorisées dans la table `products` (enum Postgres `product_unit`). */
export const PRODUCT_CATALOG_UNITS = [
  { value: 'palette', label: 'Palette' },
  { value: 'kg', label: 'Kg' },
  { value: 'colis', label: 'Colis' },
  { value: 'caisse', label: 'Caisse' },
  { value: 'plateau', label: 'Plateau' },
  { value: 'unite', label: 'Unité' },
  { value: 'sac', label: 'Sac' },
  { value: 'bidon', label: 'Bidon' },
  { value: 'carton', label: 'Carton' },
  { value: 'tonne', label: 'Tonne' },
  { value: 'botte', label: 'Botte' },
  { value: 'seau', label: 'Seau' },
  { value: 'metre', label: 'Mètre' },
  { value: 'litre', label: 'Litre' },
  { value: 'rouleau', label: 'Rouleau' },
  { value: 'camion', label: 'Camion' },
] as const

export type ProductCatalogUnit = (typeof PRODUCT_CATALOG_UNITS)[number]['value']

export const STATUSES = [
  { value: 'all',         label: 'Tous' },
  { value: 'pending',     label: 'À démarrer' },
  { value: 'in_progress', label: 'En cours' },
  { value: 'otp_sent',    label: 'OTP envoyé' },
  { value: 'delivered',   label: 'Livrée' },
  { value: 'failed',      label: 'Échouée' },
] as const

export function statusLabel(s: string) {
  return STATUSES.find((x) => x.value === s)?.label ?? s
}

export function tourLifecycleLabel(delivered: number, total: number): string {
  if (total > 0 && delivered >= total) return 'Terminée'
  if (delivered > 0) return 'En cours'
  return 'Planifiée'
}

export function todayIso() {
  // Fuseau métier (Africa/Abidjan) — aligné sur le serveur (server/utils/dates.ts)
  // pour que le dashboard demande bien la date des tournées créées par le seed.
  return appTodayString()
}

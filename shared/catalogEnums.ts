export const SITE_TYPES = [
  { value: 'prive', label: 'Privé' },
  { value: 'public', label: 'Public' },
] as const

export type SiteType = (typeof SITE_TYPES)[number]['value']

export const SUPPLIER_FAMILIES = [
  { value: 'materiaux', label: 'Matériaux' },
  { value: 'services', label: 'Services' },
  { value: 'sous_traitance', label: 'Sous-traitance' },
] as const

export type SupplierFamily = (typeof SUPPLIER_FAMILIES)[number]['value']

export function isSiteType(value: unknown): value is SiteType {
  return value === 'prive' || value === 'public'
}

export function isSupplierFamily(value: unknown): value is SupplierFamily {
  return value === 'materiaux' || value === 'services' || value === 'sous_traitance'
}

export function siteTypeLabel(value?: string | null): string {
  return SITE_TYPES.find((t) => t.value === value)?.label ?? 'Privé'
}

export function supplierFamilyLabel(value?: string | null): string {
  return SUPPLIER_FAMILIES.find((t) => t.value === value)?.label ?? '—'
}

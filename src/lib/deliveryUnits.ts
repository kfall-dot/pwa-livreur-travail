/** Unités alignées sur la planification manager et l'API Livraison. */
export const DELIVERY_UNITS = [
  'palette', 'kg', 'colis', 'carton', 'caisse', 'plateau', 'sac', 'bidon',
  'unite', 'tonne', 'botte', 'seau', 'metre', 'litre', 'rouleau', 'camion',
] as const

export type DeliveryUnit = (typeof DELIVERY_UNITS)[number]

const UNIT_ALIASES: Record<string, DeliveryUnit> = {
  unité: 'unite',
  bottes: 'botte',
  seaux: 'seau',
  metres: 'metre',
  mètres: 'metre',
  litres: 'litre',
  rouleaux: 'rouleau',
  camions: 'camion',
}

const UNIT_LABELS: Record<DeliveryUnit, string> = {
  palette: 'palette',
  kg: 'kg',
  colis: 'colis',
  carton: 'carton',
  caisse: 'caisse',
  plateau: 'plateau',
  sac: 'sac',
  bidon: 'bidon',
  unite: 'unité',
  tonne: 'tonne',
  botte: 'botte',
  seau: 'seau',
  metre: 'mètre',
  litre: 'litre',
  rouleau: 'rouleau',
  camion: 'camion',
}

/** Forme accordée au pluriel pour l'affichage « N unité(s) ». */
function pluralUnitLabel(unit: string, qty: number): string {
  const u = UNIT_ALIASES[unit] ?? unit
  const plural = qty > 1
  switch (u) {
    case 'palette': return plural ? 'palettes' : 'palette'
    case 'kg': return 'kg'
    case 'colis': return 'colis'
    case 'carton': return plural ? 'cartons' : 'carton'
    case 'caisse': return plural ? 'caisses' : 'caisse'
    case 'plateau': return plural ? 'plateaux' : 'plateau'
    case 'sac': return plural ? 'sacs' : 'sac'
    case 'bidon': return plural ? 'bidons' : 'bidon'
    case 'unite': return plural ? 'unités' : 'unité'
    case 'tonne': return plural ? 'tonnes' : 'tonne'
    case 'botte': return plural ? 'bottes' : 'botte'
    case 'seau': return plural ? 'seaux' : 'seau'
    case 'metre': return plural ? 'mètres' : 'mètre'
    case 'litre': return plural ? 'litres' : 'litre'
    case 'rouleau': return plural ? 'rouleaux' : 'rouleau'
    case 'camion': return plural ? 'camions' : 'camion'
    default: return plural ? `${unit}s` : unit
  }
}

function rawOrUnite(value: string | null | undefined): string {
  return String(value ?? '').trim().toLowerCase() || 'unite'
}

export function normalizeDeliveryUnit(value: string | null | undefined): DeliveryUnit | string {
  const raw = rawOrUnite(value)
  const u = UNIT_ALIASES[raw] ?? raw
  return (DELIVERY_UNITS as readonly string[]).includes(u) ? (u as DeliveryUnit) : u
}

export function formatUnitLabel(unit: string | null | undefined): string {
  const raw = rawOrUnite(unit)
  const u = UNIT_ALIASES[raw] ?? raw
  if ((DELIVERY_UNITS as readonly string[]).includes(u)) return UNIT_LABELS[u as DeliveryUnit]
  return raw
}

export function formatQuantityWithUnit(qty: number, unit?: string | null): string {
  const n = Number(qty)
  const safeQty = Number.isFinite(n) ? n : 0
  const raw = rawOrUnite(unit)
  return `${safeQty} ${pluralUnitLabel(raw, safeQty)}`
}

export type DriverContentProduct = { label?: string | null; qty?: number | null; unit?: string | null }

/** Résumé « Contenu » sur le tableau de bord livreur — « multiple » si plusieurs produits planifiés. */
export function formatDriverDeliveryContent(
  units: number,
  unitType: string | null | undefined,
  products?: DriverContentProduct[] | null,
): string {
  const lines = (products ?? []).filter((p) => String(p.label ?? '').trim())
  if (lines.length > 1) return 'multiple'
  if (lines.length === 1) {
    const p = lines[0]!
    const qtyUnit = formatQuantityWithUnit(Number(p.qty) || 1, p.unit)
    const label = String(p.label ?? '').trim()
    return label ? `${label} · ${qtyUnit}` : qtyUnit
  }
  return formatQuantityWithUnit(units, unitType)
}

export type TourContentStop = {
  units: number
  unitType: string
  products?: Array<{ qty?: number | null; unit?: string | null }> | null
}

/** Résumé tournée — regroupe par unité, sans additionner palettes + caisses + colis en un seul nombre. */
export function formatTourContentSummary(stops: TourContentStop[]): string {
  const byUnit = new Map<string, number>()

  for (const stop of stops) {
    const productLines = (stop.products ?? []).filter((p) => p.qty != null && Number(p.qty) > 0)
    if (productLines.length > 0) {
      for (const p of productLines) {
        const unit = normalizeDeliveryUnit(p.unit)
        byUnit.set(unit, (byUnit.get(unit) ?? 0) + Number(p.qty))
      }
    } else if (stop.units > 0) {
      const unit = normalizeDeliveryUnit(stop.unitType)
      byUnit.set(unit, (byUnit.get(unit) ?? 0) + stop.units)
    }
  }

  if (byUnit.size === 0) return '—'
  const parts = [...byUnit.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([unit, qty]) => formatQuantityWithUnit(qty, unit))
  return parts.join(', ')
}

/** Unités féminines pour l'accord attendu(e) / refusé(e). */
export function isFeminineUnit(unit?: string | null): boolean {
  const u = normalizeDeliveryUnit(unit)
  return u === 'caisse' || u === 'palette' || u === 'unite' || u === 'tonne' || u === 'botte'
}

function expectedAdjective(unit?: string | null): string {
  return isFeminineUnit(unit) ? 'attendue(s)' : 'attendu(s)'
}

function refusedAdjective(unit?: string | null): string {
  return isFeminineUnit(unit) ? 'refusée(s)' : 'refusé(s)'
}

export function formatQuantityExpected(qty: number, unit?: string | null): string {
  return `${formatQuantityWithUnit(qty, unit)} ${expectedAdjective(unit)}`
}

export function formatQuantityRefused(qty: number, unit?: string | null): string {
  return `${formatQuantityWithUnit(qty, unit)} ${refusedAdjective(unit)}`
}

type UnitSource = { unit?: string | null; productUnit?: string | null; product_unit?: string | null }

export function resolvePlannedUnit(
  products: UnitSource[] = [],
  lines: UnitSource[] = [],
  plannedUnit?: string | null
): DeliveryUnit | string {
  let resolved: DeliveryUnit | string = 'unite'
  for (const src of [{ unit: plannedUnit }, products[0], lines[0]]) {
    const raw = src?.unit ?? src?.productUnit ?? src?.product_unit
    if (raw != null && String(raw).trim()) {
      resolved = normalizeDeliveryUnit(raw)
      break
    }
  }
  return resolved
}

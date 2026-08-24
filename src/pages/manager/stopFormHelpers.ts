import { validateStopProducts } from '../../../shared/expectedProducts'
import type { UnitType } from './managerConstants'
import type { ProductLine, StopDraft, Supermarket } from './managerTypes'

export { validateStopProducts }

export function deriveStopQuantities(products: ProductLine[]): {
  units: number
  unitType: UnitType
  weightKg: string
} {
  const lines = products.filter((p) => p.label.trim())
  if (lines.length === 0) {
    return { units: 1, unitType: 'colis', weightKg: '0' }
  }
  const totalQty = lines.reduce((sum, p) => sum + (Number(p.qty) || 1), 0)
  return {
    units: totalQty,
    unitType: (lines[0]!.unit || 'colis') as UnitType,
    weightKg: '0',
  }
}

export function buildStopApiPayload(stop: StopDraft, supermarket?: Supermarket | null) {
  const derived = deriveStopQuantities(stop.products)
  const fromCatalog = Boolean(stop.supermarketId && supermarket?.id === stop.supermarketId)
  return {
    supermarketId: stop.supermarketId || undefined,
    name: fromCatalog ? supermarket!.name : stop.name.trim(),
    address: fromCatalog ? supermarket!.address : stop.address.trim() || supermarket?.address?.trim() || '',
    instructions: stop.instructions || undefined,
    units: derived.units,
    unitType: derived.unitType,
    weightKg: stop.weightKg || derived.weightKg,
    orderRef: stop.orderRef,
    contactPhone: fromCatalog
      ? supermarket!.contactPhone || undefined
      : stop.contactPhone || supermarket?.contactPhone || undefined,
    timeWindowStart: stop.timeWindowStart || undefined,
    timeWindowEnd: stop.timeWindowEnd || undefined,
    requiredPhotos: Number(stop.requiredPhotos) || 1,
    lat: fromCatalog ? (supermarket!.lat ?? '0') : (stop.lat ?? supermarket?.lat ?? '0'),
    lng: fromCatalog ? (supermarket!.lng ?? '0') : (stop.lng ?? supermarket?.lng ?? '0'),
    products: stop.products
      .filter((p) => p.label.trim())
      .map((p) => ({ label: p.label.trim(), qty: Number(p.qty) || 1, unit: p.unit })),
  }
}

export function matchSupermarketId(supermarkets: Supermarket[], name: string, address: string): string {
  const byName = supermarkets.find((s) => s.name === name)
  if (byName) return byName.id
  const byAddress = supermarkets.find((s) => s.address === address)
  return byAddress?.id ?? ''
}

export function applySupermarketToStop(stop: StopDraft, supermarket: Supermarket): StopDraft {
  return {
    ...stop,
    supermarketId: supermarket.id,
    name: supermarket.name,
    address: supermarket.address,
    lat: supermarket.lat,
    lng: supermarket.lng,
    contactPhone: supermarket.contactPhone ?? stop.contactPhone,
  }
}

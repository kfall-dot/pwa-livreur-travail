import type { DeliveryPoint } from './schema.js'

type CompareProduct = { label: string; qty: number; unit: string }

/** HH:MM — ignore les secondes renvoyées par Postgres (`time`). */
export function formatTimeHHMM(value: string | null | undefined): string {
  if (value == null || value === '') return ''
  const s = String(value).trim()
  const m = s.match(/^(\d{1,2}):(\d{2})/)
  if (!m) return s
  return `${m[1]!.padStart(2, '0')}:${m[2]}`
}

function strField(v: unknown): string {
  return String(v ?? '').trim()
}

function decimalFieldEqual(a: unknown, b: unknown): boolean {
  const na = Number(a)
  const nb = Number(b)
  if (!Number.isNaN(na) && !Number.isNaN(nb)) return na === nb
  return strField(a) === strField(b)
}

function parseProductsForCompare(raw: unknown): CompareProduct[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((p): p is Record<string, unknown> => typeof p === 'object' && p !== null)
    .map((p) => ({
      label: String(p.label ?? '').trim(),
      qty: Number(p.qty ?? 1),
      unit: String(p.unit ?? 'colis'),
    }))
    .filter((p) => p.label)
    .sort((a, b) => a.label.localeCompare(b.label) || a.unit.localeCompare(b.unit))
}

function productsFieldEqual(payloadProducts: unknown, existingProducts: unknown): boolean {
  const a = parseProductsForCompare(payloadProducts)
  const b = parseProductsForCompare(existingProducts)
  if (a.length === 0 && b.length === 0) return true
  return JSON.stringify(a) === JSON.stringify(b)
}

/** Vrai si le payload PATCH modifie un arrêt déjà livré (hors réordonnancement). */
export function stopPayloadDiffersFromExisting(
  existing: DeliveryPoint,
  payload: Record<string, unknown>,
): boolean {
  return (
    strField(payload.name) !== strField(existing.name)
    || strField(payload.address) !== strField(existing.address)
    || strField(payload.instructions) !== strField(existing.instructions)
    || Number(payload.units ?? 0) !== existing.units
    || strField(payload.unitType) !== strField(existing.unitType)
    || !decimalFieldEqual(payload.weightKg ?? '0', existing.weightKg)
    || strField(payload.orderRef) !== strField(existing.orderRef)
    || strField(payload.contactPhone) !== strField(existing.contactPhone)
    || formatTimeHHMM(String(payload.timeWindowStart ?? '')) !== formatTimeHHMM(existing.timeWindowStart)
    || formatTimeHHMM(String(payload.timeWindowEnd ?? '')) !== formatTimeHHMM(existing.timeWindowEnd)
    || Number(payload.requiredPhotos ?? 0) !== existing.requiredPhotos
    || !productsFieldEqual(payload.products, existing.products)
  )
}

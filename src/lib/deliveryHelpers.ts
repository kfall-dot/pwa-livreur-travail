import type {
  AdjustmentLine,
  AdjustmentLineRow,
  DeliveryProductOption,
  DeclarationOutcome,
} from '../types'
import { normalizeDeliveryUnit } from './deliveryUnits'
import { DEFAULT_FULL_JUSTIFICATION } from './declarationValidation'

function lineProductLabel(line: AdjustmentLineRow | AdjustmentLine | Record<string, unknown>): string {
  const raw = line as Record<string, unknown>
  return String(raw.productLabel ?? raw.product_label ?? '').trim()
}

function lineUnitValue(
  line: AdjustmentLineRow | AdjustmentLine | Record<string, unknown>,
  plannedUnit?: string | null
): string {
  const raw = line as Record<string, unknown>
  return normalizeDeliveryUnit(
    String(raw.unit ?? raw.productUnit ?? raw.product_unit ?? plannedUnit ?? 'palette')
  )
}

function lineQuantityExpected(
  line: AdjustmentLineRow | AdjustmentLine | Record<string, unknown>
): number | undefined {
  const raw = line as Record<string, unknown>
  const q = raw.quantityExpected ?? raw.quantity_expected
  return q != null ? Number(q) : undefined
}

export function mapAdjustmentLineFromApi(row: AdjustmentLineRow): AdjustmentLine {
  return {
    productLabel: lineProductLabel(row),
    unit: lineUnitValue(row),
    quantityExpected: lineQuantityExpected(row),
    quantityAccepted:
      row.quantityAccepted ?? (row as { quantity_accepted?: number }).quantity_accepted ?? undefined,
    quantityRefused:
      row.quantityRefused ?? (row as { quantity_refused?: number }).quantity_refused ?? undefined,
    justification: String(row.justification ?? ''),
  }
}

export function deliveryProductsFromLines(
  lines?: AdjustmentLineRow[] | AdjustmentLine[],
  plannedUnit?: string | null
): DeliveryProductOption[] {
  if (!lines?.length) return []
  const seen = new Set<string>()
  const out: DeliveryProductOption[] = []
  for (const l of lines) {
    const label = lineProductLabel(l)
    if (!label) continue
    const unit = lineUnitValue(l, plannedUnit)
    const key = `${label}\0${unit}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ productLabel: label, unit, quantityExpected: lineQuantityExpected(l) })
  }
  if (out.length === 0 && plannedUnit) {
    return [
      {
        productLabel: 'Produit commandé',
        unit: normalizeDeliveryUnit(plannedUnit),
        quantityExpected: undefined,
      },
    ]
  }
  return out
}

export function defaultFullLine(
  expected: number,
  options?: { productLabel?: string; unit?: string }
): AdjustmentLine {
  const unit = normalizeDeliveryUnit(options?.unit)
  return {
    productLabel: options?.productLabel?.trim() || 'Produit commandé',
    unit,
    quantityExpected: expected,
    quantityAccepted: expected,
    quantityRefused: 0,
    justification: DEFAULT_FULL_JUSTIFICATION,
  }
}

export function fullLinesFromPlanned(
  expected: number,
  products: DeliveryProductOption[]
): AdjustmentLine[] {
  if (products.length === 0) return [defaultFullLine(expected)]
  return products.map((p) =>
    defaultFullLine(p.quantityExpected ?? expected, {
      productLabel: p.productLabel,
      unit: p.unit,
    })
  )
}

export function fallbackDeliveryProducts(
  expected: number,
  lines?: AdjustmentLineRow[] | AdjustmentLine[],
  plannedUnit?: string | null
): DeliveryProductOption[] {
  const fromLines = deliveryProductsFromLines(lines, plannedUnit)
  if (fromLines.length > 0) {
    return fromLines.map((p) => ({
      ...p,
      quantityExpected: p.quantityExpected ?? expected,
    }))
  }
  return [
    {
      productLabel: 'Produit commandé',
      unit: normalizeDeliveryUnit(plannedUnit),
      quantityExpected: expected,
    },
  ]
}

export function buildRejectedLines(
  expectedPalettes: number,
  deliveryProducts: DeliveryProductOption[],
  displayUnit: string
): AdjustmentLine[] {
  if (deliveryProducts.length > 0) {
    return deliveryProducts.map((p) => ({
      productLabel: p.productLabel,
      unit: normalizeDeliveryUnit(p.unit || displayUnit),
      quantityExpected: p.quantityExpected ?? expectedPalettes,
      quantityAccepted: 0,
      quantityRefused: p.quantityExpected ?? expectedPalettes,
      justification: '',
    }))
  }
  return [
    {
      productLabel: 'Produit commandé',
      unit: displayUnit,
      quantityExpected: expectedPalettes,
      quantityAccepted: 0,
      quantityRefused: expectedPalettes,
      justification: '',
    },
  ]
}

export function buildPartialDeclareLines(
  expectedPalettes: number,
  deliveryProducts: DeliveryProductOption[],
  displayUnit: string
): AdjustmentLine[] {
  if (deliveryProducts.length > 0) {
    return deliveryProducts.map((p) => ({
      productLabel: p.productLabel,
      unit: normalizeDeliveryUnit(p.unit || displayUnit),
      quantityExpected: p.quantityExpected,
      quantityAccepted: undefined,
      quantityRefused: undefined,
      justification: '',
    }))
  }
  return [
    {
      productLabel: 'Produit commandé',
      unit: displayUnit,
      quantityExpected: expectedPalettes,
      quantityAccepted: undefined,
      quantityRefused: undefined,
      justification: '',
    },
  ]
}

export function applyDeclarationFromApi(
  expected: number,
  lines?: AdjustmentLineRow[],
  isDeclared?: boolean,
  deliveryOutcome?: string | null,
  plannedUnit?: string | null
): {
  declareLines: AdjustmentLine[]
  declared: boolean
  declareOutcome: DeclarationOutcome | null
} {
  if (lines && lines.length > 0) {
    const driverDeclared = Boolean(isDeclared)
    let declareLines = lines.map(mapAdjustmentLineFromApi)
    let declareOutcome: DeclarationOutcome | null

    if (deliveryOutcome === 'rejected') {
      declareOutcome = 'rejected'
    } else if (driverDeclared) {
      const accepted = declareLines
        .filter((l) => (l.unit || 'palette') === 'palette')
        .reduce((s, l) => s + (l.quantityAccepted || 0), 0)
      const hasRefusal = declareLines.some((l) => (l.quantityRefused || 0) > 0)
      declareOutcome = hasRefusal || accepted < expected ? 'partial' : 'full'
    } else {
      const products = deliveryProductsFromLines(lines, plannedUnit)
      declareLines = buildPartialDeclareLines(
        expected,
        products.length > 0
          ? products
          : fallbackDeliveryProducts(expected, lines, plannedUnit),
        plannedUnit ?? 'palette',
      )
      declareOutcome = null
    }

    return { declareLines, declared: driverDeclared, declareOutcome }
  }

  const products = fallbackDeliveryProducts(expected, undefined, plannedUnit)
  return {
    declareLines: buildPartialDeclareLines(expected, products, plannedUnit ?? 'palette'),
    declared: false,
    declareOutcome: null,
  }
}

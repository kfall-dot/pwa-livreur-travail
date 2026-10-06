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

function selectableLine(
  p: DeliveryProductOption,
  expectedPalettes: number,
  displayUnit: string
): AdjustmentLine {
  return {
    productLabel: p.productLabel,
    unit: normalizeDeliveryUnit(p.unit || displayUnit),
    quantityExpected: p.quantityExpected ?? expectedPalettes,
    quantityAccepted: undefined,
    quantityRefused: 0,
    justification: DEFAULT_FULL_JUSTIFICATION,
    isPartial: false,
  }
}

function selectableProducts(
  expectedPalettes: number,
  deliveryProducts: DeliveryProductOption[],
  displayUnit: string
): DeliveryProductOption[] {
  if (deliveryProducts.length > 0) return deliveryProducts
  return [
    {
      productLabel: 'Produit commandé',
      unit: normalizeDeliveryUnit(displayUnit),
      quantityExpected: expectedPalettes,
    },
  ]
}

export function buildRejectedLines(
  expectedPalettes: number,
  deliveryProducts: DeliveryProductOption[],
  displayUnit: string
): AdjustmentLine[] {
  return selectableProducts(expectedPalettes, deliveryProducts, displayUnit).map((p) =>
    selectableLine(p, expectedPalettes, displayUnit)
  )
}

export function buildPartialDeclareLines(
  expectedPalettes: number,
  deliveryProducts: DeliveryProductOption[],
  displayUnit: string
): AdjustmentLine[] {
  return selectableProducts(expectedPalettes, deliveryProducts, displayUnit).map((p) =>
    selectableLine(p, expectedPalettes, displayUnit)
  )
}

function toQty(value: unknown): number {
  if (value == null || value === '') return 0
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : 0
}

/**
 * Résout les lignes de déclaration finales à partir de la sélection du livreur :
 * - produit non coché (`isPartial` falsy) → livré en totalité ;
 * - produit coché en « partielle » → accepté saisi, refusé = commandé − accepté ;
 * - produit coché en « refusée » → accepté = 0, refusé = commandé.
 * Le flag client `isPartial` est retiré des lignes renvoyées.
 */
export function finalizeDeclarationLines(
  lines: AdjustmentLine[],
  expectedPalettes: number,
  outcome: DeclarationOutcome | null
): AdjustmentLine[] {
  return lines.map((line) => {
    const expected = line.quantityExpected ?? expectedPalettes
    const { isPartial, ...base } = line
    if (!isPartial) {
      return {
        ...base,
        quantityAccepted: expected,
        quantityRefused: 0,
        justification: DEFAULT_FULL_JUSTIFICATION,
      }
    }
    if (outcome === 'rejected') {
      return {
        ...base,
        quantityAccepted: 0,
        quantityRefused: expected,
      }
    }
    const accepted = toQty(line.quantityAccepted)
    return {
      ...base,
      quantityAccepted: accepted,
      quantityRefused: Math.max(0, expected - accepted),
    }
  })
}

/**
 * Déduit l'outcome canonique à partir des quantités finales déclarées :
 * - rien refusé → « full » ;
 * - rien accepté → « rejected » (refus total) ;
 * - sinon → « partial » (livraison mixte : une partie livrée, une partie refusée).
 */
export function resolveDeclarationOutcome(
  lines: Array<{ quantityAccepted?: number; quantityRefused?: number }>
): DeclarationOutcome {
  const accepted = lines.reduce((sum, line) => sum + toQty(line.quantityAccepted), 0)
  const refused = lines.reduce((sum, line) => sum + toQty(line.quantityRefused), 0)
  if (refused === 0) return 'full'
  if (accepted === 0) return 'rejected'
  return 'partial'
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

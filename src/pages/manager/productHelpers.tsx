import { formatQuantityExpected, formatQuantityRefused, formatQuantityWithUnit } from '../../lib/deliveryUnits'
import {
  buildDeliveredProductsDisplay,
  expectedProductsDisplay,
  deliveredQuantityEmptyLabel,
  normalizeProductLabel,
  type DisplayProductLine,
} from '../../lib/deliveredQuantity'

export type { DisplayProductLine }
export {
  buildDeliveredProductsDisplay,
  expectedProductsDisplay,
  deliveredQuantityEmptyLabel,
  isAnnuleStop,
  normalizeProductLabel,
} from '../../lib/deliveredQuantity'

export function formatPartialTaskLine(line: {
  productLabel?: string
  quantityExpected?: number
  quantityRefused?: number
  unit?: string
}): string {
  const label = line.productLabel ?? 'Produit'
  const unit = line.unit ?? 'colis'
  const expected = line.quantityExpected ?? 0
  const refused = line.quantityRefused ?? 0
  return `${label} : ${formatQuantityExpected(expected, unit)} - ${formatQuantityRefused(refused, unit)}`
}

function formatProductLine(p: DisplayProductLine): string {
  return formatProductQuantityLine(p)
}

/** Ex. « Poulet 100 unités », « Oeufs 10 palettes » */
export function formatProductQuantityLine(p: DisplayProductLine): string {
  const label = normalizeProductLabel(p.label)
  const qtyUnit = formatQuantityWithUnit(p.qty, p.unit)
  if (!label) return qtyUnit
  return `${label} ${qtyUnit}`
}

export function deliveredProductsDisplay(
  expected: DisplayProductLine[],
  declarationLines: unknown,
  status?: string,
  declarationOutcome?: string | null,
): DisplayProductLine[] {
  return buildDeliveredProductsDisplay(expected, declarationLines, status, declarationOutcome)
}

export function ProductQuantityList({
  lines,
  empty = '—',
  compact = false,
}: {
  lines: DisplayProductLine[]
  empty?: React.ReactNode
  compact?: boolean
}) {
  if (lines.length === 0) {
    return typeof empty === 'string' ? <span>{empty}</span> : empty
  }
  if (compact && lines.length === 1) {
    return <span>{formatProductQuantityLine(lines[0]!)}</span>
  }
  return (
    <ul style={{ margin: 0, paddingLeft: compact ? '1rem' : '1rem', fontSize: compact ? 12 : undefined }}>
      {lines.map((p, i) => (
        <li key={i}>{formatProductQuantityLine(p)}</li>
      ))}
    </ul>
  )
}

export function suiviQuantityDisplay(
  products: Array<{ label: string; qty: number; unit: string }> | null | undefined,
  units: number,
  unitType: string,
): DisplayProductLine[] {
  const normalized = products?.map((p) => ({
    label: p.label,
    qty: Number(p.qty),
    unit: p.unit,
  }))
  return expectedProductsDisplay(normalized, units, unitType)
}

export function isDeliveredStop(status?: string) {
  return status === 'delivered'
}

export { isStopClosedForEdit, stopClosedEditHint } from '../../lib/deliveryStatusDisplay'

export function showProductsSummary(status?: string) {
  return status === 'delivered' || status === 'failed'
}

function ProductListSection({ title, lines, empty }: { title: string; lines: DisplayProductLine[]; empty: string }) {
  return (
    <div style={{ background: '#faf8f5', borderRadius: 8, padding: '0.75rem', border: '1px solid var(--border)' }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 }}>{title}</div>
      {lines.length === 0 ? (
        <p style={{ margin: 0, fontSize: 12, color: '#9ca3af' }}>{empty}</p>
      ) : (
        <ul style={{ margin: 0, paddingLeft: '1rem', fontSize: 13 }}>
          {lines.map((p, i) => (
            <li key={i}>{formatProductLine(p)}</li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function StopProductsSummary({
  expected,
  declarationLines,
  status,
  declarationOutcome,
}: {
  expected: DisplayProductLine[]
  declarationLines?: unknown
  status?: string
  declarationOutcome?: string | null
}) {
  const delivered = buildDeliveredProductsDisplay(expected, declarationLines, status, declarationOutcome)
  const deliveredEmptyLabel = deliveredQuantityEmptyLabel(status, declarationOutcome)

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 10 }}>
      <ProductListSection title="Quantité attendue" lines={expected} empty="Aucun produit attendu." />
      <ProductListSection title="Quantité livrée" lines={delivered} empty={deliveredEmptyLabel} />
    </div>
  )
}

export interface DeclarationTableLine {
  productLabel: string
  unit: string
  quantityAccepted: number | null
  quantityRefused: number | null
  justification: string
}

export function parseDeclarationTableLines(raw: unknown): DeclarationTableLine[] {
  if (!Array.isArray(raw)) return []
  return raw.map((line) => {
    const r = line as Record<string, unknown>
    return {
      productLabel: normalizeProductLabel(String(r.productLabel ?? r.product_label ?? r.label ?? '')),
      unit: String(r.unit ?? r.productUnit ?? 'colis'),
      quantityAccepted: r.quantityAccepted != null || r.quantity_accepted != null
        ? Number(r.quantityAccepted ?? r.quantity_accepted)
        : null,
      quantityRefused: r.quantityRefused != null || r.quantity_refused != null
        ? Number(r.quantityRefused ?? r.quantity_refused)
        : null,
      justification: String(r.justification ?? ''),
    }
  })
}

export function DeclarationTable({ lines }: { lines: DeclarationTableLine[] }) {
  if (lines.length === 0) return null
  return (
    <section style={{ marginBottom: '1.25rem' }}>
      <h4 style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 700 }}>Déclaration livreur (produits)</h4>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr className="manager-table-head">
              {['Produit', 'Unité', 'Accepté', 'Refusé', 'Justification'].map((h) => (
                <th key={h} style={{ padding: '6px 8px', textAlign: 'left', fontWeight: 700 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lines.map((line, i) => (
              <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                <td style={{ padding: '6px 8px' }}>{line.productLabel || '—'}</td>
                <td style={{ padding: '6px 8px' }}>{line.unit}</td>
                <td style={{ padding: '6px 8px' }}>{line.quantityAccepted ?? '—'}</td>
                <td style={{ padding: '6px 8px' }}>{line.quantityRefused ?? '—'}</td>
                <td style={{ padding: '6px 8px', maxWidth: 160 }}>{line.justification || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

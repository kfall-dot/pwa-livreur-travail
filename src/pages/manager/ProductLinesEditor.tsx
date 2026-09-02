import { useEffect, useState } from 'react'
import { expectedProductLabelKey } from '../../../shared/expectedProducts'
import { confirmDeletion } from '../../lib/confirmDeletion'
import { authFetch } from './managerApi'
import { css, EmptyHint, LoadingHint } from './managerUi'
import { emptyProduct, type ProductLine, type ProductRow, type UnitRow } from './managerTypes'

function isLabelUsedOnOtherLine(lines: ProductLine[], lineIndex: number, label: string): boolean {
  const key = expectedProductLabelKey(label)
  if (!key) return false
  return lines.some((l, idx) => idx !== lineIndex && expectedProductLabelKey(l.label) === key)
}

export function ProductLinesEditor({
  lines,
  onChange,
  readOnly,
  disableAdd = false,
  catalogRefreshKey = 0,
}: {
  lines: ProductLine[]
  onChange: (lines: ProductLine[]) => void
  readOnly?: boolean
  /** Tournée issue d'un BC : l'ajout de produits hors BC est interdit (quantités modifiables). */
  disableAdd?: boolean
  catalogRefreshKey?: number
}) {
  const [catalog, setCatalog] = useState<ProductRow[]>([])
  const [units, setUnits] = useState<UnitRow[]>([])
  const [catalogError, setCatalogError] = useState<string | null>(null)
  const [catalogLoading, setCatalogLoading] = useState(true)
  const [duplicateHint, setDuplicateHint] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setCatalogLoading(true)
    setCatalogError(null)
    void Promise.all([
      authFetch('/dashboard/products'),
      authFetch('/dashboard/units'),
    ])
      .then(async ([productsRes, unitsRes]) => {
        const productsData = (await productsRes.json()) as { products?: ProductRow[]; message?: string }
        const unitsData = (await unitsRes.json()) as { units?: UnitRow[]; message?: string }
        if (!productsRes.ok) throw new Error(productsData.message || 'Impossible de charger le catalogue produits')
        if (!unitsRes.ok) throw new Error(unitsData.message || 'Impossible de charger les unités')
        if (!cancelled) {
          setCatalog((productsData.products ?? []).filter((p) => p.active !== false))
          setUnits((unitsData.units ?? []).filter((u) => u.active !== false))
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setCatalog([])
          setCatalogError(err instanceof Error ? err.message : 'Catalogue produits indisponible')
        }
      })
      .finally(() => {
        if (!cancelled) setCatalogLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [catalogRefreshKey])

  const update = (i: number, field: keyof ProductLine, val: string) => {
    setDuplicateHint(null)
    onChange(lines.map((l, idx) => (idx === i ? { ...l, [field]: val } : l)))
  }

  const add = () => {
    setDuplicateHint(null)
    onChange([...lines, emptyProduct()])
  }

  const remove = (i: number) => {
    const label = lines[i]?.label?.trim() || `produit ${i + 1}`
    if (!confirmDeletion(`Retirer « ${label} » de la liste des produits attendus ?`)) return
    setDuplicateHint(null)
    onChange(lines.filter((_, idx) => idx !== i))
  }

  const pickProduct = (i: number, productId: string) => {
    const prod = catalog.find((p) => p.id === productId)
    if (!prod) return
    if (isLabelUsedOnOtherLine(lines, i, prod.label)) {
      setDuplicateHint(
        `« ${prod.label} » est déjà dans la liste — modifiez la quantité sur la ligne existante.`,
      )
      return
    }
    setDuplicateHint(null)
    onChange(
      lines.map((l, idx) =>
        idx === i ? { label: prod.label, qty: l.qty || '1', unit: prod.unit } : l,
      ),
    )
  }

  const productSelectValue = (line: ProductLine) => {
    const match = catalog.find((p) => p.label === line.label)
    return match?.id ?? (line.label ? '__other__' : '')
  }

  const isCatalogProductDisabled = (lineIndex: number, product: ProductRow) =>
    isLabelUsedOnOtherLine(lines, lineIndex, product.label)

  return (
    <div style={{ marginTop: 10, background: readOnly ? '#f3f4f6' : '#f0f9ff', borderRadius: 8, padding: '0.75rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--brand)', textTransform: 'uppercase', letterSpacing: 0.6 }}>Produits attendus</span>
        {!readOnly && !disableAdd && (
          <button type="button" onClick={add} data-testid="mgr-add-product-line" style={{ fontSize: 12, background: 'none', border: '1px solid var(--brand)', borderRadius: 5, padding: '2px 10px', cursor: 'pointer', color: 'var(--brand)', fontFamily: 'inherit' }}>+ Ajouter</button>
        )}
        {!readOnly && disableAdd && (
          <span data-testid="mgr-products-locked-bc" style={{ fontSize: 11, color: '#6b7280' }}>🔒 Produits issus du BC — quantités modifiables uniquement</span>
        )}
      </div>
      {catalogLoading && (
        <LoadingHint>Chargement du catalogue…</LoadingHint>
      )}
      {catalogError && (
        <p style={{ margin: '0 0 8px', fontSize: 12, color: '#b91c1c' }} role="alert">{catalogError}</p>
      )}
      {duplicateHint && (
        <p style={{ margin: '0 0 8px', fontSize: 12, color: '#b91c1c' }} role="alert">{duplicateHint}</p>
      )}
      {lines.length === 0 && (
        <EmptyHint>{readOnly ? 'Aucun produit.' : 'Aucun produit — cliquez sur "+ Ajouter" pour en saisir.'}</EmptyHint>
      )}
      {lines.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto', gap: 6, marginBottom: 4, alignItems: 'center' }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>Produits</span>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>Qté</span>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>Unité</span>
          <span />
        </div>
      )}
      {lines.map((line, i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto', gap: 6, marginBottom: 6, alignItems: 'center' }}>
          <select
            data-testid={`mgr-product-select-${i}`}
            value={productSelectValue(line)}
            disabled={readOnly || catalogLoading}
            style={{ ...css.input, fontSize: 12 }}
            onChange={(e) => pickProduct(i, e.target.value)}
          >
            <option value="">Choisir un produit</option>
            {line.label && productSelectValue(line) === '__other__' && (
              <option value="__other__">{line.label}</option>
            )}
            {catalog.map((p) => (
              <option
                key={p.id}
                value={p.id}
                disabled={!readOnly && isCatalogProductDisabled(i, p)}
              >
                {p.label}
                {!readOnly && isCatalogProductDisabled(i, p) ? ' (déjà ajouté)' : ''}
              </option>
            ))}
          </select>
          <input type="number" min="1" value={line.qty} placeholder="Qté" disabled={readOnly} style={{ ...css.input, fontSize: 12 }} onChange={(e) => update(i, 'qty', e.target.value)} />
          <select value={line.unit} disabled={readOnly} style={{ ...css.input, fontSize: 12 }} onChange={(e) => update(i, 'unit', e.target.value)}>
            {units.map((u) => <option key={u.id} value={u.code}>{u.label}</option>)}
            {line.unit && !units.some((u) => u.code === line.unit) && (
              <option value={line.unit}>{line.unit}</option>
            )}
          </select>
          {!readOnly && (
            <button type="button" onClick={() => remove(i)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: 0 }}>×</button>
          )}
        </div>
      ))}
      {!readOnly && !catalogLoading && units.length === 0 && lines.length > 0 && (
        <p style={{ margin: '6px 0 0', fontSize: 11, color: '#64748b' }}>
          Aucune unité active — ouvrez l&apos;onglet « Unités de mesure » du catalogue.
        </p>
      )}
    </div>
  )
}

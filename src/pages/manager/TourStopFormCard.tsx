import { applySupermarketToStop, validateStopProducts } from './stopFormHelpers'
import { AlertBox, Field, Row } from './managerUi'
import { isSupermarketActive, type StopDraft, type Supermarket } from './managerTypes'
import { ProductLinesEditor } from './ProductLinesEditor'

export function TourStopFormCard({
  stop,
  index,
  supermarkets,
  locked,
  canRemove,
  onRemove,
  onChange,
  catalogRefreshKey = 0,
}: {
  stop: StopDraft
  index: number
  supermarkets: Supermarket[]
  locked?: boolean
  canRemove: boolean
  onRemove: () => void
  onChange: (next: StopDraft) => void
  catalogRefreshKey?: number
}) {
  const activePoints = supermarkets.filter((p) => isSupermarketActive(p.active))
  const selected = activePoints.find((p) => p.id === stop.supermarketId)
    ?? activePoints.find((p) => p.name === stop.name && p.address === stop.address)

  const updateField = (field: keyof StopDraft, value: string) =>
    onChange({ ...stop, [field]: value })

  const pickSupermarket = (id: string) => {
    const point = activePoints.find((p) => p.id === id)
    if (!point) {
      onChange({ ...stop, supermarketId: '', name: '', address: '', contactPhone: '', lat: undefined, lng: undefined })
      return
    }
    onChange(applySupermarketToStop(stop, point))
  }

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '1rem', marginBottom: '0.75rem', background: locked ? '#f3f1ed' : '#faf8f5', opacity: locked ? 0.85 : 1 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontWeight: 700, fontSize: 13, color: locked ? 'var(--text-muted)' : 'var(--brand)' }}>
          Arrêt {index + 1}{stop.name ? ` — ${stop.name}` : ''}
        </span>
        {canRemove && !locked && (
          <button type="button" onClick={onRemove} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 18 }}>×</button>
        )}
      </div>

      <Row>
        <Field label="Magasin / lieu *" style={{ flex: 2 }}>
          {locked ? (
            <input type="text" value={stop.name} disabled className="mgr-input" />
          ) : (
            <select
              data-testid={`mgr-stop-supermarket-${index}`}
              value={selected?.id ?? stop.supermarketId ?? ''}
              required
              className="mgr-input"
              onChange={(e) => pickSupermarket(e.target.value)}
            >
              <option value="">{activePoints.length === 0 ? 'Aucun point — onglet Catalogue → Points' : 'Choisir un point de livraison'}</option>
              {activePoints.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Réf. commande">
          <input
            type="text"
            data-testid={`mgr-stop-order-ref-${index}`}
            value={stop.orderRef}
            readOnly
            disabled={locked}
            title="Générée automatiquement"
            className="mgr-input" style={{ background: '#f3f4f6', color: '#374151' }}
          />
        </Field>
      </Row>

      {!selected && !locked && (
        <p style={{ margin: '0 0 8px', fontSize: 12, color: '#b45309', background: '#fffbeb', padding: '6px 8px', borderRadius: 6 }}>
          Chaque arrêt doit provenir du catalogue Chantiers.
        </p>
      )}

      {(selected || stop.address) && (
        <p style={{ margin: '0 0 8px', fontSize: 12, color: '#6b7280' }}>
          Adresse : {selected?.address ?? stop.address}
          {(selected?.contactPhone || stop.contactPhone) ? ` · ${selected?.contactPhone ?? stop.contactPhone}` : ''}
        </p>
      )}

      <Row>
        <Field label="Heure début">
          <input type="time" value={stop.timeWindowStart} disabled={locked} className="mgr-input" onChange={(e) => updateField('timeWindowStart', e.target.value)} />
        </Field>
        <Field label="Heure fin">
          <input type="time" value={stop.timeWindowEnd} disabled={locked} className="mgr-input" onChange={(e) => updateField('timeWindowEnd', e.target.value)} />
        </Field>
        <Field label="Photos requises">
          <input type="number" min="1" max="5" value={stop.requiredPhotos} disabled={locked} className="mgr-input" onChange={(e) => updateField('requiredPhotos', e.target.value)} />
        </Field>
      </Row>
      <Row>
        <Field label="Instructions">
          <input type="text" value={stop.instructions} placeholder="Accès quai arrière…" disabled={locked} className="mgr-input" onChange={(e) => updateField('instructions', e.target.value)} />
        </Field>
      </Row>

      {!locked && stop.products.length === 0 && (
        <p style={{ margin: '0 0 8px', fontSize: 12, color: '#b45309', background: '#fffbeb', padding: '6px 8px', borderRadius: 6 }}>
          Ajoutez au moins un produit attendu — les quantités et unités se définissent ci-dessous (plus de ligne « unité / quantité / poids » séparée).
        </p>
      )}

      <ProductLinesEditor
        lines={stop.products}
        readOnly={locked}
        catalogRefreshKey={catalogRefreshKey}
        onChange={(lines) => onChange({ ...stop, products: lines })}
      />
    </div>
  )
}

const replanSpinnerStyle: React.CSSProperties = {
  display: 'inline-block',
  width: 14,
  height: 14,
  border: '2px solid #bcd4c6',
  borderTopColor: 'var(--brand)',
  borderRadius: '50%',
  animation: 'mgr-replan-spin 0.7s linear infinite',
  verticalAlign: 'middle',
  marginRight: 8,
  flexShrink: 0,
}

export function ReplanBanner({
  sourceDate,
  targetDate,
  kind = 'tour',
  loading = false,
  onDismiss,
}: {
  sourceDate: string
  targetDate?: string
  kind?: 'tour' | 'partial'
  loading?: boolean
  onDismiss: () => void
}) {
  const sourceFr = new Date(sourceDate + 'T12:00:00').toLocaleDateString('fr-FR')
  const targetFr = targetDate
    ? new Date(targetDate + 'T12:00:00').toLocaleDateString('fr-FR')
    : null
  const dateHint = targetFr
    ? ` Date proposée : ${targetFr} (modifiable ci-dessous).`
    : ' Choisissez une date puis créez la tournée.'
  const message =
    kind === 'partial'
      ? `Replanification du reliquat (livraison partielle du ${sourceFr}) — quantités refusées pré-remplies, modifiables.${dateHint}`
      : `Replanification depuis la tournée du ${sourceFr} — arrêts non livrés pré-remplis (modifiables).${dateHint}`
  return (
    <>
      <style>{'@keyframes mgr-replan-spin { to { transform: rotate(360deg); } }'}</style>
      <div
        data-testid="mgr-replan-banner"
        style={{ background: '#f0f7f3', border: '1px solid #bcd4c6', borderRadius: 8, padding: '10px 12px', marginBottom: 12, display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}
      >
        <span style={{ fontSize: 13, color: 'var(--brand)', display: 'flex', alignItems: 'center', gap: 8 }}>
          {loading ? (
            <>
              <span data-testid="mgr-replan-loading" style={replanSpinnerStyle} aria-hidden />
              Chargement de la replanification…
            </>
          ) : message}
        </span>
        <button type="button" onClick={onDismiss} className="mgr-btn mgr-btn--ghost">Effacer</button>
      </div>
    </>
  )
}

export function StopsValidationHint({ stops }: { stops: StopDraft[] }) {
  const missingPoint = stops.some((s) => !s.supermarketId?.trim())
  const missingProducts = stops.some((s) => s.products.filter((p) => p.label.trim()).length === 0)
  const duplicateProducts = stops
    .map((s) => validateStopProducts(s.products, s.name.trim() || undefined))
    .find((msg) => msg != null)
  if (!missingPoint && !missingProducts && !duplicateProducts) return null
  return (
    <AlertBox>
      {missingPoint ? 'Chaque arrêt doit provenir du catalogue Chantiers. ' : ''}
      {missingProducts ? 'Chaque arrêt doit avoir au moins un produit attendu. ' : ''}
      {duplicateProducts ?? ''}
    </AlertBox>
  )
}

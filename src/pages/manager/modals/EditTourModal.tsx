import { useEffect, useRef, useState } from 'react'
import { confirmDeletion } from '../../../lib/confirmDeletion'
import { authFetch } from '../managerApi'
import { toast } from '../../../lib/toast'
import { AlertBox, DashboardStatusBadge, Field, LoadingHint, Row } from '../managerUi'
import { isStopClosedForEdit, StopProductsSummary, expectedProductsDisplay, stopClosedEditHint } from '../productHelpers'
import { buildStopApiPayload, matchSupermarketId, validateStopProducts } from '../stopFormHelpers'
import { StopsValidationHint, TourStopFormCard } from '../TourStopFormCard'
import {
  emptyStop,
  type DriverRow,
  type StopDetail,
  type StopDraft,
  type Supermarket,
  type TourDetail,
} from '../managerTypes'

export function EditTourModal({
  tourId,
  drivers,
  supermarkets,
  onClose,
  onSaved,
}: {
  tourId: string
  drivers: DriverRow[]
  supermarkets: Supermarket[]
  onClose: () => void
  onSaved: (savedDate: string) => void
}) {
  const [tour, setTour] = useState<TourDetail | null>(null)
  const [stops, setStops] = useState<StopDraft[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const initialStopIdsRef = useRef<string[]>([])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    authFetch(`/dashboard/tours/${tourId}`)
      .then((r) => r.json())
      .then((data: { tour: TourDetail; stops: StopDetail[] }) => {
        if (cancelled) return
        setTour(data.tour)
        initialStopIdsRef.current = data.stops.map((s) => s.id)
        const drafts = data.stops.map((s) => ({
          _id: s.id,
          supermarketId: s.supermarketId || matchSupermarketId(supermarkets, s.name, s.address),
          name: s.name,
          address: s.address,
          instructions: s.instructions ?? '',
          units: String(s.units),
          unitType: s.unitType,
          weightKg: s.weightKg ?? '',
          orderRef: s.orderRef,
          contactPhone: s.contactPhone ?? '',
          timeWindowStart: s.timeWindowStart ?? '',
          timeWindowEnd: s.timeWindowEnd ?? '',
          requiredPhotos: String(s.requiredPhotos),
          status: s.status,
          declarationLines: s.declarationLines ?? null,
          declarationOutcome: s.declarationOutcome ?? null,
          products: Array.isArray(s.products)
            ? s.products.map((p) => ({ label: p.label, qty: String(p.qty), unit: p.unit }))
            : [],
        }))
        setStops(drafts as unknown as StopDraft[])
        setLoading(false)
      })
      .catch(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
    // Charger une seule fois par tourId — ne pas recharger quand le catalogue arrive
    // (sinon le dépôt / arrêts saisis sont écrasés).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tourId])

  // Compléter supermarketId dès que le catalogue est dispo, sans toucher au reste du formulaire
  useEffect(() => {
    if (supermarkets.length === 0) return
    setStops((prev) =>
      prev.map((s) =>
        s.supermarketId?.trim()
          ? s
          : { ...s, supermarketId: matchSupermarketId(supermarkets, s.name, s.address) || s.supermarketId },
      ),
    )
  }, [supermarkets])

  const addStop = () => setStops((p) => [...p, emptyStop()])
  const removeStop = (idx: number) => {
    if (isStopClosedForEdit(stops[idx]?.status, stops[idx]?.declarationOutcome)) return
    const label = stops[idx]?.name?.trim() || `arrêt ${idx + 1}`
    if (!confirmDeletion(`Supprimer l'arrêt « ${label} » de cette tournée ?`)) return
    setStops((p) => p.filter((_, i) => i !== idx))
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!tour) return
    const currentIds = stops
      .map((s) => String((s as unknown as Record<string, unknown>)._id ?? ''))
      .filter(Boolean)
    const removedCount = initialStopIdsRef.current.filter((id) => !currentIds.includes(id)).length
    if (removedCount > 0) {
      const n = removedCount
      if (!confirmDeletion(`${n} arrêt${n > 1 ? 's' : ''} seront supprimés définitivement de la base.`)) return
    }
    setError(null)
    const editableMissingCatalog = stops.some(
      (s) => !isStopClosedForEdit(s.status, s.declarationOutcome) && !s.supermarketId?.trim(),
    )
    if (editableMissingCatalog) {
      setError('Chaque arrêt doit provenir du catalogue Chantiers.')
      return
    }
    const duplicateProducts = stops
      .filter((s) => !isStopClosedForEdit(s.status, s.declarationOutcome))
      .map((s) => validateStopProducts(s.products, s.name.trim() || undefined))
      .find((msg) => msg != null)
    if (duplicateProducts) {
      setError(duplicateProducts)
      return
    }
    setSaving(true)
    try {
      const res = await authFetch(`/dashboard/tours/${tourId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          driverId: tour.driverId,
          date: tour.date,
          depotName: tour.depotName,
          depotAddress: tour.depotAddress,
          stops: stops.map((s) => {
            const locked = isStopClosedForEdit(s.status, s.declarationOutcome)
            if (locked) {
              return {
                id: (s as unknown as Record<string, unknown>)._id ?? undefined,
                supermarketId: s.supermarketId || undefined,
                name: s.name,
                address: s.address,
                instructions: s.instructions || undefined,
                units: Number(s.units) || 1,
                unitType: s.unitType,
                weightKg: s.weightKg || '0',
                orderRef: s.orderRef,
                contactPhone: s.contactPhone || undefined,
                timeWindowStart: s.timeWindowStart || undefined,
                timeWindowEnd: s.timeWindowEnd || undefined,
                requiredPhotos: Number(s.requiredPhotos) || 1,
                products: s.products.filter((p) => p.label.trim()).map((p) => ({ label: p.label.trim(), qty: Number(p.qty) || 1, unit: p.unit })),
              }
            }
            const sm = supermarkets.find((p) => p.id === s.supermarketId)
            return {
              id: (s as unknown as Record<string, unknown>)._id ?? undefined,
              ...buildStopApiPayload(s, sm),
            }
          }),
        }),
      })
      const data = (await res.json()) as { ok?: boolean; message?: string }
      if (!res.ok) throw new Error(data.message ?? 'Erreur')
      toast.success('Tournée mise à jour.')
      onSaved(tour.date)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 1000, overflowY: 'auto', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '2rem 1rem' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 680, padding: '1.75rem', boxShadow: '0 8px 32px rgba(0,0,0,.18)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>Modifier la tournée</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#9ca3af', lineHeight: 1 }}>×</button>
        </div>

        {loading && <LoadingHint />}
        {error && <AlertBox>{error}</AlertBox>}

        {!loading && tour && (
          <form onSubmit={(e) => void handleSave(e)}>
            <Row>
              <Field label="Livreur *" style={{ flex: 2 }}>
                <select value={tour.driverId} required className="mgr-input" onChange={(e) => setTour((p) => p ? { ...p, driverId: e.target.value } : p)}>
                  {drivers.filter((d) => d.status === 'active').map((d) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </Field>
              <Field label="Date *">
                <input type="date" value={tour.date} required className="mgr-input" onChange={(e) => setTour((p) => p ? { ...p, date: e.target.value } : p)} />
              </Field>
            </Row>
            <Row>
              <Field label="Nom du dépôt *" style={{ flex: 2 }}>
                <input type="text" data-testid="mgr-edit-tour-depot" value={tour.depotName} required className="mgr-input" onChange={(e) => setTour((p) => p ? { ...p, depotName: e.target.value } : p)} />
              </Field>
            </Row>
            <Row>
              <Field label="Adresse du dépôt *" style={{ flex: 1 }}>
                <input type="text" value={tour.depotAddress} required className="mgr-input" onChange={(e) => setTour((p) => p ? { ...p, depotAddress: e.target.value } : p)} />
              </Field>
            </Row>

            <div style={{ borderTop: '1px solid var(--border)', margin: '1.25rem 0 1rem', paddingTop: '1.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Arrêts ({stops.length})</h3>
                <button type="button" onClick={addStop} className="mgr-btn mgr-btn--outline">+ Ajouter un arrêt</button>
              </div>
              <StopsValidationHint stops={stops.filter((s) => !isStopClosedForEdit(s.status, s.declarationOutcome))} />

              {stops.map((s, idx) => {
                const locked = isStopClosedForEdit(s.status, s.declarationOutcome)
                if (locked) {
                  return (
                    <div key={idx} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '1rem', marginBottom: '0.75rem', background: '#f3f4f6', opacity: 0.85 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, alignItems: 'center' }}>
                        <span style={{ fontWeight: 700, fontSize: 13, color: '#6b7280' }}>
                          Arrêt {idx + 1}{s.name ? ` — ${s.name}` : ''}
                        </span>
                        <DashboardStatusBadge status={s.status ?? 'pending'} declarationOutcome={s.declarationOutcome} />
                      </div>
                      <p style={{ margin: '0 0 10px', fontSize: 12, color: '#6b7280' }}>
                        {stopClosedEditHint(s.status, s.declarationOutcome)}
                      </p>
                      <p style={{ margin: '0 0 8px', fontSize: 12, color: '#6b7280' }}>Adresse : {s.address}</p>
                      <StopProductsSummary
                        expected={expectedProductsDisplay(
                          s.products.filter((p) => p.label.trim()).map((p) => ({ label: p.label.trim(), qty: Number(p.qty) || 1, unit: p.unit })),
                          Number(s.units) || 1,
                          s.unitType,
                        )}
                        declarationLines={s.declarationLines}
                        status={s.status}
                        declarationOutcome={s.declarationOutcome}
                      />
                    </div>
                  )
                }
                return (
                  <TourStopFormCard
                    key={idx}
                    stop={s}
                    index={idx}
                    supermarkets={supermarkets}
                    canRemove={stops.length > 1}
                    onRemove={() => removeStop(idx)}
                    onChange={(next) => setStops((prev) => prev.map((st, i) => i === idx ? next : st))}
                  />
                )
              })}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button type="button" onClick={onClose} className="mgr-btn mgr-btn--ghost">Annuler</button>
              <button type="submit" disabled={saving} className="mgr-btn mgr-btn--primary">
                {saving ? 'Sauvegarde…' : 'Enregistrer les modifications'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

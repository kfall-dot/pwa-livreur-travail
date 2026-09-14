import { useCallback, useEffect, useRef, useState } from 'react'
import { authFetch, fetchSupermarkets } from '../managerApi'
import { defaultReplanDate } from '../../../lib/dates'
import { todayIso, tourLifecycleLabel } from '../managerConstants'
import { emptyStop, normalizeSupermarkets } from '../managerTypes'
import type { DriverRow, StopDraft, Supermarket, TourRow } from '../managerTypes'
import { css, EmptyHint } from '../managerUi'
import { matchSupermarketId, validateStopProducts, buildStopApiPayload } from '../stopFormHelpers'
import type { ProcurementRole, ProcurementTourPrefill } from '../procurement/procurementTypes'
import { ReplanBanner, StopsValidationHint, TourStopFormCard } from '../TourStopFormCard'
import { EditTourModal } from '../modals/EditTourModal'
import { confirmDeletion } from '../../../lib/confirmDeletion'

// ─── CSS maquette planifier-tour-v1 ──────────────────────────────────────────

const PL_CSS = `
.pl{max-width:1180px}
.pl h1{font-size:22px;font-weight:800;color:#1e3a5f;margin:0}
.pl-sub{color:#64748b;font-size:13px;margin:4px 0 0}
.pl-topbar{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;margin-bottom:6px;flex-wrap:wrap}
.pl-actions{display:flex;gap:8px}
.pl-btn{border:1px solid #e2e8f0;background:#fff;border-radius:8px;padding:8px 14px;font-size:13px;font-weight:600;color:#1e3a5f;cursor:pointer;font-family:inherit}
.pl-btn-primary{background:#1e3a5f;border-color:#1e3a5f;color:#fff}
.pl-btn-gold{background:#fdf3e0;border-color:#ecd9b0;color:#b7791f}
.pl-btn:disabled{opacity:.55;cursor:not-allowed}
.pl-alert{background:#fffbeb;border:1px solid #fde68a;border-radius:12px;padding:12px 16px;font-size:13px;color:#b45309;margin:16px 0}
.pl-cols{display:grid;grid-template-columns:340px 1fr;gap:16px;align-items:start}
.pl-card{background:#fff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;margin-bottom:16px}
.pl-card-head{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:14px 16px;border-bottom:1px solid #e2e8f0;flex-wrap:wrap}
.pl-card-head h2,.pl-card-head h3{font-size:14px;font-weight:700;color:#1e3a5f;margin:0}
.pl-card-body{padding:16px}
.pl-field{margin-bottom:14px}
.pl-field label{display:block;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#64748b;margin-bottom:6px}
.pl-field input,.pl-field select{width:100%;border:1px solid #cbd5e1;border-radius:8px;padding:9px 12px;font-size:13px;font-family:inherit;color:#334155;background:#fff;box-sizing:border-box}
.pl-pill{display:inline-block;padding:2px 10px;border-radius:999px;font-size:11px;font-weight:700;white-space:nowrap}
.pl-pill-amber{background:#fffbeb;color:#b45309}
.pl-pill-navy{background:#eef3f8;color:#1e3a5f}
.pl-tour{display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;padding:12px 0;border-bottom:1px solid #f1f5f9}
.pl-tour:last-child{border-bottom:none}
.pl-tour .nm{font-weight:700;font-size:13px;color:#1e3a5f}
.pl-tour .meta{font-size:12px;color:#64748b}
.pl-summary{display:flex;gap:14px;align-items:center;flex-wrap:wrap;background:#1e3a5f;color:#fff;border-radius:12px;padding:14px 18px;margin-top:16px}
.pl-summary .big{font-size:17px;font-weight:800}
.pl-summary .lbl{font-size:11px;text-transform:uppercase;letter-spacing:.5px;opacity:.75}
.pl-summary .sep{width:1px;height:26px;background:rgba(255,255,255,.25)}
.pl-summary .spacer{flex:1}
.pl-summary .pl-btn-primary{background:#fff;color:#1e3a5f;border-color:#fff}
.pl-hint{font-size:11.5px;color:#64748b;margin-top:5px}
@media (max-width: 900px){.pl-cols{grid-template-columns:1fr}}
`

export function PlanifierTab({
  handleAuth,
  catalogRefreshKey = 0,
  useFournisseurLabels = false,
  procurementRole = null,
  initialEditTourId,
  onEditConsumed,
  initialPlanifierDate,
  onPlanifierDateConsumed,
  initialProcurementPrefill,
  onProcurementPrefillConsumed,
  onTourSaved,
  // REPLAN DÉSACTIVÉ — bouton retiré ; prop conservée pour compatibilité.
  onInlineReplanStart: _onInlineReplanStart,
  initialReplanTourId,
  initialReplanDeliveryId,
  initialReplanHintDate,
  onReplanConsumed,
  onTourCreated,
  onReplanCancelled,
  onTasksChanged,
}: {
  handleAuth: (s: number) => boolean
  catalogRefreshKey?: number
  useFournisseurLabels?: boolean
  /** Modifier une tournée est réservé au Service Achats (SA). */
  procurementRole?: ProcurementRole | null
  initialEditTourId?: string | null
  onEditConsumed?: () => void
  initialPlanifierDate?: string | null
  onPlanifierDateConsumed?: () => void
  initialProcurementPrefill?: ProcurementTourPrefill | null
  onProcurementPrefillConsumed?: () => void
  onTourSaved?: (savedDate: string) => void
  initialReplanTourId?: string | null
  initialReplanDeliveryId?: string | null
  initialReplanHintDate?: string | null
  onReplanConsumed?: () => void
  onTourCreated?: (date: string) => void
  onReplanCancelled?: (sourceDate?: string | null) => void
  onInlineReplanStart?: () => void
  onTasksChanged?: () => void
}) {
  const [date, setDate] = useState(todayIso)
  const [tours, setTours] = useState<TourRow[]>([])
  const [drivers, setDrivers] = useState<DriverRow[]>([])
  const [driversLoading, setDriversLoading] = useState(true)
  const [driversError, setDriversError] = useState<string | null>(null)
  const [supermarkets, setSupermarkets] = useState<Supermarket[]>([])
  const [catalogReady, setCatalogReady] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [replanSourceDate, setReplanSourceDate] = useState<string | null>(null)
  const [replanSourceTourId, setReplanSourceTourId] = useState<string | null>(null)
  const [replanKind, setReplanKind] = useState<'tour' | 'partial'>('tour')
  const [newTour, setNewTour] = useState(() => ({
    driverId: '',
    date: todayIso(),
    depotName: '',
    depotAddress: '',
    tourStart: '06:00',
    tourEnd: '18:00',
  }))
  const [stops, setStops] = useState<StopDraft[]>([emptyStop()])
  const [editTourId, setEditTourId] = useState<string | null>(initialEditTourId ?? null)
  const [formVersion, setFormVersion] = useState(0)
  const [replanLoading, setReplanLoading] = useState(false)
  const [replanSessionActive, setReplanSessionActive] = useState(false)
  const replanLoadRef = useRef(0)
  const replanIntentRef = useRef<{ tourId?: string; hintSourceDate?: string | null } | null>(null)
  const createFormRef = useRef<HTMLFormElement | null>(null)
  // Lien BC du brouillon en cours — en state (lu pendant le rendu pour les
  // verrous produits ; un ref déclencherait react-hooks/refs).
  const [procurementRequestId, setProcurementRequestId] = useState<string | null>(null)
  const [procurementOrderId, setProcurementOrderId] = useState<string | null>(null)

  const resetCreateForm = useCallback(() => {
    replanLoadRef.current += 1
    replanIntentRef.current = null
    setReplanLoading(false)
    setReplanSessionActive(false)
    setNewTour({
      driverId: '',
      date: todayIso(),
      depotName: '',
      depotAddress: '',
      tourStart: '06:00',
      tourEnd: '18:00',
    })
    setStops([emptyStop()])
    setReplanSourceDate(null)
    setReplanSourceTourId(null)
    setReplanKind('tour')
    setCreateError(null)
    setProcurementRequestId(null)
    setProcurementOrderId(null)
    setFormVersion((v) => v + 1)
  }, [])

  const isReplanActive = !!(
    replanSessionActive
    || replanSourceDate
    || replanSourceTourId
    || replanLoading
    || initialReplanTourId
  )

  const cancelReplan = useCallback(() => {
    const wasReplan = !!(
      replanSessionActive
      || replanSourceDate
      || replanSourceTourId
      || replanLoading
      || replanIntentRef.current
      || initialReplanTourId
    )
    const sourceDate =
      replanSourceDate
      ?? replanIntentRef.current?.hintSourceDate
      ?? initialReplanHintDate
      ?? null

    replanLoadRef.current += 1
    resetCreateForm()

    if (wasReplan) {
      onReplanCancelled?.(sourceDate)
    }
  }, [
    replanSessionActive,
    replanSourceDate,
    replanSourceTourId,
    replanLoading,
    initialReplanTourId,
    initialReplanHintDate,
    resetCreateForm,
    onReplanCancelled,
  ])

  useEffect(() => {
    if (initialEditTourId) {
      setEditTourId(initialEditTourId)
      onEditConsumed?.()
      void authFetch(`/dashboard/tours/${initialEditTourId}`)
        .then((r) => r.json())
        .then((data: { tour?: { date?: string } }) => {
          if (data.tour?.date) setDate(data.tour.date)
        })
        .catch(() => {})
    }
  }, [initialEditTourId, onEditConsumed])

  useEffect(() => {
    if (initialPlanifierDate) {
      setDate(initialPlanifierDate)
      onPlanifierDateConsumed?.()
    }
  }, [initialPlanifierDate, onPlanifierDateConsumed])

  useEffect(() => {
    if (!initialProcurementPrefill || !catalogReady) return
    const p = initialProcurementPrefill
    const smId = matchSupermarketId(supermarkets, p.stopName, p.stopAddress)
    setProcurementRequestId(p.purchaseRequestId)
    setProcurementOrderId(p.purchaseOrderId ?? null)
    setNewTour({
      driverId: p.driverId ?? '',
      date: p.date,
      depotName: p.depotName,
      depotAddress: p.depotAddress,
      tourStart: '06:00',
      tourEnd: '18:00',
    })
    setDate(p.date)
    setStops([
      {
        ...emptyStop(),
        supermarketId: smId || undefined,
        name: p.stopName,
        address: p.stopAddress,
        orderRef: p.orderRef,
        instructions: `Livraison matériaux — ${p.orderRef}`,
        products: p.products.map((x) => ({ label: x.label, qty: String(x.qty), unit: x.unit })),
      },
    ])
    setFormVersion((v) => v + 1)
    onProcurementPrefillConsumed?.()
    window.setTimeout(() => {
      createFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 50)
  }, [initialProcurementPrefill, onProcurementPrefillConsumed, catalogReady, supermarkets])

  const loadReplanTemplate = useCallback(async (
    tourId: string,
    partialDeliveryId?: string,
    hintSourceDate?: string | null,
  ) => {
    const loadId = ++replanLoadRef.current
    replanIntentRef.current = { tourId, hintSourceDate: hintSourceDate ?? null }
    setReplanSessionActive(true)
    setReplanLoading(true)
    setCreateError(null)
    const url = partialDeliveryId
      ? `/dashboard/deliveries/${encodeURIComponent(partialDeliveryId)}/partial-replan-template`
      : `/dashboard/tours/${encodeURIComponent(tourId)}/replan-template`
    let res: Response
    try {
      res = await authFetch(url)
    } catch {
      if (loadId !== replanLoadRef.current) return
      setReplanLoading(false)
      setCreateError('Impossible de charger la replanification')
      return
    }
    if (loadId !== replanLoadRef.current) return
    if (handleAuth(res.status)) {
      setReplanLoading(false)
      return
    }
    const data = await res.json() as {
      sourceDate?: string
      replanKind?: 'tour' | 'partial'
      driverId?: string
      depotName?: string
      depotAddress?: string
      purchaseRequestId?: string
      purchaseOrderId?: string
      stops?: Array<{
        name: string
        address: string
        lat: string
        lng: string
        instructions: string
        orderRef: string
        contactPhone: string
        timeWindowStart: string
        timeWindowEnd: string
        requiredPhotos: string
        supermarketId?: string
        products: Array<{ label: string; qty: string; unit: string }>
      }>
      message?: string
    }
    if (loadId !== replanLoadRef.current) return
    if (!res.ok) {
      setReplanLoading(false)
      setCreateError(data.message ?? 'Impossible de charger la replanification')
      return
    }
    const sourceDate = data.sourceDate ?? hintSourceDate ?? null
    const replanDate = defaultReplanDate(sourceDate)
    replanIntentRef.current = { tourId, hintSourceDate: sourceDate }
    setReplanSourceDate(sourceDate)
    setReplanLoading(false)
    setReplanKind(data.replanKind ?? (partialDeliveryId ? 'partial' : 'tour'))
    // Conserver le lien BC pour le verrouillage des produits lors de la replan
    if (data.purchaseRequestId) {
      setProcurementRequestId(data.purchaseRequestId)
      setProcurementOrderId(data.purchaseOrderId ?? null)
    } else {
      setProcurementRequestId(null)
      setProcurementOrderId(null)
    }
    setReplanSourceTourId(partialDeliveryId ? null : tourId)
    setNewTour((p) => ({
      ...p,
      driverId: data.driverId ?? p.driverId,
      date: replanDate,
      depotName: data.depotName ?? p.depotName,
      depotAddress: data.depotAddress ?? p.depotAddress,
    }))
    setStops((data.stops ?? []).map((s) => ({
      supermarketId: s.supermarketId || matchSupermarketId(supermarkets, s.name, s.address),
      lat: s.lat,
      lng: s.lng,
      name: s.name,
      address: s.address,
      instructions: s.instructions,
      units: '1',
      unitType: 'colis',
      weightKg: '0',
      orderRef: s.orderRef,
      contactPhone: s.contactPhone,
      timeWindowStart: s.timeWindowStart,
      timeWindowEnd: s.timeWindowEnd,
      requiredPhotos: s.requiredPhotos,
      products: s.products.length > 0 ? s.products : [],
    })))
    if ((data.stops ?? []).length === 0) setStops([emptyStop()])
    setFormVersion((v) => v + 1)
    createFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [handleAuth, supermarkets])

  useEffect(() => {
    if (initialReplanTourId) {
      setReplanSessionActive(true)
      replanIntentRef.current = {
        tourId: initialReplanTourId,
        hintSourceDate: initialReplanHintDate ?? null,
      }
    }
  }, [initialReplanTourId, initialReplanHintDate])

  useEffect(() => {
    if (!initialReplanTourId || supermarkets.length === 0) return
    void loadReplanTemplate(
      initialReplanTourId,
      initialReplanDeliveryId ?? undefined,
      initialReplanHintDate ?? undefined,
    )
    onReplanConsumed?.()
  // Ne pas re-déclencher quand loadReplanTemplate change (ex. chargement supermarchés)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialReplanTourId, initialReplanDeliveryId, initialReplanHintDate, supermarkets.length])

  const toursFetchGen = useRef(0)
  const fetchTours = useCallback(async (d: string) => {
    const gen = ++toursFetchGen.current
    const res = await authFetch(`/dashboard/tours?date=${d}`)
    if (gen !== toursFetchGen.current) return
    if (handleAuth(res.status)) return
    const data = await res.json() as { tours: TourRow[] }
    if (gen !== toursFetchGen.current) return
    setTours(data.tours ?? [])
  }, [handleAuth])

  useEffect(() => { void fetchTours(date) }, [date, fetchTours])

  const loadSupermarkets = useCallback(async () => {
    try {
      const res = await fetchSupermarkets()
      if (handleAuth(res.status)) return
      if (!res.ok) return
      const data = await res.json() as { supermarkets: Supermarket[] }
      setSupermarkets(normalizeSupermarkets(data.supermarkets ?? []))
    } finally {
      setCatalogReady(true)
    }
  }, [handleAuth])

  const loadDrivers = useCallback(async () => {
    setDriversLoading(true)
    setDriversError(null)
    try {
      const res = await authFetch('/dashboard/drivers')
      if (handleAuth(res.status)) return
      const data = await res.json() as { drivers?: DriverRow[]; message?: string }
      if (!res.ok) {
        setDrivers([])
        setDriversError(data.message ?? 'Impossible de charger les livreurs')
        return
      }
      setDrivers(data.drivers ?? [])
    } catch {
      setDrivers([])
      setDriversError('Impossible de charger les livreurs')
    } finally {
      setDriversLoading(false)
    }
  }, [handleAuth])

  useEffect(() => {
    void loadDrivers()
    void loadSupermarkets()
  }, [loadDrivers, loadSupermarkets])

  useEffect(() => {
    if (catalogRefreshKey === 0) return
    void loadSupermarkets()
  }, [catalogRefreshKey, loadSupermarkets])

  const addStop = () => setStops((p) => [...p, emptyStop()])
  const removeStop = (idx: number) => {
    const stop = stops[idx]
    const label = stop?.name?.trim() || `arrêt ${idx + 1}`
    if (!confirmDeletion(`Retirer « ${label} » du brouillon de tournée ?`)) return
    setStops((p) => p.filter((_, i) => i !== idx))
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault(); setCreateError(null); setCreating(true)
    const invalidPoint = stops.some((s) => !s.supermarketId?.trim())
    const invalidProducts = stops.some((s) => s.products.filter((p) => p.label.trim()).length === 0)
    const duplicateProducts = stops
      .map((s) => validateStopProducts(s.products, s.name.trim() || undefined))
      .find((msg) => msg != null)
    if (invalidPoint || invalidProducts || duplicateProducts) {
      setCreateError(
        duplicateProducts ??
          (invalidPoint
            ? 'Chaque arrêt doit provenir du catalogue Chantiers.'
            : 'Chaque arrêt doit avoir au moins un produit attendu.'),
      )
      setCreating(false)
      return
    }
    try {
      const createdDate = newTour.date
      const res = await authFetch('/dashboard/tours', {
        method: 'POST',
        body: JSON.stringify({
          driverId: newTour.driverId,
          date: newTour.date,
          depotName: newTour.depotName,
          depotAddress: newTour.depotAddress,
          ...(replanSourceTourId ? { replannedFromTourId: replanSourceTourId } : {}),
          ...(procurementRequestId
            ? {
                purchaseRequestId: procurementRequestId,
                ...(procurementOrderId
                  ? { purchaseOrderId: procurementOrderId }
                  : {}),
              }
            : {}),
          stops: stops.map((s) => {
            const sm = supermarkets.find((p) => p.id === s.supermarketId)
            return buildStopApiPayload(s, sm)
          }),
        }),
      })
      const data = await res.json() as { ok?: boolean; message?: string }
      if (!res.ok) throw new Error(data.message ?? 'Erreur')
      setNewTour((p) => ({ ...p, driverId: '', depotName: '', depotAddress: '' }))
      setStops([emptyStop()])
      setReplanSourceDate(null)
      setReplanSourceTourId(null)
      setReplanKind('tour')
      setReplanSessionActive(false)
      setProcurementRequestId(null)
      setProcurementOrderId(null)
      await fetchTours(createdDate)
      setDate(createdDate)
      onTasksChanged?.()
      onTourCreated?.(createdDate)
    } catch (err) { setCreateError(err instanceof Error ? err.message : 'Erreur') }
    finally { setCreating(false) }
  }

  const dateFr = new Date(date + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <div className="pl">
      <style>{PL_CSS}</style>
      <div className="pl-topbar">
        <div>
          <h1>Planifier une tournée</h1>
          <p className="pl-sub">Créez la tournée d'un livreur : dépôt de départ, arrêts, produits et créneau horaire — 06:00 → 18:00.</p>
        </div>
        <div className="pl-actions">
          <button type="button" data-testid="mgr-replan-cancel" onClick={cancelReplan} className="pl-btn">
            {isReplanActive ? 'Annuler la replanification' : 'Annuler'}
          </button>
          <button type="submit" form="pl-form" data-testid="mgr-create-tour" className="pl-btn pl-btn-primary" disabled={creating}>
            {creating ? 'Création…' : '💾 Enregistrer la tournée'}
          </button>
        </div>
      </div>

      {createError && <div className="pl-alert"><span>⚠️ {createError}</span></div>}
      {isReplanActive && (
        <ReplanBanner
          sourceDate={replanSourceDate ?? initialReplanHintDate ?? date}
          targetDate={newTour.date}
          kind={replanKind}
          loading={replanLoading}
          onDismiss={cancelReplan}
        />
      )}

      <form ref={createFormRef} id="pl-form" onSubmit={(e) => void handleCreate(e)} data-testid="mgr-planifier-form">
        <div className="pl-cols">
          <div className="pl-col">
            <div className="pl-card">
              <div className="pl-card-head">
                <h2 data-testid="mgr-planifier-form-title">Paramètres de la tournée</h2>
                {replanSourceDate ? <span className="pl-pill pl-pill-amber">Replanification</span> : <span className="pl-pill pl-pill-navy">Brouillon</span>}
              </div>
              <div className="pl-card-body">
                <div className="pl-field">
                  <label>Date de la tournée *</label>
                  <input type="date" data-testid="mgr-planifier-date" value={newTour.date} required onChange={(e) => setNewTour((p) => ({ ...p, date: e.target.value }))} />
                  <div className="pl-hint">La tournée apparaîtra dans le dashboard du livreur à cette date.</div>
                </div>
                <div className="pl-field">
                  <label>Créneau horaire</label>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input type="time" value={newTour.tourStart} onChange={(e) => setNewTour((p) => ({ ...p, tourStart: e.target.value }))} />
                    <span style={{ color: '#94a3b8' }}>→</span>
                    <input type="time" value={newTour.tourEnd} onChange={(e) => setNewTour((p) => ({ ...p, tourEnd: e.target.value }))} />
                  </div>
                </div>
                <div className="pl-field">
                  <label>Livreur *</label>
                  <select
                    data-testid="mgr-create-driver"
                    value={newTour.driverId}
                    required
                    disabled={driversLoading || drivers.filter((d) => d.status === 'active').length === 0}
                    onChange={(e) => setNewTour((p) => ({ ...p, driverId: e.target.value }))}
                  >
                    <option value="">
                      {driversLoading
                        ? 'Chargement des livreurs…'
                        : drivers.filter((d) => d.status === 'active').length === 0
                          ? 'Aucun livreur actif'
                          : 'Choisir un livreur'}
                    </option>
                    {drivers.filter((d) => d.status === 'active').map((d) => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                  {driversError && (
                    <p style={{ margin: '6px 0 0', fontSize: 13, color: '#b91c1c' }}>
                      {driversError}{' '}
                      <button type="button" onClick={() => void loadDrivers()} className="pl-btn" style={{ padding: '2px 8px', fontSize: 12 }}>Réessayer</button>
                    </p>
                  )}
                  {!driversLoading && !driversError && drivers.filter((d) => d.status === 'active').length === 0 && (
                    <p className="pl-hint">Ajoutez ou réactivez un livreur dans l'onglet Équipe.</p>
                  )}
                </div>
                <div className="pl-field">
                  <label>{useFournisseurLabels ? 'Fournisseur *' : 'Nom du dépôt *'}</label>
                  <input type="text" data-testid="mgr-create-depot" value={newTour.depotName} required placeholder={useFournisseurLabels ? 'Ex: CimIvoire' : 'Ex: Entrepôt Nord'} onChange={(e) => setNewTour((p) => ({ ...p, depotName: e.target.value }))} />
                </div>
                <div className="pl-field">
                  <label>{useFournisseurLabels ? 'Adresse du fournisseur *' : 'Adresse du dépôt *'}</label>
                  <input type="text" data-testid="mgr-create-depot-address" value={newTour.depotAddress} required placeholder={useFournisseurLabels ? 'Adresse du fournisseur' : '12 Rue des Logistiques, Abidjan…'} onChange={(e) => setNewTour((p) => ({ ...p, depotAddress: e.target.value }))} />
                </div>
              </div>
            </div>
          </div>

            <div className="pl-col">
              <div className="pl-card">
                <div className="pl-card-head">
                  <h2>Arrêts de la tournée ({stops.length})</h2>
                  <button type="button" onClick={addStop} className="pl-btn pl-btn-gold">+ Ajouter un arrêt</button>
                </div>
                <div className="pl-card-body">
                  {replanSourceDate && <StopsValidationHint stops={stops} />}
                  {stops.map((s, idx) => (
                    <TourStopFormCard
                      key={`${formVersion}-${idx}`}
                      stop={s}
                      index={idx}
                      supermarkets={supermarkets}
                      catalogRefreshKey={catalogRefreshKey}
                      canRemove={stops.length > 1}
                      productsLocked={!!procurementRequestId}
                      onRemove={() => removeStop(idx)}
                      onChange={(next) => setStops((prev) => prev.map((st, i) => i === idx ? next : st))}
                    />
                  ))}
                </div>
              </div>
              <div className="pl-summary">
                <div><div className="lbl">Livreur</div><div className="big">{drivers.find((d) => d.id === newTour.driverId)?.name ?? '—'}</div></div>
                <div className="sep" />
                <div><div className="lbl">Date</div><div className="big">{new Date(newTour.date + 'T12:00:00').toLocaleDateString('fr-FR')}</div></div>
                <div className="sep" />
                <div><div className="lbl">Arrêts</div><div className="big">{stops.length}</div></div>
                <div className="sep" />
                <div><div className="lbl">Créneau</div><div className="big">{newTour.tourStart} → {newTour.tourEnd}</div></div>
                <div className="spacer" />
              </div>
            </div>
        </div>
      </form>

      <div className="pl-card">
        <div className="pl-card-head"><h2>Tournées du {dateFr}</h2></div>
        <div className="pl-card-body">
        {tours.length === 0
          ? <EmptyHint>Aucune tournée planifiée pour cette date.</EmptyHint>
          : tours.map((t) => (
            <div key={t.tourId} className="pl-tour">
              <div>
                <div className="nm">{t.driverName}</div>
                <div className="meta">{t.totalStops} arrêt(s) · {t.delivered} livré(s) · {t.depotName}</div>
                <div style={{ fontSize: 11, color: 'var(--brand)', marginTop: 2 }} data-testid={`mgr-planifier-tour-status-${t.tourId}`}>
                  {tourLifecycleLabel(t.delivered, t.totalStops)}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {/* REPLAN DÉSACTIVÉ — bouton « Replanifier » retiré (on garde « Modifier »).
                {t.delivered < t.totalStops && (
                  <button
                    type="button"
                    data-testid={`mgr-planifier-replan-${t.tourId}`}
                    onClick={() => {
                      onInlineReplanStart?.()
                      void loadReplanTemplate(t.tourId, undefined, t.tourDate)
                    }}
                    style={css.btnOutline}
                  >
                    Replanifier
                  </button>
                )}
                */}
                {/* Modifier une tournée : réservé au Service Achats (SA). */}
                {procurementRole === 'purchasing' && (
                  <button type="button" onClick={() => setEditTourId(t.tourId)} style={css.btnOutline}>Modifier</button>
                )}
                {t.delivered === 0 && (
                  <button
                    type="button"
                    data-testid={`mgr-planifier-delete-${t.tourId}`}
                    onClick={async () => {
                      if (!confirmDeletion(`Supprimer définitivement la tournée de « ${t.driverName} » (${t.totalStops} arrêt${t.totalStops > 1 ? 's' : ''}) ?`)) {
                        return
                      }
                      const res = await authFetch(`/dashboard/tours/${encodeURIComponent(t.tourId)}`, { method: 'DELETE' })
                      const data = (await res.json()) as { message?: string }
                      if (!res.ok) {
                        window.alert(data.message ?? 'Suppression impossible')
                        return
                      }
                      void fetchTours(date)
                      onTourSaved?.(date)
                      onTasksChanged?.()
                    }}
                    style={css.btnDanger}
                  >
                    Supprimer
                  </button>
                )}
              </div>
            </div>
          ))
        }
      {editTourId && (
        <EditTourModal
          tourId={editTourId}
          drivers={drivers}
          supermarkets={supermarkets}
          onClose={() => setEditTourId(null)}
          onSaved={(savedDate) => {
            setEditTourId(null)
            if (savedDate !== date) setDate(savedDate)
            void fetchTours(savedDate)
            onTourSaved?.(savedDate)
            onTasksChanged?.()
          }}
        />
      )}
        </div>
      </div>
    </div>
  )
}

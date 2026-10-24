import { useCallback, useEffect, useState } from 'react'
import { authFetch } from '../managerApi'
import { apiErrorMessage } from '../../../lib/apiError'
import { formatQuantityWithUnit } from '../../../lib/deliveryUnits'
import { css } from './procurementUi'

type Site = { id: string; name: string }
export type ConfirmedSiteMaterial = { siteId: string; productLabel: string; unit: string; onHand: number }
export type PlannedSiteDelivery = { id: string; date: string; supplierName: string; reference: string; status: string; products: Array<{ label: string; qty: number; unit: string }> | null; units: number; unit: string }

export function PlannedDeliveriesTable({ deliveries }: { deliveries: PlannedSiteDelivery[] }) {
  if (!deliveries.length) return <p>Aucune livraison prévue sur ce chantier.</p>
  return <table style={{ ...css.lineTable, width: '100%' }} data-testid="mgr-chef-planned-deliveries">
    <thead><tr>{['Date prévue', 'Fournisseur', 'BC', 'Matériaux attendus', 'Statut'].map(label => <th key={label} style={css.lineTh}>{label}</th>)}</tr></thead>
    <tbody>{deliveries.map(delivery => <tr key={delivery.id}>
      <td style={css.lineTd}>{new Date(`${delivery.date}T12:00:00`).toLocaleDateString('fr-FR')}</td>
      <td style={css.lineTd}>{delivery.supplierName}</td><td style={css.lineTd}>{delivery.reference}</td>
      <td style={css.lineTd}>{delivery.products?.length ? delivery.products.map((product, i) => <div key={i}>{product.label} : {formatQuantityWithUnit(product.qty, product.unit)}</div>) : formatQuantityWithUnit(delivery.units, delivery.unit)}</td>
      <td style={css.lineTd}>{delivery.status === 'in_progress' ? 'En cours' : delivery.status === 'otp_sent' ? 'À confirmer' : 'Prévue'}</td>
    </tr>)}</tbody>
  </table>
}

export function ConfirmedMaterialsTable({ rows }: { rows: ConfirmedSiteMaterial[] }) {
  const available = rows.filter(row => row.onHand > 0)
  if (!available.length) return <p data-testid="mgr-chef-stock-empty">Aucun matériau réceptionné sur ce chantier pour le moment.</p>
  return <table style={{ ...css.lineTable, width: '100%' }} data-testid="mgr-chef-stock-table">
    <thead><tr><th style={css.lineTh}>Matériau</th><th style={css.lineTh}>Quantité disponible</th></tr></thead>
    <tbody>{available.map(row => <tr key={`${row.productLabel}|${row.unit}`}><td style={css.lineTd}>{row.productLabel}</td><td style={{ ...css.lineTd, fontWeight: 700 }}>{formatQuantityWithUnit(row.onHand, row.unit)}</td></tr>)}</tbody>
  </table>
}

/** Vue CdC : quantités issues des réceptions confirmées, sans données financières. */
export function ChefSiteStock({ handleAuth, refreshKey }: { handleAuth: (status: number) => boolean; refreshKey?: number }) {
  const [sites, setSites] = useState<Site[]>([])
  const [siteId, setSiteId] = useState('')
  const [rows, setRows] = useState<ConfirmedSiteMaterial[]>([])
  const [deliveries, setDeliveries] = useState<PlannedSiteDelivery[]>([])
  const [loadedSiteId, setLoadedSiteId] = useState('')
  const [loadingSites, setLoadingSites] = useState(true)
  const [loadingStock, setLoadingStock] = useState(false)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  const refresh = useCallback(() => setRevision(value => value + 1), [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const response = await authFetch('/daily-reports/my-sites')
        if (handleAuth(response.status)) return
        if (!response.ok) throw await apiErrorMessage(response, 'Chargement des chantiers impossible')
        const body = await response.json() as { sites: Site[] }
        if (!cancelled) {
          setSites(body.sites)
          setSiteId(current => body.sites.some(site => site.id === current) ? current : body.sites[0]?.id ?? '')
        }
      } catch (err) { if (!cancelled) setError(err instanceof Error ? err.message : 'Chargement impossible') }
      finally { if (!cancelled) setLoadingSites(false) }
    })()
    return () => { cancelled = true }
  }, [handleAuth, refreshKey, revision])

  useEffect(() => {
    if (!siteId) return
    const controller = new AbortController()
    setRows([]); setDeliveries([]); setLoadingStock(true); setError('')
    void (async () => {
      try {
        const response = await authFetch(`/procurement/site-stock?siteId=${encodeURIComponent(siteId)}`, { signal: controller.signal })
        if (handleAuth(response.status)) return
        if (!response.ok) throw await apiErrorMessage(response, 'Stock du chantier indisponible')
        const body = await response.json() as { rows: ConfirmedSiteMaterial[]; deliveries: PlannedSiteDelivery[] }
        if (!controller.signal.aborted) { setRows(body.rows.filter(row => row.siteId === siteId)); setDeliveries(body.deliveries ?? []); setLoadedSiteId(siteId) }
      } catch (err) { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : 'Stock indisponible') }
      finally { if (!controller.signal.aborted) setLoadingStock(false) }
    })()
    return () => controller.abort()
  }, [siteId, handleAuth, refreshKey, revision])

  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') refresh() }
    window.addEventListener('focus', refresh)
    const timer = window.setInterval(onVisible, 60_000)
    return () => { window.removeEventListener('focus', refresh); window.clearInterval(timer) }
  }, [refresh])

  return <section data-testid="mgr-chef-site-stock">
    <h2 style={css.sectionTitle}>Matériaux disponibles sur chantier</h2>
    <p>Quantités réceptionnées et acceptées lors des livraisons confirmées.</p>
    <div style={{ ...css.actionRow, marginBottom: 16 }}>
      <label htmlFor="chef-stock-site">Chantier</label>
      <select id="chef-stock-site" value={siteId} disabled={loadingSites || !sites.length} onChange={event => setSiteId(event.target.value)} style={css.input} data-testid="mgr-chef-stock-site">
        {!sites.length && <option value="">{loadingSites ? 'Chargement…' : 'Aucun chantier affecté'}</option>}
        {sites.map(site => <option key={site.id} value={site.id}>{site.name}</option>)}
      </select>
      <button type="button" style={css.btnOutline} disabled={loadingStock || loadingSites} onClick={refresh}>Actualiser</button>
    </div>
    {error && <p role="alert">{error}</p>}
    {!loadingSites && !sites.length && !error && <p>Aucun chantier ne vous est actuellement affecté.</p>}
    {siteId && <div style={css.card} aria-busy={loadingStock}>
      <h3>{sites.find(site => site.id === siteId)?.name}</h3>
      <h4>Matériaux disponibles</h4>
      {loadingStock || loadedSiteId !== siteId ? !error && <p>Chargement des matériaux…</p> : !error && <>
        <ConfirmedMaterialsTable rows={rows} />
        <h4 style={{ marginTop: 24 }}>Livraisons prévues</h4>
        <p>Ces quantités attendues ne sont pas incluses dans les matériaux disponibles.</p>
        <div style={{ overflowX: 'auto' }}><PlannedDeliveriesTable deliveries={deliveries} /></div>
      </>}
    </div>}
  </section>
}

import { useCallback, useEffect, useMemo, useState } from 'react'
import { authFetch } from '../managerApi'
import { todayIso } from '../managerConstants'
import type { DeliveryRow } from '../managerTypes'
import { DeliveryDetailModal } from '../modals/DeliveryDetailModal'
import { confirmDeletion } from '../../../lib/confirmDeletion'
import type { ProcurementRole } from '../procurement/procurementTypes'
import { AlertBox, EmptyHint, LoadingHint } from '../managerUi'
import { suiviQuantityDisplay, formatProductQuantityLine } from '../productHelpers'
import { toast } from '../../../lib/toast'
import { deliveryBucket, type DeliveryBucket } from '../../../lib/deliveryBucket'

interface SuiviTourGroup {
  tourId: string
  tourDate: string
  driverName: string
  depotName: string
  deliveries: DeliveryRow[]
  deliveredCount: number
}

interface SuiviTabProps {
  handleAuth: (s: number) => boolean
  procurementRole: ProcurementRole | null
  onEditTour?: (tourId: string, tourDate: string) => void
  onReplanTour?: (tourId: string, sourceDate: string) => void
  pendingDeliveryId?: string | null
  onPendingDeliveryConsumed?: () => void
  pendingDate?: string | null
  onPendingDateConsumed?: () => void
  refreshKey?: number
  /** Plus monté par l'UI (bandeau « Voir les tâches » retiré — demande CMPT) ; conservé pour l'appelant. */
  pendingTaskCount?: number
  /** Plus monté par l'UI (bandeau retiré) ; conservé pour l'appelant. */
  onGoToTasks?: () => void
}

/** Chantier proposé au filtre (chantiers ayant au moins un BC émis). */
interface ChantierOption {
  id: string
  name: string
  supermarketId: string | null
  bcCount: number
}

/** « septembre 2026 » depuis `YYYY-MM` (en-tête de la vue mois). */
function monthLabel(monthIso: string): string {
  const [y, m] = monthIso.split('-').map(Number)
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) return monthIso
  return new Date(y, m - 1, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
}

/** « 23/09/2026 » depuis `YYYY-MM-DD`. */
function dayLabel(dayIso: string): string {
  return dayIso.split('-').reverse().join('/')
}

// Classement des livraisons (tuiles, chips, badge) : source unique dans
// src/lib/deliveryBucket.ts — voir ce module pour la règle « déclaration
// (partielle / refusée) prime sur le statut delivered ».

interface SuiviTourGroup {
  tourId: string
  tourDate: string
  driverName: string
  depotName: string
  deliveries: DeliveryRow[]
  deliveredCount: number
}

function groupDeliveriesByTour(deliveries: DeliveryRow[]): SuiviTourGroup[] {
  const groups: SuiviTourGroup[] = []
  const byTour = new Map<string, SuiviTourGroup>()
  for (const d of deliveries) {
    let group = byTour.get(d.tourId)
    if (!group) {
      group = {
        tourId: d.tourId,
        tourDate: d.tourDate,
        driverName: d.driverName,
        depotName: d.depotName,
        deliveries: [],
        deliveredCount: 0,
      }
      byTour.set(d.tourId, group)
      groups.push(group)
    }
    group.deliveries.push(d)
    if (d.status === 'delivered') group.deliveredCount += 1
  }
  return groups
}
// CSS maquette livraison-manager-v1 (copié tel quel, sélecteurs scopés sous .lvm)
const LM_CSS = `
.lvm{font-family:'Inter',-apple-system,'Segoe UI',sans-serif;color:#1e293b}
.lvm .page-header{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;margin-bottom:20px;flex-wrap:wrap}
.lvm .page-header h1{font-size:22px;font-weight:800;color:#1e3a5f;margin:0}
.lvm .page-header .sub{font-size:13px;color:#64748b;margin-top:4px}
.lvm .role-pill{background:#1e3a5f;color:#fff;border-radius:999px;padding:5px 14px;font-size:12px;font-weight:600;white-space:nowrap}
.lvm .header-actions{display:flex;gap:8px}
.lvm .btn{border:1px solid #cbd5e1;background:#fff;color:#334155;border-radius:8px;padding:8px 14px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit}
.lvm .btn-primary{background:#1e3a5f;border-color:#1e3a5f;color:#fff}
.lvm .kpi-row{display:grid;grid-template-columns:repeat(5,1fr);gap:12px;margin-bottom:20px}
.lvm .kpi{background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:14px 16px}
.lvm .kpi .label{font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:#64748b;font-weight:600}
.lvm .kpi .value{font-size:24px;font-weight:800;margin-top:4px;color:#1e3a5f}
.lvm .kpi .value.warn{color:#b45309}
.lvm .kpi .value.ok{color:#15803d}
.lvm .kpi .detail{font-size:12px;color:#64748b;margin-top:2px}
.lvm .kpi .icon{float:right;font-size:17px}
.lvm .filters{background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:12px 16px;display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:16px}
.lvm .filters select,.lvm .filters input{border:1px solid #cbd5e1;border-radius:8px;padding:7px 10px;font-size:13px;color:#334155;background:#fff;font-family:inherit}
.lvm .filters .spacer{flex:1}
.lvm .filters .field{display:inline-flex;align-items:center;gap:6px;white-space:nowrap}
.lvm .chip{border-radius:999px;padding:5px 12px;font-size:12px;font-weight:600;background:#f1f5f9;color:#475569;cursor:pointer;border:none;font-family:inherit}
.lvm .chip.active{background:#1e3a5f;color:#fff}
.lvm .card{background:#fff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden}
.lvm .card-head{display:flex;justify-content:space-between;align-items:center;padding:14px 16px;border-bottom:1px solid #e2e8f0}
.lvm .card-head h2{font-size:14px;font-weight:700;color:#1e3a5f;margin:0}
.lvm table{width:100%;border-collapse:collapse;font-size:13px}
.lvm thead th{text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.4px;color:#64748b;font-weight:700;padding:10px 14px;background:#f8fafc;border-bottom:1px solid #e2e8f0;white-space:nowrap}
.lvm tbody td{padding:12px 14px;border-bottom:1px solid #f1f5f9;vertical-align:middle}
.lvm tbody tr:hover{background:#f8fafc;cursor:pointer}
.lvm .ref{font-weight:700;color:#1e3a5f}
.lvm .muted{color:#94a3b8;font-size:12px}
.lvm .mono{font-variant-numeric:tabular-nums}
.lvm .badge{border-radius:999px;padding:3px 10px;font-size:11.5px;font-weight:700;white-space:nowrap;display:inline-block}
.lvm .b-pending{background:#fef3c7;color:#92400e}
.lvm .b-progress{background:#dbeafe;color:#1d4ed8}
.lvm .b-otp{background:#ede9fe;color:#6d28d9}
.lvm .b-delivered{background:#dcfce7;color:#15803d}
.lvm .b-failed{background:#fee2e2;color:#b91c1c}
.lvm .qty-bar{width:110px;height:7px;background:#f1f5f9;border-radius:4px;overflow:hidden;margin-top:4px}
.lvm .qty-bar>div{height:100%;background:#1e3a5f;border-radius:4px}
.lvm .qty-bar>div.partial{background:#f59e0b}
.lvm .row-actions{display:flex;gap:6px}
.lvm .btn-sm{border:1px solid #cbd5e1;background:#fff;border-radius:7px;padding:4px 10px;font-size:12px;font-weight:600;color:#334155;cursor:pointer;white-space:nowrap;font-family:inherit}
.lvm .btn-sm.gold{background:#b45309;border-color:#b45309;color:#fff}
.lvm .btn-sm.danger{background:#b91c1c;border-color:#b91c1c;color:#fff}
.lvm .tourbar{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px}
.lvm .tour-chip{display:inline-flex;align-items:center;gap:8px;background:#fff;border:1px solid #e2e8f0;border-radius:999px;padding:6px 8px 6px 14px;font-size:12.5px;font-weight:600;color:#334155}
.lvm .tour-chip .mini{border:none;background:#f1f5f9;border-radius:999px;padding:3px 10px;font-size:11px;font-weight:700;color:#334155;cursor:pointer;font-family:inherit}
.lvm .note{margin-top:18px;font-size:12.5px;color:#64748b;line-height:1.6}
.lvm .note b{color:#334155}
`

// Statuts maquette livraison-manager-v1 : classes badge + libellés
function lmStatusClass(status: string | null | undefined, declarationOutcome?: string | null): string {
  const s = (status ?? '').toLowerCase()
  // La déclaration prime sur le statut : partielle / refusée = écart, même
  // quand l'arrêt est passé à « delivered ». 'refused' = repli données anciennes.
  if (declarationOutcome === 'partial' || declarationOutcome === 'rejected' || declarationOutcome === 'refused' || s.includes('partial') || s.includes('fail') || s.includes('refus')) return 'b-failed'
  if (s.includes('deliver') || s.includes('validat')) return 'b-delivered'
  if (s.includes('otp')) return 'b-otp'
  if (s.includes('progress')) return 'b-progress'
  return 'b-pending'
}

function lmStatusLabel(status: string | null | undefined, declarationOutcome?: string | null): string {
  const s = (status ?? '').toLowerCase()
  if (declarationOutcome === 'rejected' || declarationOutcome === 'refused' || s.includes('refus')) return 'Refusée'
  if (declarationOutcome === 'partial' || s.includes('partial') || s.includes('fail')) return 'Écart'
  if (s.includes('deliver') || s.includes('validat')) return 'Livrée'
  if (s.includes('otp')) return 'OTP envoyé'
  if (s.includes('progress')) return 'En cours'
  return 'En attente'
}


export function SuiviTab({
  handleAuth,
  procurementRole,
  onEditTour,
  // REPLAN DÉSACTIVÉ — bouton retiré ; prop conservée pour compatibilité.
  onReplanTour: _onReplanTour,
  pendingDeliveryId,
  onPendingDeliveryConsumed,
  pendingDate,
  onPendingDateConsumed,
  refreshKey,
  // BANDEAU « Voir les tâches » RETIRÉ (demande CMPT) — props `pendingTaskCount`
  // et `onGoToTasks` conservées dans SuiviTabProps pour compatibilité appelant.
}: SuiviTabProps) {
  // Modification des tournées/livraisons : réservée au SA. Les gestionnaires
  // sans rôle BTP (héritage, rôle null) conservent l'accès complet.
  // Modifier une tournée est réservé au Service Achats (SA) — même pour les
  // managers sans rôle achats (consultation seule).
  const canModify = procurementRole === 'purchasing'
  const [date, setDate] = useState(() => pendingDate ?? todayIso())
  const [bucket, setBucket] = useState<DeliveryBucket>('all')
  // Toutes les livraisons de la période (mois ou jour, chantier inclus) : les
  // tuiles se calculent dessus ; les chips ne filtrent que le tableau.
  const [period, setPeriod] = useState<DeliveryRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  // Vue par défaut de la page : toutes les livraisons du mois courant. Le filtre
  // « Jour » bascule sur une seule date ; « Voir tout le mois » revient au mois.
  const [scope, setScope] = useState<'month' | 'day'>('month')
  const [month, setMonth] = useState(() => (pendingDate ?? todayIso()).slice(0, 7))
  const [siteId, setSiteId] = useState('')
  const [sites, setSites] = useState<ChantierOption[]>([])

  const deliveries = useMemo(
    () => (bucket === 'all' ? period : period.filter((d) => deliveryBucket(d) === bucket)),
    [period, bucket],
  )
  const tourGroups = useMemo(() => groupDeliveriesByTour(deliveries), [deliveries])

  // Tuiles = compteurs de la période affichée (mois ou jour) : elles ne bougent
  // pas quand un chip de statut est sélectionné.
  const kpi = useMemo(() => {
    const counts = { pending: 0, progress: 0, otp: 0, delivered: 0, failed: 0 }
    for (const d of period) counts[deliveryBucket(d)] += 1
    return counts
  }, [period])

  const fetch_ = useCallback(async () => {
    setLoading(true); setError(null)
    const params = new URLSearchParams()
    if (scope === 'day') params.set('date', date)
    else params.set('month', month)
    if (siteId) params.set('siteId', siteId)
    const res = await authFetch(`/dashboard/deliveries?${params.toString()}`)
    if (handleAuth(res.status)) return
    const data = await res.json() as { deliveries: DeliveryRow[]; total: number; validated: number }
    setPeriod(data.deliveries ?? [])
    setLoading(false)
  }, [date, month, scope, siteId, handleAuth])

  const deleteTour = async (tourId: string, driverName: string, deliveredCount: number) => {
    if (deliveredCount > 0) {
      window.alert('Impossible de supprimer : au moins un arrêt est déjà livré.')
      return
    }
    if (!confirmDeletion(`Supprimer définitivement la tournée de « ${driverName} » et tous ses arrêts ?`)) {
      return
    }
    const res = await authFetch(`/dashboard/tours/${encodeURIComponent(tourId)}`, { method: 'DELETE' })
    if (handleAuth(res.status)) return
    const data = (await res.json()) as { message?: string }
    if (!res.ok) {
      window.alert(data.message ?? 'Suppression impossible')
      return
    }
    void fetch_()
  }

  useEffect(() => { void fetch_() }, [fetch_])

  // Menu « Chantier » : chantiers ayant au moins un BC émis (source achats).
  useEffect(() => {
    void (async () => {
      const res = await authFetch('/procurement/sites/with-bc')
      if (handleAuth(res.status) || !res.ok) return
      const data = (await res.json()) as { sites?: ChantierOption[] }
      setSites(data.sites ?? [])
    })()
  }, [handleAuth])

  useEffect(() => {
    if (refreshKey === undefined || refreshKey === 0) return
    void fetch_()
  }, [refreshKey, fetch_])

  useEffect(() => {
    if (pendingDate) {
      setDate(pendingDate)
      setMonth(pendingDate.slice(0, 7))
      setScope('day')
      onPendingDateConsumed?.()
    }
  }, [pendingDate, onPendingDateConsumed])

  useEffect(() => {
    if (pendingDeliveryId) {
      setSelectedId(pendingDeliveryId)
      onPendingDeliveryConsumed?.()
    }
  }, [pendingDeliveryId, onPendingDeliveryConsumed, deliveries])

  return (
    <div className="lvm">
      <style>{LM_CSS}</style>

      {/* Bandeau « Voir les tâches » retiré (demande CMPT) : entrée redondante
          pour les rôles qui ont « Tâches » dans la barre latérale, inaccessible
          pour les autres (onglet réservé à la logistique / au SA). */}

      <div className="page-header">
        <div>
          <h1>🚚 Livraisons</h1>
          <div className="sub">Suivi en temps réel des livraisons — photos, quantités déclarées, OTP.</div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <div className="header-actions">
            <button type="button" className="btn" onClick={() => toast.info('Export CSV : bientôt disponible')}>Exporter CSV</button>
            <button type="button" className="btn btn-primary" onClick={() => void fetch_()}>Actualiser</button>
          </div>
        </div>
      </div>

      <div className="kpi-row">
        <div className="kpi"><span className="icon">📦</span><div className="label">En attente</div><div className="value" data-testid="mgr-suivi-kpi-pending">{kpi.pending}</div><div className="detail">planifiées, non démarrées</div></div>
        <div className="kpi"><span className="icon">🛣️</span><div className="label">En cours</div><div className="value warn" data-testid="mgr-suivi-kpi-progress">{kpi.progress}</div><div className="detail">livreur parti du dépôt</div></div>
        <div className="kpi"><span className="icon">🔐</span><div className="label">OTP envoyé</div><div className="value warn" data-testid="mgr-suivi-kpi-otp">{kpi.otp}</div><div className="detail">en attente de saisie client</div></div>
        <div className="kpi"><span className="icon">✅</span><div className="label">Livrées</div><div className="value ok" data-testid="mgr-suivi-kpi-delivered">{kpi.delivered}</div><div className="detail">sur {period.length} prévues</div></div>
        <div className="kpi"><span className="icon">⚠️</span><div className="label">Échecs / écarts</div><div className="value warn" data-testid="mgr-suivi-kpi-failed">{kpi.failed}</div><div className="detail">quantité ≠ attendue</div></div>
      </div>

      <div className="filters">
        <button type="button" data-testid="mgr-suivi-chip-all" className={bucket === 'all' ? 'chip active' : 'chip'} onClick={() => setBucket('all')}>Toutes</button>
        <button type="button" data-testid="mgr-suivi-chip-otp" className={bucket === 'otp' ? 'chip active' : 'chip'} onClick={() => setBucket('otp')}>OTP bloqué</button>
        <button type="button" data-testid="mgr-suivi-chip-partial" className={bucket === 'failed' ? 'chip active' : 'chip'} onClick={() => setBucket('failed')}>Écarts</button>
        <button type="button" data-testid="mgr-suivi-chip-delivered" className={bucket === 'delivered' ? 'chip active' : 'chip'} onClick={() => setBucket('delivered')}>Livrées</button>
        <span className="spacer" />
        <span className="field">
          <label style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>Mois</label>
          <input
            type="month"
            data-testid="mgr-suivi-month"
            value={month}
            onChange={(e) => { if (!e.target.value) return; setMonth(e.target.value); setScope('month') }}
          />
        </span>
        <span className="field">
          <label style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>Jour</label>
          <input type="date" data-testid="mgr-suivi-date" value={date} onChange={(e) => setDate(e.target.value)} />
        </span>
        <button
          type="button"
          className="btn btn-primary"
          data-testid="mgr-suivi-filter-day"
          onClick={() => { if (scope === 'day') void fetch_(); else setScope('day') }}
        >
          Filtrer
        </button>
        {scope === 'day' && (
          <button
            type="button"
            className="btn"
            data-testid="mgr-suivi-filter-month"
            onClick={() => { setMonth(date.slice(0, 7)); setScope('month') }}
          >
            Voir tout le mois
          </button>
        )}
        <span className="field">
          <label style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>Chantier</label>
          <select data-testid="mgr-suivi-site" value={siteId} onChange={(e) => setSiteId(e.target.value)}>
            <option value="">Tous les chantiers</option>
            {sites.map((s) => (
              <option key={s.id} value={s.id}>{s.name} · {s.bcCount} BC</option>
            ))}
          </select>
        </span>
      </div>

      {error && <AlertBox>{error}</AlertBox>}
      {loading && <LoadingHint />}
      {!loading && period.length === 0 && (
        <EmptyHint>{scope === 'month' ? 'Aucune livraison pour ce mois.' : 'Aucune livraison pour ce filtre.'}</EmptyHint>
      )}
      {!loading && period.length > 0 && deliveries.length === 0 && (
        <EmptyHint>Aucune livraison ne correspond à ce filtre.</EmptyHint>
      )}

      {scope === 'day' && tourGroups.length > 0 && (
        <div className="tourbar" data-testid="mgr-suivi-tourbar">
          {tourGroups.map((group) => (
            <span key={group.tourId} className="tour-chip">
              🛣️ {group.driverName}
              {canModify && (
                <>
                  <button type="button" data-testid={`mgr-suivi-edit-${group.tourId}`} className="mini" onClick={() => onEditTour?.(group.tourId, group.tourDate)}>Modifier</button>
                  {group.deliveredCount === 0 && (
                    <button type="button" data-testid={`mgr-suivi-delete-${group.tourId}`} className="mini" onClick={() => void deleteTour(group.tourId, group.driverName, group.deliveredCount)}>Supprimer</button>
                  )}
                </>
              )}
            </span>
          ))}
        </div>
      )}

      {deliveries.length > 0 && (
        <div className="card">
          <div className="card-head">
            <h2 data-testid="mgr-suivi-list-title">
              {scope === 'month' ? `Livraisons de ${monthLabel(month)}` : `Livraisons du ${dayLabel(date)}`}
            </h2>
            <span className="muted">
              {deliveries.length} livraison{deliveries.length > 1 ? 's' : ''}
              {scope === 'day' ? ` · ${tourGroups.length} tournée${tourGroups.length > 1 ? 's' : ''}` : ''}
              {' '}· clic sur une ligne pour le détail
            </span>
          </div>
          <table data-testid="mgr-suivi-deliveries-table">
            <thead>
              <tr>
                <th>Référence</th>{scope === 'month' && <th>Date</th>}<th>Chantier / Magasin</th><th>Livreur</th><th>Statut</th><th>Quantités</th><th>Dépôt</th><th aria-hidden="true"></th>
              </tr>
            </thead>
            <tbody>
              {deliveries.map((d) => {
                const cls = lmStatusClass(d.status, d.declarationOutcome)
                const label = lmStatusLabel(d.status, d.declarationOutcome)
                const q = suiviQuantityDisplay(d.products, d.units, d.unitType)
                return (
                  <tr key={d.deliveryId} onClick={() => setSelectedId(d.deliveryId)}>
                    <td className="ref">{d.deliveryId.slice(0, 8).toUpperCase()}</td>
                    {scope === 'month' && <td className="muted">{dayLabel(d.tourDate)}</td>}
                    <td>
                      <div style={{ fontWeight: 700, color: '#1e3a5f' }}>{d.deliveryName}</div>
                      <div className="muted">{d.deliveryAddress}</div>
                    </td>
                    <td>{d.driverName}</td>
                    <td><span className={`badge ${cls}`}>{label}</span></td>
                    <td className="mono">
                      {q[0] ? (
                        <>
                          {formatProductQuantityLine(q[0])}
                          <div className="qty-bar"><div className={d.declarationOutcome && d.declarationOutcome !== 'complete' ? 'partial' : ''} /></div>
                        </>
                      ) : <span className="muted">—</span>}
                    </td>
                    <td className="muted">{d.depotName}</td>
                    <td>
                      <div className="row-actions" onClick={(e) => e.stopPropagation()}>
                        <button type="button" className="btn-sm gold" onClick={() => setSelectedId(d.deliveryId)}>Détail</button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="note"><b>Astuce :</b> cliquez sur une ligne pour ouvrir le détail complet — photos reçues, quantités déclarées vs attendues, assistance OTP et historique.</p>

      {selectedId && (
        <DeliveryDetailModal
          deliveryId={selectedId}
          canModify={procurementRole === 'purchasing'}
          onClose={() => setSelectedId(null)}
          onEditTour={(tourId, tourDate) => { setSelectedId(null); onEditTour?.(tourId, tourDate) }}
        />
      )}
    </div>
  )
}
// ─── Tab: Planifier une tournée ───────────────────────────────────────────────

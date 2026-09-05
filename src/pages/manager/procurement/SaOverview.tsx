import { useMemo, useState } from 'react'
import { css, formatFcfa, ProcurementStatusBadge } from './procurementUi'
import type { PurchaseRequestRow } from './procurementTypes'

/** Statuts qui attendent une action du Service Achats (dossiers à traiter). */
const SA_TODO_STATUSES: PurchaseRequestRow['status'][] = ['submitted', 'sa_review', 'po_ready']
/** Statuts « BC en cours » : BC émis, livraison planifiée pas encore confirmée. */
const SA_BC_ONGOING_STATUSES: PurchaseRequestRow['status'][] = ['delivery_scheduled']

/** Accord pluriel : « Dossier à traiter » / « Dossiers à traiter ». */
function dossiersLabel(n: number): string {
  return n > 1 ? 'Dossiers à traiter' : 'Dossier à traiter'
}

/** Tuiles KPI du dashboard SA — même style que les cartes du dashboard CdG. */
function SaKpiCard({
  icon,
  bg,
  color,
  label,
  value,
  detail,
  testId,
}: {
  icon: string
  bg: string
  color: string
  label: string
  value: string
  detail: string
  testId: string
}) {
  return (
    <div style={{ ...css.card, flex: '1 1 200px', minWidth: 200 }} data-testid={testId}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ ...css.meta, textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 6 }}>
            {label}
          </div>
          <div style={{ fontSize: 26, fontWeight: 700, color }}>{value}</div>
          <div style={{ ...css.meta, marginTop: 4 }}>{detail}</div>
        </div>
        <div
          style={{
            width: 38,
            height: 38,
            borderRadius: 10,
            background: bg,
            color,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 17,
            flexShrink: 0,
          }}
        >
          {icon}
        </div>
      </div>
    </div>
  )
}

/** Tunnel pipeline visuel 1 Chiffrage → 2 BC → 3 Livraison (style .pipeline de la maquette). */
function Pipeline({ step }: { step: 1 | 2 | 3 }) {
  const dot = (n: number) => {
    const done = n < step
    const current = n === step
    return (
      <span
        style={{
          width: 20,
          height: 20,
          borderRadius: '50%',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 10,
          fontWeight: 700,
          flexShrink: 0,
          background: done ? '#1e3a5f' : current ? '#e8eef5' : '#f3f4f6',
          color: done ? '#fff' : current ? '#1e3a5f' : '#9ca3af',
          border: current ? '2px solid #1e3a5f' : 'none',
        }}
      >
        {done ? '✓' : n}
      </span>
    )
  }
  const link = (done: boolean) => (
    <span style={{ width: 14, height: 2, background: done ? '#1e3a5f' : '#e5e7eb', flexShrink: 0 }} />
  )
  return (
    <div style={{ display: 'flex', alignItems: 'center' }}>
      {dot(1)}
      {link(step > 1)}
      {dot(2)}
      {link(step > 2)}
      {dot(3)}
      <span style={{ fontSize: 11, color: '#6b7280', marginLeft: 8, whiteSpace: 'nowrap' }}>
        {step === 1 ? 'Chiffrage' : step === 2 ? 'BC' : 'Livraison'}
      </span>
    </div>
  )
}

/** Étape pipeline (1-3) déduite du statut + état de chiffrage. */
function pipelineStep(r: PurchaseRequestRow): 1 | 2 | 3 {
  if (r.status === 'delivery_scheduled' || r.status === 'delivered') return 3
  if (r.totalAmountFcfa != null || r.status === 'po_ready') return 2
  return 1
}

type SaTab = 'todo' | 'pipeline'

const SA_TAB_LABELS: Record<SaTab, string> = {
  todo: 'Dossiers à traiter',
  pipeline: 'Pipeline',
}
/** ── Dashboard SA (rôle purchasing) — fidèle à docs/mockups/sa-dashboard.html ── */
export function SaOverview({
  requests,
  onOpenRequest,
}: {
  requests: PurchaseRequestRow[]
  onOpenRequest: (id: string) => void
}) {
  const [tab, setTab] = useState<SaTab>('todo')
  const [search, setSearch] = useState('')

  const todo = useMemo(() => requests.filter((r) => SA_TODO_STATUSES.includes(r.status)), [requests])
  const bcOngoing = useMemo(() => requests.filter((r) => SA_BC_ONGOING_STATUSES.includes(r.status)), [requests])
  const delivered = useMemo(() => requests.filter((r) => r.status === 'delivered'), [requests])
  const engagedSum = useMemo(
    () =>
      requests
        .filter((r) => r.status === 'po_ready' || r.status === 'delivery_scheduled' || r.status === 'delivered')
        .reduce((s, r) => s + (r.totalAmountFcfa ?? 0), 0),
    [requests],
  )

  const tabCounts: Record<SaTab, number> = { todo: todo.length, pipeline: requests.length }
  const tabRows = useMemo(() => {
    const rows = tab === 'todo' ? todo : requests
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((r) =>
      [r.reference, r.siteName, r.supplierName, r.requestedByName].some((v) =>
        (v ?? '').toLowerCase().includes(q),
      ),
    )
  }, [tab, todo, requests, search])

  // Activité récente : derniers dossiers mis à jour.
  const activity = useMemo(
    () => [...requests].sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '')).slice(0, 5),
    [requests],
  )

  // Horodatage capturé une seule fois (pureté du rendu) — sert aux alertes 48 h.
  const [nowMs] = useState(() => Date.now())

  // Alertes : dossiers urgents ou en attente depuis plus de 48 h.
  const alerts = useMemo(() => {
    return todo.filter((r) => {
      if (r.urgency && /urg/i.test(r.urgency)) return true
      const ts = r.submittedAt ?? r.createdAt
      return ts ? nowMs - new Date(ts).getTime() > 48 * 3600 * 1000 : false
    })
  }, [todo, nowMs])

  const daysWaiting = (r: PurchaseRequestRow): number => {
    const ts = r.submittedAt ?? r.createdAt
    if (!ts) return 0
    return Math.max(0, Math.floor((nowMs - new Date(ts).getTime()) / 86400000))
  }

  const actionLabel = (r: PurchaseRequestRow): string => {
    if (r.status === 'po_ready') return 'Émettre BC'
    if (r.status === 'sa_review' && r.totalAmountFcfa == null) return 'Chiffrer'
    if (r.status === 'submitted') return 'Chiffrer'
    return 'Voir'
  }

  return (
    <div data-testid="mgr-sa-overview" style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <SaKpiCard
          icon="📥"
          bg="#dbeafe"
          color="#1d4ed8"
          label={dossiersLabel(todo.length)}
          value={String(todo.length)}
          detail="en attente d'action SA"
          testId="mgr-sa-kpi-todo"
        />
        <SaKpiCard
          icon="🧾"
          bg="#fef3c7"
          color="#92400e"
          label="BC en cours"
          value={String(bcOngoing.length)}
          detail="livraison planifiée"
          testId="mgr-sa-kpi-bc"
        />
        <SaKpiCard
          icon="📦"
          bg="#dcfce7"
          color="#15803d"
          label="Livrés"
          value={String(delivered.length)}
          detail="dossiers livrés"
          testId="mgr-sa-kpi-delivered"
        />
        <SaKpiCard
          icon="💰"
          bg="#e8eef5"
          color="#1e3a5f"
          label="Engagé (BC)"
          value={formatFcfa(engagedSum)}
          detail="cumul des BC émis"
          testId="mgr-sa-kpi-engaged"
        />
      </div>

      {/* Onglets + recherche */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
          flexWrap: 'wrap',
          borderBottom: '1px solid #e5e7eb',
        }}
      >
        <div style={{ display: 'flex', gap: 20 }}>
          {(Object.keys(SA_TAB_LABELS) as SaTab[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              data-testid={`mgr-sa-tab-${t}`}
              style={{
                background: 'none',
                border: 'none',
                borderBottom: tab === t ? '2px solid #1e3a5f' : '2px solid transparent',
                color: tab === t ? '#1e3a5f' : '#6b7280',
                fontWeight: tab === t ? 700 : 400,
                fontSize: 13,
                padding: '8px 2px',
                cursor: 'pointer',
              }}
            >
              {SA_TAB_LABELS[t]} ({tabCounts[t]})
            </button>
          ))}
        </div>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher référence, chantier, fournisseur…"
          data-testid="mgr-sa-search"
          style={{ ...css.input, width: 280, marginBottom: 8 }}
        />
      </div>

      {/* Tableau pipeline */}
      <div style={css.card} data-testid="mgr-sa-table">
        {tabRows.length === 0 ? (
          <p style={{ ...css.meta, margin: 0 }}>
            {tab === 'todo' ? 'Aucun dossier à traiter 🎉' : 'Aucun dossier.'}
          </p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={css.lineTable}>
              <thead>
                <tr>
                  <th style={css.lineTh}>Référence</th>
                  <th style={css.lineTh}>Chantier</th>
                  <th style={css.lineTh}>Fournisseur</th>
                  <th style={css.lineTh}>Pipeline</th>
                  <th style={css.lineTh}>Statut</th>
                  <th style={css.lineTh}>Montant</th>
                  <th style={css.lineTh}>Action</th>
                </tr>
              </thead>
              <tbody>
                {tabRows.map((r) => (
                  <tr key={r.id} data-testid={`mgr-sa-row-${r.id}`}>
                    <td style={{ ...css.lineTd, fontWeight: 600 }}>
                      {r.reference}
                      {r.requestedByName ? (
                        <div style={{ ...css.meta, fontWeight: 400 }}>par {r.requestedByName}</div>
                      ) : null}
                    </td>
                    <td style={css.lineTd}>{r.siteName ?? '—'}</td>
                    <td style={css.lineTd}>{r.supplierName ?? '—'}</td>
                    <td style={css.lineTd}>
                      <Pipeline step={pipelineStep(r)} />
                    </td>
                    <td style={css.lineTd}>
                      <ProcurementStatusBadge status={r.status} />
                    </td>
                    <td style={css.lineTd}>{r.totalAmountFcfa == null ? '--' : formatFcfa(r.totalAmountFcfa)}</td>
                    <td style={css.lineTd}>
                      <button
                        type="button"
                        style={{ ...css.btnOutline, padding: '0.2rem 0.7rem', whiteSpace: 'nowrap' }}
                        data-testid={`mgr-sa-open-${r.id}`}
                        onClick={() => onOpenRequest(r.id)}
                      >
                        {actionLabel(r)}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>


      {/* Grille basse : Activité récente + Alertes (style maquette) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 12, marginTop: 12 }} data-testid="mgr-sa-bottom">
        <div style={css.card} data-testid="mgr-sa-activity">
          <h4 style={{ margin: '0 0 10px', fontSize: 13 }}>Activité récente</h4>
          {activity.length === 0 ? (
            <p style={{ ...css.meta, margin: 0 }}>Aucune activité.</p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {activity.map((r) => (
                <li
                  key={r.id}
                  style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: 12 }}
                >
                  <span style={{ flexShrink: 0, fontSize: 15 }}>{pipelineStep(r) === 3 ? '📦' : pipelineStep(r) === 2 ? '🧾' : '📥'}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600 }}>
                      {r.reference}
                      {r.siteName ? ` — ${r.siteName}` : ''}
                    </div>
                    <div style={{ color: 'var(--text-muted)' }}>{SA_STATUS_META[r.status]?.label ?? r.status}</div>
                  </div>
                  <span style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                    {r.updatedAt ? new Date(r.updatedAt).toLocaleDateString('fr-FR') : ''}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div style={css.card} data-testid="mgr-sa-alerts">
          <h4 style={{ margin: '0 0 10px', fontSize: 13 }}>Alertes</h4>
          {alerts.length === 0 ? (
            <p style={{ ...css.meta, margin: 0 }}>Aucune alerte 🎉</p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {alerts.map((r) => (
                <li
                  key={r.id}
                  style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: 12 }}
                >
                  <span style={{ flexShrink: 0, fontSize: 15 }}>⚠️</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600 }}>{r.reference}</div>
                    <div style={{ color: 'var(--text-muted)' }}>
                      {r.siteName ? `${r.siteName} · ` : ''}en attente depuis {daysWaiting(r)} j
                    </div>
                  </div>
                  <button
                    type="button"
                    style={{ ...css.btnOutline, padding: '0.15rem 0.6rem', whiteSpace: 'nowrap' }}
                    data-testid={`mgr-sa-alert-open-${r.id}`}
                    onClick={() => onOpenRequest(r.id)}
                  >
                    Traiter
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}

/** Libellés courts pour l'activité récente. */
const SA_STATUS_META: Partial<Record<PurchaseRequestRow['status'], { label: string }>> = {
  whatsapp_ingested: { label: 'Message WhatsApp reçu' },
  draft_parsed: { label: 'Brouillon extrait' },
  draft_review: { label: 'Brouillon en revue' },
  submitted: { label: 'Transmis — en attente de chiffrage' },
  cdg_review: { label: 'En revue CdG' },
  daf_review: { label: 'En revue DAF' },
  sa_review: { label: 'En revue SA' },
  bt_pending: { label: 'Bon de commande en attente' },
  daf_bt_review: { label: 'BT en revue DAF' },
  pdg_review: { label: 'En revue PDG' },
  po_ready: { label: 'BC émis' },
  delivery_scheduled: { label: 'Livraison planifiée' },
  delivered: { label: 'Livré' },
  rejected: { label: 'Refusé' },
}



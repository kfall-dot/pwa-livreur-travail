import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from '../../../lib/toast'
import { authFetch } from '../managerApi'
import { AlertBox, css, formatFcfa, formatPct, TRAFFIC_LIGHT_LABEL, TRAFFIC_LIGHT_STYLE } from './procurementUi'
import {
  createSiteBudgetAmendment,
  decideSiteBudgetAmendment,
  fetchSiteBudgets,
  fetchSiteIndicators,
  freezeSiteBudget,
} from './procurementApi'
import type { BudgetTrafficLight } from './procurementUi'
import type { CdgIndicatorId, ProcurementRole, SiteBudget, SiteIndicators } from './procurementTypes'
import { CdgIndicateurPage, CdgSyntheseTable } from './CdgIndicateurs'

export type SiteStockRow = {
  siteId: string
  siteName: string
  productLabel: string
  unit: string
  onHand: number
  onOrder: number
}

function EnvelopeBanner({
  budget,
  indicators,
  role,
  onChanged,
  onOpenIndicator,
}: {
  budget: SiteBudget
  indicators: SiteIndicators | null
  role: ProcurementRole | null
  onChanged: () => void
  onOpenIndicator: (id: CdgIndicatorId) => void
}) {
  const [amount, setAmount] = useState('')
  const [pin, setPin] = useState('')
  const [amdAmount, setAmdAmount] = useState('')
  const [amdReason, setAmdReason] = useState('')
  const [busy, setBusy] = useState(false)
  const draft = budget.amendments.find((a) => a.status === 'draft')
  const avenantSum = budget.amendments
    .filter((a) => a.status === 'approved')
    .reduce((s, a) => s + a.signedAmountFcfa, 0)
  const remainingTone =
    budget.remainingFcfa == null ? undefined : budget.remainingFcfa < 0 ? '#b45309' : undefined
  const light = (budget.trafficLight ?? 'none') as BudgetTrafficLight
  const lightStyle = TRAFFIC_LIGHT_STYLE[light]

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true)
    try {
      await fn()
      toast.success(ok)
      onChanged()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Action impossible')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      data-testid="mgr-suivi-enveloppe"
      data-site-id={budget.siteId}
      style={{
        ...css.card,
        marginBottom: 16,
        borderColor: budget.overBudget ? '#f59e0b' : 'var(--border)',
      }}
    >
      <h3 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 8px' }}>
        Enveloppe — {budget.siteName}
      </h3>
      {budget.overBudget && (
        <p data-testid="mgr-suivi-enveloppe-over" style={{ ...css.meta, color: '#b45309', marginBottom: 8 }}>
          Warning : l’engagé dépasse le budget total. Le SA peut quand même émettre un BC.
        </p>
      )}
      {budget.budgetFrozenAt == null && (
        <p data-testid="mgr-suivi-enveloppe-empty" style={{ ...css.meta, marginBottom: 8 }}>
          Enveloppe non renseignée
        </p>
      )}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginBottom: 8 }}>
        <div>
          <div style={css.meta}>Budget initial</div>
          <strong data-testid="mgr-suivi-enveloppe-initial">{formatFcfa(budget.budgetInitialFcfa)}</strong>
        </div>
        <div>
          <div style={css.meta}>Avenants</div>
          <strong data-testid="mgr-suivi-enveloppe-avenants">{formatFcfa(avenantSum)}</strong>
        </div>
        <div>
          <div style={css.meta}>Budget total</div>
          <strong data-testid="mgr-suivi-enveloppe-total">{formatFcfa(budget.budgetTotalFcfa)}</strong>
        </div>
        <div>
          <div style={css.meta}>Engagé</div>
          <strong data-testid="mgr-suivi-enveloppe-engaged">{formatFcfa(budget.engagedFcfa)}</strong>
        </div>
        <div>
          <div style={css.meta}>Reste à engager</div>
          <strong data-testid="mgr-suivi-enveloppe-remaining" style={{ color: remainingTone }}>
            {formatFcfa(budget.remainingFcfa)}
          </strong>
        </div>
        {budget.budgetFrozenAt != null && (
          <>
            <div>
              <div style={css.meta}>Engagement</div>
              <strong data-testid="mgr-suivi-enveloppe-pct">{formatPct(budget.engagementPct)}</strong>
            </div>
            <div>
              <div style={css.meta}>Écart</div>
              <strong data-testid="mgr-suivi-enveloppe-variance">
                {budget.varianceFcfa == null
                  ? '—'
                  : `${budget.varianceFcfa > 0 ? '+' : ''}${formatFcfa(budget.varianceFcfa)} · ${formatPct(budget.variancePct)}`}
              </strong>
            </div>
            <div>
              <div style={css.meta}>Feu</div>
              <strong
                data-testid={`mgr-suivi-feu-${light}`}
                style={{
                  color: lightStyle.color,
                  background: lightStyle.bg,
                  padding: '2px 8px',
                  borderRadius: 6,
                  fontSize: 13,
                }}
              >
                {TRAFFIC_LIGHT_LABEL[light]}
              </strong>
            </div>
          </>
        )}
      </div>

      {budget.missingAmendment && (
        <p data-testid="mgr-suivi-enveloppe-missing-amendment" style={{ ...css.meta, color: '#b45309', marginBottom: 8 }}>
          Avenant manquant : l’engagé dépasse le budget et aucun avenant n’est approuvé.
          {budget.overrunDays != null ? ` Dérive depuis ${budget.overrunDays} j.` : ''}
        </p>
      )}

      {role === 'controle_gestion' && budget.budgetFrozenAt == null && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'end', marginTop: 8 }}>
          <label style={css.meta}>
            Montant FCFA
            <input
              data-testid="mgr-suivi-enveloppe-amount"
              type="number"
              min={1}
              step={1}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              style={{ ...css.input, display: 'block', marginTop: 4, width: 160 }}
            />
          </label>
          <label style={css.meta}>
            NIP
            <input
              data-testid="mgr-suivi-enveloppe-pin"
              type="password"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              style={{ ...css.input, display: 'block', marginTop: 4, width: 100 }}
            />
          </label>
          <button
            type="button"
            data-testid="mgr-suivi-enveloppe-freeze"
            disabled={busy}
            style={css.btnGold}
            onClick={() =>
              void run(
                () => freezeSiteBudget(budget.siteId, Number.parseInt(amount, 10), pin),
                'Enveloppe gelée',
              )
            }
          >
            Geler l’enveloppe
          </button>
        </div>
      )}

      {role === 'technical_director' && budget.budgetFrozenAt && !draft && (
        <div style={{ marginTop: 10 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'end' }}>
            <label style={css.meta}>
              Avenant (FCFA, signé)
              <input
                data-testid="mgr-suivi-avenant-amount"
                type="number"
                step={1}
                value={amdAmount}
                onChange={(e) => setAmdAmount(e.target.value)}
                style={{ ...css.input, display: 'block', marginTop: 4, width: 160 }}
              />
            </label>
            <label style={{ ...css.meta, flex: '1 1 220px' }}>
              Motif
              <input
                data-testid="mgr-suivi-avenant-reason"
                value={amdReason}
                onChange={(e) => setAmdReason(e.target.value)}
                style={{ ...css.input, display: 'block', marginTop: 4, width: '100%' }}
              />
            </label>
            <button
              type="button"
              data-testid="mgr-suivi-avenant-submit"
              disabled={busy}
              style={css.btnOutline}
              onClick={() =>
                void run(
                  () => createSiteBudgetAmendment(budget.siteId, Number.parseInt(amdAmount, 10), amdReason),
                  'Avenant proposé',
                )
              }
            >
              Proposer un avenant
            </button>
          </div>
        </div>
      )}

      {role === 'daf' && draft && (
        <div style={{ marginTop: 10 }} data-testid="mgr-suivi-avenant-decide">
          <p style={css.meta}>
            Brouillon {draft.reference} — {formatFcfa(draft.signedAmountFcfa)} — {draft.reason}
          </p>
          <label style={css.meta}>
            NIP
            <input
              data-testid="mgr-suivi-avenant-pin"
              type="password"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              style={{ ...css.input, display: 'block', marginTop: 4, width: 100 }}
            />
          </label>
          <div style={{ ...css.actionRow, marginTop: 8 }}>
            <button
              type="button"
              data-testid="mgr-suivi-avenant-approve"
              disabled={busy}
              style={css.btnGold}
              onClick={() =>
                void run(
                  () => decideSiteBudgetAmendment(budget.siteId, draft.id, 'approve', pin),
                  'Avenant approuvé',
                )
              }
            >
              Approuver
            </button>
            <button
              type="button"
              data-testid="mgr-suivi-avenant-reject"
              disabled={busy}
              style={css.btnOutline}
              onClick={() =>
                void run(
                  () => decideSiteBudgetAmendment(budget.siteId, draft.id, 'reject', pin, 'Rejeté'),
                  'Avenant rejeté',
                )
              }
            >
              Rejeter
            </button>
          </div>
        </div>
      )}

      {budget.amendments.length > 0 && (
        <table style={{ ...css.lineTable, marginTop: 12 }} data-testid="mgr-suivi-enveloppe-history">
          <thead>
            <tr>
              <th style={css.lineTh}>Réf.</th>
              <th style={css.lineTh}>Montant</th>
              <th style={css.lineTh}>Motif</th>
              <th style={css.lineTh}>Auteur</th>
              <th style={css.lineTh}>Décision</th>
            </tr>
          </thead>
          <tbody>
            {budget.amendments.map((a) => (
              <tr key={a.id}>
                <td style={css.lineTd}>{a.reference}</td>
                <td style={css.lineTd}>{formatFcfa(a.signedAmountFcfa)}</td>
                <td style={css.lineTd}>{a.reason}</td>
                <td style={css.lineTd}>{a.createdByName ?? '—'}</td>
                <td style={css.lineTd}>
                  {a.status}
                  {a.decidedByName ? ` · ${a.decidedByName}` : ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {indicators && <CdgSyntheseTable snapshot={indicators} onOpen={onOpenIndicator} />}
    </div>
  )
}

export function SuiviChantierTab({
  handleAuth,
  procurementRole,
}: {
  handleAuth: (status: number) => boolean
  procurementRole: ProcurementRole | null
}) {
  const today = new Date()
  const defaultMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`
  const [month, setMonth] = useState(defaultMonth)

  const [rows, setRows] = useState<SiteStockRow[]>([])
  const [budgets, setBudgets] = useState<SiteBudget[]>([])
  const [indicatorsBySite, setIndicatorsBySite] = useState<Record<string, SiteIndicators>>({})
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null)
  const [openIndicator, setOpenIndicator] = useState<{ siteId: string; id: CdgIndicatorId } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    setLoading(true)
    try {
      const stockRes = await authFetch('/procurement/site-stock')
      if (handleAuth(stockRes.status)) return
      const [stockBody, sitesBudgets] = await Promise.all([
        stockRes.ok ? (stockRes.json() as Promise<{ rows?: SiteStockRow[] }>) : Promise.resolve({ rows: [] }),
        fetchSiteBudgets(),
      ])
      setRows(stockBody.rows ?? [])
      setBudgets(sitesBudgets)
      setSelectedSiteId((prev) => {
        if (prev && sitesBudgets.some((b) => b.siteId === prev)) return prev
        const withStock = (stockBody.rows ?? []).find((r) => sitesBudgets.some((b) => b.siteId === r.siteId))
        if (withStock) return withStock.siteId
        const frozen = sitesBudgets.find((b) => b.budgetFrozenAt)
        if (frozen) return frozen.siteId
        const pilote = sitesBudgets.find((b) => b.siteId === 'site-btp-pilote-1')
        return pilote?.siteId ?? sitesBudgets[0]?.siteId ?? null
      })
    } catch (err) {
      setRows([])
      setError(err instanceof Error ? err.message : 'Stock indisponible')
    } finally {
      setLoading(false)
    }
  }, [handleAuth])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!selectedSiteId) return
    let cancelled = false
    void fetchSiteIndicators(selectedSiteId)
      .then((snap) => {
        if (cancelled || !snap) return
        setIndicatorsBySite((prev) => ({ ...prev, [snap.siteId]: snap }))
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [selectedSiteId])

  const bySite = useMemo(() => {
    const groups = new Map<string, { siteName: string; rows: SiteStockRow[] }>()
    for (const row of rows) {
      const g = groups.get(row.siteId) ?? { siteName: row.siteName, rows: [] }
      g.rows.push(row)
      groups.set(row.siteId, g)
    }
    return [...groups.values()]
  }, [rows])

  const selectedBudget = budgets.find((b) => b.siteId === selectedSiteId) ?? null
  const openSnapshot = openIndicator ? indicatorsBySite[openIndicator.siteId] : null
  if (openSnapshot && openIndicator) {
    return (
      <div data-testid="mgr-suivi-chantier">
        <CdgIndicateurPage
          snapshot={openSnapshot}
          indicator={openIndicator.id}
          onBack={() => setOpenIndicator(null)}
        />
      </div>
    )
  }

  return (
    <div data-testid="mgr-suivi-chantier">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, marginBottom: 12 }}>
        <div>
          <h2 style={{ ...css.sectionTitle, margin: 0 }}>Suivi chantier</h2>
          <p style={css.meta}>
            Enveloppe CdG : budget, % d’engagement, écart, feux 2 % / 5 %, avenant manquant. Puis stock livré.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'end', flexWrap: 'wrap' }}>
          <label style={css.meta}>
            Mois
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              style={{ ...css.input, display: 'block', marginTop: 4, width: 180 }}
              data-testid="mgr-suivi-chantier-month"
            />
          </label>
          <button type="button" onClick={() => setMonth(defaultMonth)} style={css.btnOutline} data-testid="mgr-suivi-chantier-reset-month">
            Réinitialiser
          </button>
          <button type="button" onClick={() => void load()} style={css.btnOutline} data-testid="mgr-suivi-chantier-refresh">
            Actualiser
          </button>
        </div>
      </div>
      {error && <AlertBox>{error}</AlertBox>}
      {budgets.length > 0 && (
        <div style={{ overflowX: 'auto', marginBottom: 16 }} data-testid="mgr-suivi-board">
          <table style={css.lineTable}>
            <thead>
              <tr>
                <th style={css.lineTh}>Chantier</th>
                <th style={css.lineTh}>Budget</th>
                <th style={css.lineTh}>Engagé</th>
                <th style={css.lineTh}>Engagement</th>
                <th style={css.lineTh}>Feu</th>
                <th style={css.lineTh}>Avenant</th>
              </tr>
            </thead>
            <tbody>
              {budgets.filter((b) => b.engagedFcfa > 0).map((b) => {
                const light = (b.trafficLight ?? 'none') as BudgetTrafficLight
                return (
                  <tr
                    key={b.siteId}
                    data-testid={`mgr-suivi-board-row-${b.siteId}`}
                    onClick={() => setSelectedSiteId(b.siteId)}
                    style={{
                      cursor: 'pointer',
                      background: b.siteId === selectedSiteId ? 'var(--bg-muted, #f8fafc)' : undefined,
                    }}
                  >
                    <td style={css.lineTd}>{b.siteName}</td>
                    <td style={css.lineTd}>{formatFcfa(b.budgetTotalFcfa)}</td>
                    <td style={css.lineTd}>{formatFcfa(b.engagedFcfa)}</td>
                    <td style={css.lineTd}>{formatPct(b.engagementPct)}</td>
                    <td style={{ ...css.lineTd, color: TRAFFIC_LIGHT_STYLE[light].color }}>
                      {b.budgetFrozenAt ? TRAFFIC_LIGHT_LABEL[light] : 'Non gelée'}
                    </td>
                    <td style={css.lineTd}>
                      {b.missingAmendment ? 'Manquant' : b.overBudget ? 'À surveiller' : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      {selectedBudget && (
        <EnvelopeBanner
          key={selectedBudget.siteId}
          budget={selectedBudget}
          indicators={indicatorsBySite[selectedBudget.siteId] ?? null}
          role={procurementRole}
          onChanged={() => void load()}
          onOpenIndicator={(id) => setOpenIndicator({ siteId: selectedBudget.siteId, id })}
        />
      )}
      {loading ? (
        <p style={css.meta}>Chargement…</p>
      ) : rows.length === 0 ? (
        <p style={css.meta} data-testid="mgr-suivi-chantier-empty">
          Aucun stock livré.
        </p>
      ) : !selectedSiteId ? (
        <p style={css.meta} data-testid="mgr-suivi-chantier-no-site">
          Sélectionnez un chantier dans le tableau ci-dessus pour consulter son stock.
        </p>
      ) : (
        // Stock limité au chantier sélectionné — un chantier à la fois (demande métier CdG).
        bySite
          .filter((group) => group.rows.some((row) => row.siteId === selectedSiteId))
          .map((group) => (
          <div key={group.siteName} style={{ marginBottom: 20 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 8px' }}>{group.siteName}</h3>
            <div style={{ overflowX: 'auto' }}>
              <table style={css.lineTable} data-testid="mgr-suivi-chantier-table">
                <thead>
                  <tr>
                    <th style={css.lineTh}>Produit</th>
                    <th style={css.lineTh}>Unité</th>
                    <th style={css.lineTh}>Disponible</th>
                    <th style={css.lineTh}>En commande</th>
                  </tr>
                </thead>
                <tbody>
                  {group.rows.map((row) => (
                    <tr key={`${row.siteId}-${row.productLabel}-${row.unit}`}>
                      <td style={css.lineTd}>{row.productLabel}</td>
                      <td style={css.lineTd}>{row.unit}</td>
                      <td style={css.lineTd}>{row.onHand}</td>
                      <td style={css.lineTd}>{row.onOrder}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))
      )}
    </div>
  )
}

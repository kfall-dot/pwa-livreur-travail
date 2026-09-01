import { useCallback, useEffect, useState } from 'react'
import { toast } from '../../../lib/toast'
import { formatQuantityWithUnit } from '../../../lib/deliveryUnits'
import { authFetch } from '../managerApi'
import { DossiersPanel } from './DossiersPanel'
import { SiteAssignmentCard } from './SiteAssignmentCard'
import { AlertBox, canSeeSuiviBlock, css, formatFcfa, formatPct, PROCUREMENT_ROLE_LABELS, TRAFFIC_LIGHT_LABEL, TRAFFIC_LIGHT_STYLE } from './procurementUi'
import {
  createSiteBudgetAmendment,
  decideSiteBudgetAmendment,
  fetchSiteBudgets,
  fetchSiteIndicators,
  fetchSiteMonthlyExpenses,
  freezeSiteBudget,
} from './procurementApi'
import type { BudgetTrafficLight, SuiviChantierBlock } from './procurementUi'
import type { CdgIndicatorId, ProcurementRole, SiteBudget, SiteIndicators } from './procurementTypes'
import { CdgIndicateurPage, CdgSyntheseTable } from './CdgIndicateurs'

type HistReport = {
  id: string
  siteId: string
  siteName: string
  reportDate: string
  status: 'draft' | 'submitted'
  progressPct: number | null
  tasksDone: number
  tasksTotal: number
  usagesCount: number
  submissionsCount: number
}
type SitePhoto = { photoId: string; reportDate: string }
type ChantierSite = { id: string; name: string; address?: string }
type ReportTask = {
  id: string
  label: string
  done: boolean
  usages: { id: string; productLabel: string; unit: string; quantity: number }[]
}
type ReportDetailPayload = {
  report: {
    id: string
    reportDate: string
    status: 'draft' | 'submitted'
    globalProgressPct: string | null
    comment: string | null
  }
  tasks: ReportTask[]
  photos?: { id: string; url: string }[]
}

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

  const showBudget = canSeeSuiviBlock('enveloppe', role)
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
        {showBudget ? 'Enveloppe' : 'Avenants'} — {budget.siteName}
      </h3>
      {showBudget && budget.overBudget && (
        <p data-testid="mgr-suivi-enveloppe-over" style={{ ...css.meta, color: '#b45309', marginBottom: 8 }}>
          Warning : l’engagé dépasse le budget total. Le SA peut quand même émettre un BC.
        </p>
      )}
      {showBudget && budget.budgetFrozenAt == null && (
        <p data-testid="mgr-suivi-enveloppe-empty" style={{ ...css.meta, marginBottom: 8 }}>
          Enveloppe non renseignée
        </p>
      )}
      {showBudget && (
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
      )}

      {showBudget && budget.missingAmendment && (
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

  const [budgets, setBudgets] = useState<SiteBudget[]>([])
  const [monthExpenses, setMonthExpenses] = useState<Record<string, number>>({})
  const [indicatorsBySite, setIndicatorsBySite] = useState<Record<string, SiteIndicators>>({})
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null)
  const [openIndicator, setOpenIndicator] = useState<{ siteId: string; id: CdgIndicatorId } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      // Stock réel : uniquement pour les rôles de la matrice (évite un 403 → déconnexion).
      const stockAllowed = canSeeSuiviBlock('stock', procurementRole)
      const stockRes = stockAllowed ? await authFetch('/procurement/site-stock') : null
      if (stockRes && handleAuth(stockRes.status)) return
      const [stockBody, sitesBudgets] = await Promise.all([
        stockRes && stockRes.ok
          ? (stockRes.json() as Promise<{ rows?: SiteStockRow[] }>)
          : Promise.resolve({ rows: [] as SiteStockRow[] }),
        fetchSiteBudgets(),
      ])
      setBudgets(sitesBudgets)
      if (procurementRole !== 'site_manager') {
        setSelectedSiteId((prev) => {
          if (prev && sitesBudgets.some((b) => b.siteId === prev)) return prev
          const withStock = (stockBody.rows ?? []).find((r) => sitesBudgets.some((b) => b.siteId === r.siteId))
          if (withStock) return withStock.siteId
          const frozen = sitesBudgets.find((b) => b.budgetFrozenAt)
          if (frozen) return frozen.siteId
          const pilote = sitesBudgets.find((b) => b.siteId === 'site-btp-pilote-1')
          return pilote?.siteId ?? sitesBudgets[0]?.siteId ?? null
        })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Stock indisponible')
    }
  }, [handleAuth, procurementRole])

  useEffect(() => {
    void load()
  }, [load])

  // Dépenses engagées du mois sélectionné — ventilées par chantier.
  // month === '' → vue « Tous les mois » : pas de filtre mensuel.
  useEffect(() => {
    if (month === '') {
      setMonthExpenses({})
      return
    }
    let cancelled = false
    void fetchSiteMonthlyExpenses(month)
      .then((rows2) => {
        if (cancelled) return
        const map: Record<string, number> = {}
        for (const r of rows2) map[r.siteId] = r.amountFcfa
        setMonthExpenses(map)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [month])

  // ── Vue par rôle (matrice métier) ──
  const isChef = procurementRole === 'site_manager'
  const showEnveloppe = canSeeSuiviBlock('enveloppe', procurementRole)
  const showIndicateurs = canSeeSuiviBlock('indicateurs', procurementRole)
  const canSee = (block: SuiviChantierBlock) => canSeeSuiviBlock(block, procurementRole)

  const [chefSiteIds, setChefSiteIds] = useState<Set<string>>(new Set())
  const [chantierSites, setChantierSites] = useState<ChantierSite[]>([])
  const [histMonth, setHistMonth] = useState(defaultMonth)
  const [histReports, setHistReports] = useState<HistReport[]>([])
  const [sitePhotos, setSitePhotos] = useState<SitePhoto[]>([])
  const [openReport, setOpenReport] = useState<ReportDetailPayload | null>(null)

  // Chantiers du sélecteur « Chantier » : responsabilité du DT, tous les actifs
  // pour les autres rôles compagnie, ou ses chantiers (CDC).
  useEffect(() => {
    let cancelled = false
    void (async () => {
      // DT : uniquement les chantiers sous sa responsabilité (demande métier).
      const url =
        procurementRole === 'technical_director'
          ? '/daily-reports/my-sites?scope=mine'
          : '/daily-reports/my-sites'
      const res = await authFetch(url)
      if (handleAuth(res.status) || !res.ok) return
      const body = (await res.json()) as { sites?: ChantierSite[] }
      if (cancelled) return
      const list = body.sites ?? []
      setChantierSites(list)
      setChefSiteIds(new Set(list.map((s) => s.id)))
    })()
    return () => {
      cancelled = true
    }
  }, [procurementRole, handleAuth])

  // Historique des rapports (DT/CdG : chantiers supervisés — CdC : son chantier)
  useEffect(() => {
    if (!canSee('historique')) return
    let cancelled = false
    void (async () => {
      const res = await authFetch(`/daily-reports/my-reports?month=${encodeURIComponent(histMonth)}`)
      if (handleAuth(res.status) || !res.ok) return
      const body = (await res.json()) as {
        reports?: HistReport[]
        sites?: { id: string }[]
      }
      if (cancelled) return
      setHistReports(body.reports ?? [])
      if (body.sites) setChefSiteIds(new Set(body.sites.map((s) => s.id)))
    })()
    return () => {
      cancelled = true
    }
  }, [histMonth, procurementRole, handleAuth])

  // Photos récentes du chantier sélectionné — un 403 n'entraîne pas de déconnexion.
  useEffect(() => {
    if (!selectedSiteId || !canSee('photos')) return
    // CDC : ne jamais interroger un chantier hors de sa responsabilité.
    if (isChef && chantierSites.length > 0 && !chantierSites.some((s) => s.id === selectedSiteId)) {
      return
    }
    let cancelled = false
    void (async () => {
      const res = await authFetch(`/daily-reports/site-photos?siteId=${encodeURIComponent(selectedSiteId)}`)
      if (res.status === 401 && handleAuth(res.status)) return
      if (!res.ok) {
        if (!cancelled) setSitePhotos([])
        return
      }
      const body = (await res.json()) as { photos?: SitePhoto[] }
      if (!cancelled) setSitePhotos(body.photos ?? [])
    })()
    return () => {
      cancelled = true
    }
  }, [selectedSiteId, procurementRole, handleAuth])

  // Sélection automatique du premier chantier de la liste (pour tous les rôles).
  useEffect(() => {
    if (chantierSites.length === 0) return
    setSelectedSiteId((prev) => (prev && chantierSites.some((s) => s.id === prev) ? prev : chantierSites[0].id))
  }, [isChef, chantierSites])

  /** Consultation d'un rapport journalier (lecture seule). */
  const openReportById = async (id: string) => {
    const res = await authFetch(`/daily-reports/reports/${id}`)
    if (handleAuth(res.status)) return
    if (!res.ok) return
    setOpenReport((await res.json()) as ReportDetailPayload)
  }

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
      {openReport ? (
        <div style={css.card} data-testid="mgr-suivi-report-detail">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <h3 style={{ margin: 0 }}>
              📄 Rapport du {new Date(openReport.report.reportDate).toLocaleDateString('fr-FR')} —{' '}
              {openReport.report.status === 'submitted' ? '🟢 Soumis' : '🟡 En cours'}
            </h3>
            <button type="button" onClick={() => setOpenReport(null)} style={css.btnOutline}>
              ← Retour
            </button>
          </div>
          {openReport.report.globalProgressPct != null && (
            <p style={css.meta}>📈 Avancement : {Number(openReport.report.globalProgressPct)}%</p>
          )}
          {openReport.report.comment && <p style={css.meta}>💬 {openReport.report.comment}</p>}
          <h4>📋 Tâches</h4>
          {openReport.tasks.length === 0 ? (
            <p style={css.meta}>Aucune tâche.</p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0 }}>
              {openReport.tasks.map((t) => (
                <li key={t.id} style={{ padding: '0.3rem 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                  {t.done ? '✅' : '⬜'} {t.label}
                  {t.usages.map((u) => (
                    <div key={u.id} style={{ fontSize: 12, color: 'var(--muted, #667)' }}>
                      🔩 {formatQuantityWithUnit(u.quantity, u.unit)} — {u.productLabel}
                    </div>
                  ))}
                </li>
              ))}
            </ul>
          )}
          <h4>📷 Photos</h4>
          {(openReport.photos ?? []).length === 0 ? (
            <p style={{ ...css.meta, marginBottom: 0 }}>Aucune photo.</p>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
              {(openReport.photos ?? []).map((p) => (
                <img key={p.id} src={p.url} alt="Photo chantier" style={{ width: 88, height: 88, objectFit: 'cover', borderRadius: 8 }} />
              ))}
            </div>
          )}
        </div>
      ) : (
        <>
          <div style={css.card} data-testid="mgr-suivi-chantier-select">
            <h3 style={{ marginTop: 0 }}>📁 Chantier</h3>
            <select
              value={selectedSiteId ?? ''}
              onChange={(e) => setSelectedSiteId(e.target.value || null)}
              style={{ padding: '0.5rem', width: '100%', maxWidth: 420 }}
              aria-label="Sélectionner le chantier"
              data-testid="mgr-suivi-chantier-dropdown"
            >
              <option value="">— Sélectionner —</option>
              {chantierSites.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          {canSee('dossiers') && !isChef && (
            <DossiersPanel
              handleAuth={handleAuth}
              siteId={selectedSiteId}
              showDossiersAlerts={canSee('dossiers')}
              showStock={canSee('stock')}
              onOpenReport={(id) => void openReportById(id)}
            />
          )}
          {isChef && <ChefDossiersCard reports={histReports} onOpenReport={(id) => void openReportById(id)} />}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, marginBottom: 12 }}>
        <div>
          <h2 style={{ ...css.sectionTitle, margin: 0 }}>
            Suivi chantier{procurementRole ? ` — vue ${PROCUREMENT_ROLE_LABELS[procurementRole] ?? procurementRole}` : ''}
          </h2>
          <p style={css.meta}>
            Enveloppe CdG : budget, % d’engagement, écart, feux 2 % / 5 %, avenant manquant. Dépenses filtrées par mois.
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
            Mois courant
          </button>
          <button type="button" onClick={() => setMonth('')} style={css.btnOutline} data-testid="mgr-suivi-chantier-all-months">
            Tous les mois
          </button>
          <button type="button" onClick={() => void load()} style={css.btnOutline} data-testid="mgr-suivi-chantier-refresh">
            Actualiser
          </button>
        </div>
      </div>
      {error && <AlertBox>{error}</AlertBox>}
      {(() => {
        const allMonths = month === ''
        const base = isChef
          ? budgets.filter((b) => chefSiteIds.size === 0 || chefSiteIds.has(b.siteId))
          : allMonths
            ? budgets.filter((b) => b.engagedFcfa > 0)
            : budgets.filter((b) => (monthExpenses[b.siteId] ?? 0) > 0)
        const visible = base
        if (budgets.length > 0 && visible.length === 0) {
          return (
            <div style={{ ...css.card, marginBottom: 16 }} data-testid="mgr-suivi-empty-month">
              <p style={{ ...css.meta, margin: 0 }}>
                {isChef
                  ? 'Aucun de vos chantiers dans la liste pour le moment.'
                  : allMonths
                    ? 'Aucun chantier avec engagement à afficher.'
                    : (
                      <>
                        Aucune dépense engagée en {month} sur les chantiers.{' '}
                        <button type="button" onClick={() => setMonth('')} style={{ padding: '0 6px' }}>
                          Voir tous les mois
                        </button>
                      </>
                    )}
              </p>
            </div>
          )
        }
        if (visible.length === 0) return null
        return (
          <div style={{ overflowX: 'auto', marginBottom: 16 }} data-testid="mgr-suivi-board">
            <table style={css.lineTable}>
              <thead>
                <tr>
                  <th style={css.lineTh}>Chantier</th>
                  {!allMonths && <th style={css.lineTh}>Dépenses du mois</th>}
                  {showEnveloppe && (
                    <>
                      <th style={css.lineTh}>Budget</th>
                      <th style={css.lineTh}>Engagé (total)</th>
                      <th style={css.lineTh}>Engagement</th>
                      <th style={css.lineTh}>Feu</th>
                      <th style={css.lineTh}>Avenant</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {visible.map((b) => {
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
                      {!allMonths && <td style={css.lineTd}>{formatFcfa(monthExpenses[b.siteId] ?? 0)}</td>}
                      {showEnveloppe && (
                        <>
                          <td style={css.lineTd}>{formatFcfa(b.budgetTotalFcfa)}</td>
                          <td style={css.lineTd}>{formatFcfa(b.engagedFcfa)}</td>
                          <td style={css.lineTd}>{formatPct(b.engagementPct)}</td>
                          <td style={{ ...css.lineTd, color: TRAFFIC_LIGHT_STYLE[light].color }}>
                            {b.budgetFrozenAt ? TRAFFIC_LIGHT_LABEL[light] : 'Non gelée'}
                          </td>
                          <td style={css.lineTd}>
                            {b.missingAmendment ? 'Manquant' : b.overBudget ? 'À surveiller' : '—'}
                          </td>
                        </>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )
      })()}
      {selectedBudget && (showEnveloppe || showIndicateurs || procurementRole === 'technical_director') && (
        <EnvelopeBanner
          key={selectedBudget.siteId}
          budget={selectedBudget}
          indicators={indicatorsBySite[selectedBudget.siteId] ?? null}
          role={procurementRole}
          onChanged={() => void load()}
          onOpenIndicator={(id) => setOpenIndicator({ siteId: selectedBudget.siteId, id })}
        />
      )}
      {selectedBudget && canSee('affectation') && (
        <SiteAssignmentCard siteId={selectedBudget.siteId} siteName={selectedBudget.siteName} />
      )}
      {canSee('historique') && (
        <div style={css.card} data-testid="mgr-suivi-historique">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <h4 style={{ margin: 0 }}>
              📅 Historique des rapports{selectedBudget ? ` — ${selectedBudget.siteName}` : ''}
            </h4>
            <input
              type="month"
              value={histMonth}
              onChange={(e) => setHistMonth(e.target.value)}
              data-testid="mgr-suivi-hist-month"
              style={{ padding: '0.3rem' }}
            />
          </div>
          {histReports.length === 0 ? (
            <p style={{ ...css.meta, marginBottom: 0 }}>Aucun rapport ce mois.</p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: '0.5rem 0 0' }}>
              {histReports
                .filter((r) => !selectedSiteId || r.siteId === selectedSiteId)
                .map((r) => (
                  <li
                    key={r.id}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0.35rem 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}
                  >
                    <span style={{ minWidth: 92 }}>{new Date(r.reportDate).toLocaleDateString('fr-FR')}</span>
                    <span style={{ flex: 1 }}>
                      {r.siteName} · {r.status === 'submitted' ? '🟢 Soumis' : '🟡 En cours'}
                      {r.progressPct != null && ` · 📈 ${r.progressPct}%`}
                      {` · 📋 ${r.tasksDone}/${r.tasksTotal} tâches`}
                      {` · 🔩 ${r.usagesCount} consommation(s)`}
                    </span>
                    <button
                      type="button"
                      onClick={() => void openReportById(r.id)}
                      style={{ padding: '0.15rem 0.6rem' }}
                      data-testid={`mgr-suivi-hist-open-${r.id}`}
                    >
                      Voir
                    </button>
                  </li>
                ))}
            </ul>
          )}
        </div>
      )}
      {canSee('photos') && selectedBudget && (
        <div style={css.card} data-testid="mgr-suivi-photos">
          <h4 style={{ marginTop: 0 }}>📷 Photos — {selectedBudget.siteName}</h4>
          {sitePhotos.length === 0 ? (
            <p style={{ ...css.meta, marginBottom: 0 }}>Aucune photo pour ce chantier.</p>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
              {sitePhotos.map((p) => (
                <img
                  key={p.photoId}
                  src={`/api/v1/daily-reports/photos/${encodeURIComponent(p.photoId)}`}
                  alt={`Photo chantier ${p.reportDate}`}
                  title={new Date(p.reportDate).toLocaleDateString('fr-FR')}
                  style={{ width: 88, height: 88, objectFit: 'cover', borderRadius: 8 }}
                />
              ))}
            </div>
          )}
        </div>
      )}
        </>
      )}
    </div>
  )
}


/** CDC : résumé de son dossier du jour — consultation directe possible. */
function ChefDossiersCard({
  reports,
  onOpenReport,
}: {
  reports: HistReport[]
  onOpenReport?: (id: string) => void
}) {
  const now = new Date()
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const duJour = reports.find((r) => r.reportDate === todayStr)
  return (
    <div style={css.card} data-testid="mgr-suivi-cdc-dossiers">
      <h4 style={{ marginTop: 0 }}>📁 Mon dossier du jour</h4>
      {!duJour ? (
        <p style={{ ...css.meta, marginBottom: 0 }}>
          Aucun dossier aujourd'hui — gérez-le depuis l'onglet « Ma journée ».
        </p>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <p style={{ ...css.meta, margin: 0 }}>
            <strong>{new Date(duJour.reportDate).toLocaleDateString('fr-FR')}</strong> ·{' '}
            {duJour.status === 'submitted' ? '🟢 Soumis' : '🟡 En cours'} · 📋 {duJour.tasksDone}/
            {duJour.tasksTotal} tâches
            {duJour.progressPct != null && ` · 📈 ${duJour.progressPct}%`}
          </p>
          {onOpenReport && (
            <button
              type="button"
              onClick={() => onOpenReport(duJour.id)}
              style={{ padding: '0.3rem 0.8rem' }}
              data-testid="mgr-suivi-cdc-open-today"
            >
              📄 Voir le rapport
            </button>
          )}
        </div>
      )}
    </div>
  )
}

import { Fragment, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { ebSpendCategoryLabel } from '../../../../shared/ebSpendCategory'
import { CHARGE_FAMILIES, type ChargeFamily } from '../../../../shared/chargeNatures'
import { groupRealizedByNature } from '../../../../shared/budgetAllocation'
import { fetchRequests, saveBudgetAllocations } from './procurementApi'
import { css, formatFcfa, formatPct } from './procurementUi'
import type {
  BudgetFamilyAllocation,
  FamilyTrafficLight,
  PurchaseRequestRow,
  SiteBudget,
  SiteIndicators,
} from './procurementTypes'

const LIGHT_STYLE: Record<FamilyTrafficLight, { color: string; bg: string; dot: string }> = {
  ok: { color: '#166534', bg: '#dcfce7', dot: '🟢' },
  watch: { color: '#b45309', bg: '#fef3c7', dot: '🟡' },
  alert: { color: '#b91c1c', bg: '#fee2e2', dot: '🔴' },
  none: { color: '#64748b', bg: '#f1f5f9', dot: '⚪' },
}

/** Émoji par nature de charge — tooltip = libellé au survol. */
const CATEGORY_EMOJI: Record<string, string> = {
  // Matériaux (Koestrem 5.1 + rapport CdG)
  menuiserie: '🪚',
  peinture: '🎨',
  electricite: '🔌',
  plomberie: '🔧',
  ferraille: '⛓️',
  charpente: '🪵',
  platre: '🧱',
  cadres_portes: '🚪',
  ciments: '🏗️',
  carburant: '⛽',
  etancheite: '💧',
  sable: '🏖️',
  maconnerie: '🧱',
  agglos: '🧱',
  nettoyage: '🧹',
  carocol: '🏺',
  autres_materiaux: '📦',
  marbre_plinthes: '🪨',
  materiels_cuisine: '🍽️',
  menuiserie_aluminium: '🪟',
  accessoires_menuiserie: '🔩',
  equipement_travail: '🦺',
  sac_vide: '🛍️',
  // Main d'œuvre
  salaire_technicien: '💼',
  confection_volet: '🪟',
  mo_menuiserie: '🪚',
  mo_poncage: '🧽',
  mo_carrelage: '🧱',
  pose_marbre_plinthes: '🪨',
  mo_aides: '👷',
  mo_peinture: '🎨',
  mo_ferraille: '⛓️',
  mo_alucobond: '🪟',
  depose_granite: '🪨',
  mo_maconnerie: '🧱',
  mo_etancheite: '💧',
  mo_divers: '👷',
  // Engins & transport
  ramassage_demolition: '🚜',
  chargement_dechargement: '📦',
  livraison_materiels: '🚚',
  // Frais
  frais_depot: '🧾',
  frais_divers: '🧾',
}

const FAMILY_EMOJI: Record<string, string> = {
  materiaux: '📦',
  main_oeuvre: '👷',
  engins: '🚚',
  frais: '🧾',
}

export function catEmoji(value?: string | null): string {
  return CATEGORY_EMOJI[value ?? ''] ?? '📦'
}

/** Émoji de famille — utilisé par la ventilation par famille (F02 lot A). */
export function familyEmoji(family?: string | null): string {
  return FAMILY_EMOJI[family ?? ''] ?? '📦'
}

function catLabel(value?: string | null): string {
  return ebSpendCategoryLabel(value ?? null)
}

function KpiCard({
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
  value: ReactNode
  detail: string
  testId: string
}) {
  return (
    <div style={{ ...css.card, flex: '1 1 180px', minWidth: 180 }} data-testid={testId}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ ...css.meta, textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 6 }}>
            {label}
          </div>
          <div style={{ fontSize: 26, fontWeight: 700, color }} data-testid={`${testId}-value`}>
            {value}
          </div>
          <div style={{ ...css.meta, marginTop: 4 }}>{detail}</div>
        </div>
        <div style={{ width: 38, height: 38, borderRadius: 10, background: bg, color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17, flexShrink: 0 }}>
          {icon}
        </div>
      </div>
    </div>
  )
}

/** Agrégats sur l'ensemble des enveloppes (tous chantiers) — que des données réelles. */
function useCdgAggregates(budgets: SiteBudget[]) {
  return useMemo(() => {
    const engaged = budgets.reduce((s, b) => s + b.engagedFcfa, 0)
    const total = budgets.reduce((s, b) => s + (b.budgetTotalFcfa ?? 0), 0)
    const frozen = budgets.filter((b) => b.budgetFrozenAt)
    const alerts = budgets.filter((b) => b.trafficLight === 'alert').length
    const watch = budgets.filter((b) => b.trafficLight === 'watch').length
    const ok = budgets.filter((b) => b.trafficLight === 'ok').length
    const missing = budgets.filter((b) => b.missingAmendment).length
    const active = budgets.filter((b) => b.engagedFcfa > 0).length
    return { engaged, total, frozen: frozen.length, alerts, watch, ok, missing, active }
  }, [budgets])
}

/** Ventilation par catégorie (top postes matériaux, tableau 5.1) — affichée dans la page détails d'un chantier. */
export function CdgCategoriesCard({ indicators }: { indicators: SiteIndicators | null }) {
  const byCategory = useMemo(() => {
    if (!indicators) return []
    return [...indicators.byCategory]
      .sort((a, b) => b.amountFcfa - a.amountFcfa)
      .slice(0, 6)
  }, [indicators])
  const maxCategory = byCategory[0]?.amountFcfa ?? 0
  const byFamily = indicators?.byFamily ?? []
  return (
    <div style={css.card} data-testid="mgr-cdg-categories">
      <h4 style={{ margin: '0 0 10px', fontSize: 13 }}>
        Ventilation par famille et par nature{indicators ? '' : ' — indisponible (choisissez un chantier)'}
      </h4>
      {byFamily.length > 0 && (
        <div
          style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}
          data-testid="mgr-cdg-families"
        >
          {byFamily.map((f) => (
            <span
              key={f.family}
              title={`${f.label} — ${formatPct(f.shareOfRealizedPct)} du réalisé`}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                background: '#f3f4f6',
                borderRadius: 999,
                padding: '2px 9px',
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              {familyEmoji(f.family)} {f.label} · {formatFcfa(f.amountFcfa)}
            </span>
          ))}
        </div>
      )}
      {byCategory.length === 0 ? (
        <p style={{ ...css.meta, margin: 0 }}>Aucune donnée de catégorie pour le chantier sélectionné.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {byCategory.map((c) => (
            <div key={c.category}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                <span title={catLabel(c.category)} style={{ cursor: 'help' }}>
                  {catEmoji(c.category)} {catLabel(c.category)}
                </span>
                <span style={{ fontWeight: 600 }}>
                  {formatFcfa(c.amountFcfa)} · {formatPct(c.shareOfBudgetPct)}
                </span>
              </div>
              <div style={{ height: 8, background: '#f3f4f6', borderRadius: 4, overflow: 'hidden' }}>
                <div
                  style={{
                    height: '100%',
                    width: maxCategory > 0 ? `${Math.max(3, Math.round((c.amountFcfa / maxCategory) * 100))}%` : '0%',
                    background: '#1e3a5f',
                    borderRadius: 4,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/** Tableau de bord CdG — cartes KPI (maquette cdg-dashboard : KPI → onglets → tableau). */
export function CdgOverviewHeader({ budgets, refreshKey }: { budgets: SiteBudget[]; refreshKey?: number }) {
  const agg = useCdgAggregates(budgets)
  // BC en cours = demandes avec BC émis, livraison pas encore confirmée (po_ready
  // + delivery_scheduled). Détail par statut, comme la tuile « BC en cours » maquette.
  const [bcCounts, setBcCounts] = useState<{ poReady: number; scheduled: number } | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const rows = await fetchRequests()
        if (cancelled) return
        setBcCounts({
          poReady: rows.filter((r: PurchaseRequestRow) => r.status === 'po_ready').length,
          scheduled: rows.filter((r: PurchaseRequestRow) => r.status === 'delivery_scheduled').length,
        })
      } catch {
        if (!cancelled) setBcCounts(null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [refreshKey])

  if (budgets.length === 0) return null

  const feuxPill = (emoji: string, count: number, bg: string, color: string, label: string) => (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        background: bg,
        color,
        borderRadius: 999,
        padding: '2px 9px',
        fontSize: 13,
        fontWeight: 700,
        width: 'fit-content',
      }}
      title={emoji === '🔴' ? 'Chantiers en alerte' : emoji === '🟡' ? 'Chantiers en vigilance' : 'Chantiers neutres'}
    >
      {emoji} {count} {label}
    </span>
  )
  // Accord en nombre : « 1 neutre » / « 5 neutres ».
  const plural = (count: number, singular: string) => (count > 1 ? `${singular}s` : singular)

  return (
    <div data-testid="mgr-cdg-overview" style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
        <KpiCard
          icon="💰"
          bg="#eff6ff"
          color="#3b82f6"
          label="Total engagé"
          value={formatFcfa(agg.engaged)}
          detail="BC validés (ensemble des chantiers)"
          testId="mgr-cdg-kpi-engaged"
        />
        <KpiCard
          icon="📊"
          bg="#f0fdf4"
          color="#16a34a"
          label="Budget total"
          value={formatFcfa(agg.total)}
          detail={`${agg.frozen} enveloppe(s) gelée(s)`}
          testId="mgr-cdg-kpi-budget"
        />
        <KpiCard
          icon="🚦"
          bg="#fffbeb"
          color="#d97706"
          label="Feux"
          value={
            <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start' }}>
              {feuxPill('🔴', agg.alerts, '#fef2f2', '#dc2626', plural(agg.alerts, 'Alerte'))}
              {feuxPill('🟡', agg.watch, '#fffbeb', '#d97706', plural(agg.watch, 'Vigilance'))}
              {feuxPill('🟢', agg.ok, '#f0fdf4', '#16a34a', plural(agg.ok, 'Neutre'))}
            </span>
          }
          detail={`${agg.alerts + agg.watch + agg.ok} ${plural(agg.alerts + agg.watch + agg.ok, 'chantier actif')}`}
          testId="mgr-cdg-kpi-feux"
        />
        <KpiCard
          icon="📦"
          bg="#fef2f2"
          color="#dc2626"
          label="BC en cours"
          value={bcCounts ? String(bcCounts.poReady + bcCounts.scheduled) : '—'}
          detail={
            bcCounts
              ? `${bcCounts.poReady} BC émis — ${bcCounts.scheduled} livraison(s) planifiée(s)`
              : 'chargement…'
          }
          testId="mgr-cdg-kpi-bc"
        />
      </div>
    </div>
  )
}

/**
 * F03 — **Budget vs réalisé par famille** : le tableau à double entrée.
 *
 * F01 fournit l'enveloppe, F02 le réalisé par famille ; il manquait la
 * **ventilation** décidée par le CdG. Sans elle, l'écart global existe mais on
 * ne sait pas *où* l'argent a débordé.
 *
 * Le CdG saisit la répartition ; l'écart est recalculé **côté serveur** (source
 * unique du réalisé : BC livrés + EB hors SA payées — invariant I100).
 */
export function CdgFamilyVarianceCard({
  siteId,
  indicators,
  canEdit,
  onSaved,
}: {
  siteId: string | null
  indicators: SiteIndicators | null
  /** CdG uniquement — même acteur que le gel de l'enveloppe (D-F01-1). */
  canEdit: boolean
  onSaved?: () => void
}) {
  const variance = indicators?.familyVariance ?? null
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState<Record<string, string>>({})
  // Drill-down CdG (façon Feuil2) : familles dépliées → réalisé détaillé par nature.
  const [expanded, setExpanded] = useState<Set<ChargeFamily>>(new Set())

  const natureRows = useMemo(
    () => groupRealizedByNature(indicators?.byCategory ?? []),
    [indicators?.byCategory],
  )

  const toggleFamily = (family: ChargeFamily) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(family)) next.delete(family)
      else next.add(family)
      return next
    })
  }

  const startEdit = () => {
    const next: Record<string, string> = {}
    for (const f of CHARGE_FAMILIES) {
      const row = variance?.rows.find((r) => r.family === f.value)
      next[f.value] = row && row.allocatedFcfa > 0 ? String(row.allocatedFcfa) : ''
    }
    setDraft(next)
    setError(null)
    setEditing(true)
  }

  const draftTotal = CHARGE_FAMILIES.reduce((sum, f) => {
    const n = Number.parseInt((draft[f.value] ?? '').trim(), 10)
    return sum + (Number.isFinite(n) && n > 0 ? n : 0)
  }, 0)

  const save = async () => {
    if (!siteId) return
    const allocations: BudgetFamilyAllocation[] = []
    for (const f of CHARGE_FAMILIES) {
      const raw = (draft[f.value] ?? '').trim()
      if (!raw) continue
      const amount = Number.parseInt(raw, 10)
      if (Number.isFinite(amount) && amount > 0) {
        allocations.push({ family: f.value, amountFcfa: amount })
      }
    }
    setSaving(true)
    setError(null)
    try {
      await saveBudgetAllocations(siteId, allocations)
      setEditing(false)
      onSaved?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Enregistrement de la ventilation impossible')
    } finally {
      setSaving(false)
    }
  }

  if (!indicators || !variance) {
    return (
      <div style={css.card} data-testid="mgr-cdg-family-variance">
        <h4 style={{ margin: '0 0 10px', fontSize: 13 }}>Budget vs réalisé par famille</h4>
        <p style={{ ...css.meta, margin: 0 }}>Indisponible — choisissez un chantier.</p>
      </div>
    )
  }

  return (
    <div style={css.card} data-testid="mgr-cdg-family-variance">
      <div
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}
      >
        <h4 style={{ margin: '0 0 10px', fontSize: 13 }}>Budget vs réalisé par famille</h4>
        {canEdit && !editing && (
          <button
            type="button"
            onClick={startEdit}
            style={css.input}
            data-testid="mgr-cdg-variance-edit"
          >
            Ventiler l’enveloppe
          </button>
        )}
      </div>

      {error && (
        <p style={{ ...css.meta, color: '#b91c1c' }} data-testid="mgr-cdg-variance-error">
          {error}
        </p>
      )}

      {variance.unallocatedFcfa != null && variance.unallocatedFcfa !== 0 && (
        <p
          style={{ ...css.meta, color: variance.unallocatedFcfa > 0 ? '#b45309' : '#b91c1c' }}
          data-testid="mgr-cdg-variance-unallocated"
        >
          {variance.unallocatedFcfa > 0
            ? `${formatFcfa(variance.unallocatedFcfa)} FCFA d’enveloppe non ventilés`
            : `Ventilation supérieure à l’enveloppe de ${formatFcfa(Math.abs(variance.unallocatedFcfa))} FCFA`}
        </p>
      )}

      <div style={{ overflowX: 'auto' }}>
        <table style={css.lineTable}>
          <thead>
            <tr>
              <th style={css.lineTh}>Famille</th>
              <th style={css.lineTh}>Enveloppe</th>
              <th style={css.lineTh}>Réalisé</th>
              <th style={css.lineTh}>Écart</th>
              <th style={css.lineTh}>Consommé</th>
            </tr>
          </thead>
          <tbody>
            {variance.rows.map((row) => {
              const light = LIGHT_STYLE[row.trafficLight]
              const details = natureRows.get(row.family) ?? []
              const isOpen = expanded.has(row.family)
              return (
                <Fragment key={row.family}>
                  <tr data-testid={`mgr-cdg-variance-row-${row.family}`}>
                    <td style={css.lineTd}>
                      {details.length > 0 ? (
                        <button
                          type="button"
                          onClick={() => toggleFamily(row.family)}
                          aria-expanded={isOpen}
                          title={
                            isOpen
                              ? 'Replier le détail par nature'
                              : 'Détail du réalisé par nature (façon journal CdG)'
                          }
                          style={{
                            ...css.input,
                            padding: '0 5px',
                            marginRight: 5,
                            lineHeight: 1.4,
                            fontSize: 10,
                          }}
                          data-testid={`mgr-cdg-variance-expand-${row.family}`}
                        >
                          {isOpen ? '▾' : '▸'}
                        </button>
                      ) : null}
                      {familyEmoji(row.family)} {row.label}
                    </td>
                    <td style={css.lineTd}>
                      {editing ? (
                        <input
                          type="number"
                          min={0}
                          value={draft[row.family] ?? ''}
                          onChange={(e) => setDraft((p) => ({ ...p, [row.family]: e.target.value }))}
                          style={{ ...css.input, width: 130 }}
                          data-testid={`mgr-cdg-variance-input-${row.family}`}
                        />
                      ) : (
                        formatFcfa(row.allocatedFcfa)
                      )}
                    </td>
                    <td style={css.lineTd}>{formatFcfa(row.realizedFcfa)}</td>
                    <td style={{ ...css.lineTd, fontWeight: 600, color: light.color }}>
                      {formatFcfa(row.varianceFcfa)}
                    </td>
                    <td style={css.lineTd}>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 5,
                          background: light.bg,
                          color: light.color,
                          borderRadius: 999,
                          padding: '2px 8px',
                          fontSize: 12,
                          fontWeight: 700,
                        }}
                      >
                        {light.dot} {row.consumedPct == null ? '—' : formatPct(row.consumedPct)}
                      </span>
                    </td>
                  </tr>
                  {isOpen
                    ? details.map((n) => (
                        <tr
                          key={`${row.family}-${n.category}`}
                          style={{ background: '#f8fafc', color: '#475569' }}
                          data-testid={`mgr-cdg-variance-nature-${row.family}-${n.category}`}
                        >
                          <td style={{ ...css.lineTd, paddingLeft: 34 }}>
                            {catEmoji(n.category)} {n.label}
                          </td>
                          {/* Enveloppe ventilée par famille (F03) : pas d'enveloppe ni d'écart par nature. */}
                          <td style={{ ...css.lineTd, color: '#94a3b8' }}>—</td>
                          <td style={css.lineTd}>
                            {formatFcfa(n.amountFcfa)}
                            {n.shareOfFamilyPct != null && (
                              <span style={{ ...css.meta, marginLeft: 6 }}>
                                · {n.shareOfFamilyPct} %
                              </span>
                            )}
                          </td>
                          <td style={{ ...css.lineTd, color: '#94a3b8' }}>—</td>
                          <td style={{ ...css.lineTd, color: '#94a3b8' }}>—</td>
                        </tr>
                      ))
                    : null}
                </Fragment>
              )
            })}
            <tr style={{ fontWeight: 700 }}>
              <td style={css.lineTd}>Total</td>
              <td style={css.lineTd}>
                {formatFcfa(editing ? draftTotal : variance.allocatedFcfa)}
              </td>
              <td style={css.lineTd}>{formatFcfa(variance.realizedFcfa)}</td>
              <td style={css.lineTd}>
                {formatFcfa(editing ? draftTotal - variance.realizedFcfa : variance.varianceFcfa)}
              </td>
              <td style={css.lineTd}>
                {indicators.budgetTotalFcfa != null
                  ? `${formatFcfa(indicators.budgetTotalFcfa)} d’enveloppe`
                  : '—'}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {editing && (
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <button
            type="button"
            disabled={saving}
            onClick={() => void save()}
            style={css.input}
            data-testid="mgr-cdg-variance-save"
          >
            {saving ? 'Enregistrement…' : 'Enregistrer la ventilation'}
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => setEditing(false)}
            style={css.input}
          >
            Annuler
          </button>
        </div>
      )}

      <p style={{ ...css.meta, marginTop: 8 }}>
        Réalisé = BC livrés + EB hors SA payées. Un dépassement est une <strong>alerte</strong>,
        jamais un blocage. Cliquez sur ▸ pour le détail du réalisé par nature (façon journal
        CdG) — l’enveloppe, elle, reste ventilée par famille.
      </p>
    </div>
  )
}
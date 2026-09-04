import { useMemo, useState } from 'react'
import { ebSpendCategoryLabel } from '../../../../shared/ebSpendCategory'
import { css, formatFcfa, formatPct } from './procurementUi'
import type { SiteBudget, SiteIndicators } from './procurementTypes'

/** Émoji par poste matériaux (tableau Koestrem 5.1) — tooltip = libellé au survol. */
const CATEGORY_EMOJI: Record<string, string> = {
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
}

function catEmoji(value?: string | null): string {
  return CATEGORY_EMOJI[value ?? ''] ?? '📦'
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
}: {
  icon: string
  bg: string
  color: string
  label: string
  value: string
  detail: string
}) {
  return (
    <div style={{ ...css.card, flex: '1 1 180px', minWidth: 180 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ ...css.meta, textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 6 }}>
            {label}
          </div>
          <div style={{ fontSize: 24, fontWeight: 700, color }}>{value}</div>
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
    const missing = budgets.filter((b) => b.missingAmendment).length
    const active = budgets.filter((b) => b.engagedFcfa > 0).length
    return { engaged, total, frozen: frozen.length, alerts, watch, missing, active }
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
  return (
    <div style={css.card} data-testid="mgr-cdg-categories">
      <h4 style={{ margin: '0 0 10px', fontSize: 13 }}>
        Ventilation par catégorie{indicators ? '' : ' — indisponible (choisissez un chantier)'}
      </h4>
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

/** En-tête de tableau de bord CdG — cartes KPI + focus chantier + ventilation + activité. */
export function CdgOverviewHeader({
  budgets,
  indicators,
  selectedSiteId,
  onOpenDetails,
}: {
  budgets: SiteBudget[]
  indicators: SiteIndicators | null
  selectedSiteId: string | null
  onOpenDetails: () => void
}) {
  const agg = useCdgAggregates(budgets)
  const [activityFilter, setActivityFilter] = useState<'all' | 'alerts' | 'amendments'>('all')
  const budget = budgets.find((b) => b.siteId === selectedSiteId) ?? null

  // ── Activité récente (dérivée de données réelles : alertes + avenants) ──
  const activity = useMemo(() => {
    const items: { id: string; kind: 'alert' | 'amendment'; title: string; meta: string; ts: string }[] = []
    for (const b of budgets) {
      if (b.overBudget || b.trafficLight === 'alert') {
        items.push({
          id: `alert-${b.siteId}`,
          kind: 'alert',
          title: 'Budget dépassé',
          meta: `${b.siteName} — ${formatFcfa(Math.max(0, -(b.varianceFcfa ?? b.engagedFcfa - (b.budgetTotalFcfa ?? 0))))} de dépassement`,
          ts: b.overrunSinceAt ?? '',
        })
      }
      if (b.missingAmendment) {
        items.push({
          id: `missing-${b.siteId}`,
          kind: 'alert',
          title: 'Avenant manquant',
          meta: b.siteName,
          ts: b.overrunSinceAt ?? '',
        })
      }
      for (const a of b.amendments) {
        items.push({
          id: `amd-${a.id}`,
          kind: 'amendment',
          title: a.status === 'approved' ? 'Avenant approuvé' : a.status === 'rejected' ? 'Avenant rejeté' : 'Avenant en attente',
          meta: `${b.siteName} — ${formatFcfa(a.signedAmountFcfa)}${a.createdByName ? ` — ${a.createdByName}` : ''}`,
          ts: a.createdAt,
        })
      }
    }
    return items
      .filter((i) => {
        if (activityFilter === 'all') return true
        if (activityFilter === 'alerts') return i.kind === 'alert'
        return i.kind === 'amendment'
      })
      .sort((a, b) => (a.ts < b.ts ? 1 : -1))
      .slice(0, 6)
  }, [budgets, activityFilter])

  if (budgets.length === 0) return null

  const feuxLabel =
    agg.alerts + agg.watch === 0
      ? 'Aucune alerte'
      : `${agg.alerts ? `${agg.alerts} 🔴` : ''}${agg.alerts && agg.watch ? ' · ' : ''}${agg.watch ? `${agg.watch} 🟡` : ''}`

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
        />
        <KpiCard
          icon="📊"
          bg="#f0fdf4"
          color="#16a34a"
          label="Budget total"
          value={formatFcfa(agg.total)}
          detail={`${agg.frozen} enveloppe(s) gelée(s)`}
        />
        <KpiCard
          icon="🏗️"
          bg="#f5f3ff"
          color="#8b5cf6"
          label="Chantiers suivis"
          value={String(agg.active)}
          detail={`avec dépense(s) sur ${budgets.length}`}
        />
        <KpiCard
          icon="🚦"
          bg={agg.alerts > 0 ? '#fef2f2' : '#fffbeb'}
          color={agg.alerts > 0 ? '#dc2626' : '#d97706'}
          label="Feux"
          value={feuxLabel}
          detail="🟢 OK / 🟡 vigilance / 🔴 alerte"
        />
        <KpiCard
          icon="⚠️"
          bg="#fef2f2"
          color="#dc2626"
          label="Avenants manquants"
          value={String(agg.missing)}
          detail="engagé > budget sans avenant approuvé"
        />
      </div>
      {budget && (
        <div style={{ ...css.card, marginTop: 12 }} data-testid="mgr-cdg-focus">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <h4 style={{ margin: 0, fontSize: 14 }}>
              📍 Focus — {budget.siteName}
            </h4>
            <button
              type="button"
              style={css.btnOutline}
              data-testid="mgr-cdg-focus-open"
              onClick={onOpenDetails}
              title="Ouvre la synthèse complète du chantier : 5 indicateurs Koestrem, journal quotidien, top 3 matériaux"
            >
              📊 Détails
            </button>
          </div>
          {indicators ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, marginTop: 10 }}>
              <div>
                <div style={css.meta}>Budget total</div>
                <strong>{formatFcfa(indicators.budgetTotalFcfa)}</strong>
              </div>
              <div>
                <div style={css.meta}>Réalisé</div>
                <strong>{formatFcfa(indicators.realizedFcfa)} · {formatPct(indicators.realizedPct)}</strong>
              </div>
              <div>
                <div style={css.meta}>Écart (réalisé − budget)</div>
                <strong style={{ color: (indicators.varianceFcfa ?? 0) < 0 ? '#b91c1c' : '#166534' }}>
                  {indicators.varianceFcfa == null ? '—' : `${indicators.varianceFcfa > 0 ? '+' : ''}${formatFcfa(indicators.varianceFcfa)} · ${formatPct(indicators.variancePct)}`}
                </strong>
              </div>
              <div>
                <div style={css.meta}>Part des matériaux</div>
                <strong>{formatFcfa(indicators.materialsFcfa)} · {formatPct(indicators.materialsSharePct)}</strong>
              </div>
              <div>
                <div style={css.meta}>Poids des 3 premiers postes</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 2 }}>
                  {indicators.top3.map((p) => (
                    <span
                      key={p.label}
                      title={`${p.label} — ${formatFcfa(p.amountFcfa)} (${formatPct(p.shareOfInitialPct)} du budget initial)`}
                      style={{ cursor: 'help', background: '#f5f3ff', color: '#7c3aed', borderRadius: 6, padding: '2px 8px', fontSize: 13, fontWeight: 600 }}
                      data-testid="mgr-cdg-focus-top3"
                    >
                      {p.label} · {formatFcfa(p.amountFcfa)}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <p style={{ ...css.meta, margin: '8px 0 0' }}>Chargement des indicateurs…</p>
          )}
        </div>
      )}

      {/* Activité récente — filtrable par type (la ventilation par catégorie
          est désormais affichée dans la page détails du chantier). */}
      <div style={{ marginTop: 12 }} data-testid="mgr-cdg-overview-bottom">
        <div style={css.card} data-testid="mgr-cdg-activity">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <h4 style={{ margin: 0, fontSize: 13 }}>Activité récente</h4>
            <select
              value={activityFilter}
              onChange={(e) => setActivityFilter(e.target.value as typeof activityFilter)}
              style={{ padding: '4px 8px', fontSize: 11 }}
              data-testid="mgr-cdg-activity-filter"
            >
              <option value="all">Tous</option>
              <option value="alerts">Alertes</option>
              <option value="amendments">Avenants</option>
            </select>
          </div>
          {activity.length === 0 ? (
            <p style={{ ...css.meta, margin: 0 }}>Aucune activité récente pour ce filtre.</p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {activity.map((a) => (
                <li key={a.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: 12 }}>
                  <span style={{ flexShrink: 0, fontSize: 15 }}>
                    {a.kind === 'alert' ? (a.title.includes('dépassé') ? '🔴' : '⚠️') : a.title.includes('approuvé') ? '✅' : a.title.includes('rejeté') ? '❌' : '🟡'}
                  </span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600 }}>{a.title}</div>
                    <div style={{ color: 'var(--text-muted)' }}>{a.meta}</div>
                  </div>
                  <span style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                    {a.ts ? new Date(a.ts).toLocaleDateString('fr-FR') : ''}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
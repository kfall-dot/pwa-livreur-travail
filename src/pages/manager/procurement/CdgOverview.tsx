import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { ebSpendCategoryLabel } from '../../../../shared/ebSpendCategory'
import { fetchRequests } from './procurementApi'
import { css, formatFcfa, formatPct } from './procurementUi'
import type { PurchaseRequestRow, SiteBudget, SiteIndicators } from './procurementTypes'

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

export function catEmoji(value?: string | null): string {
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
  value: ReactNode
  detail: string
}) {
  return (
    <div style={{ ...css.card, flex: '1 1 180px', minWidth: 180 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ ...css.meta, textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 6 }}>
            {label}
          </div>
          <div style={{ fontSize: 26, fontWeight: 700, color }}>{value}</div>
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

/** Tableau de bord CdG — cartes KPI (maquette cdg-dashboard : KPI → onglets → tableau). */
export function CdgOverviewHeader({ budgets }: { budgets: SiteBudget[] }) {
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
  }, [])

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
        />
      </div>
    </div>
  )
}
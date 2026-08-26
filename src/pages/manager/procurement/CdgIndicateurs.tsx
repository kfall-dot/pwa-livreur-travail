import { formatFcfa, formatPct, css } from './procurementUi'
import type { CdgIndicatorId, SiteIndicatorProduct, SiteIndicators } from './procurementTypes'

function formatIsoFr(iso: string): string {
  const [y, m, d] = iso.split('-')
  if (!y || !m || !d) return iso
  return `${d}/${m}/${y}`
}

function formatSignedFcfa(amount: number | null | undefined): string {
  if (amount == null) return '—'
  const sign = amount > 0 ? '+' : ''
  return `${sign}${formatFcfa(amount)}`
}

function top3Sum(products: SiteIndicatorProduct[]): number {
  return products.reduce((s, p) => s + p.amountFcfa, 0)
}

function top3Share(snapshot: SiteIndicators): number | null {
  const initial = snapshot.budgetInitialFcfa
  if (initial == null || initial <= 0) return null
  return Math.round((top3Sum(snapshot.top3) / initial) * 10000) / 100
}

const ROWS: Array<{
  id: CdgIndicatorId
  label: string
  value: (s: SiteIndicators) => string
  mark: (s: SiteIndicators) => string
}> = [
  {
    id: 'budget',
    label: 'Montant du marché (budget alloué)',
    value: (s) => formatFcfa(s.budgetTotalFcfa),
    mark: (s) => (s.budgetTotalFcfa != null ? '100 %' : '—'),
  },
  {
    id: 'realized',
    label: 'Dépenses réalisées',
    value: (s) => formatFcfa(s.realizedFcfa),
    mark: (s) => formatPct(s.realizedPct),
  },
  {
    id: 'variance',
    label: 'Écart (réalisé – budget)',
    value: (s) => formatSignedFcfa(s.varianceFcfa),
    mark: (s) => formatPct(s.variancePct),
  },
  {
    id: 'materials',
    label: 'Part des matériaux dans les dépenses',
    value: (s) => formatFcfa(s.materialsFcfa),
    mark: (s) => formatPct(s.materialsSharePct),
  },
  {
    id: 'top3',
    label: 'Poids des 3 premiers postes matériaux',
    value: (s) => formatFcfa(top3Sum(s.top3)),
    mark: (s) => formatPct(top3Share(s)),
  },
]

const PAGE: Record<
  CdgIndicatorId,
  { title: string; formula: string }
> = {
  budget: {
    title: 'Montant du marché (budget alloué)',
    formula: 'Budget initial gelé + avenants approuvés. C’est le dénominateur des écarts.',
  },
  realized: {
    title: 'Dépenses réalisées',
    formula:
      'Cumul quotidien du montant des livraisons confirmées depuis la première dépense du chantier (quantités acceptées × PU des lignes BC). Ce n’est pas l’engagé BC.',
  },
  variance: {
    title: 'Écart (réalisé – budget)',
    formula: 'À date jour : dépenses réalisées cumulées − budget total (enveloppe + avenants).',
  },
  materials: {
    title: 'Part des matériaux dans les dépenses',
    formula:
      'Montant des livraisons des postes matériaux (tableau 5.1 Koestrem) / budget total (enveloppe + avenants). Le poste se choisit à la création de l’EB.',
  },
  top3: {
    title: 'Poids des 3 premiers postes matériaux',
    formula:
      'Chaque jour : les 3 postes matériaux du tableau 5.1 dont le cumul livré représente la plus grande part du budget initial.',
  },
}

export function CdgSyntheseTable({
  snapshot,
  onOpen,
}: {
  snapshot: SiteIndicators
  onOpen: (id: CdgIndicatorId) => void
}) {
  return (
    <div data-testid="mgr-cdg-synthese" data-site-id={snapshot.siteId} style={{ marginTop: 16 }}>
      <h4 style={{ fontSize: 13, fontWeight: 700, margin: '0 0 8px' }}>Synthèse — indicateurs CdG</h4>
      <p style={{ ...css.meta, marginBottom: 8 }}>
        Cliquez une ligne pour ouvrir le calcul quotidien. La part matériaux est rapportée au budget total.
      </p>
      <div style={{ overflowX: 'auto' }}>
        <table style={css.lineTable}>
          <thead>
            <tr>
              <th style={css.lineTh}>Indicateur</th>
              <th style={css.lineTh}>Valeur</th>
              <th style={css.lineTh}>Repère</th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row) => (
              <tr
                key={row.id}
                data-testid={`mgr-cdg-synthese-${row.id}`}
                onClick={() => onOpen(row.id)}
                style={{ cursor: 'pointer' }}
              >
                <td style={css.lineTd}>{row.label}</td>
                <td style={css.lineTd}>{row.value(snapshot)}</td>
                <td style={css.lineTd}>{row.mark(snapshot)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export function CdgIndicateurPage({
  snapshot,
  indicator,
  onBack,
}: {
  snapshot: SiteIndicators
  indicator: CdgIndicatorId
  onBack: () => void
}) {
  const meta = PAGE[indicator]
  const asOf = formatIsoFr(snapshot.asOf)
  return (
    <div data-testid="mgr-cdg-indicator-page" data-indicator={indicator}>
      <button type="button" onClick={onBack} style={css.btnOutline} data-testid="mgr-cdg-indicator-back">
        ← Synthèse
      </button>
      <h2 style={{ ...css.sectionTitle, margin: '16px 0 8px' }}>{meta.title}</h2>
      <p style={{ ...css.meta, marginBottom: 12 }}>{snapshot.siteName} · au {asOf}</p>
      <p style={{ fontSize: 13, margin: '0 0 16px', maxWidth: 640 }}>{meta.formula}</p>
      {indicator === 'budget' ? (
        <div style={css.card}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
            <div>
              <div style={css.meta}>Budget initial</div>
              <strong>{formatFcfa(snapshot.budgetInitialFcfa)}</strong>
            </div>
            <div>
              <div style={css.meta}>Budget total</div>
              <strong data-testid="mgr-cdg-indicator-value">{formatFcfa(snapshot.budgetTotalFcfa)}</strong>
            </div>
          </div>
        </div>
      ) : (
        <>
          <div style={{ ...css.card, marginBottom: 16 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
              {indicator === 'realized' && (
                <>
                  <div>
                    <div style={css.meta}>Réalisé au {asOf}</div>
                    <strong data-testid="mgr-cdg-indicator-value">{formatFcfa(snapshot.realizedFcfa)}</strong>
                  </div>
                  <div>
                    <div style={css.meta}>Repère / budget</div>
                    <strong>{formatPct(snapshot.realizedPct)}</strong>
                  </div>
                  <div>
                    <div style={css.meta}>Première dépense</div>
                    <strong>{snapshot.firstExpenseOn ? formatIsoFr(snapshot.firstExpenseOn) : '—'}</strong>
                  </div>
                </>
              )}
              {indicator === 'variance' && (
                <>
                  <div>
                    <div style={css.meta}>Écart au {asOf}</div>
                    <strong data-testid="mgr-cdg-indicator-value">{formatSignedFcfa(snapshot.varianceFcfa)}</strong>
                  </div>
                  <div>
                    <div style={css.meta}>Repère</div>
                    <strong>{formatPct(snapshot.variancePct)}</strong>
                  </div>
                  <div>
                    <div style={css.meta}>Réalisé</div>
                    <strong>{formatFcfa(snapshot.realizedFcfa)}</strong>
                  </div>
                  <div>
                    <div style={css.meta}>Budget</div>
                    <strong>{formatFcfa(snapshot.budgetTotalFcfa)}</strong>
                  </div>
                </>
              )}
              {indicator === 'materials' && (
                <>
                  <div>
                    <div style={css.meta}>Matériaux dépensés</div>
                    <strong data-testid="mgr-cdg-indicator-value">{formatFcfa(snapshot.materialsFcfa)}</strong>
                  </div>
                  <div>
                    <div style={css.meta}>Part du budget total</div>
                    <strong>{formatPct(snapshot.materialsSharePct)}</strong>
                  </div>
                  <div>
                    <div style={css.meta}>Budget total</div>
                    <strong>{formatFcfa(snapshot.budgetTotalFcfa)}</strong>
                  </div>
                </>
              )}
              {indicator === 'top3' && (
                <>
                  <div>
                    <div style={css.meta}>3 premiers postes</div>
                    <strong data-testid="mgr-cdg-indicator-value">{formatFcfa(top3Sum(snapshot.top3))}</strong>
                  </div>
                  <div>
                    <div style={css.meta}>Part du budget initial</div>
                    <strong>{formatPct(top3Share(snapshot))}</strong>
                  </div>
                </>
              )}
            </div>
            {indicator === 'materials' && snapshot.byCategory && snapshot.byCategory.length > 0 && (
              <table style={{ ...css.lineTable, marginTop: 12 }} data-testid="mgr-cdg-indicator-categories">
                <thead>
                  <tr>
                    <th style={css.lineTh}>Poste</th>
                    <th style={css.lineTh}>Dépensé</th>
                    <th style={css.lineTh}>% budget total</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshot.byCategory.map((row) => (
                    <tr key={row.category}>
                      <td style={css.lineTd}>{row.label}</td>
                      <td style={css.lineTd}>{formatFcfa(row.amountFcfa)}</td>
                      <td style={css.lineTd}>{formatPct(row.shareOfBudgetPct)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {indicator === 'top3' && snapshot.top3.length > 0 && (
              <ol style={{ margin: '12px 0 0', paddingLeft: 20, fontSize: 13 }}>
                {snapshot.top3.map((p) => (
                  <li key={p.label}>
                    {p.label} — {formatFcfa(p.amountFcfa)} ({formatPct(p.shareOfInitialPct)} du budget initial)
                  </li>
                ))}
              </ol>
            )}
          </div>
          {snapshot.daily.length === 0 ? (
            <p style={css.meta} data-testid="mgr-cdg-indicator-empty">
              Aucune livraison confirmée : le cumul partira de la première dépense.
            </p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={css.lineTable} data-testid="mgr-cdg-indicator-daily">
                <thead>
                  <tr>
                    <th style={css.lineTh}>Date</th>
                    {indicator === 'realized' && (
                      <>
                        <th style={css.lineTh}>Réalisé cumulé</th>
                        <th style={css.lineTh}>% budget</th>
                      </>
                    )}
                    {indicator === 'variance' && (
                      <>
                        <th style={css.lineTh}>Réalisé</th>
                        <th style={css.lineTh}>Écart</th>
                      </>
                    )}
                    {indicator === 'materials' && (
                      <>
                        <th style={css.lineTh}>Matériaux cumulés</th>
                        <th style={css.lineTh}>% budget total</th>
                      </>
                    )}
                    {indicator === 'top3' && (
                      <>
                        <th style={css.lineTh}>1er poste</th>
                        <th style={css.lineTh}>2e poste</th>
                        <th style={css.lineTh}>3e poste</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {snapshot.daily.map((day) => (
                    <tr key={day.date} data-testid={`mgr-cdg-indicator-day-${day.date}`}>
                      <td style={css.lineTd}>{formatIsoFr(day.date)}</td>
                      {indicator === 'realized' && (
                        <>
                          <td style={css.lineTd}>{formatFcfa(day.realizedFcfa)}</td>
                          <td style={css.lineTd}>
                            {formatPct(
                              snapshot.budgetTotalFcfa != null && snapshot.budgetTotalFcfa > 0
                                ? Math.round((day.realizedFcfa / snapshot.budgetTotalFcfa) * 10000) / 100
                                : null,
                            )}
                          </td>
                        </>
                      )}
                      {indicator === 'variance' && (
                        <>
                          <td style={css.lineTd}>{formatFcfa(day.realizedFcfa)}</td>
                          <td style={css.lineTd}>{formatSignedFcfa(day.varianceFcfa)}</td>
                        </>
                      )}
                      {indicator === 'materials' && (
                        <>
                          <td style={css.lineTd}>{formatFcfa(day.materialsFcfa)}</td>
                          <td style={css.lineTd}>{formatPct(day.materialsSharePct)}</td>
                        </>
                      )}
                      {indicator === 'top3' && (
                        <>
                          {[0, 1, 2].map((i) => {
                            const p = day.top3[i]
                            return (
                              <td key={i} style={css.lineTd}>
                                {p
                                  ? `${p.label} · ${formatFcfa(p.amountFcfa)} (${formatPct(p.shareOfInitialPct)})`
                                  : '—'}
                              </td>
                            )
                          })}
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}

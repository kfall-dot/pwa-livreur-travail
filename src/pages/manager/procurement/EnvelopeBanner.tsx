/**
 * Bandeau enveloppe d'un chantier : budget initial, consommation, avenants
 * (création / décision / gel) et synthèse CdG. Extrait de SuiviChantierTab.tsx
 * lors de son découpage : aucun changement de comportement.
 */
import { useState } from 'react'
import { toast } from '../../../lib/toast'
import {
  canSeeSuiviBlock,
  css,
  formatFcfa,
  formatPct,
  TRAFFIC_LIGHT_LABEL,
  TRAFFIC_LIGHT_STYLE,
} from './procurementUi'
import { CdgSyntheseTable } from './CdgIndicateurs'
import {
  createSiteBudgetAmendment,
  decideSiteBudgetAmendment,
  freezeSiteBudget,
} from './procurementApi'
import type { BudgetTrafficLight } from './procurementUi'
import type { CdgIndicatorId, ProcurementRole, SiteBudget, SiteIndicators } from './procurementTypes'

export function EnvelopeBanner({
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
          <div style={css.meta}>Réalisé</div>
          <strong data-testid="mgr-suivi-enveloppe-realized">{formatFcfa(budget.realizedFcfa)}</strong>
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
              <div style={css.meta}>Écart (budget − réalisé)</div>
              <strong
                data-testid="mgr-suivi-enveloppe-variance"
                style={{ color: budget.varianceFcfa == null ? undefined : budget.varianceFcfa >= 0 ? 'var(--green)' : 'var(--red)' }}
              >
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
            Montant
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
              Avenant (montant signé)
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

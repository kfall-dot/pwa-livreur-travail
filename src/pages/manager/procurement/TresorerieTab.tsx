import { TreasuryEbDossier } from './TreasuryEbDossier'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from '../../../lib/toast'
import {
  disburseTreasury,
  fetchTreasuryHistory,
  fetchTreasuryQueue,
  treasuryHtmlUrl,
  treasuryInvoiceUrl,
} from './procurementApi'
import {
  DISBURSEMENT_METHOD_LABELS,
  type DisbursementMethodValue,
  type TreasuryHistoryItem,
  type TreasuryQueueItem,
} from './procurementTypes'
import {
  AlertBox,
  css,
  EmptyHint,
  Field,
  formatFcfa,
  LoadingHint,
  ProcurementStatusBadge,
} from './procurementUi'

const METHODS: DisbursementMethodValue[] = ['orange_money', 'cash', 'bank', 'cheque']

function todayIso(): string {
  const d = new Date()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

/**
 * Poste **Trésorerie** — F02 lot B.
 *
 * Seul écran qui fait avancer le circuit **hors SA** : un BT émis (`bt_ready`)
 * attend son **déboursé**, et la **facture est exigée** pour l'enregistrer
 * (invariant **I103**). Décisions CdG appliquées :
 * *« Oui créer un nouveau rôle Trésorerie »* · *« Reçu OM ou autre reçu »* ·
 * *« Au déboursé et exiger de joindre la facture »*.
 */
export function TresorerieTab({ handleAuth }: { handleAuth: (status: number) => boolean }) {
  const [items, setItems] = useState<TreasuryQueueItem[]>([])
  const [history, setHistory] = useState<TreasuryHistoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dossierId, setDossierId] = useState<string | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const [method, setMethod] = useState<DisbursementMethodValue>('orange_money')
  const [reference, setReference] = useState('')
  const [paidAt, setPaidAt] = useState(todayIso())
  const [file, setFile] = useState<File | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      // La file d'abord ; l'historique ne doit jamais empêcher la file de
      // s'afficher — dégradation silencieuse si l'historique est indisponible.
      const [queue, hist] = await Promise.all([
        fetchTreasuryQueue(),
        fetchTreasuryHistory().catch(() => null),
      ])
      if (handleAuth(queue.status)) return
      setItems(queue.items)
      if (hist && !handleAuth(hist.status)) setHistory(hist.items)
    } catch (err) {
      const status = (err as { status?: number }).status ?? 0
      if (handleAuth(status)) return
      setError(err instanceof Error ? err.message : 'File trésorerie indisponible')
    } finally {
      setLoading(false)
    }
  }, [handleAuth])

  useEffect(() => {
    void load()
  }, [load])

  /** Paiements regroupés par chantier (sous-totaux ; tri par montant décroissant). */
  const historyGroups = useMemo(() => {
    const map = new Map<
      string,
      { siteId: string | null; siteName: string; totalFcfa: number; rows: TreasuryHistoryItem[] }
    >()
    for (const h of history) {
      const key = h.siteId ?? 'sans-chantier'
      const siteName = h.siteName?.trim() || 'Sans chantier'
      const group = map.get(key) ?? { siteId: h.siteId, siteName, totalFcfa: 0, rows: [] }
      group.totalFcfa += h.amountFcfa
      group.rows.push(h)
      map.set(key, group)
    }
    for (const g of map.values()) g.rows.sort((a, b) => (a.paidAt < b.paidAt ? 1 : -1))
    return [...map.values()].sort((a, b) => b.totalFcfa - a.totalFcfa)
  }, [history])

  const openForm = (item: TreasuryQueueItem) => {
    setOpenId(item.treasuryId)
    setDossierId(item.requestId)
    setMethod('orange_money')
    setReference('')
    setPaidAt(todayIso())
    setFile(null)
    setError(null)
  }

  const submit = async (item: TreasuryQueueItem) => {
    if (!file) {
      setError('Joignez le justificatif du paiement (facture ou reçu).')
      return
    }
    // Montant **verrouillé** sur celui du BT (champ grisé) : pas de saisie
    // libre, pas d'écart possible entre le bon approuvé et le déboursé.
    if (!Number.isFinite(item.amountFcfa) || item.amountFcfa <= 0) {
      setError('Montant du dossier invalide.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await disburseTreasury(item.treasuryId, file, {
        amountFcfa: item.amountFcfa,
        method,
        transactionReference: reference.trim() || undefined,
        paidAt,
      })
      toast.success(`Paiement enregistré — ${item.reference}`)
      window.dispatchEvent(new Event('procurement-payment-changed'))
      setOpenId(null)
      setDossierId(null)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Enregistrement du paiement impossible')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <LoadingHint>Chargement de la file trésorerie…</LoadingHint>

  const total = items.reduce((sum, i) => sum + i.amountFcfa, 0)

  return (
    <div data-testid="mgr-tresorerie-tab">
      <div style={{ ...css.card, marginBottom: 12 }}>
        <h3 style={{ margin: '0 0 6px', fontSize: 15 }}>
          💳 Poste Trésorerie — dossiers à payer
        </h3>
        <p style={{ ...css.meta, margin: 0 }}>
          {items.length === 0
            ? 'Aucun dossier en attente de paiement.'
            : `${items.length} dossier(s) à payer · ${formatFcfa(total)} FCFA`}
        </p>
      </div>

      {error && <AlertBox>{error}</AlertBox>}

      {items.length === 0 ? (
        <EmptyHint>
          Aucun dossier à payer. Les BT approuvés et les factures matériaux transmises par le SA apparaissent ici.
        </EmptyHint>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={css.lineTable}>
            <thead>
              <tr>
                <th style={css.lineTh}>Document</th>
                <th style={css.lineTh}>EB</th>
                <th style={css.lineTh}>Statut</th>
                <th style={css.lineTh}>Montant</th>
                <th style={css.lineTh}>Pièce</th>
                <th style={css.lineTh} />
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.treasuryId} data-testid={`mgr-tresorerie-row-${item.treasuryId}`}>
                  <td style={css.lineTd}>
                    <a
                      href={treasuryHtmlUrl(item.treasuryId)}
                      target="_blank"
                      rel="noreferrer"
                      style={{ color: 'var(--accent)' }}
                    >
                      {item.reference}
                    </a>
                  </td>
                  <td style={css.lineTd}><button type="button" style={css.btnOutline} onClick={() => setDossierId(item.requestId)}>{item.requestReference} — Voir le dossier</button></td>
                  <td style={css.lineTd}>
                    <ProcurementStatusBadge status={item.requestStatus} paymentStatus="pending" />
                  </td>
                  <td style={css.lineTd}>{formatFcfa(item.amountFcfa)}</td>
                  <td style={css.lineTd}>
                    {item.disbursement?.invoiceBlobKey ? (
                      <a
                        href={treasuryInvoiceUrl(item.treasuryId)}
                        target="_blank"
                        rel="noreferrer"
                        style={{ color: 'var(--accent)' }}
                      >
                        📎 {item.disbursement.invoiceFileName ?? 'facture'}
                      </a>
                    ) : (
                      <span style={css.meta}>à joindre</span>
                    )}
                  </td>
                  <td style={css.lineTd}>
                    {item.disbursement ? (
                      <span style={{ ...css.meta, fontWeight: 600, color: 'var(--success)' }}>
                        ✅ Payé
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => openForm(item)}
                        style={css.input}
                        data-testid={`mgr-tresorerie-disburse-${item.treasuryId}`}
                      >
                        À payer
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {dossierId && <><button type="button" style={css.btnOutline} onClick={() => setDossierId(null)}>Fermer le dossier EB</button><TreasuryEbDossier key={dossierId} requestId={dossierId} onBack={() => setDossierId(null)} /></>}
      {openId &&
        (() => {
          const item = items.find((i) => i.treasuryId === openId)
          if (!item) return null
          return (
            <div style={{ ...css.card, marginTop: 12 }} data-testid="mgr-tresorerie-form">
              <h4 style={{ margin: '0 0 10px', fontSize: 14 }}>
                Paiement — {item.reference} · {formatFcfa(item.amountFcfa)} FCFA
              </h4>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                <Field label="Montant à payer (FCFA) — non modifiable">
                  <input
                    type="text"
                    readOnly
                    value={formatFcfa(item.amountFcfa)}
                    style={{ ...css.input, background: '#f1f5f9', color: '#94a3b8', cursor: 'not-allowed' }}
                    data-testid="mgr-tresorerie-amount"
                    aria-readonly="true"
                  />
                </Field>
                <Field label="Mode de paiement">
                  <select
                    value={method}
                    onChange={(e) => setMethod(e.target.value as DisbursementMethodValue)}
                    style={css.input}
                    data-testid="mgr-tresorerie-method"
                  >
                    {METHODS.map((m) => (
                      <option key={m} value={m}>
                        {DISBURSEMENT_METHOD_LABELS[m]}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="N° de transaction (OM…)">
                  <input
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                    style={css.input}
                    placeholder="facultatif"
                    data-testid="mgr-tresorerie-reference"
                  />
                </Field>
                <Field label="Date du paiement">
                  <input
                    type="date"
                    value={paidAt}
                    onChange={(e) => setPaidAt(e.target.value)}
                    style={css.input}
                    data-testid="mgr-tresorerie-paidat"
                  />
                </Field>
                <Field label="Facture / reçu (obligatoire)">
                  <input
                    type="file"
                    accept="application/pdf,image/*"
                    onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                    style={css.input}
                    data-testid="mgr-tresorerie-file"
                  />
                </Field>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void submit(item)}
                  style={css.input}
                  data-testid="mgr-tresorerie-submit"
                >
                  {saving ? 'Enregistrement…' : 'Confirmer le paiement'}
                </button>
                <button type="button" disabled={saving} onClick={() => setOpenId(null)} style={css.input}>
                  Annuler
                </button>
              </div>
              <p style={{ ...css.meta, marginTop: 8 }}>
                La facture est rattachée à l’EB et y reste consultable. Aucun double archivage.
              </p>
            </div>
          )
        })()}

      <div style={{ ...css.card, marginTop: 12 }} data-testid="mgr-tresorerie-history">
        <h3 style={{ margin: '0 0 6px', fontSize: 15 }}>Historique des paiements par chantier</h3>
        <p style={{ ...css.meta, margin: '0 0 10px' }}>
          {history.length === 0
            ? 'Aucun paiement enregistré pour le moment — les paiements apparaissent ici dès leur enregistrement.'
            : `${history.length} paiement(s) · ${formatFcfa(history.reduce((s, h) => s + h.amountFcfa, 0))} FCFA au total`}
        </p>
        {historyGroups.map((g) => (
          <div
            key={g.siteId ?? 'sans-chantier'}
            data-testid={`mgr-tresorerie-history-site-${g.siteId ?? 'sans-chantier'}`}
            style={{ marginBottom: 14 }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
              <strong style={{ fontSize: 13 }}>🏗️ {g.siteName}</strong>
              <span style={{ ...css.meta, fontWeight: 600 }}>
                {g.rows.length} paiement(s) · {formatFcfa(g.totalFcfa)} FCFA
              </span>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={css.lineTable}>
                <thead>
                  <tr>
                    <th style={css.lineTh}>Date</th>
                    <th style={css.lineTh}>BT</th>
                    <th style={css.lineTh}>EB</th>
                    <th style={css.lineTh}>Mode</th>
                    <th style={css.lineTh}>N° transaction</th>
                    <th style={css.lineTh}>Facture</th>
                    <th style={css.lineTh}>Montant</th>
                  </tr>
                </thead>
                <tbody>
                  {g.rows.map((h) => (
                    <tr key={h.treasuryId} data-testid={`mgr-tresorerie-history-row-${h.treasuryId}`}>
                      <td style={css.lineTd}>{h.paidAt.slice(0, 10)}</td>
                      <td style={css.lineTd}>
                        <a
                          href={treasuryHtmlUrl(h.treasuryId)}
                          target="_blank"
                          rel="noreferrer"
                          style={{ color: 'var(--accent)' }}
                        >
                          {h.treasuryReference}
                        </a>
                      </td>
                      <td style={css.lineTd}><button type="button" style={css.btnOutline} onClick={() => setDossierId(h.requestId)}>{h.requestReference} — Payé</button></td>
                      <td style={css.lineTd}>{DISBURSEMENT_METHOD_LABELS[h.method] ?? h.method}</td>
                      <td style={css.lineTd}>{h.transactionReference || '—'}</td>
                      <td style={css.lineTd}>
                        {h.hasInvoice ? (
                          <a
                            href={treasuryInvoiceUrl(h.treasuryId)}
                            target="_blank"
                            rel="noreferrer"
                            style={{ color: 'var(--accent)' }}
                          >
                            📎 {h.invoiceFileName ?? 'facture'}
                          </a>
                        ) : (
                          <span style={css.meta}>—</span>
                        )}
                      </td>
                      <td style={css.lineTd}>{formatFcfa(h.amountFcfa)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

import { useCallback, useEffect, useState } from 'react'
import { toast } from '../../../lib/toast'
import {
  disburseTreasury,
  fetchTreasuryQueue,
  treasuryHtmlUrl,
  treasuryInvoiceUrl,
} from './procurementApi'
import {
  DISBURSEMENT_METHOD_LABELS,
  type DisbursementMethodValue,
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
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState<DisbursementMethodValue>('orange_money')
  const [reference, setReference] = useState('')
  const [paidAt, setPaidAt] = useState(todayIso())
  const [file, setFile] = useState<File | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { items: rows, status } = await fetchTreasuryQueue()
      if (handleAuth(status)) return
      setItems(rows)
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

  const openForm = (item: TreasuryQueueItem) => {
    setOpenId(item.treasuryId)
    setAmount(String(item.amountFcfa))
    setMethod('orange_money')
    setReference('')
    setPaidAt(todayIso())
    setFile(null)
    setError(null)
  }

  const submit = async (item: TreasuryQueueItem) => {
    if (!file) {
      setError('Joignez la facture ou le reçu — il est exigé au déboursé (I103).')
      return
    }
    const parsed = Number.parseInt(amount, 10)
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setError('Montant déboursé invalide.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await disburseTreasury(item.treasuryId, file, {
        amountFcfa: parsed,
        method,
        transactionReference: reference.trim() || undefined,
        paidAt,
      })
      toast.success(`Déboursé enregistré — ${item.reference}`)
      setOpenId(null)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Enregistrement du déboursé impossible')
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
          💳 Poste Trésorerie — BT hors SA à débourser
        </h3>
        <p style={{ ...css.meta, margin: 0 }}>
          {items.length === 0
            ? 'Aucun bon de trésorerie en attente.'
            : `${items.length} bon(s) en attente · ${formatFcfa(total)} FCFA`}
        </p>
      </div>

      {error && <AlertBox>{error}</AlertBox>}

      {items.length === 0 ? (
        <EmptyHint>
          Aucun BT à débourser. Les bons apparaissent ici dès qu’une EB de main-d’œuvre est
          approuvée par le DAF et/ou le PDG.
        </EmptyHint>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={css.lineTable}>
            <thead>
              <tr>
                <th style={css.lineTh}>Bon de trésorerie</th>
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
                  <td style={css.lineTd}>{item.requestReference}</td>
                  <td style={css.lineTd}>
                    <ProcurementStatusBadge status={item.requestStatus} />
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
                        ✅ déboursé
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => openForm(item)}
                        style={css.input}
                        data-testid={`mgr-tresorerie-disburse-${item.treasuryId}`}
                      >
                        Débourser
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {openId &&
        (() => {
          const item = items.find((i) => i.treasuryId === openId)
          if (!item) return null
          return (
            <div style={{ ...css.card, marginTop: 12 }} data-testid="mgr-tresorerie-form">
              <h4 style={{ margin: '0 0 10px', fontSize: 14 }}>
                Déboursé — {item.reference} · {formatFcfa(item.amountFcfa)} FCFA
              </h4>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                <Field label="Montant déboursé (FCFA)">
                  <input
                    type="number"
                    min={1}
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    style={css.input}
                    data-testid="mgr-tresorerie-amount"
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
                <Field label="Date du déboursé">
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
                  {saving ? 'Enregistrement…' : 'Enregistrer le déboursé'}
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
    </div>
  )
}

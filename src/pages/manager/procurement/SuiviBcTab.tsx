import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from '../../../lib/toast'
import { authFetch } from '../managerApi'
import { fetchRequestLineAttachment, patchBcRegisterFollowup } from './procurementApi'
import type { BcRegisterMonth, BcRegisterRecapGroup, BcRegisterRow } from './procurementTypes'
import { AlertBox, css } from './procurementUi'

type Sheet = 'mois' | 'recap'
type FollowupField = 'invoice' | 'justifs' | 'observation' | 'verification'

const FILTER_COLUMNS = [
  'siteName',
  'supplierName',
  'date',
  'bon',
  'paymentMode',
  'amountLabel',
  'invoice',
  'justifs',
  'observation',
  'verification',
  'attachment',
] as const

type FilterKey = (typeof FILTER_COLUMNS)[number]

function uniqueValues(rows: BcRegisterRow[], key: FilterKey): string[] {
  return [...new Set(rows.map((r) => String(r[key] ?? '').trim() || '—'))].sort((a, b) => a.localeCompare(b, 'fr'))
}

function FilterSelect({
  testId,
  values,
  selected,
  onChange,
}: {
  testId: string
  values: string[]
  selected: string
  onChange: (v: string) => void
}) {
  return (
    <select
      data-testid={testId}
      value={selected}
      onChange={(e) => onChange(e.target.value)}
      className="mgr-input" style={{ fontSize: 11, padding: '2px 4px', fontWeight: 400, maxWidth: 140 }}
    >
      <option value="">Tous</option>
      {values.map((v) => (
        <option key={v} value={v}>{v}</option>
      ))}
    </select>
  )
}

export function SuiviBcTab({ handleAuth }: { handleAuth: (status: number) => boolean }) {
  const [rows, setRows] = useState<BcRegisterRow[]>([])
  const [recap, setRecap] = useState<BcRegisterRecapGroup[]>([])
  const [months, setMonths] = useState<BcRegisterMonth[]>([])
  const [month, setMonth] = useState<string | null>(null)
  const [sheet, setSheet] = useState<Sheet>('mois')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filters, setFilters] = useState<Record<FilterKey, string>>({
    siteName: '',
    supplierName: '',
    date: '',
    bon: '',
    paymentMode: '',
    amountLabel: '',
    invoice: '',
    justifs: '',
    observation: '',
    verification: '',
    attachment: '',
  })
  const [preview, setPreview] = useState<{ url: string; fileName: string; contentType: string } | null>(null)
  const previewUrlRef = useRef<string | null>(null)

  const load = useCallback(async (selectedMonth?: string | null) => {
    setLoading(true)
    setError(null)
    try {
      const q = selectedMonth ? `?month=${encodeURIComponent(selectedMonth)}` : ''
      const res = await authFetch(`/procurement/bc-register${q}`)
      if (handleAuth(res.status)) return
      if (!res.ok) throw new Error('Registre BC indisponible')
      const data = (await res.json()) as {
        rows?: BcRegisterRow[]
        recap?: BcRegisterRecapGroup[]
        months?: BcRegisterMonth[]
        month?: string | null
      }
      setRows(data.rows ?? [])
      setRecap(data.recap ?? [])
      setMonths(data.months ?? [])
      setMonth(data.month ?? null)
    } catch (err) {
      setRows([])
      setRecap([])
      setError(err instanceof Error ? err.message : 'Registre indisponible')
    } finally {
      setLoading(false)
    }
  }, [handleAuth])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => () => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
  }, [])

  const monthLabel = months.find((m) => m.key === month)?.label ?? ''

  const filteredRows = useMemo(() => {
    return rows.filter((row) =>
      FILTER_COLUMNS.every((key) => {
        const selected = filters[key]
        if (!selected) return true
        return (String(row[key] ?? '').trim() || '—') === selected
      }),
    )
  }, [rows, filters])

  const setFilter = (key: FilterKey, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }))
  }

  const saveFollowup = async (row: BcRegisterRow, field: FollowupField, value: string) => {
    const next = value.trim()
    if (next === row[field]) return
    try {
      const updated = await patchBcRegisterFollowup(row.purchaseOrderId, { [field]: next })
      setRows((prev) => prev.map((r) => (r.purchaseOrderId === updated.purchaseOrderId ? updated : r)))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Enregistrement impossible')
    }
  }

  const openAttachment = async (row: BcRegisterRow, lineId: string, fileName: string) => {
    try {
      const file = await fetchRequestLineAttachment(row.purchaseRequestId, lineId)
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
      const url = URL.createObjectURL(file.blob)
      previewUrlRef.current = url
      setPreview({ url, fileName: file.fileName || fileName, contentType: file.contentType })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Pièce jointe introuvable')
    }
  }

  return (
    <div data-testid="mgr-suivi-bc">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, marginBottom: 12 }}>
        <div>
          <h2 style={{ ...css.sectionTitle, margin: 0 }}>Suivi — points fournisseurs des BC</h2>
          <p style={css.meta}>
            Feuille mois filtrable + récap par fournisseur (POINTS FOURNISSEURS DES BC).
          </p>
        </div>
        <button type="button" onClick={() => void load(month)} className="mgr-btn mgr-btn--outline" data-testid="mgr-suivi-bc-refresh">
          Actualiser
        </button>
      </div>
      {error && <AlertBox>{error}</AlertBox>}
      {months.length > 0 && (
        <div data-testid="mgr-suivi-bc-month-tabs" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
          {months.map((m) => (
            <button
              key={m.key}
              type="button"
              data-testid={`mgr-suivi-bc-month-${m.key}`}
              onClick={() => void load(m.key)}
              className={m.key === month ? 'mgr-btn mgr-btn--primary' : 'mgr-btn mgr-btn--outline'}
            >
              {m.label}
            </button>
          ))}
        </div>
      )}
      {month && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <button
            type="button"
            data-testid="mgr-suivi-bc-sheet-mois"
            onClick={() => setSheet('mois')}
            className={sheet === 'mois' ? 'mgr-btn mgr-btn--primary' : 'mgr-btn mgr-btn--outline'}
          >
            {monthLabel || 'Mois'}
          </button>
          <button
            type="button"
            data-testid="mgr-suivi-bc-sheet-recap"
            onClick={() => setSheet('recap')}
            className={sheet === 'recap' ? 'mgr-btn mgr-btn--primary' : 'mgr-btn mgr-btn--outline'}
          >
            RECAP {monthLabel}
          </button>
        </div>
      )}
      {loading ? (
        <p style={css.meta}>Chargement…</p>
      ) : rows.length === 0 ? (
        <p style={css.meta} data-testid="mgr-suivi-bc-empty">
          Aucune livraison BC confirmée.
        </p>
      ) : sheet === 'recap' ? (
        <div data-testid="mgr-suivi-bc-recap">
          {recap.length === 0 ? (
            <p style={css.meta}>Aucun BC ce mois.</p>
          ) : (
            recap.map((group) => (
              <div key={group.supplierName} style={{ marginBottom: 20 }} data-testid={`mgr-suivi-bc-recap-${group.supplierName}`}>
                <h3 style={{ ...css.sectionTitle, fontSize: 14, margin: '0 0 8px' }}>
                  FOURNISSEUR {group.supplierName}
                </h3>
                <div style={{ overflowX: 'auto' }}>
                  <table style={css.lineTable}>
                    <thead>
                      <tr>
                        <th style={css.lineTh}>DATE</th>
                        <th style={css.lineTh}>N° BC</th>
                        <th style={css.lineTh}>MONTANT (XOF)</th>
                        <th style={css.lineTh}>SITES</th>
                        <th style={css.lineTh}>OBSERVATION</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.rows.map((line) => (
                        <tr key={`${group.supplierName}-${line.bon}`}>
                          <td style={css.lineTd}>{line.date}</td>
                          <td style={css.lineTd}>{line.bon}</td>
                          <td style={css.lineTd}>{line.amountLabel}</td>
                          <td style={css.lineTd}>{line.siteName}</td>
                          <td style={css.lineTd}>{line.observation}</td>
                        </tr>
                      ))}
                      <tr>
                        <td style={{ ...css.lineTd, fontWeight: 700 }} colSpan={2}>Total</td>
                        <td style={{ ...css.lineTd, fontWeight: 700 }}>{group.totalLabel}</td>
                        <td style={css.lineTd} colSpan={2} />
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={css.lineTable} data-testid="mgr-suivi-bc-table">
            <thead>
              <tr>
                <th style={css.lineTh}>CHANTIERS</th>
                <th style={css.lineTh}>FOURNISSEURS</th>
                <th style={css.lineTh}>DATE</th>
                <th style={css.lineTh}>BON</th>
                <th style={css.lineTh}>MODE DE PAIEMENT</th>
                <th style={css.lineTh}>MONTANT (XOF)</th>
                <th style={css.lineTh}>FACTURE</th>
                <th style={css.lineTh}>JUSTIFS</th>
                <th style={css.lineTh}>OBSERVATION</th>
                <th style={css.lineTh}>VÉRIFICATION</th>
                <th style={css.lineTh}>DOC EN ATTACHE</th>
              </tr>
              <tr data-testid="mgr-suivi-bc-filters">
                {FILTER_COLUMNS.map((key) => (
                  <th key={key} style={{ ...css.lineTh, fontWeight: 400, borderBottom: '1px solid var(--border)' }}>
                    <FilterSelect
                      testId={`mgr-suivi-bc-filter-${key}`}
                      values={uniqueValues(rows, key)}
                      selected={filters[key]}
                      onChange={(v) => setFilter(key, v)}
                    />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => (
                <tr key={row.purchaseOrderId} data-testid={`mgr-suivi-bc-row-${row.purchaseOrderId}`}>
                  <td style={css.lineTd}>{row.siteName}</td>
                  <td style={css.lineTd}>{row.supplierName}</td>
                  <td style={css.lineTd}>{row.date}</td>
                  <td style={css.lineTd}>{row.bon}</td>
                  <td style={css.lineTd}>{row.paymentMode}</td>
                  <td style={css.lineTd}>{row.amountLabel}</td>
                  <td style={css.lineTd}>
                    <input
                      defaultValue={row.invoice}
                      onBlur={(e) => void saveFollowup(row, 'invoice', e.target.value)}
                      className="mgr-input"
                      data-testid={`mgr-suivi-bc-invoice-${row.purchaseOrderId}`}
                    />
                  </td>
                  <td style={css.lineTd}>
                    <input
                      defaultValue={row.justifs}
                      onBlur={(e) => void saveFollowup(row, 'justifs', e.target.value)}
                      className="mgr-input"
                      data-testid={`mgr-suivi-bc-justifs-${row.purchaseOrderId}`}
                    />
                  </td>
                  <td style={css.lineTd}>
                    <input
                      defaultValue={row.observation}
                      onBlur={(e) => void saveFollowup(row, 'observation', e.target.value)}
                      className="mgr-input"
                      data-testid={`mgr-suivi-bc-observation-${row.purchaseOrderId}`}
                    />
                  </td>
                  <td style={css.lineTd}>
                    <input
                      defaultValue={row.verification}
                      onBlur={(e) => void saveFollowup(row, 'verification', e.target.value)}
                      className="mgr-input"
                      data-testid={`mgr-suivi-bc-verification-${row.purchaseOrderId}`}
                    />
                  </td>
                  <td style={css.lineTd}>
                    {(row.attachments ?? []).length === 0 ? (
                      row.attachment
                    ) : (
                      (row.attachments ?? []).map((att) => (
                        <button
                          key={att.lineId}
                          type="button"
                          data-testid={`mgr-suivi-bc-attach-${row.purchaseOrderId}`}
                          onClick={() => void openAttachment(row, att.lineId, att.fileName)}
                          className="mgr-btn mgr-btn--ghost" style={{ padding: '2px 6px', fontSize: 12 }}
                        >
                          {att.fileName}
                        </button>
                      ))
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {preview && (
        <div
          role="dialog"
          data-testid="mgr-suivi-bc-preview"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 40,
          }}
          onClick={() => {
            if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
            previewUrlRef.current = null
            setPreview(null)
          }}
        >
          <div
            style={{ background: '#fff', padding: 16, maxWidth: '90vw', maxHeight: '90vh', overflow: 'auto' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
              <strong>{preview.fileName}</strong>
              <button type="button" className="mgr-btn mgr-btn--ghost" onClick={() => {
                if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
                previewUrlRef.current = null
                setPreview(null)
              }}>
                Fermer
              </button>
            </div>
            {preview.contentType.startsWith('image/') ? (
              <img src={preview.url} alt={preview.fileName} style={{ maxWidth: '80vw', maxHeight: '70vh' }} />
            ) : (
              <iframe title={preview.fileName} src={preview.url} style={{ width: '70vw', height: '70vh', border: 0 }} />
            )}
          </div>
        </div>
      )}
    </div>
  )
}

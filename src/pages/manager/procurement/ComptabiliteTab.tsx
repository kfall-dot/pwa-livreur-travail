import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from '../../../lib/toast'
import { useProcurementStore } from '../../../stores/procurementStore'
import { fetchBcInvoiceFile, patchBcRegisterFollowup } from './procurementApi'
import type { BcRegisterRow } from './procurementTypes'

/**
 * Espace « Comptabilité » — nouvel utilisateur comptable (cmpt@btp-pilote.ci).
 *
 * - Tableau de bord : totalité des BC émis pour un mois, navigation entre les mois.
 * - Suivi : même lecture que le SA (tous les modes de paiement combinés) avec filtre par mode.
 * - Factures : lignes du registre avec facture saisie.
 * - Rapports : exports mensuels proposés.
 */

type SubTab = 'dashboard' | 'suivi' | 'factures' | 'rapports'

const PAYMENT_MODE_LABELS: Record<string, string> = {
  CREDIT: 'Crédit',
  COMPTANT: 'Comptant',
  CHEQUE: 'Chèque',
  VIREMENT: 'Virement',
}

function paymentLabel(mode: string): string {
  const m = (mode || '').trim().toUpperCase()
  return PAYMENT_MODE_LABELS[m] ?? (mode.trim() || '—')
}

function badgeClass(mode: string): string {
  switch ((mode || '').trim().toUpperCase()) {
    case 'CREDIT':
      return 'cmpt-badge credit'
    case 'COMPTANT':
      return 'cmpt-badge comptant'
    case 'CHEQUE':
      return 'cmpt-badge cheque'
    case 'VIREMENT':
      return 'cmpt-badge virement'
    default:
      return 'cmpt-badge gray'
  }
}

const CMPT_CSS = `
.cmpt{--navy:#1e3a5f;--muted:#64748b;--border:#e2e8f0;--green:#047857;--amber:#b45309;--red:#b91c1c;font-family:'Inter',sans-serif;color:#1e293b}
.cmpt *{margin:0;padding:0;box-sizing:border-box}
.cmpt .page{max-width:1280px;margin:0 auto}
.cmpt h2{font-size:20px;font-weight:800;color:var(--navy);margin-bottom:4px}
.cmpt .sub{color:var(--muted);font-size:13px;margin-bottom:18px}
.cmpt .tabs{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:16px}
.cmpt .chip{border:1px solid var(--border);background:#fff;border-radius:8px;padding:7px 14px;font-family:inherit;font-size:13px;font-weight:600;color:var(--navy);cursor:pointer}
.cmpt .chip.active{background:#fdf3e0;border-color:#ecd9b0;color:#b7791f}
.cmpt .month-nav{display:flex;align-items:center;gap:10px;margin:14px 0 8px}
.cmpt .month-nav select,.cmpt .month-nav .btn{border:1px solid var(--border);background:#fff;border-radius:8px;padding:7px 12px;font-family:inherit;font-size:13px;font-weight:600;color:var(--navy);cursor:pointer}
.cmpt .kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:16px 0}
.cmpt .kpis.two{grid-template-columns:repeat(2,1fr)}
.cmpt .kpis.three{grid-template-columns:repeat(3,1fr)}
.cmpt .kpi{background:#fff;border:1px solid var(--border);border-radius:12px;padding:14px 16px}
.cmpt .kpi .lbl{font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:var(--muted);margin-bottom:6px}
.cmpt .kpi .val{font-size:22px;font-weight:800;color:var(--navy)}
.cmpt .kpi .det{font-size:11px;color:var(--muted);margin-top:4px}
.cmpt .card{background:#fff;border:1px solid var(--border);border-radius:12px;padding:16px;margin-bottom:16px}
.cmpt .filters{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:12px}
.cmpt .filters label{font-size:12px;color:var(--muted);display:flex;flex-direction:column;gap:4px}
.cmpt .filters select{font-family:inherit;font-size:13px;padding:6px 10px;border:1px solid var(--border);border-radius:8px;color:#1e293b;min-width:150px}
.cmpt table{width:100%;border-collapse:collapse;font-size:12.5px}
.cmpt th{text-align:left;padding:8px 10px;color:var(--navy);border-bottom:2px solid var(--border);font-size:11px;text-transform:uppercase;letter-spacing:.4px;white-space:nowrap}
.cmpt td{padding:8px 10px;border-bottom:1px solid var(--border);vertical-align:middle}
.cmpt tr:hover td{background:#f8fafc}
.cmpt .bon{font-weight:700;color:var(--navy)}
.cmpt .mono{font-variant-numeric:tabular-nums}
.cmpt .badge{display:inline-block;padding:2px 10px;border-radius:999px;font-size:11px;font-weight:700}
.cmpt .cmpt-badge.credit{background:#dbeafe;color:#1d4ed8}
.cmpt .cmpt-badge.comptant{background:#d1fae5;color:#047857}
.cmpt .cmpt-badge.cheque{background:#fef3c7;color:#b45309}
.cmpt .cmpt-badge.virement{background:#ede9fe;color:#6d28d9}
.cmpt .cmpt-badge.gray{background:#f1f5f9;color:var(--muted)}
.cmpt .pill-doc{display:inline-block;padding:2px 8px;border-radius:6px;font-size:11px;font-weight:600;background:#ecfdf5;color:#047857;border:1px solid #a7f3d0;cursor:pointer;font-family:inherit}
.cmpt .pill-doc:hover{background:#d1fae5}
.cmpt .summary-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:16px;margin-bottom:24px}
.cmpt .summary-card{background:#fff;border:1px solid var(--border);border-radius:12px;padding:20px}
.cmpt .summary-card h4{font-size:.85rem;color:var(--muted);margin-bottom:12px;text-transform:uppercase;letter-spacing:.5px}
.cmpt .summary-item{display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid #f1f5f9;font-size:13px}
.cmpt .summary-item:last-child{border-bottom:none;font-weight:700}
.cmpt .kpi-label{display:flex;align-items:center;gap:8px}
.cmpt .dot{width:10px;height:10px;border-radius:50%}
.cmpt .dot-credit{background:#3b82f6}
.cmpt .dot-comptant{background:#10b981}
.cmpt .dot-cheque{background:#f59e0b}
.cmpt .dot-virement{background:#8b5cf6}
.cmpt .pill-green{background:#ecfdf5;color:var(--green)}
.cmpt .pill-amber{background:#fffbeb;color:var(--amber)}
.cmpt .pill-red{background:#fef2f2;color:var(--red)}
.cmpt .grand{background:var(--navy);color:#fff;padding:18px 22px;border-radius:12px;margin-top:16px;display:flex;justify-content:space-between;align-items:center;gap:12px}
.cmpt .grand .lbl{font-size:13px;opacity:.85}
.cmpt .grand .val{font-size:24px;font-weight:800}
.cmpt .month-nav .current{font-size:20px;font-weight:800;color:var(--navy)}
.cmpt .kpi.credit{border-left:4px solid #3b82f6}
.cmpt .kpi.comptant{border-left:4px solid #10b981}
.cmpt .kpi.cheque{border-left:4px solid #f59e0b}
.cmpt .kpi.virement{border-left:4px solid #8b5cf6}
.cmpt .card-header{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:12px}
.cmpt .card-header h3{font-size:14px;font-weight:700}
.cmpt .card-header .count{color:var(--muted);font-size:12px}
.cmpt .filter-group{display:flex;flex-direction:column;gap:4px}
.cmpt .filter-group label{font-size:11px;color:var(--muted);font-weight:700;text-transform:uppercase;letter-spacing:.5px}
.cmpt .filter-group select,.cmpt .filter-group input{padding:7px 10px;border:1px solid var(--border);border-radius:8px;font-family:inherit;font-size:13px;color:#1e293b;min-width:150px}
.cmpt .btn-apply{background:var(--navy);color:#fff;border:none;padding:8px 20px;border-radius:8px;font-weight:600;cursor:pointer;font-family:inherit;font-size:13px;align-self:flex-end}
.cmpt .btn-apply:hover{background:#152d4a}
.cmpt .summary{display:grid;grid-template-columns:repeat(2,1fr);gap:16px;margin-bottom:16px}
.cmpt .summary-card{background:#fff;border:1px solid var(--border);border-radius:12px;padding:16px}
.cmpt .summary-card h4{font-size:11px;color:var(--muted);margin-bottom:10px;text-transform:uppercase;letter-spacing:.5px}
.cmpt .payment-row{display:flex;justify-content:space-between;align-items:center;padding:7px 0;border-bottom:1px solid #f1f5f9;font-size:13px}
.cmpt .payment-row:last-child{border-bottom:none;font-weight:700}
.cmpt .dot{display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:8px;vertical-align:middle}
.cmpt .dot-credit{background:#3b82f6}
.cmpt .dot-comptant{background:#10b981}
.cmpt .dot-cheque{background:#f59e0b}
.cmpt .dot-virement{background:#8b5cf6}
.cmpt .dot-gray{background:#94a3b8}
@media(max-width:860px){.cmpt .kpis{grid-template-columns:repeat(2,1fr)}.cmpt .summary{grid-template-columns:1fr}}
`

/** Met en forme un montant FCFA (séparateur d'espace, sans décimale). */
function fcfa(n: number | null | undefined): string {
  if (n == null) return '—'
  return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(n)
}

/** Normalise une date (jj/mm/aaaa → aaaa-mm-jj) pour la comparaison des filtres. */
function isoDate(d: string): string {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(d.trim())
  return m ? `${m[3]}-${m[2]}-${m[1]}` : d.trim()
}

export function ComptabiliteTab({ handleAuth }: { handleAuth: (status: number) => boolean }) {
  const [subTab, setSubTab] = useState<SubTab>('dashboard')
  // Registre BC partagé (store Zustand) : même source que SuiviBcTab (SA).
  const rows = useProcurementStore((s) => s.rows)
  const months = useProcurementStore((s) => s.months)
  const month = useProcurementStore((s) => s.month)
  const loading = useProcurementStore((s) => s.loading)
  const error = useProcurementStore((s) => s.error)
  const load = useProcurementStore((s) => s.load)
  const applyRow = useProcurementStore((s) => s.applyRow)
  const [fPayment, setFPayment] = useState('')
  const [fSupplier, setFSupplier] = useState('')
  const [fSite, setFSite] = useState('')
  const [fDateStart, setFDateStart] = useState('')
  const [fDateEnd, setFDateEnd] = useState('')

  useEffect(() => {
    void load(handleAuth)
  }, [load, handleAuth])

  const filteredRows = useMemo(
    () =>
      rows.filter((r) => {
        if (fPayment && (r.paymentMode.trim() || '—').toUpperCase() !== fPayment) return false
        if (fSupplier && r.supplierName.trim() !== fSupplier) return false
        if (fSite && r.siteName.trim() !== fSite) return false
        const iso = isoDate(r.date)
        if (fDateStart && iso < fDateStart) return false
        if (fDateEnd && iso > fDateEnd) return false
        return true
      }),
    [rows, fPayment, fSupplier, fSite, fDateStart, fDateEnd],
  )

  const supplierOptions = useMemo(() => [...new Set(rows.map((r) => r.supplierName.trim()))].sort(), [rows])
  const siteOptions = useMemo(() => [...new Set(rows.map((r) => r.siteName.trim()))].sort(), [rows])

  const supplierTotals = useMemo(() => {
    const map: Record<string, number> = {}
    for (const r of rows) {
      const s = r.supplierName.trim()
      map[s] = (map[s] ?? 0) + (r.amountFcfa ?? 0)
    }
    return Object.entries(map).sort((a, b) => b[1] - a[1])
  }, [rows])

  // Factures = lignes du registre avec un n° de facture saisi.
  const invoicedRows = useMemo(() => rows.filter((r) => r.invoice.trim()), [rows])

  // KPI factures : total, payées (vérifiées), en attente, montant cumulé.
  const invoiceKpi = useMemo(() => {
    const paid = invoicedRows.filter((r) => r.invoicePaid)
    const pending = invoicedRows.filter((r) => !r.invoicePaid)
    const totalAmount = invoicedRows.reduce((s, r) => s + (r.amountFcfa ?? 0), 0)
    return { total: invoicedRows.length, paid: paid.length, pending: pending.length, totalAmount }
  }, [invoicedRows])

  const [preview, setPreview] = useState<{ url: string; fileName: string; contentType: string } | null>(null)
  const previewUrlRef = useRef<string | null>(null)

  /** Ouvre la copie de facture transmise par le SA (aperçu). */
  const openInvoiceFile = async (row: BcRegisterRow) => {
    try {
      const file = await fetchBcInvoiceFile(row.purchaseOrderId)
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
      const url = URL.createObjectURL(file.blob)
      previewUrlRef.current = url
      setPreview({ url, fileName: file.fileName || row.invoiceFile?.fileName || 'facture', contentType: file.blob.type })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Facture introuvable')
    }
  }

  const closePreview = () => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
    previewUrlRef.current = null
    setPreview(null)
  }

  const toggleInvoicePaid = async (row: BcRegisterRow) => {
    try {
      const updated = await patchBcRegisterFollowup(row.purchaseOrderId, { invoicePaid: !row.invoicePaid })
      applyRow(updated)
      toast.show(!row.invoicePaid ? 'Facture marquée payée' : 'Facture marquée non payée')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Enregistrement impossible')
    }
  }

  // KPI du mois : total BC, montant total, répartition par mode de paiement.
  const kpi = useMemo(() => {
    const totalAmount = rows.reduce((s, r) => s + (r.amountFcfa ?? 0), 0)
    const byMode: Record<string, { count: number; amount: number }> = {}
    for (const r of rows) {
      const mode = (r.paymentMode || '').trim().toUpperCase()
      const key = mode || '—'
      const bucket = (byMode[key] ??= { count: 0, amount: 0 })
      bucket.count += 1
      bucket.amount += r.amountFcfa ?? 0
    }
    return { totalAmount, byMode }
  }, [rows])

  const monthLabel = useMemo(() => {
    const m = months.find((x) => x.key === month)
    return m?.label ?? month ?? '—'
  }, [months, month])

  const monthIndex = useMemo(() => months.findIndex((m) => m.key === month), [months, month])

  const gotoNeighbor = (delta: -1 | 1) => {
    const next = months[monthIndex + delta]
    if (next) void load(handleAuth, next.key)
  }

  const sessionExport = () => {
    void load(handleAuth)
    toast.show('Registre à jour')
  }
return (
    <div className="cmpt">
      <style>{CMPT_CSS}</style>
      <div className="page">
        <h2>Comptabilité</h2>
        <p className="sub">BC émis, suivi points fournisseurs, factures et rapports — {monthLabel}</p>

        <div className="tabs">
          <button type="button" className={`chip${subTab === 'dashboard' ? ' active' : ''}`} onClick={() => setSubTab('dashboard')}>
            Tableau de bord
          </button>
          <button type="button" className={`chip${subTab === 'suivi' ? ' active' : ''}`} onClick={() => setSubTab('suivi')}>
            Suivi BC
          </button>
          <button type="button" className={`chip${subTab === 'factures' ? ' active' : ''}`} onClick={() => setSubTab('factures')}>
            Factures
          </button>
          <button type="button" className={`chip${subTab === 'rapports' ? ' active' : ''}`} onClick={() => setSubTab('rapports')}>
            Rapports
          </button>
        </div>

        {loading ? (
          <div className="card" style={{ minHeight: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>
            Chargement du registre… 
          </div>
        ) : error ? (
          <div className="card" style={{ color: '#b91c1c' }}>⚠️ {error}</div>
        ) : (
          <>
            <div className="month-nav">
              <button type="button" className="btn" onClick={() => gotoNeighbor(-1)} disabled={monthIndex <= 0}>
                &lt; Précédent
              </button>
              <span className="current">{monthLabel}</span>
              <button type="button" className="btn" onClick={() => gotoNeighbor(1)} disabled={monthIndex < 0 || monthIndex >= months.length - 1}>
                Suivant &gt;
              </button>
            </div>

            {subTab === 'dashboard' && (
              <>
                <div className="kpis two">
                  <div className="kpi">
                    <div className="lbl">Total BC émis</div>
                    <div className="val">{rows.length}</div>
                    <div className="det">BC ce mois</div>
                  </div>
                  <div className="kpi">
                    <div className="lbl">Total factures</div>
                    <div className="val">{invoicedRows.length}</div>
                    <div className="det">factures saisies ce mois</div>
                  </div>
                </div>

                <div className="filters">
                  <div className="filter-group">
                    <label>Mode de paiement</label>
                    <select value={fPayment} onChange={(e) => setFPayment(e.target.value)}>
                      <option value="">Tous</option>
                      {['CREDIT', 'COMPTANT', 'CHEQUE', 'VIREMENT'].map((m) => (
                        <option key={m} value={m}>
                          {paymentLabel(m)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="filter-group">
                    <label>Fournisseur</label>
                    <select value={fSupplier} onChange={(e) => setFSupplier(e.target.value)}>
                      <option value="">Tous</option>
                      {supplierOptions.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="filter-group">
                    <label>Chantier</label>
                    <select value={fSite} onChange={(e) => setFSite(e.target.value)}>
                      <option value="">Tous</option>
                      {siteOptions.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="filter-group">
                    <label>Date début</label>
                    <input type="date" value={fDateStart} onChange={(e) => setFDateStart(e.target.value)} />
                  </div>
                  <div className="filter-group">
                    <label>Date fin</label>
                    <input type="date" value={fDateEnd} onChange={(e) => setFDateEnd(e.target.value)} />
                  </div>
                  <button type="button" className="btn-apply" onClick={() => toast.show('Filtres appliqués')}>
                    Appliquer
                  </button>
                </div>

                <div className="card">
                  <div className="card-header">
                    <h3>Liste des BC — {monthLabel}</h3>
                    <span className="count">{filteredRows.length} BC affichés</span>
                  </div>
                  {filteredRows.length === 0 ? (
                    <p style={{ color: '#64748b', fontSize: 13 }}>Aucun BC pour ces filtres.</p>
                  ) : (
                    <table>
                      <thead>
                        <tr>
                          <th>N° BC</th>
                          <th>Date</th>
                          <th>Fournisseur</th>
                          <th>Chantier</th>
                          <th>Mode de paiement</th>
                          <th>Montant (FCFA)</th>
                          <th>N° Facture</th>
                          <th>Statut</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredRows.map((r) => (
                          <tr key={r.purchaseOrderId}>
                            <td className="bon">{r.bon}</td>
                            <td className="mono">{r.date}</td>
                            <td>{r.supplierName}</td>
                            <td>{r.siteName}</td>
                            <td><span className="cmpt-badge gray">{paymentLabel(r.paymentMode)}</span></td>
                            <td className="mono">{r.amountLabel}</td>
                            <td>{r.invoice.trim() ? r.invoice : <span style={{ color: '#b45309' }}>—</span>}</td>
                            <td>
                              {r.verification.trim() ? (
                                <span className="cmpt-badge comptant">Validé</span>
                              ) : (
                                <span className="cmpt-badge cheque">En attente</span>
                              )}
                            </td>
                          </tr>
                        ))}
                        <tr style={{ fontWeight: 700, background: '#f1f5f9' }}>
                          <td colSpan={5}>Total affiché</td>
                          <td className="mono">{fcfa(filteredRows.reduce((s, r) => s + (r.amountFcfa ?? 0), 0))}</td>
                          <td colSpan={2} />
                        </tr>
                      </tbody>
                    </table>
                  )}
                </div>

                <div className="summary">
                  <div className="summary-card">
                    <h4>Répartition par mode de paiement</h4>
                    {Object.keys(kpi.byMode).length === 0 ? (
                      <p style={{ color: '#64748b', fontSize: 13 }}>Aucun BC émis ce mois.</p>
                    ) : (
                      <>
                        {Object.entries(kpi.byMode)
                          .sort((a, b) => b[1].amount - a[1].amount)
                          .map(([mode, bucket]) => (
                            <div className="payment-row" key={mode}>
                              <span>
                                <span className={`dot dot-${badgeClass(mode).split(' ')[1] ?? 'gray'}`} />
                                {paymentLabel(mode)}
                              </span>
                              <span>
                                {fcfa(bucket.amount)} FCFA ({bucket.count} BC)
                              </span>
                            </div>
                          ))}
                        <div className="payment-row">
                          <span>Total</span>
                          <span>{fcfa(kpi.totalAmount)} FCFA</span>
                        </div>
                      </>
                    )}
                  </div>
                  <div className="summary-card">
                    <h4>Répartition par fournisseur</h4>
                    {supplierTotals.length === 0 ? (
                      <p style={{ color: '#64748b', fontSize: 13 }}>Aucun BC émis ce mois.</p>
                    ) : (
                      supplierTotals.map(([s, amount]) => (
                        <div className="payment-row" key={s}>
                          <span>{s}</span>
                          <span>{fcfa(amount)} FCFA</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="grand">
                  <span className="lbl">Total général {monthLabel}</span>
                  <span className="val">{fcfa(kpi.totalAmount)} FCFA</span>
                </div>
              </>
            )}

            {subTab === 'suivi' && (
              <>
                <div className="kpis">
                  <div className="kpi">
                    <div className="lbl">Total BC</div>
                    <div className="val">{rows.length}</div>
                    <div className="det">BC ce mois</div>
                  </div>
                  <div className="kpi credit">
                    <div className="lbl">Crédit</div>
                    <div className="val">{kpi.byMode['CREDIT']?.count ?? 0}</div>
                    <div className="det">BC à crédit</div>
                  </div>
                  <div className="kpi comptant">
                    <div className="lbl">Comptant</div>
                    <div className="val">{kpi.byMode['COMPTANT']?.count ?? 0}</div>
                    <div className="det">BC payés comptant</div>
                  </div>
                  <div className="kpi">
                    <div className="lbl">Montant total</div>
                    <div className="val">{fcfa(kpi.totalAmount)}</div>
                    <div className="det">FCFA ce mois</div>
                  </div>
                </div>

                <div className="filters">
                  <label>
                    Mode de paiement
                    <select value={fPayment} onChange={(e) => setFPayment(e.target.value)} data-testid="cmpt-filter-paymentMode">
                      <option value="">Tous les modes</option>
                      {['CREDIT', 'COMPTANT', 'CHEQUE', 'VIREMENT']
                        .filter((m) => rows.some((r) => r.paymentMode.trim().toUpperCase() === m))
                        .map((m) => (
                          <option key={m} value={m}>
                            {paymentLabel(m)}
                          </option>
                        ))}
                    </select>
                  </label>
                </div>

                <div className="card">
                  <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>
                    Suivi points fournisseurs — {monthLabel}
                  </h3>
                  {filteredRows.length === 0 ? (
                    <p style={{ color: '#64748b', fontSize: 13 }}>Aucun BC pour ce filtre.</p>
                  ) : (
                    <table>
                      <thead>
                        <tr>
                          <th>Chantier</th>
                          <th>Fournisseur</th>
                          <th>Date</th>
                          <th>N° BC</th>
                          <th>Mode</th>
                          <th>Montant (FCFA)</th>
                          <th>N° Facture</th>
                          <th>Vérification</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredRows.map((r) => (
                          <tr key={r.purchaseOrderId}>
                            <td>{r.siteName}</td>
                            <td>{r.supplierName}</td>
                            <td className="mono">{r.date}</td>
                            <td className="bon">{r.bon}</td>
                            <td><span className={badgeClass(r.paymentMode)}>{paymentLabel(r.paymentMode)}</span></td>
                            <td className="mono">{r.amountLabel}</td>
                            <td>{r.invoice.trim() ? r.invoice : <span style={{ color: '#b45309' }}>—</span>}</td>
                            <td>{r.verification.trim() ? <span className="cmpt-badge comptant">{r.verification}</span> : <span style={{ color: '#64748b' }}>—</span>}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </>
            )}

            {subTab === 'factures' && (
              <>
                <div className="kpis">
                  <div className="kpi">
                    <div className="lbl">Total factures</div>
                    <div className="val">{invoiceKpi.total}</div>
                    <div className="det">factures ce mois</div>
                  </div>
                  <div className="kpi comptant">
                    <div className="lbl">Payées</div>
                    <div className="val">{invoiceKpi.paid}</div>
                    <div className="det">vérifiées ce mois</div>
                  </div>
                  <div className="kpi credit">
                    <div className="lbl">En attente</div>
                    <div className="val">{invoiceKpi.pending}</div>
                    <div className="det">à suivre ce mois</div>
                  </div>
                  <div className="kpi">
                    <div className="lbl">Montant total</div>
                    <div className="val">{fcfa(invoiceKpi.totalAmount)}</div>
                    <div className="det">FCFA facturés ce mois</div>
                  </div>
                </div>

                <div className="card">
                <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Factures — {monthLabel}</h3>
                {(() => {
                  const invoiced = invoicedRows
                  if (invoiced.length === 0) {
                    return <p style={{ color: '#64748b', fontSize: 13 }}>Aucune facture saisie ce mois.</p>
                  }
                  return (
                    <table>
                      <thead>
                        <tr>
                          <th>N° Facture</th>
                          <th>N° BC</th>
                          <th>Fournisseur</th>
                          <th>Date</th>
                          <th>Montant (FCFA)</th>
                          <th>Mode</th>
                          <th>Payée</th>
                          <th>Statut</th>
                          <th>Facture</th>
                        </tr>
                      </thead>
                      <tbody>
                        {invoiced.map((r) => (
                          <tr key={r.purchaseOrderId}>
                            <td className="bon">{r.invoice || <span style={{ color: '#64748b' }}>—</span>}</td>
                            <td>{r.bon}</td>
                            <td>{r.supplierName}</td>
                            <td className="mono">{r.date}</td>
                            <td className="mono">{r.amountLabel}</td>
                            <td><span className={"cmpt-badge gray"}>{paymentLabel(r.paymentMode)}</span></td>
                            <td>
                              <button
                                type="button"
                                onClick={() => void toggleInvoicePaid(r)}
                                className={`cmpt-badge gray`}
                                style={{ cursor: 'pointer', border: 'none', fontFamily: 'inherit' }}
                                title={r.invoicePaid ? 'Marquer non payée' : 'Marquer payée'}
                              >
                                {r.invoicePaid ? 'Oui' : 'Non'}
                              </button>
                            </td>
                            <td>
                              {r.invoiceFile ? (
                                <span className="cmpt-badge gray">Reçu</span>
                              ) : (
                                <span className="cmpt-badge gray">À recevoir</span>
                              )}
                            </td>
                            <td>
                              {r.invoiceFile ? (
                                <button type="button" className="pill-doc" onClick={() => void openInvoiceFile(r)}>
                                  📄 {r.invoiceFile.fileName}
                                </button>
                              ) : (
                                <span style={{ color: '#64748b' }}>—</span>
                              )}
                            </td>
                           </tr>
                        ))}
                      </tbody>
                    </table>
                  )
                })()}
                </div>
              </>
            )}

            {subTab === 'rapports' && (
              <>
                <div className="summary-grid">
                  <div className="summary-card">
                    <h4>Répartition par mode de paiement</h4>
                    {Object.keys(kpi.byMode).length === 0 ? (
                      <p style={{ color: '#64748b', fontSize: 13 }}>Aucun BC émis ce mois.</p>
                    ) : (
                      <>
                        {Object.entries(kpi.byMode)
                          .sort((a, b) => b[1].amount - a[1].amount)
                          .map(([mode, bucket]) => (
                            <div key={mode} className="summary-item">
                              <span className="kpi-label">
                                <span className={`dot dot-${mode.toLowerCase() || 'gray'}`}></span>
                                {paymentLabel(mode)}
                              </span>
                              <span>{fcfa(bucket.amount)} FCFA ({bucket.count} BC)</span>
                            </div>
                          ))}
                        <div className="summary-item">
                          <span>Total</span>
                          <span>{fcfa(kpi.totalAmount)} FCFA</span>
                        </div>
                      </>
                    )}
                  </div>
                  <div className="summary-card">
                    <h4>Répartition par fournisseur</h4>
                    {(() => {
                      const bySupplier: Record<string, number> = {}
                      for (const r of rows) {
                        bySupplier[r.supplierName.trim()] = (bySupplier[r.supplierName.trim()] ?? 0) + (r.amountFcfa ?? 0)
                      }
                      const entries = Object.entries(bySupplier).sort((a, b) => b[1] - a[1])
                      if (entries.length === 0) {
                        return <p style={{ color: '#64748b', fontSize: 13 }}>Aucun BC émis ce mois.</p>
                      }
                      return entries.map(([name, amount]) => (
                        <div key={name} className="summary-item">
                          <span>{name}</span>
                          <span>{fcfa(amount)} FCFA</span>
                        </div>
                      ))
                    })()}
                  </div>
                </div>
                <div className="card">
                  <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Rapports disponibles — {monthLabel}</h3>
                  <table>
                    <thead>
                      <tr>
                        <th>Rapport</th>
                        <th>Description</th>
                        <th>Format</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td style={{ fontWeight: 700 }}>Suivi BC</td>
                        <td>Liste des BC avec détails fournisseurs et paiements</td>
                        <td>XLSX</td>
                        <td><button type="button" className="chip" onClick={sessionExport}>Exporter</button></td>
                      </tr>
                      <tr>
                        <td style={{ fontWeight: 700 }}>Factures</td>
                        <td>Liste des factures avec statut de paiement</td>
                        <td>XLSX</td>
                        <td><button type="button" className="chip" onClick={sessionExport}>Exporter</button></td>
                      </tr>
                      <tr>
                        <td style={{ fontWeight: 700 }}>Recap fournisseur</td>
                        <td>Récapitulatif groupé par fournisseur</td>
                        <td>PDF</td>
                        <td><button type="button" className="chip" onClick={sessionExport}>Exporter</button></td>
                      </tr>
                      <tr>
                        <td style={{ fontWeight: 700 }}>Suivi paiements</td>
                        <td>État des paiements par mode</td>
                        <td>XLSX</td>
                        <td><button type="button" className="chip" onClick={sessionExport}>Exporter</button></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </>
        )}

        {preview && (
          <div
            role="dialog"
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.45)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 40,
            }}
            onClick={closePreview}
          >
            <div
              style={{ background: '#fff', padding: 16, maxWidth: '90vw', maxHeight: '90vh', overflow: 'auto', borderRadius: 12 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
                <strong>{preview.fileName}</strong>
                <button type="button" className="btn" onClick={closePreview}>
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
    </div>
  )
}
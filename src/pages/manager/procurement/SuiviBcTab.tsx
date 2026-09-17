import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from '../../../lib/toast'
import { useProcurementStore } from '../../../stores/procurementStore'
import {
  fetchBcInvoiceFile,
  fetchRequestLineAttachment,
  patchBcRegisterFollowup,
  uploadBcInvoiceFile,
} from './procurementApi'
import type { BcRegisterRow } from './procurementTypes'
import { AlertBox, formatFcfa } from './procurementUi'

/**
 * Onglet « Suivi — points fournisseurs des BC » (SA / CdG).
 * Reproduction fidèle de la maquette docs/mockups/suivi-bc-v1.html :
 * le CSS ci-dessous est celui de la maquette, scopé sous .sbc.
 */
const SBC_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap');
.sbc{
  --navy:#1e3a5f; --navy-soft:#eef3f8; --muted:#64748b; --border:#e2e8f0;
  --green:#047857; --green-bg:#ecfdf5; --amber:#b45309; --amber-bg:#fffbeb;
  --red:#b91c1c; --red-bg:#fef2f2; --gold:#b7791f;
  font-family:'Inter',sans-serif; color:#1e293b;
}
.sbc *{margin:0;padding:0;box-sizing:border-box}
.sbc .page{max-width:1280px;margin:0 auto}
.sbc .topbar{display:flex;justify-content:space-between;align-items:center;gap:16px;margin-bottom:6px}
.sbc h1{font-size:22px;font-weight:800;color:var(--navy)}
.sbc .sub{color:var(--muted);font-size:13px;margin-top:4px}
.sbc .btn{border:1px solid var(--border);background:#fff;border-radius:8px;padding:8px 14px;font-family:inherit;font-size:13px;font-weight:600;color:var(--navy);cursor:pointer}
.sbc .btn-primary{background:var(--navy);border-color:var(--navy);color:#fff}
.sbc .kpis{display:grid;grid-template-columns:repeat(5,1fr);gap:12px;margin:18px 0}
.sbc .kpi{background:#fff;border:1px solid var(--border);border-radius:12px;padding:14px 16px}
.sbc .kpi .lbl{font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:var(--muted);margin-bottom:6px}
.sbc .kpi .val{font-size:22px;font-weight:800;color:var(--navy)}
.sbc .kpi .det{font-size:11px;color:var(--muted);margin-top:4px}
.sbc .kpi.warn .val{color:var(--amber)}
.sbc .pill{display:inline-block;padding:2px 10px;border-radius:999px;font-size:11px;font-weight:700}
.sbc .pill-green{background:var(--green-bg);color:var(--green)}
.sbc .pill-amber{background:var(--amber-bg);color:var(--amber)}
.sbc .pill-red{background:var(--red-bg);color:var(--red)}
.sbc .pill-gray{background:#f1f5f9;color:var(--muted)}
.sbc .tabs{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:12px}
.sbc .chip{border:1px solid var(--border);background:#fff;border-radius:8px;padding:7px 14px;font-family:inherit;font-size:13px;font-weight:600;color:var(--navy);cursor:pointer}
.sbc .chip.active{background:#fdf3e0;border-color:#ecd9b0;color:var(--gold)}
.sbc .sheet-note{font-size:12px;color:var(--muted);margin-left:8px}
.sbc .card{background:#fff;border:1px solid var(--border);border-radius:12px;padding:16px;margin-bottom:16px}
.sbc .card-recap{border-left:4px solid var(--gold)}
.sbc .filters{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:12px}
.sbc .filters label{font-size:12px;color:var(--muted);display:flex;flex-direction:column;gap:4px}
.sbc .filters select{font-family:inherit;font-size:13px;padding:6px 10px;border:1px solid var(--border);border-radius:8px;color:#1e293b;min-width:150px}
.sbc table{width:100%;border-collapse:collapse;font-size:12.5px}
.sbc th{text-align:left;padding:8px 10px;color:var(--navy);border-bottom:2px solid var(--border);font-size:11px;text-transform:uppercase;letter-spacing:.4px;white-space:nowrap}
.sbc td{padding:8px 10px;border-bottom:1px solid var(--border);vertical-align:middle}
.sbc tr:hover td{background:#f8fafc}
.sbc .mono{font-variant-numeric:tabular-nums}
.sbc .cell-input{font-family:inherit;font-size:12.5px;padding:5px 8px;border:1px solid var(--border);border-radius:6px;width:100%;min-width:90px;color:#1e293b;background:#fff}
.sbc .cell-input:focus{outline:2px solid #bfdbfe;border-color:#93c5fd}
.sbc .cell-input.filled{border-color:#a7f3d0;background:#f0fdf9}
.sbc .att{border:1px solid var(--border);background:#fff;border-radius:6px;padding:3px 8px;font-size:11.5px;color:var(--navy);cursor:pointer;display:inline-flex;align-items:center;gap:4px;margin:1px 2px 1px 0}
.sbc .bon{font-weight:700;color:var(--navy);white-space:nowrap}
.sbc .tot{font-weight:800;background:var(--navy-soft)}
.sbc .sup-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px}
.sbc .sup-head h3{font-size:14px;font-weight:800;color:var(--navy);text-transform:uppercase;letter-spacing:.4px}
.sbc .sup-total{font-size:14px;font-weight:800;color:var(--navy)}
.sbc .grand{display:flex;justify-content:flex-end;gap:12px;align-items:baseline;margin-top:14px;padding:12px 16px;background:var(--navy);border-radius:10px;color:#fff}
.sbc .grand .lbl{font-size:12px;text-transform:uppercase;letter-spacing:.5px;opacity:.75}
.sbc .grand .val{font-size:20px;font-weight:800}
.sbc .legend{font-size:11.5px;color:var(--muted);margin-top:10px}
`
const MOIS_FR = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']

/** '2026-07' → 'Juillet 2026' (format maquette). */
function monthTitle(key: string | null | undefined): string {
  if (!key) return ''
  const [y, m] = key.split('-').map(Number)
  if (!y || !m || m < 1 || m > 12) return key
  const name = MOIS_FR[m - 1]
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} ${y}`
}

/** '2026-07' → 'juillet' (libellés KPI façon maquette). */
function monthNameLower(key: string | null | undefined): string {
  if (!key) return ''
  const m = Number(key.split('-')[1])
  return m >= 1 && m <= 12 ? MOIS_FR[m - 1] : key
}

function daysSince(dateStr: string): number | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(dateStr.trim())
  const d = m ? new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1])) : new Date(dateStr)
  if (Number.isNaN(d.getTime())) return null
  return Math.floor((Date.now() - d.getTime()) / 86400000)
}


function uniqueValues(rows: BcRegisterRow[], key: 'siteName' | 'supplierName' | 'paymentMode'): string[] {
  return [...new Set(rows.map((r) => String(r[key] ?? '').trim() || '—'))].sort((a, b) => a.localeCompare(b, 'fr'))
}

type Sheet = 'mois' | 'recap'
type FollowupField = 'invoice' | 'justifs' | 'observation' | 'verification'
type InvoiceFilter = '' | 'received' | 'missing'

export function SuiviBcTab({ handleAuth }: { handleAuth: (status: number) => boolean }) {
  // Registre BC partagé (store Zustand) : même source que ComptabiliteTab.
  const rows = useProcurementStore((s) => s.rows)
  const recap = useProcurementStore((s) => s.recap)
  const months = useProcurementStore((s) => s.months)
  const month = useProcurementStore((s) => s.month)
  const loading = useProcurementStore((s) => s.loading)
  const error = useProcurementStore((s) => s.error)
  const load = useProcurementStore((s) => s.load)
  const applyRow = useProcurementStore((s) => s.applyRow)
  const patchRow = useProcurementStore((s) => s.patchRow)
  const [sheet, setSheet] = useState<Sheet>('mois')
  const [fSite, setFSite] = useState('')
  const [fSupplier, setFSupplier] = useState('')
  const [fPayment, setFPayment] = useState('')
  const [fInvoice, setFInvoice] = useState<InvoiceFilter>('')
  const [preview, setPreview] = useState<{ url: string; fileName: string; contentType: string } | null>(null)
  const previewUrlRef = useRef<string | null>(null)
  const invoiceInputRef = useRef<HTMLInputElement | null>(null)
  const invoiceUploadRowRef = useRef<BcRegisterRow | null>(null)

  useEffect(() => {
    void load(handleAuth)
  }, [load, handleAuth])

  const filteredRows = useMemo(
    () =>
      rows.filter((r) => {
        if (fSite && (r.siteName.trim() || '—') !== fSite) return false
        if (fSupplier && (r.supplierName.trim() || '—') !== fSupplier) return false
        if (fPayment && (r.paymentMode.trim() || '—') !== fPayment) return false
        if (fInvoice === 'received' && !r.invoice.trim()) return false
        if (fInvoice === 'missing' && r.invoice.trim()) return false
        return true
      }),
    [rows, fSite, fSupplier, fPayment, fInvoice],
  )

  // KPI du mois (maquette suivi-bc-v1) — dérivés des champs existants.
  const kpi = useMemo(() => {
    const totalAmount = rows.reduce((s, r) => s + (r.amountFcfa ?? 0), 0)
    const invoicesReceived = rows.filter((r) => r.invoice.trim()).length
    const justifsMissingRows = rows.filter((r) => !r.justifs.trim())
    const verifPendingRows = rows.filter((r) => !r.verification.trim())
    const oldVerifCount = verifPendingRows.filter((r) => {
      const d = daysSince(r.date)
      return d != null && d > 7
    }).length
    return {
      count: rows.length,
      totalAmount,
      invoicesReceived,
      invoicePct: rows.length > 0 ? Math.round((invoicesReceived / rows.length) * 100) : 0,
      justifsMissing: justifsMissingRows.length,
      justifsSites: new Set(justifsMissingRows.map((r) => r.siteName)).size,
      supplierCount: new Set(rows.map((r) => r.supplierName)).size,
      verifPending: verifPendingRows.length,
      oldVerifCount,
    }
  }, [rows])

  // Export Excel (.xls SpreadsheetML — s'ouvre dans Excel/LibreOffice, sans dépendance externe).
  const exportXls = () => {
    const esc = (v: unknown) =>
      String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    const headers = ['Chantier', 'Fournisseur', 'Date', 'N° BC', 'Paiement', 'Montant (XOF)', 'N° Facture', 'Observation', 'Vérification']
    const body = filteredRows
      .map((r) => {
        const cells = [r.siteName, r.supplierName, r.date, r.bon, r.paymentMode, r.amountFcfa ?? '', r.invoice, r.observation, r.verification]
        return '<tr>' + cells.map((v, i) => (i === 5 ? `<td x:num>${esc(v)}</td>` : `<td>${esc(v)}</td>`)).join('') + '</tr>'
      })
      .join('')
    const html =
      '<html xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="UTF-8"></head><body>' +
      `<table border="1"><thead><tr>${headers.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table>` +
      '</body></html>'
    const blob = new Blob(['﻿' + html], { type: 'application/vnd.ms-excel' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `points-fournisseurs-bc-${month ?? 'tous'}.xls`
    a.click()
    URL.revokeObjectURL(url)
  }

  // Ouverture du sélecteur de fichier pour joindre / remplacer la copie de facture.
  const openInvoicePicker = (row: BcRegisterRow) => {
    invoiceUploadRowRef.current = row
    invoiceInputRef.current?.click()
  }

  // Aperçu intégré de la facture jointe (image ou PDF).
  const openInvoicePreview = async (row: BcRegisterRow) => {
    if (!row.invoiceFile) return
    try {
      const { blob } = await fetchBcInvoiceFile(row.purchaseOrderId)
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
      const url = URL.createObjectURL(blob)
      previewUrlRef.current = url
      setPreview({ url, fileName: row.invoiceFile.fileName, contentType: blob.type })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Aperçu indisponible')
    }
  }

  // Consultation d'une pièce jointe fournisseur portée par la ligne de la demande liée au BC.
  const openAttachment = async (row: BcRegisterRow, lineId: string, fileName: string) => {
    try {
      const { blob, fileName: servedName } = await fetchRequestLineAttachment(row.purchaseRequestId, lineId)
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
      const url = URL.createObjectURL(blob)
      previewUrlRef.current = url
      setPreview({ url, fileName: servedName || fileName, contentType: blob.type })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Pièce jointe indisponible')
    }
  }

  const handleInvoiceFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const row = invoiceUploadRowRef.current
    const file = e.target.files?.[0]
    e.target.value = ''
    invoiceUploadRowRef.current = null
    if (!row || !file) return
    try {
      await uploadBcInvoiceFile(row.purchaseOrderId, file)
      patchRow(row.purchaseOrderId, { invoiceFile: { fileName: file.name }, invoiceTransmitted: false })
      toast.show(`Facture jointe · ${file.name}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Jointure impossible')
    }
  }

  // Transmettre la facture au comptable (CMPT) : PJ + n° de facture requis.
  const transmitInvoice = async (row: BcRegisterRow) => {
    if (!row.invoiceFile || !row.invoice.trim()) return
    try {
      const updated = await patchBcRegisterFollowup(row.purchaseOrderId, { invoiceTransmitted: true })
      applyRow(updated)
      toast.show(`Facture ${row.invoice.trim()} transmise au comptable`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Transmission impossible')
    }
  }


  const saveFollowup = async (row: BcRegisterRow, field: FollowupField, value: string) => {
    const next = value.trim()
    if (next === row[field]) return
    try {
      const updated = await patchBcRegisterFollowup(row.purchaseOrderId, { [field]: next })
      applyRow(updated)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Enregistrement impossible')
    }
  }

  const closePreview = () => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
    previewUrlRef.current = null
    setPreview(null)
  }

  const followupInput = (row: BcRegisterRow, field: FollowupField, placeholder: string) => (
    <input
      key={`${row.purchaseOrderId}-${field}-${row[field]}`}
      className={`cell-input${row[field].trim() ? ' filled' : ''}`}
      defaultValue={row[field]}
      placeholder={placeholder}
      data-testid={`mgr-suivi-bc-${field}-${row.purchaseOrderId}`}
      onBlur={(e) => void saveFollowup(row, field, e.target.value)}
    />
  )

  return (
    <div className="sbc" data-testid="mgr-suivi-bc">
      <style>{SBC_CSS}</style>
      <input
        ref={invoiceInputRef}
        type="file"
        accept="application/pdf,image/*"
        style={{ display: 'none' }}
        onChange={(e) => void handleInvoiceFileChange(e)}
        data-testid="mgr-suivi-bc-invoice-input"
      />
      <div className="page">
        <div className="topbar">
          <div>
            <h1>Suivi — points fournisseurs des BC</h1>
            <p className="sub">Feuille mois filtrable + récap par fournisseur · suivi facture / justificatifs / vérification</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn" onClick={exportXls} data-testid="mgr-suivi-bc-export">
              ↳ Exporter (xlsx)
            </button>
            <button type="button" className="btn btn-primary" onClick={() => void load(handleAuth, month)} data-testid="mgr-suivi-bc-refresh">
              ⟳ Actualiser
            </button>
          </div>
        </div>

        <div className="kpis" data-testid="mgr-suivi-bc-kpis">
          <div className="kpi" data-testid="mgr-suivi-bc-kpi-count">
            <div className="lbl">BC confirmés{month ? ` · ${monthNameLower(month)}` : ''}</div>
            <div className="val">{kpi.count}</div>
            <div className="det">
              {kpi.supplierCount} fournisseur{kpi.supplierCount > 1 ? 's' : ''} actif{kpi.supplierCount > 1 ? 's' : ''}
            </div>
          </div>
          <div className="kpi" data-testid="mgr-suivi-bc-kpi-amount">
            <div className="lbl">Montant total</div>
            <div className="val mono">{formatFcfa(kpi.totalAmount)}</div>
            <div className="det">XOF · tous chantiers</div>
          </div>
          <div className={`kpi${kpi.justifsMissing > 0 ? ' warn' : ''}`} data-testid="mgr-suivi-bc-kpi-justifs">
            <div className="lbl">Justifs manquants</div>
            <div className="val">{kpi.justifsMissing}</div>
            <div className="det">
              {kpi.justifsMissing > 0
                ? `${kpi.justifsSites} chantier${kpi.justifsSites > 1 ? 's' : ''} concerné${kpi.justifsSites > 1 ? 's' : ''}`
                : 'Tous complétés'}
            </div>
          </div>
          <div className={`kpi${kpi.verifPending > 0 ? ' warn' : ''}`} data-testid="mgr-suivi-bc-kpi-verifs">
            <div className="lbl">Vérifs en attente</div>
            <div className="val">{kpi.verifPending}</div>
            <div className="det">
              {kpi.oldVerifCount > 0 ? `CdG — ${kpi.oldVerifCount} de plus de 7 j` : 'CdG — à jour'}
            </div>
          </div>
          <div className="kpi" data-testid="mgr-suivi-bc-kpi-invoices">
            <div className="lbl">Factures reçues</div>
            <div className="val">
              {kpi.invoicesReceived} / {kpi.count}
            </div>
            <div className="det">{kpi.invoicePct} % du mois</div>
          </div>
        </div>

        {months.length > 0 && (
          <div className="tabs" data-testid="mgr-suivi-bc-month-tabs">
            {months.map((m) => (
              <button
                key={m.key}
                type="button"
                className={`chip${m.key === month ? ' active' : ''}`}
                data-testid={`mgr-suivi-bc-month-${m.key}`}
                onClick={() => void load(handleAuth, m.key)}
              >
                {monthTitle(m.key)}
              </button>
            ))}
            {month && (
              <>
                <span className="sheet-note">Feuille active :</span>
                <button
                  type="button"
                  className={`chip${sheet === 'mois' ? ' active' : ''}`}
                  data-testid="mgr-suivi-bc-sheet-mois"
                  onClick={() => setSheet('mois')}
                >
                  Feuille mois
                </button>
                <button
                  type="button"
                  className={`chip${sheet === 'recap' ? ' active' : ''}`}
                  data-testid="mgr-suivi-bc-sheet-recap"
                  onClick={() => setSheet('recap')}
                >
                  RECAP {monthTitle(month)}
                </button>
              </>
            )}
          </div>
        )}

        {error && <AlertBox>{error}</AlertBox>}

        {loading ? (
          <p className="sub">Chargement…</p>
        ) : rows.length === 0 ? (
          <p className="sub" data-testid="mgr-suivi-bc-empty">
            Aucune livraison BC confirmée.
          </p>
        ) : sheet === 'mois' ? (
          <div className="card">
            <div className="filters" data-testid="mgr-suivi-bc-filters">
              <label>
                Chantier
                <select value={fSite} onChange={(e) => setFSite(e.target.value)} data-testid="mgr-suivi-bc-filter-siteName">
                  <option value="">Tous</option>
                  {uniqueValues(rows, 'siteName').map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Fournisseur
                <select value={fSupplier} onChange={(e) => setFSupplier(e.target.value)} data-testid="mgr-suivi-bc-filter-supplierName">
                  <option value="">Tous</option>
                  {uniqueValues(rows, 'supplierName').map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Mode de paiement
                <select value={fPayment} onChange={(e) => setFPayment(e.target.value)} data-testid="mgr-suivi-bc-filter-paymentMode">
                  <option value="">Tous</option>
                  {uniqueValues(rows, 'paymentMode').map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Facture
                <select value={fInvoice} onChange={(e) => setFInvoice(e.target.value as InvoiceFilter)} data-testid="mgr-suivi-bc-filter-invoice">
                  <option value="">Toutes</option>
                  <option value="received">Reçue</option>
                  <option value="missing">Manquante</option>
                </select>
              </label>
              <span className="sheet-note">{filteredRows.length} BC · filtres en-tête dupliqués (tri par colonne au clic)</span>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table data-testid="mgr-suivi-bc-table">
                <thead>
                  <tr>
                    <th>CHANTIERS</th>
                    <th>FOURNISSEURS</th>
                    <th>DATE</th>
                    <th>BON</th>
                    <th>MODE DE PAIEMENT</th>
                    <th>MONTANT (XOF)</th>
                    <th>N° FACTURE</th>
                    <th>FACTURE</th>
                    <th>OBSERVATION</th>
                    <th>VÉRIFICATION</th>
                    <th>DOC EN ATTACHE</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row) => {
                    const days = daysSince(row.date)
                    return (
                      <tr key={row.purchaseOrderId}>
                        <td>{row.siteName}</td>
                        <td>{row.supplierName}</td>
                        <td className="mono">{row.date}</td>
                        <td className="bon">{row.bon}</td>
                        <td>{row.paymentMode}</td>
                        <td className="mono tot">{row.amountLabel}</td>
                        <td>{followupInput(row, 'invoice', 'n° facture…')}</td>
                        <td>
                          {row.invoiceTransmitted ? (
                            <span
                              className="pill pill-green"
                              data-testid={`mgr-suivi-bc-invoice-transmitted-${row.purchaseOrderId}`}
                            >
                              ✓ Transmis
                            </span>
                          ) : (
                            <button
                              type="button"
                              className="btn"
                              style={{ padding: '4px 10px', fontSize: 12 }}
                              disabled={!row.invoice.trim() || !row.invoiceFile}
                              title={
                                !row.invoiceFile
                                  ? 'Joindre la facture pour transmettre'
                                  : !row.invoice.trim()
                                    ? 'Saisir le numéro de facture pour transmettre'
                                    : 'Transmettre la facture au comptable'
                              }
                              data-testid={`mgr-suivi-bc-invoice-transmit-${row.purchaseOrderId}`}
                              onClick={() => void transmitInvoice(row)}
                            >
                              Transmettre
                            </button>
                          )}
                        </td>
                        <td>{followupInput(row, 'observation', 'à compléter…')}</td>
                        <td>
                          {row.verification.trim() ? (
                            <span className="pill pill-green">✓ Vérifié</span>
                          ) : (
                            <>
                              {followupInput(row, 'verification', 'à compléter…')}
                              <div style={{ marginTop: 4 }}>
                                {days != null && days > 7 ? (
                                  <span className="pill pill-red">Non vérifié · {days} j</span>
                                ) : (
                                  <span className="pill pill-amber">En attente</span>
                                )}
                              </div>
                            </>
                          )}
                        </td>
                        <td data-testid={`mgr-suivi-bc-attach-cell-${row.purchaseOrderId}`}>
                          {(row.attachments ?? []).length > 0 && (
                            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center', marginBottom: 4 }}>
                              {(row.attachments ?? []).map((att) => (
                                <button
                                  key={att.lineId}
                                  type="button"
                                  className="att"
                                  data-testid={`mgr-suivi-bc-attach-${row.purchaseOrderId}`}
                                  onClick={() => void openAttachment(row, att.lineId, att.fileName)}
                                  title="Consulter la pièce jointe fournisseur"
                                >
                                  📎 {att.fileName}
                                </button>
                              ))}
                            </div>
                          )}
                          {row.invoiceFile ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <button
                                type="button"
                                className="att"
                                data-testid={`mgr-suivi-bc-invoice-preview-${row.purchaseOrderId}`}
                                onClick={() => void openInvoicePreview(row)}
                                title="Aperçu de la facture (image ou PDF)"
                              >
                                📎 {row.invoiceFile.fileName}
                              </button>
                              <button
                                type="button"
                                className="att"
                                style={{ padding: '2px 7px' }}
                                data-testid={`mgr-suivi-bc-invoice-replace-${row.purchaseOrderId}`}
                                onClick={() => openInvoicePicker(row)}
                                title="Remplacer la facture"
                              >
                                ✕
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              className="btn"
                              style={{ padding: '4px 10px', fontSize: 12 }}
                              data-testid={`mgr-suivi-bc-invoice-attach-${row.purchaseOrderId}`}
                              onClick={() => openInvoicePicker(row)}
                              title="Joindre la copie de la facture (PDF ou image)"
                            >
                              📎 Joindre
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <p className="legend">
              ● Champs N° FACTURE / OBSERVATION / VÉRIFICATION éditables en ligne (sauvegarde auto à la sortie du champ). ●
              Facture : 📎 Joindre la copie (PDF ou image) → clic sur le nom = aperçu, ✕ = remplacer → bouton Transmettre
              actif une fois le n° saisi → pastille verte ✓ Transmis.
            </p>
          </div>
        ) : null}

        {!loading && rows.length > 0 && sheet === 'recap' && (
          <div className="card card-recap" data-testid="mgr-suivi-bc-recap">
            <p className="sub" style={{ marginBottom: 14 }}>
              <strong style={{ color: 'var(--gold)' }}>RECAP {monthTitle(month).toUpperCase()}</strong> — groupage par
              fournisseur, tel que partagé aux points fournisseurs. Export xlsx en un clic.
            </p>
            {recap.length === 0 ? (
              <p className="sub">Aucun BC ce mois.</p>
            ) : (
              recap.map((group) => (
                <div key={group.supplierName} style={{ marginBottom: 18 }} data-testid={`mgr-suivi-bc-recap-${group.supplierName}`}>
                  <div className="sup-head">
                    <h3>🏢 Fournisseur {group.supplierName}</h3>
                    <span className="sup-total mono">Total : {group.totalLabel} XOF</span>
                  </div>
                  <div style={{ overflowX: 'auto' }}>
                    <table>
                      <thead>
                        <tr>
                          <th>DATE</th>
                          <th>N° BC</th>
                          <th>MONTANT (XOF)</th>
                          <th>SITES</th>
                          <th>OBSERVATION</th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.rows.map((line) => (
                          <tr key={`${group.supplierName}-${line.bon}`}>
                            <td className="mono">{line.date}</td>
                            <td className="bon">{line.bon}</td>
                            <td className="mono">{line.amountLabel}</td>
                            <td>{line.siteName}</td>
                            <td>{line.observation}</td>
                          </tr>
                        ))}
                        <tr className="tot">
                          <td colSpan={2}>Total</td>
                          <td className="mono">{group.totalLabel}</td>
                          <td colSpan={2} />
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              ))
            )}
            {recap.length > 0 && (
              <div className="grand" data-testid="mgr-suivi-bc-recap-grand">
                <span className="lbl">Total général {monthNameLower(month)} {month?.split('-')[0]}</span>
                <span className="val mono">{formatFcfa(kpi.totalAmount)} XOF</span>
                <span className="lbl">
                  · {kpi.count} BC · {kpi.supplierCount} fournisseurs
                </span>
              </div>
            )}
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

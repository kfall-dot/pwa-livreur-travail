import { useBcRegisterLiveUpdates } from './useBcRegisterLiveUpdates'
import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from '../../../lib/toast'
import { useProcurementStore } from '../../../stores/procurementStore'
import {
  certificateHtmlUrl,
  fetchBcBlFile,
  fetchBcInvoiceFile,
  fetchRequestLineAttachment,
  patchBcRegisterFollowup,
  verifyBcRegister,
  uploadBcBlFile,
  uploadBcInvoiceFile,
} from './procurementApi'
import type { BcRegisterRow } from './procurementTypes'
import { AlertBox, formatFcfa } from './procurementUi'

/**
 * Onglet « Suivi — points fournisseurs des BC » (SA / CdG).
 * Registre synthétique avec filtres et panneau documentaire, styles scopés sous .sbc.
 */
const SBC_CSS = `

.sbc{
  --navy:#1e3a5f; --navy-soft:#eef3f8; --muted:#64748b; --border:#e2e8f0;
  --green:#047857; --green-bg:#ecfdf5; --amber:#b45309; --amber-bg:#fffbeb;
  --red:#b91c1c; --red-bg:#fef2f2; --gold:#b7791f;
  font-family:inherit; color:#1e293b;
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
.sbc .documents-panel{position:fixed;inset:0 0 0 auto;margin:0;width:min(560px,100vw);height:100dvh;max-height:100dvh;max-width:100vw;border:0;border-left:1px solid var(--border);padding:24px;overflow-y:auto;color:#1e293b;background:#fff;box-shadow:-8px 0 32px #0002}
.sbc .documents-panel::backdrop{background:#0f172a66}
.sbc .documents-header{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:20px}
.sbc .documents-header h2{font-size:18px;color:var(--navy)}
.sbc .documents-panel h3{font-size:13px;color:var(--navy);margin:24px 0 10px;border-top:1px solid var(--border);padding-top:16px}
.sbc .documents-panel .att{max-width:100%;overflow-wrap:anywhere;text-align:left}
.sbc .bon{font-weight:700;color:var(--navy);white-space:nowrap}
.sbc .tot{font-weight:800;background:var(--navy-soft)}
.sbc .sup-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px}
.sbc .sup-head h3{font-size:14px;font-weight:800;color:var(--navy);text-transform:uppercase;letter-spacing:.4px}
/* RECAP : largeurs de colonnes figées identiques d'un fournisseur à l'autre */
.sbc .recap-tbl{table-layout:fixed;width:100%}
.sbc .recap-tbl th:nth-child(3),.sbc .recap-tbl td:nth-child(3){text-align:right}
/* Sélecteur de mois */
.sbc .month-pick{display:flex;align-items:center;gap:8px;font-size:13px;font-weight:600;color:var(--navy)}
.sbc .month-select{font-family:inherit;font-size:13px;padding:7px 12px;border:1px solid var(--border);border-radius:8px;color:#1e293b;min-width:170px;background:#fff;cursor:pointer}
.sbc .sup-total{font-size:14px;font-weight:800;color:var(--navy)}
.sbc .grand{display:flex;justify-content:flex-end;gap:12px;align-items:baseline;margin-top:14px;padding:12px 16px;background:var(--navy);border-radius:10px;color:#fff}
.sbc .grand .lbl{font-size:12px;text-transform:uppercase;letter-spacing:.5px;opacity:.75}
.sbc .grand .val{font-size:20px;font-weight:800}
.sbc .legend{font-size:11.5px;color:var(--muted);margin-top:10px}
.sbc .filters{padding:14px;background:#f8fafc;border:1px solid var(--border);border-radius:10px;gap:12px;align-items:flex-end}
.sbc .filters label{font-weight:600;gap:6px}
.sbc .filters input,.sbc .filters select{height:38px;background:#fff;font:inherit;font-size:13px;border:1px solid #cbd5e1;border-radius:8px;padding:8px 10px;color:#1e293b}
.sbc .search-field{flex:1;min-width:230px}
.sbc .filters input{width:100%}
.sbc button:focus-visible,.sbc input:focus-visible,.sbc select:focus-visible,.sbc a:focus-visible{outline:2px solid #2563eb;outline-offset:3px}
.sbc .cell-truncate{max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sbc td.mono,.sbc .pill{white-space:nowrap}
.sbc td.tot,.sbc th:nth-child(5){text-align:right}
.sbc .empty-result{padding:32px;text-align:center;color:var(--muted)}
.sbc th{background:#f1f5f9;padding:12px 10px}
.sbc td{padding:12px 10px}
.sbc .pill{padding:5px 10px}
.sbc .btn{min-height:34px}
.sbc .kpi{box-shadow:0 2px 5px #0f172a05}
@media(max-width:900px){.sbc .kpis{grid-template-columns:repeat(2,minmax(0,1fr))}.sbc .topbar{flex-wrap:wrap}.sbc .filters label{flex:1;min-width:140px}.sbc .filters select{width:100%;min-width:0}.sbc .search-field{flex-basis:100%}.sbc .card{padding:12px}}

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
type FollowupField = 'invoice' | 'justifs' | 'observation'
type InvoiceFilter = '' | 'received' | 'missing'

export function SuiviBcTab({ handleAuth, procurementRole }: { handleAuth: (status: number) => boolean; procurementRole?: string | null }) {
  // Registre BC partagé (store Zustand) : même source que ComptabiliteTab.
  useBcRegisterLiveUpdates(handleAuth)
  const rows = useProcurementStore((s) => s.rows)
  const recap = useProcurementStore((s) => s.recap)
  const months = useProcurementStore((s) => s.months)
  const month = useProcurementStore((s) => s.month)
  const loading = useProcurementStore((s) => s.loading)
  const error = useProcurementStore((s) => s.error)
  const load = useProcurementStore((s) => s.load)
  const applyRow = useProcurementStore((s) => s.applyRow)
  const patchRow = useProcurementStore((s) => s.patchRow)
  const [documentOrderId, setDocumentOrderId] = useState<string | null>(null)
  const documentsDialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    if (documentOrderId) documentsDialog.current?.showModal()
    else documentsDialog.current?.close()
  }, [documentOrderId])
  const [verificationTarget, setVerificationTarget] = useState<BcRegisterRow | null>(null)
  const [verificationComment, setVerificationComment] = useState('')
  const [verificationBusy, setVerificationBusy] = useState(false)
  const [verificationError, setVerificationError] = useState<string | null>(null)
  const verificationDialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    if (verificationTarget) verificationDialog.current?.showModal()
    else verificationDialog.current?.close()
  }, [verificationTarget])
  const submitVerification = async () => {
    if (!verificationTarget || verificationBusy) return
    setVerificationBusy(true)
    setVerificationError(null)
    try {
      applyRow(await verifyBcRegister(verificationTarget.purchaseOrderId, verificationComment.trim()))
      setVerificationTarget(null)
      toast.show('Vérification CdG enregistrée')
    } catch (err) {
      setVerificationError(err instanceof Error ? err.message : 'Vérification impossible')
    } finally { setVerificationBusy(false) }
  }
  const [sheet, setSheet] = useState<Sheet>('mois')
  const [search, setSearch] = useState('')
  const [paymentStatus, setPaymentStatus] = useState('')
  const [fSite, setFSite] = useState('')
  const [fSupplier, setFSupplier] = useState('')
  const [fPayment, setFPayment] = useState('')
  const [fInvoice, setFInvoice] = useState<InvoiceFilter>('')
  const monthOptions = useMemo(() => {
    if (month && !months.some((m) => m.key === month)) return [{ key: month, label: monthTitle(month) }, ...months]
    return months
  }, [months, month])
  const [preview, setPreview] = useState<{ url: string; fileName: string; contentType: string } | null>(null)
  const previewUrlRef = useRef<string | null>(null)
  const invoiceInputRef = useRef<HTMLInputElement | null>(null)
  const invoiceUploadRowRef = useRef<BcRegisterRow | null>(null)
  const blInputRef = useRef<HTMLInputElement | null>(null)
  const blUploadRowRef = useRef<BcRegisterRow | null>(null)

  useEffect(() => {
    void load(handleAuth)
  }, [load, handleAuth])

  const filteredRows = useMemo(
    () =>
      rows.filter((r) => {
        const normalize = (value: string) => value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
        if (search.trim() && !normalize([r.bon, r.ebReference, r.siteName, r.supplierName, r.invoice, ...r.btReferences].join(' ')).includes(normalize(search.trim()))) return false
        if (paymentStatus === 'paid' && !r.invoicePaid) return false
        if (paymentStatus === 'due' && (!r.invoiceTransmitted || r.invoicePaid)) return false
        if (paymentStatus === 'untransmitted' && (r.invoiceTransmitted || r.invoicePaid)) return false
        if (fSite && (r.siteName.trim() || '—') !== fSite) return false
        if (fSupplier && (r.supplierName.trim() || '—') !== fSupplier) return false
        if (fPayment && (r.paymentMode.trim() || '—') !== fPayment) return false
        if (fInvoice === 'received' && !r.invoice.trim()) return false
        if (fInvoice === 'missing' && r.invoice.trim()) return false
        return true
      }),
    [rows, fSite, fSupplier, fPayment, fInvoice, search, paymentStatus],
  )

  // KPI du mois (maquette suivi-bc-v1) — dérivés des champs existants.
  const kpi = useMemo(() => {
    const totalAmount = rows.reduce((s, r) => s + (r.amountFcfa ?? 0), 0)
    const invoicesReceived = rows.filter((r) => r.invoice.trim()).length
    const justifsMissingRows = rows.filter((r) => !r.justifs.trim())
    const verifPendingRows = rows.filter((r) => !r.verificationAudit)
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

  // Bon de livraison fournisseur : pièce de la chaîne EB → BC → BL (miroir facture).
  const openBlPicker = (row: BcRegisterRow) => {
    blUploadRowRef.current = row
    blInputRef.current?.click()
  }

  const openBlPreview = async (row: BcRegisterRow) => {
    if (!row.blFile) return
    try {
      const { blob } = await fetchBcBlFile(row.purchaseOrderId)
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
      const url = URL.createObjectURL(blob)
      previewUrlRef.current = url
      setPreview({ url, fileName: row.blFile.fileName, contentType: blob.type })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Aperçu indisponible')
    }
  }

  const handleBlFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const row = blUploadRowRef.current
    const file = e.target.files?.[0]
    e.target.value = ''
    blUploadRowRef.current = null
    if (!row || !file) return
    try {
      await uploadBcBlFile(row.purchaseOrderId, file)
      patchRow(row.purchaseOrderId, { blFile: { fileName: file.name } })
      toast.show(`Bon de livraison joint · ${file.name}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Jointure impossible')
    }
  }

  // Transmettre à la Comptabilité et à la Trésorerie (CMPT) : PJ + n° de facture requis.
  const transmitInvoice = async (row: BcRegisterRow) => {
    if (!row.invoiceFile || !row.invoice.trim()) return
    try {
      const updated = await patchBcRegisterFollowup(row.purchaseOrderId, { invoiceTransmitted: true })
      applyRow(updated)
      toast.show(`Facture ${row.invoice.trim()} transmise à la Comptabilité et à la Trésorerie`)
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
      disabled={field === 'invoice' && row.invoicePaid}
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
      <input
        ref={blInputRef}
        type="file"
        accept="application/pdf,image/*"
        style={{ display: 'none' }}
        onChange={(e) => void handleBlFileChange(e)}
        data-testid="mgr-suivi-bc-bl-input"
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
            <label className="month-pick">
              Mois
              <select
                className="month-select"
                value={month ?? ''}
                onChange={(e) => { const key = e.target.value; if (key) void load(handleAuth, key) }}
                data-testid="mgr-suivi-bc-month-select"
              >
                {monthOptions.map((m) => (
                  <option key={m.key} value={m.key} data-testid={`mgr-suivi-bc-month-${m.key}`}>
                    {monthTitle(m.key)}
                  </option>
                ))}
              </select>
            </label>
            {month && (
              <>
                <span className="sheet-note">Afficher :</span>
                <button
                  type="button"
                  className={`chip${sheet === 'mois' ? ' active' : ''}`}
                  data-testid="mgr-suivi-bc-sheet-mois"
                  onClick={() => setSheet('mois')}
                >
                  Suivi des bons
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
            Aucun bon de commande à suivre pour cette période.
          </p>
        ) : sheet === 'mois' ? (
          <div className="card">
            <div className="filters" data-testid="mgr-suivi-bc-filters">
              <label className="search-field">Rechercher
                <input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="BC, EB, fournisseur, chantier…" />
              </label>
              <label>Paiement
                <select value={paymentStatus} onChange={e => setPaymentStatus(e.target.value)}>
                  <option value="">Tous les statuts</option>
                  <option value="untransmitted">Non transmis</option>
                  <option value="due">À payer</option>
                  <option value="paid">Payé</option>
                </select>
              </label>
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
              <button type="button" className="btn" onClick={() => { setSearch(''); setPaymentStatus(''); setFSite(''); setFSupplier(''); setFPayment(''); setFInvoice('') }}>Réinitialiser</button>
              <span className="sheet-note" role="status">{filteredRows.length} BC sur {rows.length}</span>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table data-testid="mgr-suivi-bc-table">
                <thead>
                  <tr>
                    <th>CHANTIERS</th>
                    <th>FOURNISSEURS</th>
                    <th>DATE</th>
                    <th>BON</th>
                    <th>MONTANT (XOF)</th>
                    <th>PAIEMENT</th>
                    <th>N° FACTURE</th>
                    <th>FACTURE</th>
                    <th>OBSERVATION</th>
                    <th>VÉRIFICATION</th>
                    <th>PIÈCES</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.length === 0 && <tr><td colSpan={11} className="empty-result">Aucun bon ne correspond à ces filtres. Modifiez la recherche ou cliquez sur « Réinitialiser ».</td></tr>}
                  {filteredRows.map((row) => {
                    const days = daysSince(row.date)
                    return (
                      <tr key={row.purchaseOrderId}>
                        <td className="cell-truncate" title={row.siteName}>{row.siteName}</td>
                        <td className="cell-truncate" title={row.supplierName}>{row.supplierName}</td>
                        <td className="mono">{row.date}</td>
                        <td className="bon">
                          {row.bon}
                          <div style={{ fontSize: 11, color: '#667', fontWeight: 400 }}>
                            EB {row.ebReference}
                            {row.btReferences.length > 0 ? ` · BT ${row.btReferences.join(', ')}` : ''}
                          </div>
                        </td>
                        <td className="mono tot">{row.amountLabel}</td>
                        <td><span className={`pill ${row.invoicePaid ? 'pill-green' : row.invoiceTransmitted ? 'pill-amber' : 'pill-gray'}`}>{row.invoicePaid ? 'Payé' : row.invoiceTransmitted ? 'À payer' : 'Non transmis'}</span></td>
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
                                    : 'Transmettre à la Comptabilité et à la Trésorerie'
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
                          {row.verificationAudit ? (
                            <div>
                              <span className="pill pill-green">✓ Vérifié</span>
                              <div className="sub">{row.verificationAudit.byName}</div>
                              <div className="sub">{new Date(row.verificationAudit.at).toLocaleString('fr-FR')}</div>
                              {row.verificationAudit.comment && <div className="sub" style={{ maxWidth: 200, overflowWrap: 'anywhere' }}>{row.verificationAudit.comment}</div>}
                            </div>
                          ) : (
                            <>
                              <span className={`pill ${days != null && days > 7 ? 'pill-red' : 'pill-amber'}`}>
                                {days != null && days > 7 ? `Non vérifié · ${days} j` : 'En attente du CdG'}
                              </span>
                              {row.verification.trim() && <div className="sub" style={{ maxWidth: 200, overflowWrap: 'anywhere' }}>Ancienne note : {row.verification}</div>}
                              {procurementRole === 'controle_gestion' && <div style={{ marginTop: 6 }}><button type="button" className="btn" onClick={() => { setVerificationTarget(row); setVerificationComment(''); setVerificationError(null) }}>Marquer comme vérifié</button></div>}
                            </>
                          )}
                        </td>
                        <td data-testid={`mgr-suivi-bc-attach-cell-${row.purchaseOrderId}`}>
                          <button type="button" className="btn" style={{ whiteSpace: 'nowrap' }}
                            data-testid={`mgr-suivi-bc-documents-${row.purchaseOrderId}`}
                            onClick={() => setDocumentOrderId(row.purchaseOrderId)}>
                            📎 {(row.attachments?.length ?? 0) + Number(Boolean(row.invoiceFile)) + Number(Boolean(row.blFile)) + Number(Boolean(row.blReceiptId))} pièces
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <p className="legend">
              ● Champs N° FACTURE / OBSERVATION éditables en ligne (sauvegarde auto à la sortie du champ). ●
              Pièces : ouvrez le panneau documentaire pour consulter ou joindre une facture et un BL. Le bouton Transmettre
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
                    <table className="recap-tbl">
                      <colgroup>
                        <col style={{ width: '12%' }} />
                        <col style={{ width: '16%' }} />
                        <col style={{ width: '17%' }} />
                        <col style={{ width: '25%' }} />
                        <col style={{ width: '30%' }} />
                      </colgroup>
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

        <dialog ref={verificationDialog} aria-labelledby="sbc-verification-title" style={{ margin: 'auto', padding: 24, border: '1px solid #e2e8f0', borderRadius: 12, width: 'min(480px, 95vw)' }}
          onCancel={e => { if (verificationBusy) e.preventDefault(); else setVerificationTarget(null) }}>
          <form onSubmit={e => { e.preventDefault(); void submitVerification() }}>
            <h2 id="sbc-verification-title" style={{ fontSize: 18 }}>Vérification du dossier BC</h2>
            <p className="sub" style={{ margin: '12px 0' }}>{verificationTarget?.bon} · {verificationTarget?.supplierName}</p>
            <p style={{ fontSize: 13, marginBottom: 12 }}>Confirmez avoir contrôlé le dossier et ses justificatifs. Votre nom et la date seront enregistrés. Cette action ne vaut ni réception ni paiement.</p>
            <label style={{ display: 'block', fontSize: 13 }}>Commentaire facultatif
              <textarea value={verificationComment} onChange={e => setVerificationComment(e.target.value)} maxLength={500} disabled={verificationBusy} rows={3} style={{ display: 'block', width: '100%', marginTop: 8, padding: 8 }} />
            </label>
            {verificationError && <p role="alert" style={{ color: '#b91c1c', marginTop: 10 }}>{verificationError}</p>}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
              <button type="button" className="btn" disabled={verificationBusy} onClick={() => setVerificationTarget(null)}>Annuler</button>
              <button type="submit" className="btn btn-primary" disabled={verificationBusy}>{verificationBusy ? 'Enregistrement…' : 'Marquer comme vérifié'}</button>
            </div>
          </form>
        </dialog>
        <dialog ref={documentsDialog} className="documents-panel" aria-labelledby="sbc-documents-title"
          onCancel={() => setDocumentOrderId(null)} onClose={() => setDocumentOrderId(null)}>
          <header className="documents-header">
            <h2 id="sbc-documents-title">Documents du bon</h2>
            <button type="button" className="btn" onClick={() => setDocumentOrderId(null)}>Fermer</button>
          </header>
          {(() => {
            const row = rows.find(item => item.purchaseOrderId === documentOrderId)
            if (!row) return <p>Ce bon n’est plus présent dans la liste.</p>
            return <>
              <strong>{row.bon}</strong>
              <p className="sub">{row.siteName} · {row.supplierName}</p>
                          <h3>Pièces fournisseurs</h3>
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
                          <h3>Facture</h3>
                          {!(row.attachments ?? []).length && <p className="sub">Aucune pièce fournisseur jointe.</p>}
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
                              📎 Joindre une facture
                            </button>
                          )}
                          <h3>Bon de livraison fournisseur</h3>
                          {row.blFile ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                              <button
                                type="button"
                                className="att"
                                data-testid={`mgr-suivi-bc-bl-preview-${row.purchaseOrderId}`}
                                onClick={() => void openBlPreview(row)}
                                title="Bon de livraison fournisseur (image ou PDF)"
                              >
                                📎 BL {row.blFile.fileName}
                              </button>
                              <button
                                type="button"
                                className="att"
                                style={{ padding: '2px 7px' }}
                                data-testid={`mgr-suivi-bc-bl-replace-${row.purchaseOrderId}`}
                                onClick={() => openBlPicker(row)}
                                title="Remplacer le bon de livraison"
                              >
                                ✕
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              className="btn"
                              style={{ padding: '4px 10px', fontSize: 12, marginTop: 4 }}
                              data-testid={`mgr-suivi-bc-bl-attach-${row.purchaseOrderId}`}
                              onClick={() => openBlPicker(row)}
                              title="Joindre le bon de livraison fournisseur (PDF ou image)"
                            >
                              📎 Joindre un bon de livraison
                            </button>
                          )}
                          <h3>Réception — certificat interne</h3>
                          {row.blReceiptId ? (
                            <div style={{ marginTop: 4 }}>
                              <a
                                className="att"
                                href={certificateHtmlUrl(row.blReceiptId)}
                                target="_blank"
                                rel="noopener noreferrer"
                                data-testid={`mgr-suivi-bc-bl-link-${row.purchaseOrderId}`}
                                title="Bon de livraison interne (certificat de livraison)"
                              >
                                🧾 {row.blReceiptId}
                              </a>
                            </div>
                          ) : null}

            </>
          })()}
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
        </dialog>
      </div>
    </div>
  )
}

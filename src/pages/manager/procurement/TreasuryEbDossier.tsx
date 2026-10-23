import { useEffect, useRef, useState } from 'react'
import { ebRequestFicheHtmlUrl, fetchRequest, lineAttachmentUrl, fetchBcInvoiceFile, bcBlFileUrl, documentHtmlUrl } from './procurementApi'
import type { RequestDetailResponse } from './procurementTypes'
import { css, formatFcfa, ProcurementStatusBadge } from './procurementUi'

/** Dossier consultable sans accorder de droits de modification à la Trésorerie. */
export function TreasuryEbDossier({ requestId }: { requestId: string }) {
  const [detail, setDetail] = useState<RequestDetailResponse | null>(null)
  const [error, setError] = useState('')
  const [invoice, setInvoice] = useState<{ url: string; name: string } | null>(null)
  const previewUrl = useRef<string | null>(null)
  useEffect(() => {
    let cancelled = false
    setDetail(null); setError(''); setInvoice(null)
    void fetchRequest(requestId).then(data => { if (!cancelled) setDetail(data) })
      .catch(err => { if (!cancelled) setError(err instanceof Error ? err.message : 'Dossier indisponible') })
    return () => { cancelled = true; if (previewUrl.current) URL.revokeObjectURL(previewUrl.current); previewUrl.current = null }
  }, [requestId])
  const openInvoice = async (poId: string) => {
    try {
      const file = await fetchBcInvoiceFile(poId)
      if (previewUrl.current) URL.revokeObjectURL(previewUrl.current)
      previewUrl.current = URL.createObjectURL(file.blob)
      setInvoice({ url: previewUrl.current, name: file.fileName ?? 'Facture' })
    } catch (err) { setError(err instanceof Error ? err.message : 'Facture indisponible') }
  }
  if (error && !detail) return <p role="alert">{error}</p>
  if (!detail) return <p>Chargement du dossier EB…</p>
  return <section style={{ ...css.card, marginTop: 12 }} data-testid="mgr-treasury-eb-dossier">
    <h4>Dossier {detail.request.reference} — {detail.site?.name ?? detail.request.siteName}</h4>
    <ProcurementStatusBadge status={detail.request.status} paymentStatus={detail.request.paymentStatus} />
    <p><a href={ebRequestFicheHtmlUrl(requestId)} target="_blank" rel="noreferrer">Ouvrir la fiche EB complète et ses validations</a></p>
    <div style={{ overflowX: 'auto' }}><table style={css.lineTable}>
      <thead><tr><th>Désignation</th><th>Quantité</th><th>Fournisseur / bénéficiaire</th><th>Montant</th><th>Pièce jointe</th></tr></thead>
      <tbody>{detail.lines.map(line => <tr key={line.id}>
        <td>{line.label}</td><td>{line.quantity} {line.unit}</td><td>{line.supplierName || '—'}</td>
        <td>{formatFcfa(Number(line.amountFcfa ?? 0))}</td>
        <td>{line.attachmentBlobKey ? <a href={lineAttachmentUrl(requestId, line.id)} target="_blank" rel="noreferrer">{line.attachmentFileName || 'Consulter'}</a> : '—'}</td>
      </tr>)}</tbody>
    </table></div>
    {(detail.purchaseOrders ?? []).filter(po => po.docType === 'bc').map(po => <p key={po.id}>
      <a href={documentHtmlUrl(po.id)} target="_blank" rel="noreferrer">{po.reference}</a>
      {' · '}{po.saInvoicePaid ? 'Payé' : po.saInvoiceTransmitted ? 'À payer' : 'Non transmis'}
      {po.saInvoiceBlobKey && <> · <button type="button" style={css.btnOutline} onClick={() => void openInvoice(po.id)}>Facture {po.saInvoice || po.saInvoiceFileName}</button></>}
      {po.blFileName && <> · <a href={bcBlFileUrl(po.id)} target="_blank" rel="noreferrer">BL : {po.blFileName}</a></>}
    </p>)}
    {error && <p role="alert">{error}</p>}
    {invoice && <div><strong>{invoice.name}</strong> · <a href={invoice.url} download={invoice.name}>Télécharger</a>
      <iframe title={invoice.name} src={invoice.url} style={{ width: '100%', height: 500, border: 0 }} />
    </div>}
  </section>
}

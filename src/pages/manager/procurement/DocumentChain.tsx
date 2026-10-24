import { useCallback, useEffect, useRef, useState } from 'react'
import {
  bcBlFileUrl,
  bcInvoiceFileUrl,
  documentHtmlUrl,
  ebRequestFicheHtmlUrl,
  fetchDocumentChain,
  fetchRequestDisbursements,
  treasuryHtmlUrl,
  treasuryInvoiceUrl,
  uploadBcBlFile,
} from './procurementApi'
import type {
  DocumentChain as DocumentChainData,
  DocumentChainBl,
  DocumentChainMatch,
  RequestDisbursement,
} from './procurementTypes'
import { DISBURSEMENT_METHOD_LABELS } from './procurementTypes'
import { chainHighlightMatches, chainReferencesLabel, css, formatFcfa, STATUS_LABELS } from './procurementUi'

/**
 * Chaîne documentaire d'une EB : EB → BT → BC → BL → facture.
 *
 * Le BL est le certificat `RCT-XXXXXXXX` émis à la confirmation de livraison de
 * l'arrêt (chaîne reconstruite côté serveur par `GET /procurement/requests/:id/chain`).
 * Chaque maillon renvoie vers la pièce correspondante ; le SA peut joindre la
 * copie du bon de livraison fournisseur au BC (comme la facture).
 */

const OUTCOME_LABELS: Record<string, string> = {
  full: 'Livraison complète',
  partial: 'Livraison partielle',
  rejected: 'Livraison refusée',
}

function blStatusLabel(bl: DocumentChainBl): string {
  if (bl.outcome) return OUTCOME_LABELS[bl.outcome] ?? bl.outcome
  return bl.status === 'delivered' ? 'Livrée' : 'En attente de livraison'
}

function ChainBlock({
  kind,
  id,
  title,
  subtitle,
  amountFcfa,
  highlighted,
  children,
}: {
  kind: 'eb' | 'bt' | 'bc' | 'bl' | 'invoice'
  /** Id technique du maillon (ex. un BT par ligne) : rend le testid unique par pièce. */
  id?: string | null
  title: string
  subtitle?: string | null
  amountFcfa?: number | null
  /** Maillon retrouvé par le résolveur d'identifiants (recherche par réf.). */
  highlighted?: boolean
  children?: React.ReactNode
}) {
  const colors: Record<string, string> = {
    eb: '#0b4a2c',
    bt: '#1e3a5f',
    bc: '#7a1f12',
    bl: '#b45309',
    invoice: '#6b7280',
  }
  return (
    <div
      data-testid={`mgr-chain-node-${kind}${id ? `-${id}` : ''}`}
      data-chain-highlighted={highlighted ? 'true' : undefined}
      style={{
        borderLeft: `3px solid ${colors[kind] ?? '#e5e7eb'}`,
        background: highlighted ? '#fffbeb' : 'var(--bg-elevated, #fff)',
        outline: highlighted ? '2px solid #f59e0b' : undefined,
        borderRadius: 8,
        padding: '0.5rem 0.75rem',
        fontSize: 13,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <strong>{title}</strong>
        {amountFcfa != null && <span className="mono">{formatFcfa(amountFcfa)}</span>}
      </div>
      {subtitle ? <div style={css.meta}>{subtitle}</div> : null}
      {children ? <div style={{ marginTop: 4, display: 'flex', gap: 10, flexWrap: 'wrap' }}>{children}</div> : null}
    </div>
  )
}

function Link({ href, label, testId }: { href: string; label: string; testId: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" data-testid={testId}>
      {label}
    </a>
  )
}


export function DocumentChain({
  requestId,
  canAttachBl = false,
  highlight = null,
  onError,
  onNotice,
  treasuryOrders,
  refreshKey = '',
  onPrintTreasury,
  onPrintBc,
}: {
  requestId: string
  /** SA (rôle purchasing) : affiche « Joindre le BL fournisseur » sur chaque BC. */
  canAttachBl?: boolean
  /** Pièce retrouvée par le résolveur d'identifiants : son maillon est surligné. */
  highlight?: DocumentChainMatch | null
  onError?: (message: string) => void
  onNotice?: (message: string) => void
  treasuryOrders?: Array<{ id: string; reference: string; amountFcfa?: string | number | null; purchaseOrderId?: string | null }>
  refreshKey?: string
  onPrintTreasury?: (id: string) => void
  onPrintBc?: (id: string) => void
}) {
  const [chain, setChain] = useState<DocumentChainData | null>(null)
  const [disbursements, setDisbursements] = useState<RequestDisbursement[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const blInputRef = useRef<HTMLInputElement | null>(null)
  const blTargetRef = useRef<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [nextChain, nextDisbursements] = await Promise.all([
        fetchDocumentChain(requestId),
        // Les déboursés (F02 lot B) complètent la chaîne : la facture du
        // paiement reste consultable depuis l'EB. Un rôle sans accès ne doit
        // pas casser l'affichage de la chaîne.
        fetchRequestDisbursements(requestId).catch(() => [] as RequestDisbursement[]),
      ])
      setChain(nextChain)
      setDisbursements(nextDisbursements)
      setError(null)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Chaîne documentaire indisponible'
      setError(message)
      onError?.(message)
    } finally {
      setLoading(false)
    }
  }, [requestId, onError])

  useEffect(() => {
    void load()
  }, [load, refreshKey])

  const pickBlFile = (purchaseOrderId: string) => {
    blTargetRef.current = purchaseOrderId
    blInputRef.current?.click()
  }

  const handleBlFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const poId = blTargetRef.current
    const file = e.target.files?.[0]
    e.target.value = ''
    blTargetRef.current = null
    if (!poId || !file) return
    try {
      await uploadBcBlFile(poId, file)
      setNotice(`Bon de livraison joint · ${file.name}`)
      onNotice?.(`Bon de livraison joint · ${file.name}`)
      await load()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Jointure du bon de livraison impossible'
      setError(message)
      onError?.(message)
    }
  }

  if (loading) {
    return (
      <p style={css.meta} data-testid="mgr-chain-loading">
        Chaîne documentaire…
      </p>
    )
  }
  if (!chain) return null
  const bts = treasuryOrders ? treasuryOrders.map(bt => ({ ...bt, amountFcfa: Number(bt.amountFcfa), bcReference: chain.bcs.find(bc => bc.id === bt.purchaseOrderId)?.reference ?? null })) : chain.bts

  return (
    <div style={{ marginTop: '1rem' }} data-testid="mgr-document-chain">
      <input
        ref={blInputRef}
        type="file"
        accept="application/pdf,image/*"
        style={{ display: 'none' }}
        onChange={(e) => void handleBlFileChange(e)}
        data-testid="mgr-chain-bl-input"
      />
      <h4 style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Chaîne documentaire</h4>
      {error ? (
        <p style={{ ...css.meta, color: '#b91c1c' }} data-testid="mgr-chain-error">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p style={{ ...css.meta, color: '#0f766e' }} data-testid="mgr-chain-notice">
          {notice}
        </p>
      ) : null}
      <p style={css.meta} data-testid="mgr-chain-refs">
        {chainReferencesLabel({ ...chain.references, bt: bts.map(bt => bt.reference).join(', ') })}
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <ChainBlock
          kind="eb"
          title={`EB ${chain.eb.versionLabel}`}
          subtitle={`${chain.eb.siteName} · ${STATUS_LABELS[chain.eb.status as keyof typeof STATUS_LABELS] ?? chain.eb.status}`}
          amountFcfa={chain.eb.totalAmountFcfa}
          highlighted={chainHighlightMatches(highlight, 'eb', chain.requestId)}
        >
          <Link
            href={ebRequestFicheHtmlUrl(chain.requestId)}
            label="Voir la fiche EB"
            testId="mgr-chain-eb-link"
          />
        </ChainBlock>

        {bts.length === 0 ? (
          <ChainBlock kind="bt" title="Aucun bon de trésorerie" subtitle="Mode crédit : pas d’avance à financer." />
        ) : (
          bts.map((bt) => (
            <ChainBlock
              key={bt.id}
              kind="bt"
              id={bt.id}
              title={`BT ${bt.reference}`}
              subtitle={bt.bcReference ? `Finance le BC ${bt.bcReference}` : 'BC non encore émis'}
              amountFcfa={bt.amountFcfa}
              highlighted={chainHighlightMatches(highlight, 'bt', bt.id)}
            >
              <Link href={treasuryHtmlUrl(bt.id)} label="Voir la fiche trésorerie" testId={`mgr-chain-bt-link-${bt.id}`} />
              {onPrintTreasury && <button type="button" style={{ ...css.btnGhost, padding: 0, fontWeight: 600 }} onClick={() => onPrintTreasury(bt.id)} data-testid={`mgr-chain-bt-print-${bt.id}`}>Imprimer</button>}
            </ChainBlock>
          ))
        )}

        {chain.bcs.length === 0 ? (
          <ChainBlock kind="bc" title="Aucun bon de commande" subtitle="BC non encore généré." />
        ) : (
          chain.bcs.map((bc) => (
            <ChainBlock
              key={bc.id}
              kind="bc"
              title={`BC ${bc.reference}`}
              subtitle={`${bc.supplierName}${bc.tourDate ? ` · tournée du ${bc.tourDate}` : ''}`}
              amountFcfa={bc.amountFcfa}
              highlighted={chainHighlightMatches(highlight, 'bc', bc.id)}
            >
              <Link href={documentHtmlUrl(bc.id)} label="Voir le document" testId={`mgr-chain-bc-link-${bc.id}`} />
              {onPrintBc && <button type="button" style={{ ...css.btnGhost, padding: 0, fontWeight: 600 }} onClick={() => onPrintBc(bc.id)} data-testid={`mgr-chain-bc-print-${bc.id}`}>Imprimer</button>}
              {bc.blFile ? (
                <Link
                  href={bcBlFileUrl(bc.id)}
                  label={`BL fournisseur · ${bc.blFile.fileName}`}
                  testId={`mgr-chain-bl-file-${bc.id}`}
                />
              ) : canAttachBl ? (
                <button
                  type="button"
                  style={{ ...css.btnGhost, padding: 0, fontWeight: 600 }}
                  data-testid={`mgr-chain-bl-attach-${bc.id}`}
                  onClick={() => pickBlFile(bc.id)}
                >
                  Joindre le BL fournisseur
                </button>
              ) : (
                <span style={css.meta}>BL fournisseur non joint</span>
              )}
            </ChainBlock>
          ))
        )}

        {chain.bls.length === 0 ? (
          <ChainBlock kind="bl" title="Aucun BL (livraison non confirmée)" />
        ) : (
          chain.bls.map((bl) => (
            <ChainBlock
              key={bl.deliveryId}
              kind="bl"
              title={`BL ${bl.receiptId || 'en attente'}`}
              subtitle={`${bl.stopName}${bl.tourDate ? ` · ${bl.tourDate}` : ''} · ${blStatusLabel(bl)}`}
              highlighted={chainHighlightMatches(highlight, 'bl', bl.deliveryId)}
            >
              {bl.certificateUrl ? (
                <Link href={bl.certificateUrl} label="Voir le BL" testId={`mgr-chain-bl-link-${bl.deliveryId}`} />
              ) : (
                <span style={css.meta}>Certificat émis à la confirmation de livraison</span>
              )}
            </ChainBlock>
          ))
        )}
        <section aria-label="Factures" data-testid="mgr-chain-invoices">
          <h5 style={{ fontSize: 13, fontWeight: 700, margin: '10px 0 6px' }}>Factures</h5>
          {chain.bcs.filter(bc => bc.invoiceFile || bc.invoiceReference).length === 0 ? (
            <ChainBlock kind="invoice" title="Aucune facture fournisseur" subtitle="Les factures apparaîtront ici après leur enregistrement dans le suivi des BC." />
          ) : chain.bcs.filter(bc => bc.invoiceFile || bc.invoiceReference).map(bc => (
            <ChainBlock key={bc.id} kind="invoice" id={bc.id}
              title={bc.invoiceReference ? `Facture ${bc.invoiceReference}` : 'Facture fournisseur'}
              subtitle={`${bc.supplierName} · BC ${bc.reference} · ${bc.invoicePaid ? 'Payé' : bc.invoiceTransmitted ? 'À payer' : 'Non transmis'}`}>
              {bc.invoiceFile ? (
                <Link
                  href={bcInvoiceFileUrl(bc.id)}
                  label={`Facture · ${bc.invoiceFile.fileName}`}
                  testId={`mgr-chain-invoice-file-${bc.id}`}
                />
              ) : (
                <span style={css.meta}>Facture non jointe</span>
              )}
            </ChainBlock>
          ))}
        {disbursements.length > 0 && (
          <ChainBlock
            kind="invoice"
            title={`Déboursé${disbursements.length > 1 ? 's' : ''} — ${disbursements.length}`}
            subtitle="Circuit hors SA · facture exigée au déboursé (I103)"
            amountFcfa={disbursements.reduce((sum, d) => sum + d.amountFcfa, 0)}
          >
            {disbursements.map((d) => (
              <span
                key={d.treasuryId}
                style={{ display: 'inline-flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}
                data-testid={`mgr-chain-disbursement-${d.treasuryId}`}
              >
                <span style={css.meta}>
                  {d.treasuryReference} · {DISBURSEMENT_METHOD_LABELS[d.method] ?? d.method}
                  {d.transactionReference ? ` · ${d.transactionReference}` : ''}
                </span>
                {d.hasInvoice && (
                  <Link
                    href={treasuryInvoiceUrl(d.treasuryId)}
                    label={`📎 ${d.invoiceFileName ?? 'facture'}`}
                    testId={`mgr-chain-invoice-${d.treasuryId}`}
                  />
                )}
              </span>
            ))}
          </ChainBlock>
        )}

        </section>
      </div>
    </div>
  )
}

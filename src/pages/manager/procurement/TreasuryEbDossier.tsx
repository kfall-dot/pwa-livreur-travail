import { useEffect, useState } from 'react'
import { fetchRequest } from './procurementApi'
import { RequestDetailPanel } from './AchatsTab'
import type { RequestDetailResponse } from './procurementTypes'

const noop = () => {}

/** La même fiche EB et la même chaîne documentaire que dans Achats, en lecture seule. */
export function TreasuryEbContent({ detail, onBack = noop }: { detail: RequestDetailResponse; onBack?: () => void }) {
  return <RequestDetailPanel
    detail={detail} readOnly procurementRole="treasury" managerName="Trésorerie"
    backLabel="← Retour à la Trésorerie" onBack={onBack} highlight={null}
    approvalComment="" approvalPin="" selectedSupplierId="" poAmount="" actionLoading={false}
    reviseModalOpen={false} reviseQuantities={{}} reviseComment="" revisePin=""
    onCommentChange={noop} onPinChange={noop} onSupplierChange={noop} onPoAmountChange={noop}
    onApprove={noop} onReject={noop} onCreatePo={noop} onCreateTreasury={noop} onScheduleDelivery={noop}
    onUnitPriceChange={noop} onAmountChange={noop} onLineCommercial={noop} onSavePricing={noop}
    onSubmitFinance={noop} onUploadAttachment={noop} onUploadAttachmentBulk={noop} onRemoveAttachment={noop}
    onReviseQuantities={noop} onReviseQuantityChange={noop} onReviseCommentChange={noop}
    onRevisePinChange={noop} onReviseModalClose={noop} onReviseConfirm={noop}
  />
}

export function TreasuryEbDossier({ requestId, onBack }: { requestId: string; onBack?: () => void }) {
  const [detail, setDetail] = useState<RequestDetailResponse | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let cancelled = false
    setDetail(null); setError('')
    void fetchRequest(requestId).then(data => { if (!cancelled) setDetail(data) })
      .catch(err => { if (!cancelled) setError(err instanceof Error ? err.message : 'Dossier indisponible') })
    return () => { cancelled = true }
  }, [requestId])
  if (error) return <p role="alert">{error}</p>
  if (!detail) return <p>Chargement du dossier EB…</p>
  return <section data-testid="mgr-treasury-eb-dossier"><TreasuryEbContent detail={detail} onBack={onBack} /></section>
}

import { deliveryDisplayStatusMeta } from '../lib/deliveryStatusDisplay'
import type { DeliveryStatus } from '../types'

type Props = {
  status: DeliveryStatus
  declarationOutcome?: string | null
}

export function StatusBadge({ status, declarationOutcome }: Props) {
  const c = deliveryDisplayStatusMeta(status, declarationOutcome)
  return (
    <span className={`status-badge ${c.className}`} aria-label={c.label}>
      <span className="status-badge__dot" aria-hidden="true" />
      {c.label}
    </span>
  )
}

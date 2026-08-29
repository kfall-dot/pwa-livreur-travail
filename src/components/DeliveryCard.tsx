import { Link } from 'react-router-dom'
import {
  canOpenDelivery,
  deliveryAccessLabel,
  driverStopCtaLabel,
  isDeliveryTerminal,
  isFutureTourDate,
} from '../lib/deliveryAccess'
import { formatDriverDeliveryContent } from '../lib/deliveryUnits'
import type { DeliveryPoint } from '../types'

interface Props {
  delivery: DeliveryPoint
  tourDate: string
  isNext?: boolean
  stopNumber?: number
}

export function DeliveryCard({ delivery, tourDate, isNext = false, stopNumber }: Props) {
  const terminal = isDeliveryTerminal(delivery.status)
  const canOpen = canOpenDelivery(delivery.status, tourDate)
  const lockLabel = deliveryAccessLabel(delivery.status, tourDate, delivery.declarationOutcome)
  const isFuture = isFutureTourDate(tourDate)
  const cta = driverStopCtaLabel({
    status: delivery.status,
    tourDate,
    isNext,
    nextLabel: 'Continuer',
  })
  const number = stopNumber ?? delivery.sequence

  const stateClass = terminal
    ? 'delivery-card--done'
    : isNext && canOpen
      ? 'delivery-card--next'
      : 'delivery-card--upcoming'

  const contentLine = formatDriverDeliveryContent(
    delivery.units,
    delivery.unitType,
    delivery.products,
  )

  const content = (
    <article
      className={`delivery-card ${stateClass}${!canOpen && !terminal ? ' delivery-card--locked' : ''}${terminal ? ' delivery-card--terminal' : ''}`}
    >
      <div className="delivery-card__rail" aria-hidden="true">
        <span className="delivery-card__dot">{number}</span>
        {terminal && <span className="delivery-card__check" />}
      </div>

      <div className="delivery-card__body">
        <div className="delivery-card__main">
          <h3 className="delivery-card__name">{delivery.name}</h3>
          <p className="delivery-card__address">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12 2C8.1 2 5 5.1 5 9c0 5.2 7 13 7 13s7-7.8 7-13c0-3.9-3.1-7-7-7zm0 9.5A2.5 2.5 0 1 1 12 6a2.5 2.5 0 0 1 0 5.5z" />
            </svg>
            {delivery.address}
          </p>
          <p
            className="delivery-card__status-line"
            {...(terminal ? { 'aria-label': lockLabel ?? 'Livrée' } : {})}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <circle cx="12" cy="12" r="9" />
              <polyline points="12 7 12 12 15 14" />
            </svg>
            {terminal
              ? (lockLabel ?? 'Livrée')
              : `Prévue entre ${delivery.timeWindow.start} – ${delivery.timeWindow.end}`}
          </p>
          <p className="visually-hidden">{contentLine}</p>
          {isFuture && <span className="badge badge-info">Future</span>}
          {lockLabel && !terminal && <p className="delivery-card__lock-hint">{lockLabel}</p>}
        </div>
        <span
          className={`delivery-card__cta delivery-card__cta--${terminal ? 'done' : isNext && canOpen ? 'next' : 'idle'}`}
        >
          {cta}
          {(terminal || (isNext && canOpen)) && <span aria-hidden="true"> ›</span>}
        </span>
      </div>
    </article>
  )

  if (!canOpen && !terminal) {
    return (
      <div
        className="delivery-card-wrap delivery-card-wrap--static"
        aria-disabled="true"
        aria-label={`${delivery.name} — ${lockLabel ?? 'non accessible'}`}
      >
        {content}
      </div>
    )
  }

  if (terminal) {
    return (
      <div
        className="delivery-card-wrap delivery-card-wrap--static"
        data-testid={`delivery-card-${delivery.id}`}
        aria-label={`${delivery.name} — ${lockLabel ?? 'Livrée'}`}
      >
        {content}
      </div>
    )
  }

  return (
    <Link
      to={`/delivery/${delivery.id}`}
      className="delivery-card-wrap"
      data-testid={`delivery-card-${delivery.id}`}
      aria-label={`Livrer ${delivery.name}`}
    >
      {content}
    </Link>
  )
}

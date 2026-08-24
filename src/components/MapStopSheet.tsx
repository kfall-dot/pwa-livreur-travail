import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { canOpenDelivery, driverStopCtaLabel, isDeliveryTerminal } from '../lib/deliveryAccess'
import type { DeliveryPoint } from '../types'

interface Props {
  stops: DeliveryPoint[]
  tourDate: string
  selectedId?: string | null
  onSelect: (stopId: string) => void
}

function stopStatusLabel(stop: DeliveryPoint, tourDate: string, isNext: boolean): string {
  return driverStopCtaLabel({
    status: stop.status,
    tourDate,
    isNext,
    nextLabel: 'Suivant',
  })
}

export function MapStopSheet({ stops, tourDate, selectedId, onSelect }: Props) {
  const listRef = useRef<HTMLUListElement>(null)
  const nextId = stops.find((s) => canOpenDelivery(s.status, tourDate))?.id

  useEffect(() => {
    if (!selectedId || !listRef.current) return
    const el = listRef.current.querySelector(`[data-stop-id="${selectedId}"]`)
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [selectedId])

  if (stops.length === 0) return null

  return (
    <div className="map-bottom-sheet" aria-label="Arrêts du jour">
      <div className="map-bottom-sheet__handle" aria-hidden="true" />
      <p className="map-bottom-sheet__title">
        Arrêts du jour ({stops.length})
      </p>
      <ul ref={listRef} className="map-bottom-sheet__list">
        {stops.map((stop, index) => {
          const isNext = stop.id === nextId
          const selected = stop.id === selectedId
          const accessible = canOpenDelivery(stop.status, tourDate)
          const status = stopStatusLabel(stop, tourDate, isNext)
          const itemClass = [
            'map-stop-item',
            isNext ? 'map-stop-item--next' : '',
            selected ? 'map-stop-item--selected' : '',
            isDeliveryTerminal(stop.status) ? 'map-stop-item--done' : '',
          ]
            .filter(Boolean)
            .join(' ')

          const inner = (
            <>
              <span className="map-stop-item__num">{index + 1}</span>
              <span className="map-stop-item__body">
                <span className="map-stop-item__name">{stop.name}</span>
                <span className="map-stop-item__address">{stop.address}</span>
              </span>
              <span className="map-stop-item__status">{status}</span>
            </>
          )

          return (
            <li key={stop.id}>
              {accessible ? (
                <Link
                  to={`/delivery/${stop.id}`}
                  className={itemClass}
                  data-stop-id={stop.id}
                  onClick={() => onSelect(stop.id)}
                >
                  {inner}
                </Link>
              ) : (
                <button
                  type="button"
                  className={itemClass}
                  data-stop-id={stop.id}
                  onClick={() => onSelect(stop.id)}
                  disabled={isDeliveryTerminal(stop.status)}
                >
                  {inner}
                </button>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

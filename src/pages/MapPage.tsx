import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MapStopSheet } from '../components/MapStopSheet'
import { MapView } from '../components/MapView'
import { useTour } from '../contexts/TourContext'
import { useGps } from '../hooks/useGps'
import { canOpenDelivery } from '../lib/deliveryAccess'

export function MapPage() {
  const { tour, loading } = useTour()
  const { reading } = useGps()
  const navigate = useNavigate()
  const [selectedId, setSelectedId] = useState<string | null>(null)

  if (loading && !tour) {
    return (
      <div className="page page-center">
        <div className="loading-block" role="status">
          <span className="loading-block__spinner" aria-hidden="true" />
          <span>Chargement de la carte…</span>
        </div>
      </div>
    )
  }

  if (!tour || tour.stops.length === 0) {
    return (
      <div className="page page-center">
        <div className="empty-state" role="status">
          <p className="empty-state__title">Aucune livraison sur la carte</p>
          <p>Pas de tournée prévue pour cette date, ou aucun arrêt à afficher.</p>
        </div>
      </div>
    )
  }

  const defaultSelected =
    selectedId ??
    tour.stops.find((s) => canOpenDelivery(s.status, tour.date))?.id ??
    tour.stops[0]?.id ??
    null

  return (
    <div className="page map-page map-page--sheet">
      <MapView
        tour={tour}
        currentPosition={reading ? { lat: reading.lat, lng: reading.lng } : null}
        highlightId={defaultSelected}
        onStopSelect={(stop) => setSelectedId(stop.id)}
        onDeliver={(d) => navigate(`/delivery/${d.id}`)}
      />
      <MapStopSheet
        stops={tour.stops}
        tourDate={tour.date}
        selectedId={defaultSelected}
        onSelect={setSelectedId}
      />
    </div>
  )
}

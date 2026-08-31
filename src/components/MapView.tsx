import { useEffect, useMemo } from 'react'
import {
  AttributionControl,
  MapContainer,
  Marker,
  Polyline,
  Popup,
  TileLayer,
  useMap,
} from 'react-leaflet'
import L from 'leaflet'
import { formatQuantityWithUnit } from '../lib/deliveryUnits'
import { canOpenDelivery } from '../lib/deliveryAccess'
import { buildTourColorMap } from '../lib/tourColors'
import type { Coordinates, DeliveryPoint, Tour } from '../types'
import { DEFAULT_MAP_CENTER, isValidCoord } from '../lib/route'
import 'leaflet/dist/leaflet.css'

const iconCurrent = L.divIcon({
  className: 'marker-current',
  html: '<span class="pulse-dot" aria-hidden="true"></span>',
  iconSize: [24, 24],
  iconAnchor: [12, 12],
})

const iconDepot = L.divIcon({
  className: 'marker-depot',
  html: '<span class="marker-depot-pin" aria-hidden="true"></span>',
  iconSize: [22, 22],
  iconAnchor: [11, 18],
})

function stopMarkerIcon(color: string, delivered: boolean, stopNumber: number): L.DivIcon {
  const n = Number.isFinite(stopNumber) && stopNumber > 0 ? String(Math.trunc(stopNumber)) : '?'
  const cls = delivered
    ? 'tour-marker-dot tour-marker-dot--numbered tour-marker-dot--delivered'
    : 'tour-marker-dot tour-marker-dot--numbered'
  return L.divIcon({
    className: 'marker-tour-stop',
    html: `<span class="${cls}" style="--tour-color:${color}" aria-hidden="true">${n}</span>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  })
}

function MapResizeFix() {
  const map = useMap()
  useEffect(() => {
    const t = setTimeout(() => map.invalidateSize(), 100)
    return () => clearTimeout(t)
  }, [map])
  return null
}

function RecenterButton({ position }: { position: Coordinates | null }) {
  const map = useMap()
  return (
    <button
      type="button"
      className="map-recenter btn btn-fab"
      onClick={() => position && map.setView([position.lat, position.lng], 15)}
      aria-label="Recentrer sur ma position"
    >
      ⊕
    </button>
  )
}

function FitBounds({
  routeSegments,
  stops,
  position,
}: {
  routeSegments: Coordinates[][]
  stops: DeliveryPoint[]
  position: Coordinates | null
}) {
  const map = useMap()
  useEffect(() => {
    const points: [number, number][] = []
    for (const segment of routeSegments) {
      for (const p of segment) {
        if (isValidCoord(p)) points.push([p.lat, p.lng])
      }
    }
    for (const s of stops) {
      if (isValidCoord(s.coordinates)) points.push([s.coordinates.lat, s.coordinates.lng])
    }
    const hasDeliveryPoints = stops.some((s) => isValidCoord(s.coordinates))
    if (hasDeliveryPoints && position && isValidCoord(position)) {
      points.push([position.lat, position.lng])
    }
    if (points.length) {
      map.fitBounds(points, { padding: [40, 40] })
    } else {
      map.setView([DEFAULT_MAP_CENTER.lat, DEFAULT_MAP_CENTER.lng], 11)
    }
  }, [map, routeSegments, stops, position])
  return null
}

type TourRouteGroup = {
  tourId: string
  label: string
  color: string
  positions: [number, number][]
}

interface Props {
  tour: Tour
  currentPosition: Coordinates | null
  onDeliver?: (delivery: DeliveryPoint) => void
  highlightId?: string
  onStopSelect?: (delivery: DeliveryPoint) => void
}

export function MapView({ tour, currentPosition, onDeliver, highlightId, onStopSelect }: Props) {
  const stopsWithCoords = useMemo(
    () => tour.stops.filter((s) => isValidCoord(s.coordinates)),
    [tour.stops]
  )

  /** Numéros jour (1…N), alignés sur la liste Tournée. */
  const stopNumbers = useMemo(
    () => new Map(tour.stops.map((s, i) => [s.id, i + 1] as const)),
    [tour.stops],
  )

  const colorByTourId = useMemo(
    () => buildTourColorMap(tour.stops.map((s) => s.tourId)),
    [tour.stops]
  )

  const routeGroups = useMemo((): TourRouteGroup[] => {
    const groups: TourRouteGroup[] = []
    const byId = new Map<string, TourRouteGroup>()

    for (const stop of stopsWithCoords) {
      const tourId = stop.tourId?.trim() || 'day'
      let group = byId.get(tourId)
      if (!group) {
        group = {
          tourId,
          label: stop.tourDepotName?.trim() || 'Tournée',
          color: colorByTourId.get(tourId) ?? '#0b4a2c',
          positions: [],
        }
        byId.set(tourId, group)
        groups.push(group)
      }
      group.positions.push([stop.coordinates.lat, stop.coordinates.lng])
    }

    // Repli : une seule polyline globale si pas de tourId
    if (groups.length === 0 && tour.routePolyline.length >= 2) {
      return [
        {
          tourId: 'day',
          label: tour.depot.name || 'Tournée',
          color: '#0b4a2c',
          positions: tour.routePolyline
            .filter(isValidCoord)
            .map((p) => [p.lat, p.lng] as [number, number]),
        },
      ]
    }
    return groups
  }, [stopsWithCoords, colorByTourId, tour.routePolyline, tour.depot.name])

  const routeSegments = useMemo(
    () => routeGroups.map((g) => g.positions.map(([lat, lng]) => ({ lat, lng }))),
    [routeGroups]
  )

  const multiTour = routeGroups.length > 1

  const center = useMemo(() => {
    if (stopsWithCoords.length) return stopsWithCoords[0].coordinates
    if (isValidCoord(tour.depot)) return tour.depot
    if (currentPosition && isValidCoord(currentPosition)) return currentPosition
    return DEFAULT_MAP_CENTER
  }, [currentPosition, stopsWithCoords, tour.depot])

  const nextPending = useMemo(
    () => tour.stops.find((s) => canOpenDelivery(s.status, tour.date)),
    [tour.stops, tour.date]
  )
  const showDepot = isValidCoord(tour.depot)
  const showNextBtn = Boolean(nextPending && onDeliver && !onStopSelect)

  return (
    <div className="map-container">
      <MapContainer
        center={[center.lat, center.lng]}
        zoom={13}
        className="leaflet-map"
        scrollWheelZoom
        touchZoom
        attributionControl={false}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <AttributionControl position="bottomright" prefix={false} />
        <MapResizeFix />
        <FitBounds routeSegments={routeSegments} stops={tour.stops} position={currentPosition} />
        <RecenterButton position={currentPosition} />

        {showDepot && (
          <Marker position={[tour.depot.lat, tour.depot.lng]} icon={iconDepot}>
            <Popup>
              <strong>{tour.depot.name}</strong>
              <br />
              {tour.depot.address}
            </Popup>
          </Marker>
        )}

        {currentPosition && isValidCoord(currentPosition) && (
          <Marker position={[currentPosition.lat, currentPosition.lng]} icon={iconCurrent} />
        )}

        {stopsWithCoords.map((stop) => {
          const accessible = canOpenDelivery(stop.status, tour.date)
          const color = colorByTourId.get(stop.tourId?.trim() || 'day') ?? '#0b4a2c'
          const stopNumber = stopNumbers.get(stop.id) ?? stop.sequence
          return (
            <Marker
              key={stop.id}
              position={[stop.coordinates.lat, stop.coordinates.lng]}
              icon={stopMarkerIcon(color, stop.status === 'delivered', stopNumber)}
              opacity={highlightId && highlightId !== stop.id ? 0.5 : accessible ? 1 : 0.45}
              eventHandlers={{
                click: () => onStopSelect?.(stop),
              }}
            >
              <Popup>
                <strong>
                  #{stopNumber} {stop.name}
                </strong>
                {stop.tourDepotName && (
                  <p className="map-popup-tour" style={{ color }}>
                    {stop.tourDepotName}
                  </p>
                )}
                <p>{stop.address}</p>
                <p>{formatQuantityWithUnit(stop.units, stop.unitType)}</p>
                {onDeliver && (
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    disabled={!accessible}
                    onClick={() => accessible && onDeliver(stop)}
                  >
                    {accessible ? 'Livrer' : 'Non disponible'}
                  </button>
                )}
              </Popup>
            </Marker>
          )
        })}

        {routeGroups.map((group) =>
          group.positions.length >= 2 ? (
            <Polyline
              key={group.tourId}
              positions={group.positions}
              pathOptions={{ color: group.color, dashArray: '8 8', weight: 4 }}
            />
          ) : null
        )}
      </MapContainer>

      {multiTour && (
        <ul className="map-tour-legend" aria-label="Légende des tournées">
          {routeGroups.map((group, index) => (
            <li key={group.tourId}>
              <span className="map-tour-legend__swatch" style={{ background: group.color }} />
              Tournée {index + 1} — {group.label}
            </li>
          ))}
        </ul>
      )}

      {stopsWithCoords.length === 0 && (
        <p className="map-hint" role="status">
          Coordonnées en cours de chargement…
        </p>
      )}

      {showNextBtn && (
        <button
          type="button"
          className="btn btn-primary map-next-btn"
          onClick={() => onDeliver!(nextPending!)}
        >
          Livraison suivante
        </button>
      )}
    </div>
  )
}

import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { DriverHero } from '../components/DriverHero'
import { DemoBanner } from '../components/DemoBanner'
import { DeliveryCalendar } from '../components/DeliveryCalendar'
import { DeliveryCard } from '../components/DeliveryCard'
import { useAuth } from '../contexts/AuthContext'
import { useTour } from '../contexts/TourContext'
import { useGps } from '../hooks/useGps'
import { todayIso } from '../lib/dates'
import { canOpenDelivery, isDeliveryTerminal } from '../lib/deliveryAccess'
import { haversineDistanceM } from '../lib/geo'
import { isValidCoord } from '../lib/route'
import { buildTourColorMap } from '../lib/tourColors'
import { isDemoSession } from '../lib/demoSession'
import type { DeliveryPoint } from '../types'

type StopFilter = 'all' | 'todo' | 'done'

const FILTER_LABELS: { id: StopFilter; label: string }[] = [
  { id: 'all', label: 'Toutes' },
  { id: 'todo', label: 'À faire' },
  { id: 'done', label: 'Terminées' },
]

function formatDistanceKm(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`
  return `${(meters / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} km`
}

function filterStops(stops: DeliveryPoint[], filter: StopFilter): DeliveryPoint[] {
  if (filter === 'todo') return stops.filter((s) => !isDeliveryTerminal(s.status))
  if (filter === 'done') return stops.filter((s) => isDeliveryTerminal(s.status))
  return stops
}

type TourGroup = {
  tourId: string
  depotName: string
  color: string
  stops: DeliveryPoint[]
}

function groupStopsByTour(stops: DeliveryPoint[]): TourGroup[] {
  const colorByTourId = buildTourColorMap(stops.map((s) => s.tourId))
  const groups: TourGroup[] = []
  const byId = new Map<string, TourGroup>()
  for (const stop of stops) {
    const tourId = stop.tourId ?? 'day'
    let group = byId.get(tourId)
    if (!group) {
      group = {
        tourId,
        depotName: stop.tourDepotName?.trim() || 'Tournée',
        color: colorByTourId.get(tourId) ?? '#0b4a2c',
        stops: [],
      }
      byId.set(tourId, group)
      groups.push(group)
    }
    group.stops.push(stop)
  }
  return groups
}

function firstName(fullName: string | undefined): string {
  const part = fullName?.trim().split(/\s+/)[0]
  return part || 'Livreur'
}

export function DashboardPage() {
  const { driver } = useAuth()
  const {
    tour,
    loading,
    error,
    selectedDate,
    calendarMonth,
    scheduledDays,
    calendarLoading,
    refresh,
    selectDate,
    setCalendarMonth,
    loadSchedule,
  } = useTour()
  const { reading } = useGps()
  const [showCalendar, setShowCalendar] = useState(false)
  const [stopFilter, setStopFilter] = useState<StopFilter>('all')

  const isToday = selectedDate === todayIso()
  const helloName = firstName(driver?.name)
  const demoMode = isDemoSession()

  useEffect(() => {
    if (!demoMode || loading || !isToday || (tour?.stops.length ?? 0) > 0) return
    const timer = window.setTimeout(() => {
      void refresh()
    }, 2000)
    return () => window.clearTimeout(timer)
  }, [demoMode, loading, isToday, tour?.stops.length, refresh])

  const flatStops = useMemo(() => tour?.stops ?? [], [tour?.stops])
  const filteredStops = useMemo(
    () => filterStops(flatStops, stopFilter),
    [flatStops, stopFilter],
  )
  const tourGroups = filteredStops.length ? groupStopsByTour(filteredStops) : []
  const multiTour = (tour?.stops.length ? groupStopsByTour(tour.stops) : []).length > 1
  const nextStop = flatStops.find((s) => canOpenDelivery(s.status, tour?.date ?? selectedDate))
  const nextStopId = nextStop?.id
  const stopNumbers = useMemo(
    () => new Map(flatStops.map((s, i) => [s.id, i + 1] as const)),
    [flatStops],
  )
  const nextStopDistance =
    nextStop &&
    reading &&
    isValidCoord(nextStop.coordinates) &&
    isValidCoord(reading)
      ? formatDistanceKm(haversineDistanceM(reading, nextStop.coordinates))
      : null

  if (loading && !tour) {
    return (
      <div className="page page-center">
        <div className="loading-block" role="status">
          <span className="loading-block__spinner" aria-hidden="true" />
          <span>Chargement de la tournée…</span>
        </div>
      </div>
    )
  }

  const progress = tour?.stops.length
    ? Math.round((tour.deliveredCount / tour.stops.length) * 100)
    : 0

  return (
    <div className="page dashboard-page dashboard-page--traceo">
      <DemoBanner role="driver" />
      <DriverHero name={helloName} />

      <div className="driver-panel">
        <header className="page-header driver-panel__intro">
          <h1>
            <button
              type="button"
              className="driver-panel__title-btn"
              aria-expanded={showCalendar}
              onClick={() => setShowCalendar((v) => !v)}
            >
              {isToday ? "Ma tournée d'aujourd'hui" : 'Mes livraisons'}
            </button>
          </h1>
          {tour && tour.stops.length > 0 && (
            <p className="visually-hidden" data-testid="driver-stop-count">
              {tour.stops.length} livraison{tour.stops.length > 1 ? 's' : ''}
              {multiTour ? ` · ${tourGroups.length} tournées` : ''}
            </p>
          )}
          {multiTour && (
            <p className="hint" data-testid="driver-tour-count">
              {tourGroups.length} tournées planifiées
            </p>
          )}
          {error && <p className="banner-warn">{error}</p>}
        </header>

        {showCalendar && (
          <div className="driver-panel__calendar">
            <DeliveryCalendar
              month={calendarMonth}
              selectedDate={selectedDate}
              scheduledDays={scheduledDays}
              loading={calendarLoading}
              onMonthChange={setCalendarMonth}
              onSelectDate={(iso) => {
                selectDate(iso)
                setShowCalendar(false)
              }}
            />
            {!isToday && (
              <button
                type="button"
                className="btn btn-ghost btn-today btn-block"
                onClick={() => selectDate(todayIso())}
              >
                Revenir à aujourd&apos;hui
              </button>
            )}
            <button
              type="button"
              className="btn btn-ghost btn-block"
              disabled={loading}
              onClick={() => {
                void refresh()
                void loadSchedule(calendarMonth)
              }}
            >
              {loading ? 'Chargement…' : 'Actualiser'}
            </button>
          </div>
        )}

        {tour && tour.stops.length > 0 ? (
          <>
            <section className="tour-progress-card" aria-label="Récapitulatif tournée">
              <div className="tour-progress-card__row">
                <span className="tour-progress-card__icon" aria-hidden="true">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M16.5 9.4 7.5 4.2" />
                    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                    <path d="M3.3 7 12 12l8.7-5" />
                    <path d="M12 22V12" />
                  </svg>
                </span>
                <div className="tour-progress-card__text">
                  <p className="tour-progress-card__count">
                    {tour.deliveredCount} / {tour.stops.length} livré(s)
                  </p>
                  <p className="tour-progress-card__hint">
                    {tour.deliveredCount >= tour.stops.length
                      ? 'Tournée terminée'
                      : 'Continuez votre tournée'}
                  </p>
                </div>
                <div className="tour-progress-card__meter">
                  <div
                    className="progress-bar"
                    role="progressbar"
                    aria-valuenow={progress}
                    aria-valuemin={0}
                    aria-valuemax={100}
                  >
                    <div className="progress-bar__fill" style={{ width: `${progress}%` }} />
                  </div>
                  <span className="tour-progress-card__pct">{progress}%</span>
                </div>
              </div>
            </section>

            {nextStop && stopFilter !== 'done' && (
              <section className="next-delivery-banner" aria-label="Prochaine livraison">
                <div className="next-delivery-banner__text">
                  <p className="next-delivery-banner__eyebrow">Prochaine livraison</p>
                  <p className="next-delivery-banner__name">{nextStop.name}</p>
                  <p className="next-delivery-banner__meta">
                    {nextStopDistance && <span>{nextStopDistance} · </span>}
                    créneau {nextStop.timeWindow.start}–{nextStop.timeWindow.end}
                  </p>
                </div>
                <Link
                  to="/map"
                  className="btn btn-primary next-delivery-banner__cta"
                  data-testid="next-delivery-go"
                >
                  Y aller
                </Link>
              </section>
            )}

            <div className="filter-chips" role="tablist" aria-label="Filtrer les livraisons">
              {FILTER_LABELS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  role="tab"
                  aria-selected={stopFilter === f.id}
                  className={`filter-chip${stopFilter === f.id ? ' filter-chip--active' : ''}`}
                  onClick={() => setStopFilter(f.id)}
                >
                  {f.label}
                </button>
              ))}
            </div>

            <section aria-label="Liste des livraisons">
              {filteredStops.length === 0 && (
                <p className="empty-state empty-state--compact" role="status">
                  Aucune livraison pour ce filtre.
                </p>
              )}
              {tourGroups.map((group, index) => (
                <div key={group.tourId} data-testid={`driver-tour-group-${group.tourId}`}>
                  {multiTour && (
                    <h2 className="section-title">
                      <span
                        className="tour-color-swatch"
                        style={{ background: group.color }}
                        aria-hidden
                      />
                      {`Tournée ${index + 1} — ${group.depotName}`}
                    </h2>
                  )}
                  <ul className="delivery-list delivery-list--timeline">
                    {group.stops.map((d) => (
                      <li key={d.id}>
                        <DeliveryCard
                          delivery={d}
                          tourDate={tour.date}
                          isNext={d.id === nextStopId}
                          stopNumber={stopNumbers.get(d.id) ?? 0}
                        />
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </section>
          </>
        ) : (
          !loading && (
            <p className="empty-state" role="status">
              {demoMode && isToday
                ? 'Aucune livraison démo visible — rouvrez /demo/livreur ou attendez le rechargement automatique.'
                : isToday
                  ? 'Aucune livraison planifiée pour aujourd\u2019hui.'
                  : 'Aucune livraison planifiée pour cette date.'}
            </p>
          )
        )}
      </div>
    </div>
  )
}

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { api } from '../lib/api'
import { cacheTour, getTodayCachedTour } from '../lib/db'
import { monthBounds, todayIso } from '../lib/dates'
import { enrichTourForMap } from '../lib/route'
import type { DeliveryPoint, ScheduleDay, Tour } from '../types'

interface TourState {
  tour: Tour | null
  loading: boolean
  error: string | null
  selectedDate: string
  calendarMonth: Date
  scheduledDays: ScheduleDay[]
  calendarLoading: boolean
  refresh: () => Promise<void>
  selectDate: (iso: string) => void
  setCalendarMonth: (month: Date) => void
  loadSchedule: (month: Date) => Promise<void>
  updateStop: (id: string, patch: Partial<DeliveryPoint>) => void
}

const TourContext = createContext<TourState | null>(null)

export function TourProvider({ children }: { children: ReactNode }) {
  const [tour, setTour] = useState<Tour | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedDate, setSelectedDate] = useState(todayIso)
  const [calendarMonth, setCalendarMonth] = useState(
    () => new Date(new Date().getFullYear(), new Date().getMonth(), 1)
  )
  const [scheduledDays, setScheduledDays] = useState<ScheduleDay[]>([])
  const [calendarLoading, setCalendarLoading] = useState(false)

  const loadSchedule = useCallback(async (month: Date) => {
    setCalendarLoading(true)
    try {
      const { from, to } = monthBounds(month)
      const data = await api.fetchSchedule(from, to)
      setScheduledDays(data.days)
    } catch (e) {
      console.warn('Calendrier indisponible', e)
    } finally {
      setCalendarLoading(false)
    }
  }, [])

  const refresh = useCallback(async (date?: string) => {
    const target = date ?? selectedDate
    setLoading(true)
    setError(null)
    try {
      // Afficher d’abord la réponse API : OSRM/Nominatim ne doivent pas
      // bloquer la liste des livraisons (sinon l’UI reste sur un cache obsolète).
      const data = await api.getTourByDate(target)
      setTour(data)
      await cacheTour(data)
      setLoading(false)
      try {
        const enriched = await enrichTourForMap(data)
        setTour(enriched)
        await cacheTour(enriched)
      } catch (enrichErr) {
        console.warn('Enrichissement carte indisponible', enrichErr)
      }
    } catch (e) {
      const cached = await getTodayCachedTour()
      if (cached && cached.date === target) {
        setTour(cached)
        setError('Mode hors ligne — données en cache')
      } else {
        setError(e instanceof Error ? e.message : 'Erreur chargement tournée')
      }
      setLoading(false)
    }
  }, [selectedDate])

  const selectDate = useCallback((iso: string) => {
    setSelectedDate(iso)
    const [y, m] = iso.split('-').map(Number)
    setCalendarMonth(new Date(y, m - 1, 1))
  }, [])

  useEffect(() => {
    void refresh(selectedDate)
  }, [selectedDate, refresh])

  useEffect(() => {
    void loadSchedule(calendarMonth)
  }, [calendarMonth, loadSchedule])

  const updateStop = useCallback((id: string, patch: Partial<DeliveryPoint>) => {
    setTour((prev) => {
      if (!prev) return prev
      const stops = prev.stops.map((s) => (s.id === id ? { ...s, ...patch } : s))
      const deliveredCount = stops.filter((s) => s.status === 'delivered').length
      const next = { ...prev, stops, deliveredCount }
      void cacheTour(next)
      return next
    })
  }, [])

  const value = useMemo(
    () => ({
      tour,
      loading,
      error,
      selectedDate,
      calendarMonth,
      scheduledDays,
      calendarLoading,
      refresh: () => refresh(selectedDate),
      selectDate,
      setCalendarMonth,
      loadSchedule,
      updateStop,
    }),
    [
      tour,
      loading,
      error,
      selectedDate,
      calendarMonth,
      scheduledDays,
      calendarLoading,
      refresh,
      selectDate,
      loadSchedule,
      updateStop,
    ]
  )

  return <TourContext.Provider value={value}>{children}</TourContext.Provider>
}

export function useTour(): TourState {
  const ctx = useContext(TourContext)
  if (!ctx) throw new Error('useTour must be used within TourProvider')
  return ctx
}

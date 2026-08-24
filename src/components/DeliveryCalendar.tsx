import { useMemo } from 'react'
import type { ScheduleDay } from '../types'

type Props = {
  month: Date
  selectedDate: string
  scheduledDays: ScheduleDay[]
  loading?: boolean
  onMonthChange: (month: Date) => void
  onSelectDate: (isoDate: string) => void
}

const WEEKDAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']

function toIso(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function todayIso(): string {
  return toIso(new Date())
}

function formatMonthLabel(month: Date): string {
  return new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' }).format(month)
}

function formatSelectedLabel(iso: string): string {
  const d = new Date(`${iso}T12:00:00`)
  return new Intl.DateTimeFormat('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(d)
}

export function DeliveryCalendar({
  month,
  selectedDate,
  scheduledDays,
  loading,
  onMonthChange,
  onSelectDate,
}: Props) {
  const today = todayIso()
  const countsByDate = useMemo(() => {
    const map = new Map<string, number>()
    for (const day of scheduledDays) {
      const total = Number(day.count)
      const n = Number.isFinite(total) ? total : Number(day.activeCount) || 0
      map.set(day.date, n)
    }
    return map
  }, [scheduledDays])

  const cells = useMemo(() => {
    const year = month.getFullYear()
    const m = month.getMonth()
    const first = new Date(year, m, 1)
    const last = new Date(year, m + 1, 0)
    const startPad = (first.getDay() + 6) % 7
    const grid: Array<{ iso: string | null; day: number | null }> = []

    for (let i = 0; i < startPad; i++) grid.push({ iso: null, day: null })
    for (let d = 1; d <= last.getDate(); d++) {
      const date = new Date(year, m, d)
      grid.push({ iso: toIso(date), day: d })
    }
    return grid
  }, [month])

  const shiftMonth = (delta: number) => {
    const next = new Date(month.getFullYear(), month.getMonth() + delta, 1)
    onMonthChange(next)
  }

  return (
    <section className="delivery-calendar" aria-label="Calendrier des livraisons">
      <div className="calendar-toolbar">
        <button
          type="button"
          className="btn btn-ghost btn-icon calendar-nav"
          onClick={() => shiftMonth(-1)}
          aria-label="Mois précédent"
        >
          ‹
        </button>
        <h2 className="calendar-month-title">{formatMonthLabel(month)}</h2>
        <button
          type="button"
          className="btn btn-ghost btn-icon calendar-nav"
          onClick={() => shiftMonth(1)}
          aria-label="Mois suivant"
        >
          ›
        </button>
      </div>

      {loading && <p className="hint calendar-loading">Chargement du calendrier…</p>}

      <div className="calendar-weekdays">
        {WEEKDAYS.map((w) => (
          <span key={w} className="calendar-weekday">
            {w}
          </span>
        ))}
      </div>

      <div className="calendar-grid">
        {cells.map((cell, i) => {
          if (!cell.iso || cell.day == null) {
            return <span key={`empty-${i}`} className="calendar-cell calendar-cell-empty" />
          }
          const count = countsByDate.get(cell.iso) ?? 0
          const hasDelivery = count > 0
          const isSelected = cell.iso === selectedDate
          const isToday = cell.iso === today
          const isPast = cell.iso < today

          return (
            <button
              key={cell.iso}
              type="button"
              className={[
                'calendar-cell',
                hasDelivery ? 'has-delivery' : '',
                isSelected ? 'selected' : '',
                isToday ? 'is-today' : '',
                isPast && !hasDelivery ? 'is-past' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => onSelectDate(cell.iso!)}
              aria-label={
                hasDelivery
                  ? `${cell.day}, ${count} livraison(s)`
                  : `${cell.day}, aucune livraison`
              }
              aria-pressed={isSelected}
            >
              <span className="calendar-day-num">{cell.day}</span>
              {hasDelivery && (
                <span className="calendar-badge" title={`${count} livraison(s)`}>
                  {count > 9 ? '9+' : count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      <p className="hint calendar-selected-label">{formatSelectedLabel(selectedDate)}</p>
    </section>
  )
}

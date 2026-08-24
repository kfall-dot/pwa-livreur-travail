/** Date locale au format AAAA-MM-JJ (alignée sur le calendrier UI). */
export function todayIso(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Date proposée à la replanification : jour source si futur/aujourd'hui, sinon aujourd'hui. */
export function defaultReplanDate(sourceDate?: string | null): string {
  const today = todayIso()
  if (sourceDate && sourceDate >= today) return sourceDate
  return today
}

export function monthBounds(month: Date): { from: string; to: string } {
  const y = month.getFullYear()
  const m = month.getMonth()
  const pad = (n: number) => String(n).padStart(2, '0')
  const from = `${y}-${pad(m + 1)}-01`
  const last = new Date(y, m + 1, 0).getDate()
  const to = `${y}-${pad(m + 1)}-${pad(last)}`
  return { from, to }
}

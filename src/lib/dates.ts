import { appTodayString } from './appDate'

/** Date du jour au format AAAA-MM-JJ dans le fuseau métier (Africa/Abidjan),
 * alignée sur le seed et les rapports serveur — pas sur le fuseau du navigateur. */
export function todayIso(): string {
  return appTodayString()
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

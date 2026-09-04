/** Fuseau métier — aligné sur le client (src/lib/appDate.ts). */
export const APP_TIMEZONE = process.env.APP_TIMEZONE ?? 'Africa/Abidjan'

/** Date calendaire YYYY-MM-DD dans le fuseau métier (alignée seed / sync / filtres dashboard / client). */
export function localTodayIso(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())
  const get = (type: 'year' | 'month' | 'day') => parts.find((p) => p.type === type)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')}`
}

export function localYesterdayIso(): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - 1)
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d)
  const get = (type: 'year' | 'month' | 'day') => parts.find((p) => p.type === type)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')}`
}

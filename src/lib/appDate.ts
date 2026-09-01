/** Fuseau métier — partagé avec le serveur (voir server/db/dailyReportQueries.ts). */
export const APP_TIMEZONE = 'Africa/Abidjan'

/**
 * Date du jour au format AAAA-MM-JJ dans le fuseau métier (pas le fuseau du
 * navigateur) : les rapports « du jour » sont datés côté serveur selon ce
 * fuseau, le client doit comparer sur la même base.
 */
export function appTodayString(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const get = (type: 'year' | 'month' | 'day') => parts.find((p) => p.type === type)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')}`
}
/** Dates civiles du registre : comparaison inclusive, sans conversion de fuseau. */
export function inAccountingDateRange(date: string, start: string, end: string): boolean {
  if (!start && !end) return true
  const value = date.trim()
  const fr = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value)
  const iso = fr ? `${fr[3]}-${fr[2].padStart(2, '0')}-${fr[1].padStart(2, '0')}` : value.slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false
  return (!start || iso >= start) && (!end || iso <= end)
}

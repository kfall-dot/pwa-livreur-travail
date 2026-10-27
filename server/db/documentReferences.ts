import { getPool } from './index.js'

export type DocumentPrefix = 'EB' | 'BC' | 'BT'
type ReferenceExecutor = { query: (text: string, values: string[]) => Promise<{ rows: Array<{ last_value: string }> }> }

export function documentReferenceYear(now = new Date(), timeZone = process.env.APP_TIMEZONE ?? 'Africa/Abidjan'): number {
  return Number(new Intl.DateTimeFormat('en', { timeZone, year: 'numeric' }).format(now))
}

/** Réservation durable : un échec de création peut laisser un trou, jamais réutiliser un numéro réservé. */
export async function nextDocumentReference(
  companyId: string,
  prefix: DocumentPrefix,
  now = new Date(),
  executor: ReferenceExecutor = getPool(),
): Promise<string> {
  if (!companyId.trim() || !['EB', 'BC', 'BT'].includes(prefix)) throw new Error('Compagnie et type de document valides requis')
  const year = documentReferenceYear(now)
  const result = await executor.query(`
    INSERT INTO document_reference_counters (company_id, prefix, year, last_value)
    VALUES ($1, $2, $3, 1)
    ON CONFLICT (company_id, prefix, year) DO UPDATE
    SET last_value = document_reference_counters.last_value + 1
    RETURNING last_value::text`, [companyId, prefix, String(year)])
  const value = result.rows[0]?.last_value
  if (!value || !/^[1-9][0-9]*$/.test(value)) throw new Error('Réservation de référence impossible')
  return `${prefix}-${year}-${value.padStart(4, '0')}`
}

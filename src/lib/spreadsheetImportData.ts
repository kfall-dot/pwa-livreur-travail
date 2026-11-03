import * as XLSX from 'xlsx'

export const MAX_SPREADSHEET_BYTES = 10 * 1024 * 1024
export const MAX_SPREADSHEET_ROWS = 5000
export const MAX_SPREADSHEET_COLUMNS = 100
export type SpreadsheetMode = 'records' | 'rows'
export type SpreadsheetRows = Record<string, unknown>[] | unknown[][]

export function parseSpreadsheetImport(buffer: ArrayBuffer, mode: SpreadsheetMode): SpreadsheetRows {
  if (buffer.byteLength > MAX_SPREADSHEET_BYTES) throw new Error('Le fichier dépasse la limite de 10 Mo.')
  const workbook = XLSX.read(buffer, {
    type: 'array', sheets: 0, sheetRows: MAX_SPREADSHEET_ROWS + 1,
    cellHTML: false, cellFormula: false, bookVBA: false,
  })
  const sheet = workbook.Sheets[workbook.SheetNames[0] ?? '']
  if (!sheet?.['!ref']) return []
  const range = XLSX.utils.decode_range(sheet['!fullref'] ?? sheet['!ref'])
  if (range.e.r >= MAX_SPREADSHEET_ROWS || range.e.c >= MAX_SPREADSHEET_COLUMNS) {
    throw new Error('Le fichier dépasse la limite de 5 000 lignes ou 100 colonnes (en-tête compris).')
  }
  return mode === 'records'
    ? XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' })
    : XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '', blankrows: false })
}

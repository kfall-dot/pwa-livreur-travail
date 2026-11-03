import { parseSpreadsheetImport, type SpreadsheetMode } from './spreadsheetImportData'

self.onmessage = (event: MessageEvent<{ buffer: ArrayBuffer; mode: SpreadsheetMode }>) => {
  try {
    self.postMessage({ rows: parseSpreadsheetImport(event.data.buffer, event.data.mode) })
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : 'Lecture du fichier impossible.' })
  }
}

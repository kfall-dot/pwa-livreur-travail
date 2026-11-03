import type { SpreadsheetMode, SpreadsheetRows } from './spreadsheetImportData'

export function readSpreadsheetImport(file: File, mode: 'records'): Promise<Record<string, unknown>[]>
export function readSpreadsheetImport(file: File, mode: 'rows'): Promise<unknown[][]>
export async function readSpreadsheetImport(file: File, mode: SpreadsheetMode): Promise<SpreadsheetRows> {
  if (file.size > 10 * 1024 * 1024) throw new Error('Le fichier dépasse la limite de 10 Mo.')
  const buffer = await file.arrayBuffer()
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./spreadsheetImport.worker.ts', import.meta.url), { type: 'module' })
    const finish = () => { clearTimeout(timer); worker.terminate() }
    const timer = setTimeout(() => {
      finish()
      reject(new Error('La lecture du fichier a été interrompue après 15 secondes. Vérifiez le fichier importé.'))
    }, 15_000)
    worker.onmessage = (event: MessageEvent<{ rows?: SpreadsheetRows; error?: string }>) => {
      finish()
      if (event.data.error) reject(new Error(event.data.error))
      else resolve(event.data.rows ?? [])
    }
    worker.onerror = () => {
      finish()
      reject(new Error('Lecture du fichier impossible. Vérifiez son format.'))
    }
    worker.postMessage({ buffer, mode }, [buffer])
  })
}

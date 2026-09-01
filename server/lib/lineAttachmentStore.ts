import fs from 'node:fs'
import path from 'node:path'
import { getProcurementMediaStore, isBlobsEnabled } from './blobs.js'

/**
 * Répertoire local des pièces jointes EB.
 * - Railway/Docker : PHOTOS_DIR est défini (/data/delivery-photos, volume persistant)
 *   → on stocke dans le dossier frère /data/eb-attachments pour survivre aux redéploiements.
 * - Local (dev) : PHOTOS_DIR absent → comportement historique .netlify/eb-attachments.
 * - Surcharge possible via EB_ATTACHMENTS_DIR.
 */
function resolveLocalDir(): string {
  const custom = process.env.EB_ATTACHMENTS_DIR?.trim()
  if (custom) return custom
  const photosDir = process.env.PHOTOS_DIR?.trim()
  if (photosDir) return path.join(path.dirname(photosDir), 'eb-attachments')
  return path.join(process.cwd(), '.netlify', 'eb-attachments')
}

const LOCAL_DIR = resolveLocalDir()
const BLOBS_TIMEOUT_MS = 2_500

export function localAttachmentPath(key: string): string {
  return path.join(LOCAL_DIR, key.replace(/[/\\]/g, '__'))
}

function toArrayBuffer(buffer: Buffer): ArrayBuffer {
  const copy = new Uint8Array(buffer.byteLength)
  copy.set(buffer)
  return copy.buffer
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timeout after ${ms}ms`)), ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (err) => {
        clearTimeout(timer)
        reject(err)
      },
    )
  })
}

function writeLocalBackup(
  key: string,
  buffer: Buffer,
  metadata: { contentType: string; fileName: string },
): boolean {
  try {
    fs.mkdirSync(LOCAL_DIR, { recursive: true })
    const file = localAttachmentPath(key)
    fs.writeFileSync(file, buffer)
    fs.writeFileSync(`${file}.meta.json`, JSON.stringify(metadata))
    return fs.existsSync(file) && fs.statSync(file).size > 0
  } catch (err) {
    console.warn('[eb-attachments] local backup skipped', err)
    return false
  }
}

function readLocal(key: string): { data: Buffer } | null {
  const file = localAttachmentPath(key)
  if (!fs.existsSync(file)) return null
  const data = fs.readFileSync(file)
  return data.length ? { data } : null
}

async function readBlobs(key: string): Promise<{ data: Buffer } | null> {
  const store = getProcurementMediaStore()
  const direct = await withTimeout(
    store.get(key, { type: 'arrayBuffer' }),
    BLOBS_TIMEOUT_MS,
    'blobs.get',
  )
  if (direct && (direct as ArrayBuffer).byteLength > 0) {
    return { data: Buffer.from(direct) }
  }
  return null
}

export async function putLineAttachment(
  key: string,
  buffer: Buffer,
  metadata: { contentType: string; fileName: string },
): Promise<void> {
  const localOk = writeLocalBackup(key, buffer, metadata)
  let blobsOk = false
  if (isBlobsEnabled()) {
    try {
      const store = getProcurementMediaStore()
      await withTimeout(
        store.set(key, toArrayBuffer(buffer), { metadata }),
        BLOBS_TIMEOUT_MS,
        'blobs.set',
      )
      blobsOk = true
    } catch (err) {
      console.warn('[eb-attachments] blobs write failed, local copy kept', err)
    }
  }
  if (!localOk && !blobsOk) {
    throw new Error('Stockage des pièces jointes indisponible')
  }
}

export async function deleteLineAttachment(key: string): Promise<void> {
  try {
    if (isBlobsEnabled()) {
      const store = getProcurementMediaStore() as { delete?: (k: string) => Promise<unknown> }
      if (typeof store.delete === 'function') {
        await withTimeout(store.delete(key), BLOBS_TIMEOUT_MS, 'blobs.delete')
      }
    }
  } catch {
    // Fichier déjà absent : on continue pour vider la ligne en base.
  }
  try {
    const file = localAttachmentPath(key)
    if (fs.existsSync(file)) fs.unlinkSync(file)
    const meta = `${file}.meta.json`
    if (fs.existsSync(meta)) fs.unlinkSync(meta)
  } catch {
    // Fichier déjà absent : on continue pour vider la ligne en base.
  }
}

export async function getLineAttachment(key: string): Promise<{ data: Buffer } | null> {
  const local = readLocal(key)
  if (local?.data?.length) return local
  if (!isBlobsEnabled()) return null
  try {
    return await readBlobs(key)
  } catch (err) {
    console.warn('[eb-attachments] blobs read failed', err)
    return null
  }
}

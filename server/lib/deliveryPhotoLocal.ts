import fs from 'node:fs'
import path from 'node:path'

/**
 * Stockage local des photos de livraison — fallback quand Netlify Blobs est
 * indisponible (déploiement Railway/VPS). Persistance assurée par un Volume
 * monté sur PHOTOS_DIR (ex. /data/delivery-photos sur Railway).
 */

const PHOTO_EXT = '.jpg'
const META_EXT = '.json'

export type PhotoMetaInput = Record<string, string>

export function photosDir(): string {
  return process.env.PHOTOS_DIR ?? path.join(process.cwd(), '.data', 'delivery-photos')
}

/** Activé si PHOTO_STORAGE=local ou si PHOTOS_DIR est défini. */
export function isLocalPhotoStorageEnabled(): boolean {
  return process.env.PHOTO_STORAGE === 'local' || Boolean(process.env.PHOTOS_DIR?.trim())
}

function sanitize(photoId: string): string {
  return photoId.replace(/[/\\]/g, '__')
}

export function savePhotoLocal(photoId: string, buffer: Buffer, meta: PhotoMetaInput): void {
  const dir = photosDir()
  fs.mkdirSync(dir, { recursive: true })
  const base = sanitize(photoId)
  fs.writeFileSync(path.join(dir, base + PHOTO_EXT), buffer)
  fs.writeFileSync(path.join(dir, base + META_EXT), JSON.stringify({ photoId, ...meta }, null, 2))
}

export type LocalPhoto = { photoId: string; buffer: Buffer; meta: PhotoMetaInput }

export function readPhotoLocal(photoId: string): LocalPhoto | null {
  const base = sanitize(photoId)
  const binPath = path.join(photosDir(), base + PHOTO_EXT)
  const metaPath = path.join(photosDir(), base + META_EXT)
  if (!fs.existsSync(binPath)) return null
  let meta: PhotoMetaInput
  try {
    meta = JSON.parse(fs.readFileSync(metaPath, 'utf8')) as PhotoMetaInput
  } catch {
    meta = {}
  }
  return { photoId, buffer: fs.readFileSync(binPath), meta }
}

export function listPhotosLocal(deliveryId: string): LocalPhoto[] {
  const dir = photosDir()
  if (!fs.existsSync(dir)) return []
  const out: LocalPhoto[] = []
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith(META_EXT)) continue
    try {
      const meta = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) as PhotoMetaInput & {
        photoId?: string
      }
      if (meta.deliveryId !== deliveryId) continue
      const photoId = meta.photoId ?? f.slice(0, -META_EXT.length)
      const binPath = path.join(dir, f.slice(0, -META_EXT.length) + PHOTO_EXT)
      if (!fs.existsSync(binPath)) continue
      out.push({ photoId, buffer: fs.readFileSync(binPath), meta })
    } catch {
      /* fichier corrompu — ignoré */
    }
  }
  return out.sort((a, b) => (a.meta.uploadedAt ?? '').localeCompare(b.meta.uploadedAt ?? ''))
}
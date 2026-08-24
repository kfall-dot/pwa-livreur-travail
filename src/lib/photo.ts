import exifr from 'exifr'
import type { Coordinates } from '../types'
import { db } from './db'

const MAX_SIZE_BYTES = 10 * 1024 * 1024
const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic', 'image/heif']

export async function computePerceptualHash(blob: Blob): Promise<string> {
  const bitmap = await createImageBitmap(blob)
  const size = 9
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(bitmap, 0, 0, size, size)
  bitmap.close()
  const { data } = ctx.getImageData(0, 0, size, size)
  const gray: number[] = []
  for (let i = 0; i < data.length; i += 4) {
    gray.push(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2])
  }
  const avg = gray.reduce((a, b) => a + b, 0) / gray.length
  return gray.map((v) => (v >= avg ? '1' : '0')).join('')
}

export function hammingDistance(a: string, b: string): number {
  let d = 0
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    if (a[i] !== b[i]) d++
  }
  return d
}

export async function isDuplicatePhoto(
  hash: string,
  deliveryId: string,
  threshold = 5
): Promise<boolean> {
  const existing = await db.photoHashes.toArray()
  for (const row of existing) {
    if (row.deliveryId === deliveryId && hammingDistance(hash, row.hash) <= threshold) {
      return true
    }
  }
  return false
}

export async function registerPhotoHash(hash: string, deliveryId: string): Promise<void> {
  await db.photoHashes.put({ hash, deliveryId, createdAt: Date.now() })
}

export function validatePhotoFile(file: File | Blob, type?: string): string | null {
  const mime = type ?? (file instanceof File ? file.type : '')
  if (mime && !ALLOWED_TYPES.some((t) => mime.toLowerCase().includes(t.replace('image/', '')))) {
    if (!mime.startsWith('image/')) return 'Format non supporté (JPEG, PNG ou HEIC)'
  }
  if (file.size > MAX_SIZE_BYTES) return 'Photo trop volumineuse (max 10 Mo)'
  return null
}

export async function extractGpsFromImage(
  blob: Blob,
  fallback: Coordinates
): Promise<Coordinates> {
  try {
    const gps = await exifr.gps(blob)
    if (gps?.latitude != null && gps?.longitude != null) {
      return { lat: gps.latitude, lng: gps.longitude }
    }
  } catch {
    /* use fallback */
  }
  return fallback
}

export async function captureFromVideo(video: HTMLVideoElement): Promise<Blob> {
  if (video.videoWidth <= 0 || video.videoHeight <= 0) {
    throw new Error('Caméra non prête — attendez l’aperçu puis réessayez.')
  }
  const canvas = document.createElement('canvas')
  canvas.width = video.videoWidth
  canvas.height = video.videoHeight
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(video, 0, 0)
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Capture échouée'))),
      'image/jpeg',
      0.92
    )
  })
}

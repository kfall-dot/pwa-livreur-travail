import Dexie, { type Table } from 'dexie'
import type { AuthTokens, DriverProfile, Tour } from '../types'
import { todayIso } from './dates'

export interface PendingPhoto {
  id?: number
  deliveryId: string
  blob: Blob
  hash: string
  lat: number
  lng: number
  paletteNumber?: string
  createdAt: number
  retries: number
}

export interface SyncQueueItem {
  id?: number
  type: 'photo' | 'start' | 'confirm' | 'send-otp' | 'declare'
  deliveryId: string
  payload: string
  createdAt: number
  retries: number
}

export interface StoredSession extends AuthTokens {
  id: string
  driverId?: string
  driverName?: string
  driverPhone?: string
}

class LivreurDB extends Dexie {
  tokens!: Table<StoredSession>
  tours!: Table<{ id: string; tour: Tour; cachedAt: number }>
  pendingPhotos!: Table<PendingPhoto>
  syncQueue!: Table<SyncQueueItem>
  photoHashes!: Table<{ hash: string; deliveryId: string; createdAt: number }>

  constructor() {
    super('livreur-pwa')
    this.version(1).stores({
      tokens: 'id',
      tours: 'id',
      pendingPhotos: '++id, deliveryId',
      syncQueue: '++id, deliveryId, type',
      photoHashes: 'hash',
    })
    this.version(2).stores({
      pendingPhotos: '++id, deliveryId, createdAt',
      syncQueue: '++id, deliveryId, type, createdAt',
    })
    this.version(3).stores({
      tours: 'id, cachedAt',
    })
  }
}

export const db = new LivreurDB()

const TOKEN_KEY = 'session'
const FALLBACK_SESSION_KEY = 'traceo.driverSession'

type FallbackSession = {
  tokens: AuthTokens
  driver?: DriverProfile
}

function readFallbackSession(): FallbackSession | null {
  try {
    const raw = sessionStorage.getItem(FALLBACK_SESSION_KEY)
    if (!raw) return null
    return JSON.parse(raw) as FallbackSession
  } catch {
    return null
  }
}

function writeFallbackSession(tokens: AuthTokens, driver?: DriverProfile): void {
  try {
    sessionStorage.setItem(FALLBACK_SESSION_KEY, JSON.stringify({ tokens, driver }))
  } catch {
    /* ignore */
  }
}

function clearFallbackSession(): void {
  try {
    sessionStorage.removeItem(FALLBACK_SESSION_KEY)
  } catch {
    /* ignore */
  }
}

/** Répare IndexedDB corrompue (UnknownError fréquent sur Safari / onglets multiples). */
export async function repairIndexedDb(): Promise<void> {
  try {
    db.close()
  } catch {
    /* ignore */
  }
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase('livreur-pwa')
    req.onsuccess = () => resolve()
    req.onblocked = () => resolve()
    req.onerror = () => reject(req.error ?? new Error('IndexedDB delete failed'))
  })
  await db.open()
}

export async function prepareDriverStorage(): Promise<void> {
  try {
    await Promise.race([
      db.tokens.count(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('IndexedDB timeout')), 4000),
      ),
    ])
  } catch {
    try {
      await repairIndexedDb()
    } catch {
      /* sessionStorage fallback reste disponible */
    }
  }
}

/** Session immédiate (démo / cold start) — ne bloque pas sur IndexedDB. */
export function primeDriverSession(tokens: AuthTokens, driver?: DriverProfile): void {
  writeFallbackSession(tokens, driver)
}

export async function saveTokens(tokens: AuthTokens, driver?: DriverProfile): Promise<void> {
  const row = {
    id: TOKEN_KEY,
    ...tokens,
    driverId: driver?.id,
    driverName: driver?.name,
    driverPhone: driver?.phone,
  }

  try {
    const existing = await db.tokens.get(TOKEN_KEY)
    await db.tokens.put({
      ...row,
      driverId: driver?.id ?? existing?.driverId,
      driverName: driver ? driver.name : existing?.driverName,
      driverPhone: driver ? driver.phone : existing?.driverPhone,
    })
    clearFallbackSession()
    return
  } catch {
    /* retry after repair */
  }

  try {
    await repairIndexedDb()
    await db.tokens.put(row)
    clearFallbackSession()
    return
  } catch {
    writeFallbackSession(tokens, driver)
  }
}

export async function getStoredDriver(): Promise<DriverProfile | null> {
  try {
    const row = await db.tokens.get(TOKEN_KEY)
    if (row?.driverId) {
      return {
        id: String(row.driverId),
        name: String(row.driverName ?? 'Livreur'),
        phone: String(row.driverPhone ?? ''),
      }
    }
  } catch {
    /* fallback below */
  }
  const fallback = readFallbackSession()
  return fallback?.driver ?? null
}

export async function getTokens(): Promise<AuthTokens | undefined> {
  try {
  const row = await db.tokens.get(TOKEN_KEY)
    if (row) {
  const { accessToken, refreshToken, expiresAt } = row
  return { accessToken, refreshToken, expiresAt }
    }
  } catch {
    /* fallback below */
  }
  return readFallbackSession()?.tokens
}

export async function clearAllData(): Promise<void> {
  clearFallbackSession()
  try {
  await Promise.all([
    db.tokens.clear(),
    db.tours.clear(),
    db.pendingPhotos.clear(),
    db.syncQueue.clear(),
    db.photoHashes.clear(),
  ])
  } catch {
    await repairIndexedDb()
  }
}

export async function cacheTour(tour: Tour): Promise<void> {
  await db.tours.put({ id: tour.id, tour, cachedAt: Date.now() })
}

export async function getCachedTour(id: string): Promise<Tour | undefined> {
  const row = await db.tours.get(id)
  return row?.tour
}

export async function getTodayCachedTour(): Promise<Tour | undefined> {
  const today = todayIso()
  const rows = await db.tours.orderBy('cachedAt').reverse().toArray()
  return rows.find((r) => r.tour.date === today)?.tour
}

export async function purgeSyncQueueForDelivery(deliveryId: string): Promise<void> {
  await db.syncQueue.where('deliveryId').equals(deliveryId).delete()
  await db.pendingPhotos.where('deliveryId').equals(deliveryId).delete()
}

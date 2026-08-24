import { api } from './api'
import { db } from './db'
import type { AdjustmentLine, DeclarationOutcome } from '../types'

const SYNC_TYPE_ORDER: Record<string, number> = {
  start: 0,
  photo: 1,
  declare: 2,
  'send-otp': 3,
  confirm: 4,
}

export async function processSyncQueue(): Promise<void> {
  if (!navigator.onLine) return
  const items = await db.syncQueue.orderBy('createdAt').toArray()
  // Pour une même livraison : démarrer avant déclarer / OTP (évite « démarrez d’abord »).
  items.sort((a, b) => {
    if (a.deliveryId !== b.deliveryId) return a.createdAt - b.createdAt
    const oa = SYNC_TYPE_ORDER[a.type] ?? 50
    const ob = SYNC_TYPE_ORDER[b.type] ?? 50
    if (oa !== ob) return oa - ob
    return a.createdAt - b.createdAt
  })

  for (const item of items) {
    try {
      let payload: unknown
      try {
        payload = JSON.parse(item.payload)
      } catch {
        if (item.id != null) await db.syncQueue.delete(item.id)
        console.warn('Sync item payload corrompu, ignoré', item.type)
        continue
      }
      switch (item.type) {
        case 'photo': {
          const photoPayload = payload as { blob: Blob; meta: Parameters<typeof api.uploadPhoto>[2] }
          await api.uploadPhoto(item.deliveryId, photoPayload.blob, photoPayload.meta)
          break
        }
        case 'start':
          await api.startDelivery(item.deliveryId, payload as { lat: number; lng: number })
          break
        case 'send-otp':
          await api.sendOtp(item.deliveryId)
          break
        case 'declare':
          await api.declareDelivery(
            item.deliveryId,
            payload as { outcome: DeclarationOutcome; lines: AdjustmentLine[] },
          )
          break
        case 'confirm':
          await api.confirmDelivery(
            item.deliveryId,
            payload as { otp: string; lat: number; lng: number },
          )
          break
      }
      if (item.id != null) await db.syncQueue.delete(item.id)
    } catch (e) {
      const retries = item.retries + 1
      if (item.id != null) {
        if (retries >= 5) await db.syncQueue.delete(item.id)
        else await db.syncQueue.update(item.id, { retries })
      }
      console.warn('Sync item failed', item.type, e)
    }
  }

  const photos = await db.pendingPhotos.orderBy('createdAt').toArray()
  for (const photo of photos) {
    try {
      await api.uploadPhoto(photo.deliveryId, photo.blob, {
        lat: photo.lat,
        lng: photo.lng,
        hash: photo.hash,
        paletteNumber: photo.paletteNumber,
      })
      if (photo.id != null) await db.pendingPhotos.delete(photo.id)
    } catch {
      if (photo.id != null) {
        await db.pendingPhotos.update(photo.id, { retries: photo.retries + 1 })
      }
    }
  }
}

export function registerBackgroundSync(): void {
  if ('serviceWorker' in navigator && 'SyncManager' in window) {
    navigator.serviceWorker.ready.then((reg) => {
      // @ts-expect-error Background Sync API
      return reg.sync?.register('livreur-sync')
    }).catch(() => {})
  }
}

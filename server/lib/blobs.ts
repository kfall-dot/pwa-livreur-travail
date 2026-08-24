import { getStore } from '@netlify/blobs'

/**
 * Blobs est injecté automatiquement (Functions v2) ou via `connectLambda(event)` (Functions v1).
 * Toujours évaluer au moment de la requête — pas au chargement du module.
 */
export function isBlobsEnabled(): boolean {
  return Boolean(process.env.NETLIFY_BLOBS_CONTEXT) || typeof globalThis.netlifyBlobsContext !== 'undefined'
}

export function getDeliveryPhotosStore() {
  return getStore('delivery-photos')
}

export function getProcurementMediaStore() {
  return getStore('procurement-media')
}

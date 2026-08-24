export function arrayBufferToDataUrl(buf: ArrayBuffer): string {
  return `data:image/jpeg;base64,${Buffer.from(buf).toString('base64')}`
}

export type DeliveryPhotoListItem = {
  photoId: string
  url: string
  dataUrl?: string
  paletteNumber: string
  lat: string
  lng: string
  hash: string
  uploadedAt: string
}

export function buildPhotoListItem(
  key: string,
  metadata: Record<string, string>,
  data: ArrayBuffer | undefined,
  urlPath: string,
): DeliveryPhotoListItem {
  return {
    photoId: key,
    url: `${urlPath}?key=${encodeURIComponent(key)}`,
    dataUrl: data ? arrayBufferToDataUrl(data) : undefined,
    paletteNumber: metadata.paletteNumber ?? '',
    lat: metadata.lat ?? '',
    lng: metadata.lng ?? '',
    hash: metadata.hash ?? '',
    uploadedAt: metadata.uploadedAt ?? '',
  }
}

export function resolvePhotoKey(raw: string): string {
  try {
    return decodeURIComponent(raw)
  } catch {
    return raw
  }
}

const MIME_BY_EXT: Record<string, string> = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  heic: 'image/heic',
  heif: 'image/heif',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
}

export const ALLOWED_LINE_ATTACHMENTS = new Set(Object.values(MIME_BY_EXT))

export const LINE_ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024

function extOf(fileName: string): string {
  const base = fileName.trim().split(/[/\\]/).pop() ?? ''
  const dot = base.lastIndexOf('.')
  return dot >= 0 ? base.slice(dot + 1).toLowerCase() : ''
}

/** MIME autorisé (PDF / image / Excel), déduit de l’extension si le navigateur envoie octet-stream ou vide. */
export function resolveLineAttachmentMime(fileName: string, declared?: string | null): string | null {
  const fromName = MIME_BY_EXT[extOf(fileName)]
  const raw = (declared ?? '').trim().toLowerCase().split(';')[0].trim()
  if (raw && ALLOWED_LINE_ATTACHMENTS.has(raw)) return raw
  if (fromName && (!raw || raw === 'application/octet-stream')) return fromName
  return fromName ?? null
}

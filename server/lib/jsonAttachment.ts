import { resolveLineAttachmentMime } from './uploadMime.js'

export function parseJsonAttachment(body: unknown): { buffer: Buffer; originalname: string; mimetype: string } | { error: string } {
  if (!body || typeof body !== 'object' || Buffer.isBuffer(body)) {
    return { error: 'Fichier requis (PDF, image ou Excel)' }
  }
  const rec = body as { data?: unknown; fileName?: unknown; contentType?: unknown }
  if (typeof rec.data !== 'string' || !rec.data.trim()) {
    return { error: 'Fichier requis (PDF, image ou Excel)' }
  }
  const originalname = String(rec.fileName ?? 'piece-jointe').trim() || 'piece-jointe'
  const mimetype = resolveLineAttachmentMime(originalname, String(rec.contentType ?? ''))
  if (!mimetype) {
    return { error: 'Type de fichier non accepté (PDF, image ou Excel)' }
  }
  return { buffer: Buffer.from(rec.data, 'base64'), originalname, mimetype }
}

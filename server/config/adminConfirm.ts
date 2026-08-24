/** Phrase exacte requise pour POST /admin/reset (corps JSON : { "confirm": "…" }). */
export const RESET_CONFIRM_PHRASE = 'SUPPRIMER TOUTES LES DONNÉES'

export function readConfirmPhrase(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null
  const confirm = (body as { confirm?: unknown }).confirm
  return typeof confirm === 'string' ? confirm.trim() : null
}

export function isResetConfirmed(body: unknown): boolean {
  return readConfirmPhrase(body) === RESET_CONFIRM_PHRASE
}

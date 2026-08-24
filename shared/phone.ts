/**
 * Formats téléphone — Côte d'Ivoire (+225).
 * Le format 418… (Québec) reste accepté pour les tests automatisés uniquement.
 * Module partagé client (Vite) + serveur (Express / Netlify Functions).
 */

const IVORY_COAST_PATTERN = /^\+225[0-9]{10}$/
const QUEBEC_418_PATTERN = /^\+1[0-9]{10}$/

export function normalizeDriverPhone(phone: string): string {
  const p = phone.trim().replace(/[\s.\-()]/g, '')

  if (/^\+225[0-9]{10}$/.test(p)) return p
  if (/^225[0-9]{10}$/.test(p)) return `+${p}`

  // 4185551234 → +14185551234
  if (/^418[0-9]{7}$/.test(p)) return `+1${p}`
  if (/^\+1418[0-9]{7}$/.test(p)) return p
  if (/^1[0-9]{10}$/.test(p) && p.startsWith('418')) return `+${p}`

  // 10 chiffres locaux CI (hors 418)
  if (/^[0-9]{10}$/.test(p) && !p.startsWith('418')) return `+225${p}`

  return p
}

export function isValidDriverPhone(phone: string): boolean {
  const n = normalizeDriverPhone(phone)
  return IVORY_COAST_PATTERN.test(n) || (QUEBEC_418_PATTERN.test(n) && n.startsWith('+1418'))
}

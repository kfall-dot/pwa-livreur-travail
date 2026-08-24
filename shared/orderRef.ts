/**
 * Référence commande conforme (générée côté client + serveur).
 * Format : CMD-YYYYMMDD-XXXX (4 hex majuscules).
 */
export function generateOrderRef(now: Date = new Date()): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  const suffix = Math.random().toString(16).slice(2, 6).toUpperCase().padEnd(4, '0')
  return `CMD-${y}${m}${d}-${suffix}`
}

export function isValidOrderRef(value: string): boolean {
  return /^CMD-\d{8}-[A-F0-9]{4}$/i.test(value.trim())
}

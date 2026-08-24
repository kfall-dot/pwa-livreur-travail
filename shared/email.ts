/** Validation e-mail contact point / manager (format simple, pas de DNS). */
export function isValidContactEmail(email: string): boolean {
  const normalized = email.trim().toLowerCase()
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)
}

export function normalizeContactEmail(email: string): string {
  return email.trim().toLowerCase()
}

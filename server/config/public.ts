/** URL publique de l'API — alignée Livraison (PUBLIC_BASE_URL). */
export function publicBaseUrl(): string {
  const port = process.env.PORT ?? '3002'
  return (process.env.PUBLIC_BASE_URL ?? `http://localhost:${port}`).replace(/\/$/, '')
}

/**
 * Lien navigateur vers le certificat HTML (jeton `access` + `view=html`).
 * Évite les routes SPA (/certificates/…) qui renvoyaient vers la page de connexion.
 */
export function buildCertificatePublicUrl(receiptId: string, accessToken?: string): string {
  const base = `${publicBaseUrl()}/api/v1/certificates/${encodeURIComponent(receiptId)}`
  const params = new URLSearchParams({ view: 'html' })
  if (accessToken) params.set('access', accessToken)
  return `${base}?${params.toString()}`
}

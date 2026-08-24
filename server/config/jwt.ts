/** Secret unique pour JWT livreur, gestionnaire et certificats. */
const DEV_JWT_SECRET = 'livreur-dev-only-not-for-production'

const WEAK_SECRETS = new Set([
  DEV_JWT_SECRET,
  'dev-secret-change-in-prod',
  'livreur-dev-secret-change-in-prod',
  'change-me-in-production',
  'secret',
  '12345678901234567890123456789012',
])

const MIN_PRODUCTION_LENGTH = 32

function isProduction(): boolean {
  return process.env.NODE_ENV === 'production'
}

export function getJwtSecret(): string {
  const configured = process.env.JWT_SECRET?.trim()
  if (configured) return configured
  if (isProduction()) {
    throw new Error('JWT_SECRET est obligatoire en production.')
  }
  return DEV_JWT_SECRET
}

export function validateJwtSecretAtStartup(): void {
  const configured = process.env.JWT_SECRET?.trim()

  if (isProduction()) {
    if (!configured) {
      throw new Error(
        'JWT_SECRET est obligatoire en production (minimum 32 caractères aléatoires). ' +
          'Définissez la variable dans Netlify ou votre hébergeur.'
      )
    }
    if (WEAK_SECRETS.has(configured)) {
      throw new Error('JWT_SECRET refusé : valeur par défaut ou trop prévisible.')
    }
    if (configured.length < MIN_PRODUCTION_LENGTH) {
      throw new Error(`JWT_SECRET refusé : minimum ${MIN_PRODUCTION_LENGTH} caractères en production.`)
    }
    return
  }

  if (!configured) {
    console.warn('[jwt] JWT_SECRET non défini — secret de développement local utilisé.')
    return
  }
  if (WEAK_SECRETS.has(configured) || configured.length < MIN_PRODUCTION_LENGTH) {
    console.warn('[jwt] JWT_SECRET faible — toléré en dev, interdit en production.')
  }
}

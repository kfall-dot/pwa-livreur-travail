/**
 * Production Netlify : `CONTEXT=production` (NODE_ENV seul n’est pas fiable
 * sur les Functions — sinon OTP fixe 123456 + devOtpCode exposés).
 */
export function isProduction(): boolean {
  const context = process.env.CONTEXT?.trim()
  if (context === 'production') return true
  if (context === 'dev' || context === 'deploy-preview' || context === 'branch-deploy') {
    return false
  }
  if (process.env.NETLIFY_DEV === 'true' || process.env.NETLIFY_DEV === '1') {
    return false
  }
  return process.env.NODE_ENV === 'production'
}

/** Dev local (`netlify:dev`) : un même téléphone livreur peut être recréé. CI et prod refusent. */
export function allowDevDuplicateDriverPhone(): boolean {
  if (isProduction()) return false
  const ci = process.env.CI?.trim()
  return ci !== 'true' && ci !== '1'
}

/**
 * Bypass tests (OTP fixe, devOtpCode) — interdit en production et dès qu’un
 * vrai fournisseur SMS est configuré (filet si CONTEXT manque sur la Function).
 */
export function allowTestBypass(): boolean {
  if (isProduction()) return false
  const sms = process.env.SMS_PROVIDER?.trim().toLowerCase()
  if (sms && sms !== 'mock') return false
  return true
}

/** Code OTP à 6 chiffres — aléatoire dès que le bypass test est off. */
export function resolveOtpCode(): string {
  if (allowTestBypass()) {
    return process.env.OTP_CODE?.trim() || '123456'
  }
  return String(Math.floor(100000 + Math.random() * 900000))
}

export function validateProductionBypassAtStartup(): void {
  if (!isProduction()) return

  if (process.env.GEOFENCE_BYPASS === 'true' || process.env.GEOFENCE_BYPASS === '1') {
    const allowed =
      process.env.ALLOW_GEOFENCE_BYPASS === 'true' || process.env.ALLOW_GEOFENCE_BYPASS === '1'
    if (!allowed) {
      throw new Error(
        'GEOFENCE_BYPASS est interdit en production — retirez la variable ou définissez ALLOW_GEOFENCE_BYPASS=true.',
      )
    }
    console.warn('[production] GEOFENCE_BYPASS actif (ALLOW_GEOFENCE_BYPASS=true).')
  }

  const otpCode = process.env.OTP_CODE?.trim()
  if (otpCode) {
    throw new Error('OTP_CODE est interdit en production — le code OTP doit être généré aléatoirement.')
  }

  const driverPin = process.env.DRIVER_PIN?.trim()
  if (driverPin) {
    throw new Error('DRIVER_PIN est interdit en production — les PIN doivent être hashés en base.')
  }

  if (process.env.ALLOW_SEED === 'true' || process.env.ALLOW_RESET === 'true') {
    console.warn('[production] ALLOW_SEED ou ALLOW_RESET actif — vérifiez que c’est intentionnel.')
    if (!process.env.ADMIN_API_TOKEN?.trim()) {
      console.warn(
        '[production] ADMIN_API_TOKEN absent — reset/seed n’acceptent que la session manager.',
      )
    }
  }

  if (process.env.SMS_OTP_FAIL_OPEN === 'true' || process.env.SMS_OTP_FAIL_OPEN === '1') {
    console.warn('[production] SMS_OTP_FAIL_OPEN actif — la livraison peut continuer sans SMS OTP.')
  }
}

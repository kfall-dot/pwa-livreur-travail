/**
 * Formats téléphone — application principalement en Côte d'Ivoire (+225).
 * Logique de normalisation : `shared/phone.ts` (partagée avec le serveur).
 */
export {
  normalizeDriverPhone,
  isValidDriverPhone,
  normalizeDriverPhone as normalizeIvoryCoastMobile,
  isValidDriverPhone as isValidIvoryCoastMobile,
} from '../../shared/phone'

/** Exemple affiché (login démo, docs) — ne pas utiliser comme valeur par défaut des formulaires création. */
export const CI_PHONE_EXAMPLE = '+2250701234567'
/** Placeholder des champs vides (création livreur / point) — évite l’effet « pré-rempli ». */
export const CI_PHONE_PLACEHOLDER = '+22507XXXXXXXX'
/** Compte livreur démo principal (aligné seed + E2E). */
export const DEMO_DRIVER_PHONE = '+2250701234567'

export const CI_PHONE_INPUT_TITLE = '+225 suivi de 10 chiffres (OTP SMS)'

export const PHONE_FORMAT_HINT =
  '+225 suivi de 10 chiffres (ex. +2250701234567, ou 0701234567 sans indicatif)'

export function formatPhoneInput(value: string): string {
  const digits = value.replace(/\D/g, '')
  if (value.startsWith('+') || digits.length === 0) return value.replace(/[^\d+]/g, '')
  if (digits.startsWith('225')) return `+${digits.slice(0, 13)}`
  if (digits.startsWith('418')) return digits.slice(0, 10)
  if (digits.length <= 10) return digits
  return `+${digits}`
}

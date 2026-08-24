import { publicBaseUrl } from '../config/public.js'

export interface OtpSmsContext {
  pointName: string
  orderRef?: string | null
  orderDetail?: string | null
  outcome?: 'full' | 'partial' | 'rejected' | null
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function resolveSmsOrderReference(orderRef?: string | null): string {
  const ref = String(orderRef ?? '').trim()
  if (!ref || UUID_RE.test(ref)) return '—'
  return ref
}

export function formatOrderDetailForOtpSms(
  products: Array<{ label: string; qty: number; unit: string }> | null | undefined,
  units: number,
  unitType: string,
): string {
  if (products && products.length > 0) {
    return products.map((p) => `${p.label} : ${p.qty} ${p.unit}`).join(' ; ')
  }
  return `${units} ${unitType}`
}

/** Corps SMS OTP — court pour limiter les segments facturés. */
export function buildOtpSmsBody(otpCode: string, ctx: OtpSmsContext): string {
  const point = ctx.pointName.trim() || 'Point de livraison'
  const orderId = resolveSmsOrderReference(ctx.orderRef)
  const detail = (ctx.orderDetail ?? '—').trim()
  const outcome = ctx.outcome ?? 'full'

  if (outcome === 'rejected') {
    return (
      `Refus livraison ${point} (${orderId}). ` +
      `Code validation ${otpCode} — transmettez au livreur si vous confirmez le refus.`
    )
  }

  if (outcome === 'partial') {
    return (
      `Livraison partielle ${point} (${orderId}). ${detail}. ` +
      `Code ${otpCode} — transmettez au livreur si les quantités sont correctes.`
    )
  }

  return (
    `Livraison ${point} (${orderId}). ${detail}. ` +
    `Code ${otpCode} — transmettez au livreur pour confirmer la réception.`
  )
}

/** SMS d’assignation de tournée au livreur (création / replan). */
export function buildTourAssignedSmsBody(opts: {
  tourDate: string
  stopCount: number
  depotName?: string | null
  /** URL de l’app livreur (défaut : PUBLIC_BASE_URL). */
  appUrl?: string | null
}): string {
  const date = opts.tourDate.trim() || '—'
  const n = Math.max(0, opts.stopCount)
  const depot = (opts.depotName ?? '').trim()
  const depotPart = depot ? ` Dépôt : ${depot}.` : ''
  const appUrl = (opts.appUrl ?? publicBaseUrl()).trim().replace(/\/$/, '')
  const linkPart = appUrl ? ` Ouvrez ${appUrl}` : ` Ouvrez l'app Livreur`
  return (
    `Nouvelle tournée du ${date} : ${n} arrêt(s).${depotPart}` +
    `${linkPart} pour démarrer.`
  )
}

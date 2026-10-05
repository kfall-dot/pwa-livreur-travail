import type { AdjustmentLine, DeliveryProductOption } from '../types'
import { testBypass } from './testBypass'

/** Une photo par produit (ligne), indépendamment des quantités. */
export function requiredPhotoCount(
  lines: Array<
    Pick<AdjustmentLine, 'productLabel' | 'unit' | 'quantityAccepted' | 'quantityRefused'> & {
      quantity_expected?: number | null
      quantity_accepted?: number | null
      quantity_refused?: number | null
      product_label?: string
    }
  >
): number {
  if (!lines.length) return 1

  const withLabel = lines.filter((l) => String(l.productLabel || l.product_label || '').trim())
  if (!withLabel.length) return 1

  const declared = withLabel.filter(
    (l) =>
      l.quantityAccepted != null ||
      l.quantityRefused != null ||
      l.quantity_accepted != null ||
      l.quantity_refused != null
  )

  return Math.max(1, declared.length > 0 ? declared.length : withLabel.length)
}

/** Cible photos affichée et utilisée pour les contrôles UI : au moins une photo par fournisseur. */
export function effectivePhotoTarget(_options: {
  deliveryProducts: DeliveryProductOption[]
  declareLines: AdjustmentLine[]
  declared: boolean
  apiRequired?: number
}): number {
  return 1
}

export function applyPhotoTargetFromApi(apiRequired: number | undefined, lines: AdjustmentLine[]): number {
  if (testBypass.minPhotosOnly) return 1
  return apiRequired ?? requiredPhotoCount(lines)
}

/** Plafond de photos proposées à l’UI : aucune limitation (le minimum est géré par `effectivePhotoTarget`). */
export function photoCapacity(_options: {
  deliveryProducts: DeliveryProductOption[]
  declareLines: AdjustmentLine[]
  declared: boolean
  apiRequired?: number
}): number {
  return Infinity
}

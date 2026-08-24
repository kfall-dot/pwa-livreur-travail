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

export function requiredPhotoCountFromProducts(products: DeliveryProductOption[]): number {
  return Math.max(1, products.length)
}

/** Cible photos affichée et utilisée pour les contrôles UI (respecte VITE_PHOTOS_BYPASS). */
export function effectivePhotoTarget(options: {
  deliveryProducts: DeliveryProductOption[]
  declareLines: AdjustmentLine[]
  declared: boolean
  apiRequired?: number
}): number {
  if (testBypass.minPhotosOnly) return 1

  const fromProducts = requiredPhotoCountFromProducts(options.deliveryProducts)
  const fromLines = requiredPhotoCount(options.declareLines)

  if (options.declared) {
    return Math.max(options.apiRequired ?? 0, fromLines, 1)
  }
  return Math.max(fromProducts, fromLines, 1)
}

export function applyPhotoTargetFromApi(apiRequired: number | undefined, lines: AdjustmentLine[]): number {
  if (testBypass.minPhotosOnly) return 1
  return apiRequired ?? requiredPhotoCount(lines)
}

/** Plafond de photos proposées à l’UI (en mode test : min. 1, mais plusieurs produits possibles). */
export function photoCapacity(options: {
  deliveryProducts: DeliveryProductOption[]
  declareLines: AdjustmentLine[]
  declared: boolean
  apiRequired?: number
}): number {
  const minimum = effectivePhotoTarget(options)
  if (!testBypass.minPhotosOnly) return minimum

  const fullCount = Math.max(
    requiredPhotoCountFromProducts(options.deliveryProducts),
    requiredPhotoCount(options.declareLines),
    options.apiRequired ?? 0,
    1
  )
  return Math.max(minimum, fullCount)
}

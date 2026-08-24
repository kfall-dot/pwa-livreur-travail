export type DeliveryStatus =
  | 'pending'
  | 'in_progress'
  | 'otp_sent'
  | 'delivered'
  | 'failed'

export type UnitType =
  | 'palette'
  | 'carton'
  | 'sac'
  | 'colis'
  | 'bidon'
  | 'kg'
  | 'caisse'
  | 'plateau'
  | 'unite'
  | 'tonne'
  | 'botte'
  | 'seau'
  | 'metre'
  | 'litre'
  | 'rouleau'
  | 'camion'

export type FraudLevel = 'low' | 'medium' | 'high' | 'critical'

export interface Coordinates {
  lat: number
  lng: number
}

export interface DeliveryPoint {
  id: string
  sequence: number
  /** Présent si plusieurs tournées le même jour. */
  tourId?: string
  tourDepotName?: string
  name: string
  address: string
  instructions?: string
  status: DeliveryStatus
  units: number
  unitType: UnitType
  weightKg: number
  orderRef: string
  distanceFromPrevM: number
  timeWindow: { start: string; end: string }
  estimatedArrival: string
  coordinates: Coordinates
  contactPhone?: string
  requiredPhotos: number
  certificateUrl?: string
  receiptId?: string
  /** Produits planifiés (plusieurs → contenu « multiple » côté livreur). */
  products?: Array<{ label: string; qty: number; unit: string }> | null
  /** Présent lorsque la livraison est clôturée (full / partial / rejected). */
  declarationOutcome?: 'full' | 'partial' | 'rejected' | null
}

export interface Tour {
  id: string
  date: string
  /** Nombre de tournées fusionnées pour cette date (si > 1). */
  tourCount?: number
  depot: Coordinates & { name: string; address: string }
  stops: DeliveryPoint[]
  totalUnits: number
  totalWeightKg: number
  optimizationScore: number
  routePolyline: Coordinates[]
  deliveredCount: number
}

export interface AuthTokens {
  accessToken: string
  refreshToken: string
  expiresAt: number
}

export interface DriverProfile {
  id: string
  phone: string
  name: string
}

export interface ConfirmResult {
  receiptId: string
  certificateUrl: string
  fraudScore: number
  fraudLevel: FraudLevel
  fraudDetails?: string[]
  isPartial?: boolean
  isRejected?: boolean
  acceptedPalettes?: number
  declarationOutcome?: 'full' | 'partial' | 'rejected' | null
}

export type DeclarationOutcome = 'full' | 'partial' | 'rejected'

export interface AdjustmentLine {
  productLabel: string
  unit: string
  quantityExpected?: number
  quantityAccepted?: number
  quantityRefused?: number
  justification: string
}

export type AdjustmentLineRow = AdjustmentLine & { id?: string }

export interface DeliveryProductOption {
  productLabel: string
  unit: string
  quantityExpected?: number
}

export interface DeliveryDetailResponse {
  delivery: {
    id: string
    status: string
    expected_palettes: number
    supermarket_name?: string
    supermarket_address?: string
  }
  photos: { id: string; palette_number?: string }[]
  adjustmentLines?: AdjustmentLineRow[]
  plannedUnit?: string | null
  declared?: boolean
  declarationOutcome?: string | null
  products?: Array<{ label: string; qty: number; unit: string }> | null
  requiredPhotos?: number
  devOtpCode?: string
  otpExpired?: boolean
}

export interface GeofenceError {
  code: 'GEOFENCE'
  distanceM: number
  maxM: number
}

export interface ScheduleDay {
  date: string
  count: number
  activeCount?: number
}

export interface DeliveryPhoto {
  photoId: string
  url: string
  dataUrl?: string
  paletteNumber: string
  lat: string
  lng: string
  uploadedAt: string
}

export interface DeliveryPhotosResponse {
  deliveryId: string
  photos: DeliveryPhoto[]
  blobsEnabled: boolean
}

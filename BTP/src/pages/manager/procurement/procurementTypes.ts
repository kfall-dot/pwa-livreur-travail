/** Types alignés sur l’API /procurement/* et le schéma BTP. */

export type ProcurementRole =
  | 'site_controller'
  | 'technical_director'
  | 'daf'
  | 'purchasing'
  | 'pdg'

export type PurchaseRequestStatus =
  | 'whatsapp_ingested'
  | 'draft_parsed'
  | 'draft_review'
  | 'submitted'
  | 'daf_review'
  | 'sa_review'
  | 'bt_pending'
  | 'daf_bt_review'
  | 'pdg_review'
  | 'po_ready'
  | 'delivery_scheduled'
  | 'delivered'
  | 'rejected'

export type WhatsappMessageType = 'text' | 'audio' | 'image' | 'document' | 'unknown'

export type ApprovalDecision = 'approved' | 'rejected'

export type PurchaseDocType = 'bc' | 'bt'

export interface ParsedEbLine {
  label: string
  quantity: number
  unit: string
  observation?: string
  supplierName?: string
  paymentMode?: string
  unitPrice?: number
  amount?: number
}

export interface SiteRow {
  id: string
  name: string
  address: string
  lat?: string | null
  lng?: string | null
  managerId?: string | null
  whatsappGroupId?: string | null
  active: boolean
  createdAt?: string
}

export interface SupplierRow {
  id: string
  name: string
  contactPhone?: string | null
  contactEmail?: string | null
  hasAccount: boolean
  address?: string | null
  active: boolean
}

export interface WhatsappMessageRow {
  id: string
  fromPhone: string
  fromName?: string | null
  messageType: WhatsappMessageType
  bodyText?: string | null
  mediaBlobKey?: string | null
  createdAt: string
}

export interface PurchaseRequestDraftRow {
  id: string
  companyId: string
  siteId?: string | null
  status: string
  sourceMessageIds: string[]
  parsedLines: ParsedEbLine[]
  parsedUrgency?: string | null
  confidenceScore?: string | number | null
  needsReview: boolean
  purchaseRequestId?: string | null
  createdAt: string
  updatedAt: string
  siteName?: string | null
}

export interface PurchaseRequestLineRow {
  id: string
  purchaseRequestId: string
  label: string
  unit: string
  quantity: string | number
  unitPriceFcfa?: string | number | null
  amountFcfa?: string | number | null
  observation?: string | null
  supplierName?: string | null
  paymentMode?: string | null
  attachmentBlobKey?: string | null
  attachmentFileName?: string | null
  attachmentContentType?: string | null
  displayOrder: number
}

export interface ApprovalStepRow {
  id: string
  purchaseRequestId: string
  role: ProcurementRole
  managerId: string
  managerName?: string | null
  decision: ApprovalDecision
  comment?: string | null
  createdAt: string
}

export interface PurchaseRequestRow {
  id: string
  companyId: string
  siteId: string
  reference: string
  status: PurchaseRequestStatus
  urgency?: string | null
  requestedByPhone?: string | null
  requestedByName?: string | null
  sourceDraftId?: string | null
  supplierId?: string | null
  totalAmountFcfa?: number | null
  notes?: string | null
  createdByManagerId?: string | null
  submittedAt?: string | null
  createdAt: string
  updatedAt: string
  siteName?: string | null
  supplierName?: string | null
}

export interface PurchaseOrderRow {
  id: string
  purchaseRequestId: string
  supplierId: string
  reference: string
  docType: PurchaseDocType
  amountFcfa?: number | null
  tourId?: string | null
  createdAt: string
}

export interface ProcurementConfig {
  btThresholdFcfa: number
  whatsappMock: boolean
  openAiEnabled: boolean
}

export interface DraftParseHints {
  destination?: string | null
  neededBy?: string | null
  objet?: string | null
  requesterName?: string | null
  missingInfo?: string[]
  dtActions?: string[]
  source?: string | null
  signature?: {
    etape?: string
    approbateur?: string
    role?: string
    timestamp?: string
    ipAddress?: string
    codePinVerifie?: boolean
    commentaire?: string
  } | null
}

export interface DraftDetailResponse {
  draft: PurchaseRequestDraftRow
  messages: WhatsappMessageRow[]
  sites: SiteRow[]
  site?: SiteRow | null
  parseHints?: DraftParseHints | null
  suppliers?: SupplierRow[]
}

export interface RequestDetailResponse {
  request: PurchaseRequestRow
  lines: PurchaseRequestLineRow[]
  approvalSteps: ApprovalStepRow[]
  site?: SiteRow | null
  supplier?: SupplierRow | null
  purchaseOrder?: PurchaseOrderRow | null
  suppliers?: SupplierRow[]
}

export interface DraftUpdatePayload {
  siteId?: string | null
  parsedUrgency?: string | null
  parsedLines?: ParsedEbLine[]
  requesterName?: string
  objet?: string
  neededBy?: string
}

export interface CreatePoPayload {
  supplierId: string
  amountFcfa?: number
}

export interface ScheduleDeliveryPayload {
  driverId: string
  date: string
}

export interface ProcurementTourPrefill {
  purchaseRequestId: string
  date: string
  driverId?: string
  depotName: string
  depotAddress: string
  stopName: string
  stopAddress: string
  orderRef: string
  products: Array<{ label: string; qty: number; unit: string }>
}

export interface ApproveRejectPayload {
  comment?: string
}

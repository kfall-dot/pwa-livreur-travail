/** Types alignés sur l’API /procurement/* et le schéma BTP. */
import type { ChargeFamily } from '../../../../shared/chargeNatures'

export type ProcurementRole =
  | 'site_controller'
  | 'technical_director'
  | 'daf'
  | 'purchasing'
  | 'pdg'
  | 'controle_gestion'
  | 'site_manager'
  | 'accountant'
  | 'treasury'

export type PurchaseRequestStatus =
  | 'whatsapp_ingested'
  | 'draft_parsed'
  | 'draft_review'
  | 'dt_review'
  | 'sa_head_review'
  | 'bc_head_review'
  | 'submitted'
  | 'cdg_review'
  | 'daf_review'
  | 'sa_review'
  | 'bt_pending'
  | 'bt_ready'
  | 'deboursed'
  | 'paid'
  | 'daf_bt_review'
  | 'pdg_review'
  | 'po_ready'
  | 'delivery_scheduled'
  | 'delivered'
  | 'rejected'

export type WhatsappMessageType = 'text' | 'audio' | 'image' | 'document' | 'unknown'

export type ApprovalDecision = 'approved' | 'rejected' | 'revised'

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
  spendCategory?: string
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
  spendCategory?: string | null
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
  pinVerified?: boolean | null
  createdAt: string
}

export interface PurchaseRequestRow {
  saReviewerId?: string | null
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
  version?: number
  ebVersion?: number
  revisionComment?: string | null
  revisedAt?: string | null
}

export interface PurchaseRequestVersion {
  id: string
  purchaseRequestId: string
  version: number
  quantities: Array<{ lineId: string; quantity: number }>
  comment?: string | null
  createdBy?: string | null
  createdAt: string
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

export interface TreasuryOrderRow {
  id: string
  purchaseRequestId: string
  reference: string
  amountFcfa?: string | number | null
  createdAt: string
}

export interface RequestDetailResponse {
  request: PurchaseRequestRow
  lines: PurchaseRequestLineRow[]
  approvalSteps: ApprovalStepRow[]
  site?: SiteRow | null
  supplier?: SupplierRow | null
  purchaseOrder?: PurchaseOrderRow | null
  purchaseOrders?: PurchaseOrderRow[]
  treasuryOrders?: TreasuryOrderRow[] | null
  suppliers?: SupplierRow[]
  versions?: PurchaseRequestVersion[]
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
  supplierId?: string
  amountFcfa?: number
  allSuppliers?: boolean
}

export interface ScheduleDeliveryPayload {
  driverId: string
  date: string
}

export interface ProcurementTourPrefill {
  purchaseRequestId: string
  purchaseOrderId?: string
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
  pin?: string
}

export interface ReviseQuantitiesPayload {
  quantities: Array<{ id: string; quantity: number }>
  comment?: string
  /** NIP du PDG : la révision est signée (visa porté sur le BT régénéré). */
  pin?: string
}

export interface BcRegisterMonth {
  key: string
  label: string
}

export interface BcRegisterRecapLine {
  date: string
  bon: string
  amountFcfa: number
  amountLabel: string
  siteName: string
  observation: string
}

export interface BcRegisterRecapGroup {
  supplierName: string
  totalFcfa: number
  totalLabel: string
  rows: BcRegisterRecapLine[]
}

export interface BcRegisterRow {
  status?: PurchaseRequestStatus
  purchaseOrderId: string
  purchaseRequestId: string
  siteName: string
  supplierName: string
  date: string
  bon: string
  paymentMode: string
  quantities: string
  amountFcfa: number
  amountLabel: string
  invoice: string
  justifs: string
  observation: string
  verification: string
  invoicePaid: boolean
  invoiceFile: { fileName: string } | null
  invoiceTransmitted: boolean
  attachment: string
  attachments: Array<{ lineId: string; fileName: string }>
  /** Chaîne documentaire : réf. de l'EB d'origine (+ version) et BT rattachés. */
  ebReference: string
  ebVersion: number
  btReferences: string[]
  /** Copie du bon de livraison fournisseur jointe par le SA. */
  blFile: { fileName: string } | null
  /** N° du BL interne (certificat RCT-…) émis à la livraison de l'arrêt. */
  blReceiptId: string | null
}

// ─── Chaîne documentaire EB → BT → BC → BL → facture ─────────────────────────

export interface DocumentChainBl {
  receiptId: string
  deliveryId: string
  purchaseOrderId: string
  stopName: string
  tourId: string
  tourDate: string | null
  status: string
  outcome: 'full' | 'partial' | 'rejected' | null
  declaredAt: string | null
  certificateUrl: string | null
  isDelivered: boolean
}

export interface DocumentChainBc {
  id: string
  reference: string
  supplierName: string
  amountFcfa: number
  tourId: string | null
  tourDate: string | null
  invoiceReference: string
  invoiceFile: { fileName: string } | null
  blFile: { fileName: string } | null
  bls: DocumentChainBl[]
}

export interface DocumentChainBt {
  id: string
  reference: string
  amountFcfa: number
  purchaseOrderId: string | null
  bcReference: string | null
}

export interface DocumentChain {
  requestId: string
  eb: {
    reference: string
    version: number
    versionLabel: string
    status: string
    siteName: string
    totalAmountFcfa: number | null
  }
  bts: DocumentChainBt[]
  bcs: DocumentChainBc[]
  bls: DocumentChainBl[]
  references: { eb: string; bt: string; bc: string; bl: string }
}

/** Maillon par lequel on est entré dans la chaîne (résolveur d'identifiants). */
export interface DocumentChainMatch {
  kind: 'eb' | 'bt' | 'bc' | 'bl'
  id: string
  reference: string
}

/** Réponse de `GET /procurement/document-chain?ref=…`. */
export interface ResolvedDocumentChain {
  requestId: string
  matched: DocumentChainMatch
  chain: DocumentChain
}

export interface SiteBudgetAmendmentRow {
  id: string
  reference: string
  status: 'draft' | 'approved' | 'rejected'
  signedAmountFcfa: number
  reason: string
  createdByName: string | null
  decidedByName: string | null
  decidedAt: string | null
  createdAt: string
  comment: string | null
}

export interface SiteBudget {
  siteId: string
  siteName: string
  budgetInitialFcfa: number | null
  budgetFrozenAt: string | null
  budgetTotalFcfa: number | null
  engagedFcfa: number
  realizedFcfa: number
  remainingFcfa: number | null
  overBudget: boolean
  engagementPct?: number | null
  varianceFcfa?: number | null
  variancePct?: number | null
  trafficLight?: 'none' | 'ok' | 'watch' | 'alert'
  missingAmendment?: boolean
  overrunSinceAt?: string | null
  overrunDays?: number | null
  amendments: SiteBudgetAmendmentRow[]
}

export type CdgIndicatorId = 'budget' | 'realized' | 'variance' | 'materials' | 'top3'

export interface SiteIndicatorProduct {
  label: string
  amountFcfa: number
  shareOfInitialPct: number | null
}

export interface SiteIndicatorDay {
  date: string
  realizedFcfa: number
  varianceFcfa: number | null
  materialsFcfa: number
  materialsSharePct?: number | null
  byCategory?: SiteIndicatorCategory[]
  top3: SiteIndicatorProduct[]
}

export interface SiteIndicatorCategory {
  category: string
  label: string
  amountFcfa: number
  shareOfBudgetPct: number | null
}

/** Ventilation par famille de charge (F02 lot A). */
export interface SiteIndicatorFamily {
  family: string
  label: string
  amountFcfa: number
  shareOfRealizedPct: number | null
}

// ─── F03 — budget vs réalisé par famille ─────────────────────────────────────

export type FamilyTrafficLight = 'none' | 'ok' | 'watch' | 'alert'

export interface BudgetFamilyAllocation {
  family: string
  amountFcfa: number
}

/** Une ligne du tableau à double entrée : enveloppe ventilée vs réalisé. */
export interface FamilyVarianceRow {
  family: ChargeFamily
  label: string
  allocatedFcfa: number
  realizedFcfa: number
  /** `alloué − réalisé` — négatif = dépassement. */
  varianceFcfa: number
  consumedPct: number | null
  overrun: boolean
  trafficLight: FamilyTrafficLight
}

export interface FamilyVariance {
  rows: FamilyVarianceRow[]
  allocatedFcfa: number
  realizedFcfa: number
  varianceFcfa: number
  /** Enveloppe non encore ventilée (`budget_total − Σ allocations`). */
  unallocatedFcfa: number | null
  allocationOverBudget: boolean
  overrunFamilies: ChargeFamily[]
}

// ─── F02 lot B — poste Trésorerie ────────────────────────────────────────────

export type DisbursementMethodValue = 'orange_money' | 'cash' | 'bank' | 'cheque'

/** Déboursé enregistré pour un bon de trésorerie. */
export interface TreasuryDisbursementRow {
  id: string
  amountFcfa: string | number
  method: DisbursementMethodValue
  transactionReference: string | null
  paidAt: string
  invoiceFileName: string | null
  invoicePrintedAt: string | null
  invoiceBlobKey: string | null
}

/** Ligne de la file du poste Trésorerie (`GET /procurement/treasury`). */
export interface TreasuryQueueItem {
  treasuryId: string
  reference: string
  amountFcfa: number
  status: 'pending' | 'issued' | 'deboursed' | 'paid' | 'cancelled'
  lineId: string | null
  requestId: string
  requestReference: string
  requestStatus: string
  siteId: string
  disbursement: TreasuryDisbursementRow | null
}

/** Déboursé d'une EB (`GET /procurement/requests/:id/disbursements`). */
export interface RequestDisbursement {
  treasuryId: string
  treasuryReference: string
  amountFcfa: number
  method: DisbursementMethodValue
  transactionReference: string | null
  paidAt: string
  invoiceFileName: string | null
  invoicePrintedAt: string | null
  hasInvoice: boolean
}

/**
 * Paiement (déboursé) historisé — `GET /procurement/treasury/history`
 * (onglet Trésorerie : « Historique des paiements par chantier »).
 */
export interface TreasuryHistoryItem {
  treasuryId: string
  treasuryReference: string
  treasuryStatus: 'pending' | 'issued' | 'deboursed' | 'paid' | 'cancelled'
  requestId: string
  requestReference: string
  requestStatus: string
  siteId: string | null
  siteName: string | null
  amountFcfa: number
  method: DisbursementMethodValue
  transactionReference: string | null
  paidAt: string
  invoiceFileName: string | null
  hasInvoice: boolean
  invoicePrintedAt: string | null
}

export const DISBURSEMENT_METHOD_LABELS: Record<DisbursementMethodValue, string> = {
  orange_money: 'Orange Money',
  cash: 'Espèces',
  bank: 'Virement',
  cheque: 'Chèque',
}

export interface SiteIndicators {
  siteId: string
  siteName: string
  asOf: string
  firstExpenseOn: string | null
  budgetInitialFcfa: number | null
  budgetTotalFcfa: number | null
  realizedFcfa: number
  realizedPct: number | null
  varianceFcfa: number | null
  variancePct: number | null
  materialsFcfa: number
  materialsSharePct: number | null
  top3: SiteIndicatorProduct[]
  byCategory: SiteIndicatorCategory[]
  byFamily?: SiteIndicatorFamily[]
  /** F03 — tableau à double entrée (enveloppe ventilée vs réalisé). */
  familyVariance?: FamilyVariance
  daily: SiteIndicatorDay[]
}

// ─── T08 — rejeu de l'historique du CdG ──────────────────────────────────────

/** Ligne du journal écartée au parsing (date / montant / nature illisibles). */
export interface JournalRejectedRow {
  row: number
  reason: string
}

/** Sort d'un libellé de chantier du journal : imputé, ou non. */
export interface JournalSiteMapping {
  journalName: string
  siteId: string | null
  siteName: string | null
  lines: number
  fcfa: number
}

/** Répartition du rejeu par nature de charge — aperçu du réalisé F02/F03. */
export interface JournalNatureSummary {
  nature: string
  label: string
  family: string
  lines: number
  fcfa: number
}

/**
 * Aperçu du rapprochement journal ↔ TraceO — **n'écrit rien** (I106).
 *
 * `excluded` = lignes portant un n° de BC, **déjà dans TraceO** (I100) ;
 * `toImport` = lignes hors BC, le rejeu réel.
 */
export interface HistoricalJournalPreview {
  parsedLines: number
  rejected: JournalRejectedRow[]
  totalFcfa: number
  excluded: { lines: number; fcfa: number }
  toImport: { lines: number; fcfa: number }
  unmappedBcReferences: string[]
  matchRatePct: number
  sites: JournalSiteMapping[]
  /** Lignes qu'aucun chantier n'absorbe — à désigner avant d'importer. */
  unassigned: { lines: number; fcfa: number }
  byNature: JournalNatureSummary[]
}

/** Résultat d'un rejeu — idempotent (I99), annulable par `batchId`. */
export interface HistoricalImportResult {
  batchId: string
  imported: number
  skipped: number
  importedFcfa: number
  unassignedSites: string[]
  totalFcfa: number
  excluded: { lines: number; fcfa: number }
  rejected: JournalRejectedRow[]
  matchRatePct: number
}

export interface HistoricalImportBatch {
  batchId: string
  source: string
  lines: number
  amountFcfa: number
  importedAt: string
}

export interface HistoricalExpenseRow {
  id: string
  siteId: string | null
  siteName: string | null
  occurredOn: string
  label: string
  nature: string
  natureLabel: string | null
  supplierName: string | null
  amountFcfa: number
  batchId: string
}

export interface HistoricalExpensesResponse {
  batches: HistoricalImportBatch[]
  lines: HistoricalExpenseRow[]
}

import {
  boolean,
  date,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  numeric,
  time,
  jsonb,
  uniqueIndex,
} from 'drizzle-orm/pg-core'

// ─── Enums ───────────────────────────────────────────────────────────────────

export const driverStatusEnum = pgEnum('driver_status', ['pending', 'active', 'suspended'])
export const deliveryStatusEnum = pgEnum('delivery_status', [
  'pending',
  'in_progress',
  'otp_sent',
  'delivered',
  'failed',
])
export const declarationOutcomeEnum = pgEnum('declaration_outcome', ['full', 'partial', 'rejected'])
export const companyStatusEnum = pgEnum('company_status', ['active', 'suspended'])
export const managerRoleEnum = pgEnum('manager_role', ['admin', 'manager'])

export const procurementRoleEnum = pgEnum('procurement_role', [
  'site_controller',
  'technical_director',
  'daf',
  'purchasing',
  'pdg',
  'controle_gestion',
  'site_manager',
])

export const siteBudgetAmendmentStatusEnum = pgEnum('site_budget_amendment_status', [
  'draft',
  'approved',
  'rejected',
])

export const purchaseRequestStatusEnum = pgEnum('purchase_request_status', [
  'whatsapp_ingested',
  'draft_parsed',
  'draft_review',
  'submitted',
  'cdg_review',
  'daf_review',
  'sa_review',
  'bt_pending',
  'daf_bt_review',
  'pdg_review',
  'po_ready',
  'delivery_scheduled',
  'delivered',
  'rejected',
  'deleted',
])

export const whatsappMessageTypeEnum = pgEnum('whatsapp_message_type', [
  'text',
  'audio',
  'image',
  'document',
  'unknown',
])

export const approvalDecisionEnum = pgEnum('approval_decision', ['approved', 'rejected'])

export const purchaseDocTypeEnum = pgEnum('purchase_doc_type', ['bc', 'bt'])

/** Entreprise démo (seed / E2E) — toutes les données historiques y sont rattachées. */
export const DEMO_COMPANY_ID = 'co-demo'

/** Entreprise pilote BTP achats-chantier (isolée de co-demo). */
export const BTP_PILOT_COMPANY_ID = 'co-btp-pilote'

// ─── companies (multi-tenant) ─────────────────────────────────────────────────

export const companies = pgTable(
  'companies',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    status: companyStatusEnum('status').notNull().default('active'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [uniqueIndex('companies_slug_uidx').on(t.slug)],
)

export type Company = typeof companies.$inferSelect
export type NewCompany = typeof companies.$inferInsert

// ─── drivers ─────────────────────────────────────────────────────────────────

export const drivers = pgTable('drivers', {
  id: text('id').primaryKey(),
  companyId: text('company_id')
    .notNull()
    .references(() => companies.id)
    .default(DEMO_COMPANY_ID),
  phone: text('phone').notNull().unique(),
  pinHash: text('pin_hash'),
  name: text('name').notNull(),
  status: driverStatusEnum('status').notNull().default('pending'),
  inviteToken: text('invite_token'),
  inviteExpiresAt: timestamp('invite_expires_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export type Driver = typeof drivers.$inferSelect
export type NewDriver = typeof drivers.$inferInsert

// ─── tours ────────────────────────────────────────────────────────────────────

export const tours = pgTable('tours', {
  id: text('id').primaryKey(),
  companyId: text('company_id')
    .notNull()
    .references(() => companies.id)
    .default(DEMO_COMPANY_ID),
  driverId: text('driver_id')
    .notNull()
    .references(() => drivers.id),
  date: text('date').notNull(),
  depotName: text('depot_name').notNull(),
  depotAddress: text('depot_address').notNull(),
  depotLat: numeric('depot_lat', { precision: 10, scale: 7 }).notNull(),
  depotLng: numeric('depot_lng', { precision: 10, scale: 7 }).notNull(),
  optimizationScore: integer('optimization_score').notNull().default(0),
  purchaseOrderId: text('purchase_order_id'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export type Tour = typeof tours.$inferSelect
export type NewTour = typeof tours.$inferInsert

// ─── delivery_points ──────────────────────────────────────────────────────────

export const deliveryPoints = pgTable('delivery_points', {
  id: text('id').primaryKey(),
  tourId: text('tour_id')
    .notNull()
    .references(() => tours.id),
  sequence: integer('sequence').notNull(),
  name: text('name').notNull(),
  address: text('address').notNull(),
  instructions: text('instructions'),
  status: deliveryStatusEnum('status').notNull().default('pending'),
  units: integer('units').notNull(),
  unitType: text('unit_type').notNull().default('palette'),
  weightKg: numeric('weight_kg', { precision: 8, scale: 2 }).notNull().default('0'),
  orderRef: text('order_ref').notNull(),
  distanceFromPrevM: integer('distance_from_prev_m').notNull().default(0),
  timeWindowStart: time('time_window_start'),
  timeWindowEnd: time('time_window_end'),
  estimatedArrival: time('estimated_arrival'),
  lat: numeric('lat', { precision: 10, scale: 7 }).notNull(),
  lng: numeric('lng', { precision: 10, scale: 7 }).notNull(),
  contactPhone: text('contact_phone'),
  /** Point du catalogue `supermarkets` — obligatoire pour les nouvelles tournées. */
  supermarketId: text('supermarket_id'),
  requiredPhotos: integer('required_photos').notNull().default(1),
  receiptId: text('receipt_id'),
  // [{ label: string, qty: number, unit: string }]
  products: jsonb('products'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export type DeliveryPoint = typeof deliveryPoints.$inferSelect
export type NewDeliveryPoint = typeof deliveryPoints.$inferInsert

// ─── sessions ─────────────────────────────────────────────────────────────────

export const sessions = pgTable('sessions', {
  id: text('id').primaryKey(),
  driverId: text('driver_id')
    .notNull()
    .references(() => drivers.id),
  accessToken: text('access_token').notNull(),
  refreshToken: text('refresh_token').notNull().unique(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export type Session = typeof sessions.$inferSelect
export type NewSession = typeof sessions.$inferInsert

// ─── otps ─────────────────────────────────────────────────────────────────────

export const otps = pgTable('otps', {
  deliveryId: text('delivery_id')
    .primaryKey()
    .references(() => deliveryPoints.id),
  code: text('code').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  attempts: integer('attempts').notNull().default(0),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export type Otp = typeof otps.$inferSelect
export type NewOtp = typeof otps.$inferInsert

// ─── declarations ─────────────────────────────────────────────────────────────

export const declarations = pgTable('declarations', {
  deliveryId: text('delivery_id')
    .primaryKey()
    .references(() => deliveryPoints.id),
  outcome: declarationOutcomeEnum('outcome').notNull(),
  lines: jsonb('lines').notNull(),
  declaredAt: timestamp('declared_at').defaultNow().notNull(),
})

export type Declaration = typeof declarations.$inferSelect
export type NewDeclaration = typeof declarations.$inferInsert

// ─── certificates ─────────────────────────────────────────────────────────────

export const certificates = pgTable('certificates', {
  receiptId: text('receipt_id').primaryKey(),
  deliveryId: text('delivery_id')
    .notNull()
    .references(() => deliveryPoints.id),
  certificateUrl: text('certificate_url').notNull(),
  isPartial: boolean('is_partial').notNull().default(false),
  isRejected: boolean('is_rejected').notNull().default(false),
  acceptedPalettes: integer('accepted_palettes'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export type Certificate = typeof certificates.$inferSelect
export type NewCertificate = typeof certificates.$inferInsert

// ─── supermarkets ─────────────────────────────────────────────────────────────

export const supermarkets = pgTable('supermarkets', {
  id: text('id').primaryKey(),
  companyId: text('company_id')
    .notNull()
    .references(() => companies.id)
    .default(DEMO_COMPANY_ID),
  name: text('name').notNull(),
  address: text('address').notNull(),
  contactPhone: text('contact_phone').notNull(),
  contactName: text('contact_name'),
  contactEmail: text('contact_email'),
  lat: numeric('lat', { precision: 10, scale: 7 }),
  lng: numeric('lng', { precision: 10, scale: 7 }),
  active: boolean('active').notNull().default(true),
  /** Chantier : prive | public */
  siteType: text('site_type').notNull().default('prive'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export type Supermarket = typeof supermarkets.$inferSelect
export type NewSupermarket = typeof supermarkets.$inferInsert

// ─── products ─────────────────────────────────────────────────────────────────

export const products = pgTable('products', {
  id: text('id').primaryKey(),
  companyId: text('company_id')
    .notNull()
    .references(() => companies.id)
    .default(DEMO_COMPANY_ID),
  label: text('label').notNull(),
  unit: text('unit').notNull().default('palette'),
  displayOrder: integer('display_order').notNull().default(0),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export type Product = typeof products.$inferSelect
export type NewProduct = typeof products.$inferInsert

// ─── company_units (catalogue unités de mesure par entreprise) ────────────────

export const companyUnits = pgTable(
  'company_units',
  {
    id: text('id').primaryKey(),
    companyId: text('company_id')
      .notNull()
      .references(() => companies.id),
    code: text('code').notNull(),
    label: text('label').notNull(),
    displayOrder: integer('display_order').notNull().default(0),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [uniqueIndex('company_units_company_code_uidx').on(t.companyId, t.code)],
)

export type CompanyUnit = typeof companyUnits.$inferSelect
export type NewCompanyUnit = typeof companyUnits.$inferInsert

// ─── manager_tasks ────────────────────────────────────────────────────────────

export const managerTaskTypeEnum = pgEnum('manager_task_type', [
  'delivery_failed',
  'delivery_partial',
  'delivery_cancelled',
  'delivery_confirmed',
  'missed_delivery',
  'partial_delivery',
  'reassign_tour',
  'otp_manager_assist',
])

export const managerTasks = pgTable('manager_tasks', {
  id: text('id').primaryKey(),
  companyId: text('company_id')
    .notNull()
    .references(() => companies.id)
    .default(DEMO_COMPANY_ID),
  type: managerTaskTypeEnum('type').notNull(),
  deliveryId: text('delivery_id').references(() => deliveryPoints.id),
  title: text('title').notNull(),
  description: text('description').notNull(),
  payload: jsonb('payload'),
  relatedTourId: text('related_tour_id').references(() => tours.id),
  relatedDriverId: text('related_driver_id').references(() => drivers.id),
  resolved: boolean('resolved').notNull().default(false),
  resolvedAt: timestamp('resolved_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export type ManagerTask = typeof managerTasks.$inferSelect
export type NewManagerTask = typeof managerTasks.$inferInsert

// ─── managers ─────────────────────────────────────────────────────────────────

export const managers = pgTable('managers', {
  id: text('id').primaryKey(),
  companyId: text('company_id')
    .notNull()
    .references(() => companies.id)
    .default(DEMO_COMPANY_ID),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  name: text('name').notNull(),
  role: managerRoleEnum('role').notNull().default('manager'),
  procurementRole: procurementRoleEnum('procurement_role'),
  totpSecret: text('totp_secret'),
  totpEnabled: boolean('totp_enabled').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export type Manager = typeof managers.$inferSelect
export type NewManager = typeof managers.$inferInsert
export type ManagerRole = Manager['role']

export const securityAuditEvents = pgTable('security_audit_events', {
  id: text('id').primaryKey(),
  companyId: text('company_id').references(() => companies.id),
  actorType: text('actor_type').notNull(),
  actorId: text('actor_id'),
  action: text('action').notNull(),
  metadata: jsonb('metadata'),
  ip: text('ip'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export type SecurityAuditEvent = typeof securityAuditEvents.$inferSelect

export const managerInvites = pgTable('manager_invites', {
  id: text('id').primaryKey(),
  companyId: text('company_id')
    .notNull()
    .references(() => companies.id),
  email: text('email').notNull(),
  name: text('name').notNull(),
  tokenHash: text('token_hash').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  acceptedAt: timestamp('accepted_at'),
  procurementRole: text('procurement_role'),
  invitedBy: text('invited_by')
    .notNull()
    .references(() => managers.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export type ManagerInvite = typeof managerInvites.$inferSelect
export type NewManagerInvite = typeof managerInvites.$inferInsert

export const managerPasswordResets = pgTable('manager_password_resets', {
  id: text('id').primaryKey(),
  managerId: text('manager_id')
    .notNull()
    .references(() => managers.id),
  tokenHash: text('token_hash').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  usedAt: timestamp('used_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export type ManagerPasswordReset = typeof managerPasswordResets.$inferSelect

// ─── photo_hashes ─────────────────────────────────────────────────────────────

export const photoHashes = pgTable('photo_hashes', {
  hash: text('hash').primaryKey(),
  deliveryId: text('delivery_id')
    .notNull()
    .references(() => deliveryPoints.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export type PhotoHash = typeof photoHashes.$inferSelect
export type NewPhotoHash = typeof photoHashes.$inferInsert

// ─── BTP procurement (Achats-Chantier) ─────────────────────────────────────

export const sites = pgTable('sites', {
  id: text('id').primaryKey(),
  companyId: text('company_id')
    .notNull()
    .references(() => companies.id),
  name: text('name').notNull(),
  address: text('address').notNull(),
  lat: numeric('lat', { precision: 10, scale: 7 }),
  lng: numeric('lng', { precision: 10, scale: 7 }),
  managerId: text('manager_id').references(() => managers.id),
  supervisorManagerId: text('supervisor_manager_id').references(() => managers.id),
  whatsappGroupId: text('whatsapp_group_id'),
  supermarketId: text('supermarket_id').references(() => supermarkets.id),
  budgetInitialFcfa: numeric('budget_initial_fcfa', { precision: 14, scale: 0 }),
  budgetFrozenAt: timestamp('budget_frozen_at'),
  budgetFrozenByManagerId: text('budget_frozen_by_manager_id').references(() => managers.id),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export type Site = typeof sites.$inferSelect
export type NewSite = typeof sites.$inferInsert

export const siteBudgetAmendments = pgTable(
  'site_budget_amendments',
  {
    id: text('id').primaryKey(),
    companyId: text('company_id')
      .notNull()
      .references(() => companies.id),
    siteId: text('site_id')
      .notNull()
      .references(() => sites.id, { onDelete: 'cascade' }),
    reference: text('reference').notNull(),
    status: siteBudgetAmendmentStatusEnum('status').notNull().default('draft'),
    signedAmountFcfa: numeric('signed_amount_fcfa', { precision: 14, scale: 0 }).notNull(),
    reason: text('reason').notNull(),
    createdByManagerId: text('created_by_manager_id')
      .notNull()
      .references(() => managers.id),
    decidedByManagerId: text('decided_by_manager_id').references(() => managers.id),
    decidedAt: timestamp('decided_at'),
    comment: text('comment'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [uniqueIndex('site_budget_amendments_company_ref_uidx').on(t.companyId, t.reference)],
)

export type SiteBudgetAmendment = typeof siteBudgetAmendments.$inferSelect
export type NewSiteBudgetAmendment = typeof siteBudgetAmendments.$inferInsert

export const suppliers = pgTable('suppliers', {
  id: text('id').primaryKey(),
  companyId: text('company_id')
    .notNull()
    .references(() => companies.id),
  name: text('name').notNull(),
  contactName: text('contact_name'),
  contactPhone: text('contact_phone'),
  contactEmail: text('contact_email'),
  hasAccount: boolean('has_account').notNull().default(false),
  address: text('address'),
  depotAddress: text('depot_address'),
  family: text('family'),
  notes: text('notes'),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export type Supplier = typeof suppliers.$inferSelect
export type NewSupplier = typeof suppliers.$inferInsert

export const purchaseRequests = pgTable('purchase_requests', {
  id: text('id').primaryKey(),
  companyId: text('company_id')
    .notNull()
    .references(() => companies.id),
  siteId: text('site_id')
    .notNull()
    .references(() => sites.id),
  reference: text('reference').notNull(),
  status: purchaseRequestStatusEnum('status').notNull().default('submitted'),
  urgency: text('urgency'),
  requestedByPhone: text('requested_by_phone'),
  requestedByName: text('requested_by_name'),
  sourceDraftId: text('source_draft_id'),
  supplierId: text('supplier_id').references(() => suppliers.id),
  totalAmountFcfa: numeric('total_amount_fcfa', { precision: 14, scale: 0 }),
  notes: text('notes'),
  createdByManagerId: text('created_by_manager_id').references(() => managers.id),
  submittedAt: timestamp('submitted_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

export type PurchaseRequest = typeof purchaseRequests.$inferSelect
export type NewPurchaseRequest = typeof purchaseRequests.$inferInsert
export type PurchaseRequestStatus = PurchaseRequest['status']

export const purchaseRequestLines = pgTable('purchase_request_lines', {
  id: text('id').primaryKey(),
  purchaseRequestId: text('purchase_request_id')
    .notNull()
    .references(() => purchaseRequests.id, { onDelete: 'cascade' }),
  label: text('label').notNull(),
  unit: text('unit').notNull(),
  quantity: numeric('quantity', { precision: 12, scale: 3 }).notNull(),
  unitPriceFcfa: numeric('unit_price_fcfa', { precision: 14, scale: 0 }),
  amountFcfa: numeric('amount_fcfa', { precision: 14, scale: 0 }),
  observation: text('observation'),
  supplierName: text('supplier_name'),
  paymentMode: text('payment_mode'),
  attachmentBlobKey: text('attachment_blob_key'),
  attachmentFileName: text('attachment_file_name'),
  attachmentContentType: text('attachment_content_type'),
  spendCategory: text('spend_category').notNull().default('autres_materiaux'),
  displayOrder: integer('display_order').notNull().default(0),
})

export type PurchaseRequestLine = typeof purchaseRequestLines.$inferSelect
export type NewPurchaseRequestLine = typeof purchaseRequestLines.$inferInsert

export const approvalSteps = pgTable('approval_steps', {
  id: text('id').primaryKey(),
  purchaseRequestId: text('purchase_request_id')
    .notNull()
    .references(() => purchaseRequests.id, { onDelete: 'cascade' }),
  role: procurementRoleEnum('role').notNull(),
  managerId: text('manager_id').references(() => managers.id),
  decision: approvalDecisionEnum('decision').notNull(),
  comment: text('comment'),
  ip: text('ip'),
  etape: text('etape'),
  pinVerified: boolean('pin_verified').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export type ApprovalStep = typeof approvalSteps.$inferSelect
export type NewApprovalStep = typeof approvalSteps.$inferInsert

export const purchaseOrders = pgTable('purchase_orders', {
  id: text('id').primaryKey(),
  companyId: text('company_id')
    .notNull()
    .references(() => companies.id),
  purchaseRequestId: text('purchase_request_id')
    .notNull()
    .references(() => purchaseRequests.id),
  supplierId: text('supplier_id')
    .notNull()
    .references(() => suppliers.id),
  reference: text('reference').notNull(),
  docType: purchaseDocTypeEnum('doc_type').notNull().default('bc'),
  templateId: text('template_id').references(() => documentTemplates.id),
  amountFcfa: numeric('amount_fcfa', { precision: 14, scale: 0 }).notNull(),
  pdfHtml: text('pdf_html'),
  tourId: text('tour_id').references(() => tours.id),
  saInvoice: text('sa_invoice'),
  saJustifs: text('sa_justifs'),
  saObservation: text('sa_observation'),
  saVerification: text('sa_verification'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export type PurchaseOrder = typeof purchaseOrders.$inferSelect
export type NewPurchaseOrder = typeof purchaseOrders.$inferInsert

export const treasuryOrders = pgTable('treasury_orders', {
  id: text('id').primaryKey(),
  companyId: text('company_id')
    .notNull()
    .references(() => companies.id),
  purchaseRequestId: text('purchase_request_id')
    .notNull()
    .references(() => purchaseRequests.id),
  reference: text('reference').notNull(),
  amountFcfa: numeric('amount_fcfa', { precision: 14, scale: 0 }).notNull(),
  quotationUrls: jsonb('quotation_urls'),
  pdfHtml: text('pdf_html'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export type TreasuryOrder = typeof treasuryOrders.$inferSelect
export type NewTreasuryOrder = typeof treasuryOrders.$inferInsert

export const documentTemplates = pgTable('document_templates', {
  id: text('id').primaryKey(),
  companyId: text('company_id')
    .notNull()
    .references(() => companies.id),
  docType: purchaseDocTypeEnum('doc_type').notNull(),
  name: text('name').notNull(),
  fields: jsonb('fields'),
  htmlTemplate: text('html_template').notNull(),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export type DocumentTemplate = typeof documentTemplates.$inferSelect
export type NewDocumentTemplate = typeof documentTemplates.$inferInsert

export const whatsappMessages = pgTable('whatsapp_messages', {
  id: text('id').primaryKey(),
  companyId: text('company_id')
    .notNull()
    .references(() => companies.id),
  externalId: text('external_id'),
  fromPhone: text('from_phone').notNull(),
  fromName: text('from_name'),
  messageType: whatsappMessageTypeEnum('message_type').notNull().default('text'),
  bodyText: text('body_text'),
  mediaBlobKey: text('media_blob_key'),
  groupId: text('group_id'),
  rawPayload: jsonb('raw_payload'),
  processedAt: timestamp('processed_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export type WhatsappMessage = typeof whatsappMessages.$inferSelect
export type NewWhatsappMessage = typeof whatsappMessages.$inferInsert

export const purchaseRequestDrafts = pgTable('purchase_request_drafts', {
  id: text('id').primaryKey(),
  companyId: text('company_id')
    .notNull()
    .references(() => companies.id),
  siteId: text('site_id').references(() => sites.id),
  status: purchaseRequestStatusEnum('status').notNull().default('draft_parsed'),
  sourceMessageIds: jsonb('source_message_ids'),
  parsedLines: jsonb('parsed_lines'),
  parsedUrgency: text('parsed_urgency'),
  confidenceScore: numeric('confidence_score', { precision: 5, scale: 2 }),
  needsReview: boolean('needs_review').notNull().default(true),
  purchaseRequestId: text('purchase_request_id').references(() => purchaseRequests.id),
  deletedAt: timestamp('deleted_at'),
  deletedById: text('deleted_by_id').references(() => managers.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

export type PurchaseRequestDraft = typeof purchaseRequestDrafts.$inferSelect
export type NewPurchaseRequestDraft = typeof purchaseRequestDrafts.$inferInsert

export const ebParseRuns = pgTable('eb_parse_runs', {
  id: text('id').primaryKey(),
  draftId: text('draft_id')
    .notNull()
    .references(() => purchaseRequestDrafts.id, { onDelete: 'cascade' }),
  promptVersion: text('prompt_version').notNull(),
  inputSummary: text('input_summary'),
  extractedJson: jsonb('extracted_json'),
  confidenceScore: numeric('confidence_score', { precision: 5, scale: 2 }),
  error: text('error'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export type EbParseRun = typeof ebParseRuns.$inferSelect
// ─── Dossier du jour (RJC — rapport quotidien de chantier) ────────────────────

export const siteReportStatusEnum = pgEnum('site_report_status', ['draft', 'submitted'])

export const siteDailyReports = pgTable(
  'site_daily_reports',
  {
    id: text('id').primaryKey(),
    companyId: text('company_id')
      .notNull()
      .references(() => companies.id),
    siteId: text('site_id')
      .notNull()
      .references(() => sites.id, { onDelete: 'cascade' }),
    reportDate: date('report_date').notNull(),
    authorManagerId: text('author_manager_id').references(() => managers.id),
    status: siteReportStatusEnum('status').notNull().default('draft'),
    globalProgressPct: numeric('global_progress_pct', { precision: 5, scale: 2 }),
    comment: text('comment'),
    submittedAt: timestamp('submitted_at'),
    /** Historique horodaté des soumissions : [{ at, byManagerId, note? }] */
    submissions: jsonb('submissions').notNull().default([]),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [uniqueIndex('site_daily_reports_site_date_uidx').on(t.siteId, t.reportDate)],
)

export type SiteDailyReport = typeof siteDailyReports.$inferSelect
export type NewSiteDailyReport = typeof siteDailyReports.$inferInsert

export const siteDailyTasks = pgTable('site_daily_tasks', {
  id: text('id').primaryKey(),
  reportId: text('report_id')
    .notNull()
    .references(() => siteDailyReports.id, { onDelete: 'cascade' }),
  label: text('label').notNull(),
  done: boolean('done').notNull().default(false),
  doneNote: text('done_note'),
  /** Réserve pour des types prédéfinis (phase 2) : 'coulage', 'maconnerie', … */
  taskType: text('task_type'),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export type SiteDailyTask = typeof siteDailyTasks.$inferSelect
export type NewSiteDailyTask = typeof siteDailyTasks.$inferInsert

export const siteMaterialUsages = pgTable('site_material_usages', {
  id: text('id').primaryKey(),
  companyId: text('company_id')
    .notNull()
    .references(() => companies.id),
  siteId: text('site_id')
    .notNull()
    .references(() => sites.id, { onDelete: 'cascade' }),
  reportId: text('report_id').references(() => siteDailyReports.id, { onDelete: 'cascade' }),
  /** Lien forcé : toute consommation est rattachée à une tâche du jour. */
  taskId: text('task_id')
    .notNull()
    .references(() => siteDailyTasks.id, { onDelete: 'cascade' }),
  usageDate: date('usage_date').notNull(),
  productLabel: text('product_label').notNull(),
  unit: text('unit').notNull(),
  quantity: numeric('quantity', { precision: 12, scale: 3 }).notNull(),
  /** Provenance : si le matériau vient d'un autre chantier (traçabilité). */
  sourceSiteId: text('source_site_id').references(() => sites.id),
  /** Provenance libre (texte) — obligatoire pour un matériau « Autre » non livré. */
  provenance: text('provenance'),
  authorManagerId: text('author_manager_id').references(() => managers.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export type SiteMaterialUsage = typeof siteMaterialUsages.$inferSelect
export type NewSiteMaterialUsage = typeof siteMaterialUsages.$inferInsert

export const siteReportPhotos = pgTable('site_report_photos', {
  id: text('id').primaryKey(),
  reportId: text('report_id')
    .notNull()
    .references(() => siteDailyReports.id, { onDelete: 'cascade' }),
  taskId: text('task_id').references(() => siteDailyTasks.id, { onDelete: 'set null' }),
  /** Clé de stockage (store Blobs ou disque local, même mécanique que les livraisons). */
  photoId: text('photo_id').notNull(),
  size: integer('size'),
  takenAt: timestamp('taken_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export type SiteReportPhoto = typeof siteReportPhotos.$inferSelect
export type NewSiteReportPhoto = typeof siteReportPhotos.$inferInsert

export type ProcurementRole = (typeof procurementRoleEnum.enumValues)[number]
export type NewEbParseRun = typeof ebParseRuns.$inferInsert

export type ParsedEbLine = {
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

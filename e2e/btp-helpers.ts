import { expect, type APIRequestContext, type Page } from '@playwright/test'
import {
  API_BASE,
  ADMIN_API_TOKEN,
  resetAndSeed,
  UI_READY_TIMEOUT,
} from './helpers'

/** Aligné sur server/db/seedBtpPilot.ts (BTP_DEMO) */
export const BTP_PILOT = {
  COMPANY_ID: 'co-btp-pilote',
  SITE_ID: 'site-btp-pilote-1',
  /** Nom du chantier tel qu'il apparaît dans les journaux / exports (T08). */
  SITE_NAME: 'Résidence Cocody — Tour A',
  SUPPLIER_ACCOUNT_ID: 'sup-btp-ciment',
  SUPPLIER_FER_ID: 'sup-btp-fer',
  DRIVER_ID: 'drv-btp-1',
  DRIVER_PHONE: '+2250700998877',
  DRIVER_PIN: '1234',
  DT_EMAIL: 'dt@btp-pilote.ci',
  DAF_EMAIL: 'daf@btp-pilote.ci',
  PDG_EMAIL: 'pdg@btp-pilote.ci',
  SA_EMAIL: 'sa@btp-pilote.ci',
  CDG_EMAIL: 'cdg@btp-pilote.ci',
  CDC_EMAIL: 'cdc@btp-pilote.ci',
  CMPT_EMAIL: 'cmpt@btp-pilote.ci',
  TREASURY_EMAIL: 'tresorerie@btp-pilote.ci',
  PASSWORD: 'admin1234',
  WHATSAPP_PHONE: '+2250701888001',
  EB_MESSAGE: '50 sacs ciment, 20 barres fer pour chantier',
} as const

/** PDF with binary bytes — ASCII-only stubs hide the Netlify utf8/proxy crash. */
export function binaryPdfFixture(): Buffer {
  return Buffer.concat([
    Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nstream\n'),
    Buffer.from([0x00, 0xff, 0xd8, 0xff, 0x80, 0x0a, 0x00]),
    Buffer.from('\nendstream\nendobj\n%%EOF\n'),
  ])
}

function adminHeaders(): Record<string, string> {
  return { 'X-Admin-Token': ADMIN_API_TOKEN }
}

export async function resetAndSeedBtp(request: APIRequestContext): Promise<void> {
  await resetAndSeed(request)
  const res = await request.post(`${API_BASE}/api/v1/admin/seed-btp`, {
    headers: adminHeaders(),
  })
  if (!res.ok()) {
    throw new Error(`seed-btp failed: ${res.status()} — ${await res.text()}`)
  }
}

export type WhatsappSimulateResult = {
  draftId: string
  messageId: string
  lines: Array<{ label: string; quantity: number; unit: string }>
}

export async function simulateWhatsappEb(
  request: APIRequestContext,
  text: string = BTP_PILOT.EB_MESSAGE,
): Promise<WhatsappSimulateResult> {
  const res = await request.post(`${API_BASE}/api/v1/whatsapp/simulate`, {
    headers: adminHeaders(),
    data: {
      companyId: BTP_PILOT.COMPANY_ID,
      fromPhone: BTP_PILOT.WHATSAPP_PHONE,
      text,
      siteId: BTP_PILOT.SITE_ID,
    },
  })
  expect(res.ok(), await res.text()).toBeTruthy()
  const body = (await res.json()) as {
    draftId: string
    messageId: string
    lines: Array<{ label: string; quantity: number; unit: string }>
  }
  expect(body.draftId).toBeTruthy()
  expect(body.lines.length).toBeGreaterThanOrEqual(1)
  return body
}

/** Rôles BTP du seed pilote (`cmpt` = comptable, `tresorerie` = poste Trésorerie). */
export type BtpRole = 'dt' | 'daf' | 'sa' | 'pdg' | 'cdg' | 'cdc' | 'cmpt' | 'tresorerie'

export async function loginBtpApi(
  request: APIRequestContext,
  role: BtpRole,
): Promise<void> {
  const email =
    role === 'dt'
      ? BTP_PILOT.DT_EMAIL
      : role === 'daf'
        ? BTP_PILOT.DAF_EMAIL
        : role === 'pdg'
          ? BTP_PILOT.PDG_EMAIL
          : role === 'cdg'
            ? BTP_PILOT.CDG_EMAIL
            : role === 'cdc'
              ? BTP_PILOT.CDC_EMAIL
              : role === 'cmpt'
                ? BTP_PILOT.CMPT_EMAIL
                : role === 'tresorerie'
                  ? BTP_PILOT.TREASURY_EMAIL
                  : BTP_PILOT.SA_EMAIL
  const login = await request.post(`${API_BASE}/api/v1/auth/login-dashboard`, {
    data: { email, password: BTP_PILOT.PASSWORD },
  })
  expect(login.ok(), await login.text()).toBeTruthy()
}

export type SiteBudgetBody = {
  siteId: string
  siteName: string
  budgetInitialFcfa: number | null
  budgetFrozenAt: string | null
  budgetTotalFcfa: number | null
  engagedFcfa: number
  remainingFcfa: number | null
  overBudget: boolean
  engagementPct?: number | null
  varianceFcfa?: number | null
  variancePct?: number | null
  trafficLight?: 'none' | 'ok' | 'watch' | 'alert'
  missingAmendment?: boolean
  overrunSinceAt?: string | null
  overrunDays?: number | null
  amendments: Array<{
    id: string
    status: string
    signedAmountFcfa: number
    createdByName: string | null
    decidedByName: string | null
  }>
}

export async function getBtpSiteBudget(request: APIRequestContext): Promise<{ status: number; body: SiteBudgetBody }> {
  const res = await request.get(`${API_BASE}/api/v1/procurement/sites/${BTP_PILOT.SITE_ID}/budget`)
  return { status: res.status(), body: (await res.json()) as SiteBudgetBody }
}

export async function freezeBtpBudget(
  request: APIRequestContext,
  amountFcfa: number,
): Promise<{ status: number; body: SiteBudgetBody & { message?: string } }> {
  await loginBtpApi(request, 'cdg')
  const res = await request.post(`${API_BASE}/api/v1/procurement/sites/${BTP_PILOT.SITE_ID}/budget/freeze`, {
    data: { amountFcfa, pin: BTP_PINS.cdg },
  })
  return { status: res.status(), body: (await res.json()) as SiteBudgetBody & { message?: string } }
}

export const BTP_PINS = { dt: '1234', daf: '5678', pdg: '9999', cdg: '2468' } as const

export async function approveBtpRequest(
  request: APIRequestContext,
  requestId: string,
  role: 'daf' | 'pdg' | 'cdg',
): Promise<{ request: { id: string; status: string } }> {
  await loginBtpApi(request, role)
  const res = await request.post(`${API_BASE}/api/v1/procurement/requests/${requestId}/approve`, {
    data: { pin: BTP_PINS[role] },
  })
  expect(res.ok(), await res.text()).toBeTruthy()
  return (await res.json()) as { request: { id: string; status: string } }
}

export async function dtSubmitDraft(
  request: APIRequestContext,
  draftId: string,
): Promise<{ id: string; status: string; reference: string; notifiedRoles?: string[] }> {
  await loginBtpApi(request, 'dt')
  const submit = await request.post(`${API_BASE}/api/v1/procurement/drafts/${draftId}/submit`, {
    data: { pin: '1234', requesterName: 'Chef chantier' },
  })
  expect(submit.ok(), await submit.text()).toBeTruthy()
  const body = (await submit.json()) as {
    request: { id: string; status: string; reference: string }
    notifiedRoles?: string[]
  }
  return { ...body.request, notifiedRoles: body.notifiedRoles }
}

/** CDC (Chef Chantier) soumet un brouillon WhatsApp depuis le terrain → `dt_review` (I110). */
export async function terrainSubmitDraft(
  request: APIRequestContext,
  draftId: string,
): Promise<{ id: string; status: string; reference: string; notifiedRoles?: string[] }> {
  await loginBtpApi(request, 'cdc')
  const submit = await request.post(`${API_BASE}/api/v1/procurement/drafts/${draftId}/submit`, {
    data: { requesterName: 'Chef chantier' },
  })
  expect(submit.ok(), await submit.text()).toBeTruthy()
  const body = (await submit.json()) as {
    request: { id: string; status: string; reference: string }
    notifiedRoles?: string[]
  }
  return { ...body.request, notifiedRoles: body.notifiedRoles }
}

/** DT approuve une EB en cours de revue → `submitted` (matériaux) ou `cdg_review` (hors SA) (I110). */
export async function dtApproveRequest(
  request: APIRequestContext,
  requestId: string,
): Promise<{ request: { id: string; status: string } }> {
  await loginBtpApi(request, 'dt')
  const res = await request.post(`${API_BASE}/api/v1/procurement/requests/${requestId}/approve`, {
    data: { pin: BTP_PINS.dt },
  })
  expect(res.ok(), await res.text()).toBeTruthy()
  return (await res.json()) as { request: { id: string; status: string } }
}

export type SaPriceLine = {
  id: string
  label?: string | null
  supplierName?: string | null
  paymentMode?: string | null
}

export type SaPriceOptions = {
  paymentMode?: string
  supplierForLine?: (line: SaPriceLine, index: number) => string
}

export async function saPriceLines(
  request: APIRequestContext,
  requestId: string,
  unitPriceFcfa: number,
  options: SaPriceOptions = {},
): Promise<SaPriceLine[]> {
  await loginBtpApi(request, 'sa')
  const detailRes = await request.get(`${API_BASE}/api/v1/procurement/requests/${requestId}`)
  expect(detailRes.ok(), await detailRes.text()).toBeTruthy()
  const detail = (await detailRes.json()) as { lines: SaPriceLine[] }
  expect(detail.lines.length).toBeGreaterThanOrEqual(1)
  const pdfB64 = binaryPdfFixture().toString('base64')
  for (const line of detail.lines) {
    const attach = await request.post(
      `${API_BASE}/api/v1/procurement/requests/${requestId}/lines/${line.id}/attachment`,
      { data: { fileName: 'devis.pdf', contentType: 'application/pdf', data: pdfB64 } },
    )
    expect(attach.ok(), await attach.text()).toBeTruthy()
  }
  const pricing = await request.patch(`${API_BASE}/api/v1/procurement/requests/${requestId}/pricing`, {
    data: {
      lines: detail.lines.map((l, i) => ({
        id: l.id,
        unitPriceFcfa,
        supplierName: options.supplierForLine?.(l, i) ?? ((l.supplierName ?? '').trim() || 'CimIvoire Distribution'),
        paymentMode: options.paymentMode ?? ((l.paymentMode ?? '').trim() || 'CREDIT'),
      })),
    },
  })
  expect(pricing.ok(), await pricing.text()).toBeTruthy()
  return detail.lines
}

export async function saPriceAndSubmitFinance(
  request: APIRequestContext,
  requestId: string,
  unitPriceFcfa: number,
  options: SaPriceOptions = {},
): Promise<{
  request: { id: string; status: string }
  finance: { totalAmountFcfa: number; needsPdg: boolean; notifiedRoles: string[] }
}> {
  await saPriceLines(request, requestId, unitPriceFcfa, options)
  const finance = await request.post(`${API_BASE}/api/v1/procurement/requests/${requestId}/submit-finance`, {
    data: {},
  })
  expect(finance.ok(), await finance.text()).toBeTruthy()
  return finance.json() as Promise<{
    request: { id: string; status: string }
    finance: { totalAmountFcfa: number; needsPdg: boolean; notifiedRoles: string[] }
  }>
}

/** SA chiffre + soumet au CdG, puis le CdG approuve → `daf_review`. */
export async function saPriceSubmitCdgApprove(
  request: APIRequestContext,
  requestId: string,
  unitPriceFcfa: number,
  options: SaPriceOptions = {},
): Promise<{
  request: { id: string; status: string }
  finance: { totalAmountFcfa: number; needsPdg: boolean; notifiedRoles: string[] }
}> {
  const quoted = await saPriceAndSubmitFinance(request, requestId, unitPriceFcfa, options)
  expect(quoted.request.status).toBe('cdg_review')
  const cdg = await approveBtpRequest(request, requestId, 'cdg')
  expect(cdg.request.status).toBe('daf_review')
  return { ...quoted, request: cdg.request }
}

/**
 * Après validation CdG (statut `daf_review`) : le DAF approuve puis le SA émet
 * le bon de commande → `po_ready`. C'est CE moment qui crée l'engagement
 * budgétaire (feature #4 : le board Suivi n'affiche que les chantiers engagés).
 */
export async function completePoAfterCdg(
  request: APIRequestContext,
  requestId: string,
): Promise<{ id: string; status: string }> {
  const daf = await approveBtpRequest(request, requestId, 'daf')
  expect(daf.request.status).toBe('sa_review')
  await loginBtpApi(request, 'sa')
  const po = await request.post(`${API_BASE}/api/v1/procurement/requests/${requestId}/create-po`, {
    data: {},
  })
  expect(po.ok(), await po.text()).toBeTruthy()
  const body = (await po.json()) as { request: { id: string; status: string } }
  expect(body.request.status).toBe('po_ready')
  return { id: body.request.id, status: body.request.status }
}

/** EB WhatsApp simulée jusqu'au bon de commande (`po_ready`, site engagé au budget). */
export async function simulateEbToPo(
  request: APIRequestContext,
  unitPriceFcfa: number,
  options: SaPriceOptions = {},
): Promise<{ id: string; status: string }> {
  const simulated = await simulateWhatsappEb(request)
  const submitted = await dtSubmitDraft(request, simulated.draftId)
  const quoted = await saPriceAndSubmitFinance(request, submitted.id, unitPriceFcfa, options)
  expect(quoted.request.status).toBe('cdg_review')
  const cdg = await approveBtpRequest(request, submitted.id, 'cdg')
  expect(cdg.request.status).toBe('daf_review')
  return completePoAfterCdg(request, submitted.id)
}

export async function loginBtpManager(page: Page, role: BtpRole): Promise<void> {
  const email =
    role === 'dt'
      ? BTP_PILOT.DT_EMAIL
      : role === 'daf'
        ? BTP_PILOT.DAF_EMAIL
        : role === 'pdg'
          ? BTP_PILOT.PDG_EMAIL
          : role === 'cdg'
            ? BTP_PILOT.CDG_EMAIL
            : role === 'cdc'
              ? BTP_PILOT.CDC_EMAIL
              : role === 'cmpt'
                ? BTP_PILOT.CMPT_EMAIL
                : role === 'tresorerie'
                  ? BTP_PILOT.TREASURY_EMAIL
                  : BTP_PILOT.SA_EMAIL

  await page.context().clearCookies()
  await page.goto('/manager/login', { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('mgr-login-email')).toBeVisible({ timeout: UI_READY_TIMEOUT })
  await page.getByTestId('mgr-login-email').fill(email)
  await page.getByTestId('mgr-login-password').fill(BTP_PILOT.PASSWORD)
  await page.getByTestId('mgr-login-submit').click()
  await expect(page).toHaveURL(/\/manager(\?|$)/, { timeout: UI_READY_TIMEOUT })
}

export async function openAchatsTab(page: Page): Promise<void> {
  await page.getByTestId('mgr-tab-achats').click()
  await expect(page.getByTestId('mgr-achats-tab')).toBeVisible({ timeout: UI_READY_TIMEOUT })
}

export function localTodayIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export async function confirmScheduledBtpDelivery(
  request: APIRequestContext,
  tourId: string,
): Promise<void> {
  const login = await request.post(`${API_BASE}/api/v1/auth/login-driver`, {
    data: { phone: BTP_PILOT.DRIVER_PHONE, pin: BTP_PILOT.DRIVER_PIN },
  })
  expect(login.ok(), await login.text()).toBeTruthy()
  const { accessToken } = (await login.json()) as { accessToken: string }
  const auth = { Authorization: `Bearer ${accessToken}` }

  const today = await request.get(`${API_BASE}/api/v1/tours/today`, { headers: auth })
  expect(today.ok(), await today.text()).toBeTruthy()
  const tour = (await today.json()) as {
    stops?: Array<{
      id: string
      tourId?: string
      coordinates: { lat: number; lng: number }
      products?: Array<{ label: string; qty: number; unit: string }>
      units: number
      unitType: string
    }>
  }
  const stop = tour.stops?.find((s) => s.tourId === tourId) ?? tour.stops?.[0]
  expect(stop, 'arrêt BTP introuvable pour le livreur').toBeTruthy()
  const lat = stop!.coordinates.lat
  const lng = stop!.coordinates.lng

  const started = await request.post(`${API_BASE}/api/v1/deliveries/${stop!.id}/start`, {
    headers: auth,
    data: { lat, lng },
  })
  expect(started.ok(), await started.text()).toBeTruthy()

  const products =
    stop!.products && stop!.products.length > 0
      ? stop!.products
      : [{ label: 'Produit commandé', qty: stop!.units, unit: stop!.unitType }]
  const declared = await request.post(`${API_BASE}/api/v1/deliveries/${stop!.id}/declare`, {
    headers: auth,
    data: {
      outcome: 'full',
      lines: products.map((p) => ({
        productLabel: p.label,
        unit: p.unit,
        quantityExpected: p.qty,
        quantityAccepted: p.qty,
        quantityRefused: 0,
        justification: 'Réception conforme à la commande',
      })),
    },
  })
  expect(declared.ok(), await declared.text()).toBeTruthy()

  const otpRes = await request.post(`${API_BASE}/api/v1/deliveries/${stop!.id}/send-otp`, {
    headers: auth,
  })
  expect(otpRes.ok(), await otpRes.text()).toBeTruthy()
  const otpBody = (await otpRes.json()) as { devOtpCode?: string }
  const otp = otpBody.devOtpCode ?? '123456'

  const confirmed = await request.post(`${API_BASE}/api/v1/deliveries/${stop!.id}/confirm`, {
    headers: auth,
    data: { otp, lat, lng },
  })
  expect(confirmed.ok(), await confirmed.text()).toBeTruthy()
}

// ── Registre BC : suivi SA (n° facture, transmission) et côté comptable (CMPT) ──

/** Ligne du registre BC telle que renvoyée par `GET /procurement/bc-register`. */
export type BcRegisterRowApi = {
  purchaseOrderId: string
  bon: string
  siteName: string
  supplierName: string
  date: string
  paymentMode: string
  amountFcfa: number
  amountLabel: string
  invoice: string
  invoicePaid: boolean
  invoiceTransmitted: boolean
  invoiceFile: { fileName: string } | null
  observation: string
  verification: string
}

export async function listBcRegisterRows(
  request: APIRequestContext,
  role: BtpRole = 'sa',
): Promise<{ month: string | null; rows: BcRegisterRowApi[] }> {
  await loginBtpApi(request, role)
  const res = await request.get(`${API_BASE}/api/v1/procurement/bc-register`)
  expect(res.ok(), await res.text()).toBeTruthy()
  return (await res.json()) as { month: string | null; rows: BcRegisterRowApi[] }
}

/** Ligne du registre pour un BC donné — échoue si le BC n'est pas (encore) au registre. */
export async function getBcRegisterRow(
  request: APIRequestContext,
  role: BtpRole,
  poId: string,
): Promise<BcRegisterRowApi> {
  const { month, rows } = await listBcRegisterRows(request, role)
  const row = rows.find((r) => r.purchaseOrderId === poId)
  expect(row, `BC ${poId} absent du registre BC (mois ${month})`).toBeTruthy()
  return row!
}

/** Patch partiel du suivi SA/comptable (n° facture, paiement, transmission…). */
export async function patchBcFollowupApi(
  request: APIRequestContext,
  role: BtpRole,
  poId: string,
  body: Record<string, unknown>,
): Promise<{ status: number }> {
  await loginBtpApi(request, role)
  const res = await request.patch(`${API_BASE}/api/v1/procurement/bc-register/${poId}`, { data: body })
  return { status: res.status() }
}

/** SA : joint la copie de facture (PDF binaire) au BC — `POST bc-register/:poId/invoice-file`. */
export async function attachBcInvoiceApi(
  request: APIRequestContext,
  poId: string,
  fileName = 'facture-sa.pdf',
): Promise<{ status: number }> {
  await loginBtpApi(request, 'sa')
  const res = await request.post(`${API_BASE}/api/v1/procurement/bc-register/${poId}/invoice-file`, {
    data: { fileName, contentType: 'application/pdf', data: binaryPdfFixture().toString('base64') },
  })
  return { status: res.status() }
}

/** SA : n° de facture + copie, puis transmission au comptable (équivalent API du parcours UI). */
export async function transmitBcInvoiceApi(
  request: APIRequestContext,
  poId: string,
  invoiceNumber = 'FAC-E2E-0001',
): Promise<void> {
  const patch = await patchBcFollowupApi(request, 'sa', poId, { invoice: invoiceNumber })
  expect(patch.status, `patch n° facture ${poId}`).toBe(200)
  const attach = await attachBcInvoiceApi(request, poId, `${invoiceNumber}.pdf`)
  expect(attach.status, `copie facture ${poId}`).toBe(200)
  const transmit = await patchBcFollowupApi(request, 'sa', poId, { invoiceTransmitted: true })
  expect(transmit.status, `transmission ${poId}`).toBe(200)
}

/**
 * Parcours complet EB WhatsApp → BC émis **et livré** : le registre BC ne liste
 * que les bons dont la livraison est confirmée (cf. test I63).
 */
export async function simulateDeliveredBcViaApi(
  request: APIRequestContext,
  unitPriceFcfa = 1500,
): Promise<{ purchaseOrderId: string; bon: string; amountFcfa: number }> {
  const simulated = await simulateWhatsappEb(request)
  const submitted = await dtSubmitDraft(request, simulated.draftId)
  const quoted = await saPriceSubmitCdgApprove(request, submitted.id, unitPriceFcfa)
  expect(quoted.request.status).toBe('daf_review')
  await approveBtpRequest(request, submitted.id, 'daf')

  await loginBtpApi(request, 'sa')
  const po = await request.post(`${API_BASE}/api/v1/procurement/requests/${submitted.id}/create-po`, {
    data: { supplierId: BTP_PILOT.SUPPLIER_ACCOUNT_ID },
  })
  expect(po.ok(), await po.text()).toBeTruthy()

  const schedule = await request.post(
    `${API_BASE}/api/v1/procurement/requests/${submitted.id}/schedule-delivery`,
    { data: { driverId: BTP_PILOT.DRIVER_ID, date: localTodayIso() } },
  )
  expect(schedule.ok(), await schedule.text()).toBeTruthy()
  const { tourId } = (await schedule.json()) as { tourId: string }
  await confirmScheduledBtpDelivery(request, tourId)

  const { rows } = await listBcRegisterRows(request, 'sa')
  expect(rows.length, 'registre BC vide après livraison confirmée').toBeGreaterThanOrEqual(1)
  const row = rows[0]!
  return { purchaseOrderId: row.purchaseOrderId, bon: row.bon, amountFcfa: row.amountFcfa }
}

// ─── F02 lot B — circuit hors SA (EB main-d'œuvre → BT → déboursé) ───────────

/**
 * Crée une EB **hors SA** (lignes de main-d'œuvre uniquement), chiffrée par le
 * DT à la saisie, et la soumet.
 *
 * Le DT part d'une fiche vierge, saisit une ligne en famille `main_oeuvre`
 * (donc hors SA — cf. `shared/chargeFlow.ts`) avec son PU, puis soumet.
 * Depuis I110, l'EB part **directement en `cdg_review`** (le SA n'est plus un
 * gicrot) ; après approbation CdG puis DAF, elle bifurque vers le BT
 * (décision CdG 16/10/2026).
 */
export async function createHorsSaEbViaApi(
  request: APIRequestContext,
  options: { label?: string; quantity?: number; unitPrice?: number; spendCategory?: string } = {},
): Promise<{ id: string; status: string; reference: string }> {
  await loginBtpApi(request, 'dt')
  const blank = await request.post(`${API_BASE}/api/v1/procurement/drafts/blank`, {
    data: { siteId: BTP_PILOT.SITE_ID },
  })
  expect(blank.ok(), await blank.text()).toBeTruthy()
  const { draftId } = (await blank.json()) as { draftId: string }

  const patch = await request.patch(`${API_BASE}/api/v1/procurement/drafts/${draftId}`, {
    data: {
      siteId: BTP_PILOT.SITE_ID,
      parsedLines: [
        {
          label: options.label ?? "Main d'œuvre carrelage",
          quantity: options.quantity ?? 10,
          unit: 'jour',
          unitPrice: options.unitPrice ?? 25_000,
          spendCategory: options.spendCategory ?? 'mo_carrelage',
        },
      ],
    },
  })
  expect(patch.ok(), await patch.text()).toBeTruthy()

  return dtSubmitDraft(request, draftId)
}

export type TreasuryQueueItemApi = {
  treasuryId: string
  reference: string
  amountFcfa: number
  requestId: string
  requestReference: string
  requestStatus: string
}

/** File du poste Trésorerie (`GET /procurement/treasury`). */
export async function fetchTreasuryQueueApi(
  request: APIRequestContext,
  role: BtpRole = 'tresorerie',
): Promise<TreasuryQueueItemApi[]> {
  await loginBtpApi(request, role)
  const res = await request.get(`${API_BASE}/api/v1/procurement/treasury`)
  expect(res.ok(), await res.text()).toBeTruthy()
  const body = (await res.json()) as { items?: TreasuryQueueItemApi[] }
  return body.items ?? []
}

/**
 * Débourse un BT. `withInvoice: false` sert à prouver l'invariant **I103** :
 * le serveur doit **refuser** (400) un déboursé sans facture.
 */
export async function disburseTreasuryApi(
  request: APIRequestContext,
  treasuryId: string,
  options: { withInvoice?: boolean; amountFcfa?: number; method?: string } = {},
): Promise<{ status: number }> {
  await loginBtpApi(request, 'tresorerie')
  const data: Record<string, unknown> = {
    method: options.method ?? 'orange_money',
    transactionReference: 'OM-E2E-0001',
  }
  if (options.amountFcfa != null) data.amountFcfa = options.amountFcfa
  if (options.withInvoice !== false) {
    data.fileName = 'recu-om.pdf'
    data.contentType = 'application/pdf'
    data.data = binaryPdfFixture().toString('base64')
  }
  const res = await request.post(`${API_BASE}/api/v1/procurement/treasury/${treasuryId}/disburse`, {
    data,
  })
  return { status: res.status() }
}

export type RequestDisbursementApi = {
  treasuryId: string
  treasuryReference: string
  amountFcfa: number
  method: string
  transactionReference: string | null
  hasInvoice: boolean
}

/** Déboursés d'une EB — la facture reste consultable depuis l'EB. */
export async function fetchRequestDisbursementsApi(
  request: APIRequestContext,
  requestId: string,
  role: BtpRole = 'cdg',
): Promise<RequestDisbursementApi[]> {
  await loginBtpApi(request, role)
  const res = await request.get(`${API_BASE}/api/v1/procurement/requests/${requestId}/disbursements`)
  expect(res.ok(), await res.text()).toBeTruthy()
  const body = (await res.json()) as { items?: RequestDisbursementApi[] }
  return body.items ?? []
}

// ─── F03 — budget vs réalisé par famille ─────────────────────────────────────

export type BudgetAllocationApi = { family: string; amountFcfa: number }

export type FamilyVarianceApi = {
  rows: Array<{
    family: string
    label: string
    allocatedFcfa: number
    realizedFcfa: number
    varianceFcfa: number
    consumedPct: number | null
    overrun: boolean
    trafficLight: string
  }>
  allocatedFcfa: number
  realizedFcfa: number
  varianceFcfa: number
  unallocatedFcfa: number | null
  allocationOverBudget: boolean
  overrunFamilies: string[]
}

/**
 * Ventile l'enveloppe d'un chantier (F03). Réservé au **CdG** : passer un autre
 * rôle sert à vérifier le refus (403).
 */
export async function putBudgetAllocationsApi(
  request: APIRequestContext,
  siteId: string,
  allocations: BudgetAllocationApi[],
  role: BtpRole = 'cdg',
): Promise<{
  status: number
  body: { allocations: BudgetAllocationApi[]; familyVariance: FamilyVarianceApi | null } | null
}> {
  await loginBtpApi(request, role)
  const res = await request.put(
    `${API_BASE}/api/v1/procurement/sites/${siteId}/budget/allocations`,
    { data: { allocations } },
  )
  if (!res.ok()) return { status: res.status(), body: null }
  return {
    status: res.status(),
    body: (await res.json()) as {
      allocations: BudgetAllocationApi[]
      familyVariance: FamilyVarianceApi | null
    },
  }
}

/** Ventilation enregistrée pour un chantier. */
export async function getBudgetAllocationsApi(
  request: APIRequestContext,
  siteId: string,
  role: BtpRole = 'cdg',
): Promise<{ allocations: BudgetAllocationApi[] }> {
  await loginBtpApi(request, role)
  const res = await request.get(`${API_BASE}/api/v1/procurement/sites/${siteId}/budget/allocations`)
  expect(res.ok(), await res.text()).toBeTruthy()
  return (await res.json()) as { allocations: BudgetAllocationApi[] }
}

/** Indicateurs d'un chantier — porte le réalisé et l'écart par famille (F03). */
export async function getBtpSiteIndicatorsApi(
  request: APIRequestContext,
  siteId: string,
  role: BtpRole = 'cdg',
  skipLogin = false,
): Promise<{ realizedFcfa: number; familyVariance?: FamilyVarianceApi }> {
  if (!skipLogin) await loginBtpApi(request, role)
  const res = await request.get(`${API_BASE}/api/v1/procurement/sites/${siteId}/indicators`)
  expect(res.ok(), await res.text()).toBeTruthy()
  return (await res.json()) as { realizedFcfa: number; familyVariance?: FamilyVarianceApi }
}

// ─── T08 — rejeu de l'historique du CdG ──────────────────────────────────────

/** En-tête réel du journal `DG CI ENERGIE` (v1 du 16/10/2026). */
export const CDG_JOURNAL_HEADER = [
  'Nom Chantier',
  'Nom fournisseur',
  'Nature de dépense',
  'No BC',
  'No Facture ou BL',
  'Date',
  'Designation',
  'Qte',
  'PU',
  'Montant',
]

/**
 * Une ligne du journal du CdG (colonnes A → J).
 * `noBc` non vide ⇒ la ligne est **exclue** du rejeu (invariant I100).
 */
export function cdgJournalRow(input: {
  site: string
  nature: string
  date: string
  label: string
  amountFcfa: number
  noBc?: string
  supplier?: string
}): unknown[] {
  return [
    input.site,
    input.supplier ?? 'FOURNISSEUR TEST',
    input.nature,
    input.noBc ?? '',
    'F-000',
    input.date,
    input.label,
    1,
    1,
    input.amountFcfa,
  ]
}

export type JournalPreviewApi = {
  parsedLines: number
  rejected: Array<{ row: number; reason: string }>
  totalFcfa: number
  excluded: { lines: number; fcfa: number }
  toImport: { lines: number; fcfa: number }
  unmappedBcReferences: string[]
  matchRatePct: number
  sites: Array<{
    journalName: string
    siteId: string | null
    siteName: string | null
    lines: number
    fcfa: number
  }>
  /** Lignes qu'aucun chantier n'absorbe — le CdG doit désigner la cible. */
  unassigned: { lines: number; fcfa: number }
  byNature: Array<{ nature: string; label: string; family: string; lines: number; fcfa: number }>
}

/**
 * Aperçu du rapprochement journal ↔ TraceO (I106) — **n'écrit rien**.
 * Réservé au **CdG** : passer un autre rôle sert à vérifier le refus (403).
 *
 * `skipLogin` réutilise la session déjà établie sur ce contexte : les helpers
 * T08 s'enchaînent en moins d'une seconde, et re-logger à chacun déclenche
 * le garde anti-brute-force de `/auth/login-dashboard` (~15 min de blocage).
 */
export async function previewCdgJournalApi(
  request: APIRequestContext,
  rows: unknown[][],
  options: { role?: BtpRole; siteId?: string; skipLogin?: boolean } = {},
): Promise<{ status: number; body: JournalPreviewApi | null }> {
  if (!options.skipLogin) await loginBtpApi(request, options.role ?? 'cdg')
  const res = await request.post(`${API_BASE}/api/v1/procurement/historical-expenses/preview`, {
    data: { rows, siteId: options.siteId },
  })
  if (!res.ok()) return { status: res.status(), body: null }
  return { status: res.status(), body: (await res.json()) as JournalPreviewApi }
}

export type HistoricalImportApi = {
  batchId: string
  imported: number
  skipped: number
  importedFcfa: number
  unassignedSites: string[]
  totalFcfa: number
  excluded: { lines: number; fcfa: number }
  rejected: Array<{ row: number; reason: string }>
  matchRatePct: number
}

/**
 * Rejeu effectif du journal — **seules** les lignes hors BC sont écrites (I100).
 * Idempotent (I99). Réservé au **CdG** (403 pour les autres rôles).
 *
 * `skipLogin` : voir `previewCdgJournalApi` — re-logger à chaque appel déclenche
 * le rate limit de `/auth/login-dashboard`.
 */
export async function importCdgJournalApi(
  request: APIRequestContext,
  rows: unknown[][],
  options: { role?: BtpRole; siteId?: string; skipLogin?: boolean } = {},
): Promise<{ status: number; body: HistoricalImportApi | null }> {
  if (!options.skipLogin) await loginBtpApi(request, options.role ?? 'cdg')
  const res = await request.post(`${API_BASE}/api/v1/procurement/historical-expenses/import`, {
    data: { rows, siteId: options.siteId },
  })
  if (!res.ok()) return { status: res.status(), body: null }
  return { status: res.status(), body: (await res.json()) as HistoricalImportApi }
}

export type HistoricalExpensesApi = {
  batches: Array<{
    batchId: string
    source: string
    lines: number
    amountFcfa: number
    importedAt: string
  }>
  lines: Array<{
    id: string
    siteId: string | null
    occurredOn: string
    label: string
    nature: string
    amountFcfa: number
    batchId: string
  }>
}

/** Lots déjà rejoués + dernières lignes historiques (lecture seule). */
export async function fetchHistoricalExpensesApi(
  request: APIRequestContext,
  role: BtpRole = 'cdg',
): Promise<HistoricalExpensesApi> {
  await loginBtpApi(request, role)
  const res = await request.get(`${API_BASE}/api/v1/procurement/historical-expenses`)
  expect(res.ok(), await res.text()).toBeTruthy()
  return (await res.json()) as HistoricalExpensesApi
}

/** Annule un lot de rejeu (action **CdG**) — le rejeu est **réversible**. */
export async function deleteHistoricalBatchApi(
  request: APIRequestContext,
  batchId: string,
  options: { role?: BtpRole; skipLogin?: boolean } = {},
): Promise<{ status: number; deleted: number }> {
  if (!options.skipLogin) await loginBtpApi(request, options.role ?? 'cdg')
  const res = await request.delete(
    `${API_BASE}/api/v1/procurement/historical-expenses/${encodeURIComponent(batchId)}`,
  )
  if (!res.ok()) return { status: res.status(), deleted: 0 }
  const body = (await res.json()) as { deleted: number }
  return { status: res.status(), deleted: body.deleted }
}

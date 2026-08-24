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

export async function loginBtpApi(
  request: APIRequestContext,
  role: 'dt' | 'daf' | 'sa' | 'pdg' | 'cdg',
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
): Promise<{ request: { status: string } }> {
  await loginBtpApi(request, role)
  const res = await request.post(`${API_BASE}/api/v1/procurement/requests/${requestId}/approve`, {
    data: { pin: BTP_PINS[role] },
  })
  expect(res.ok(), await res.text()).toBeTruthy()
  return (await res.json()) as { request: { status: string } }
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

export async function loginBtpManager(page: Page, role: 'dt' | 'daf' | 'sa' | 'pdg' | 'cdg'): Promise<void> {
  const email =
    role === 'dt'
      ? BTP_PILOT.DT_EMAIL
      : role === 'daf'
        ? BTP_PILOT.DAF_EMAIL
        : role === 'pdg'
          ? BTP_PILOT.PDG_EMAIL
          : role === 'cdg'
            ? BTP_PILOT.CDG_EMAIL
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

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
  DRIVER_ID: 'drv-btp-1',
  DT_EMAIL: 'dt@btp-pilote.ci',
  DAF_EMAIL: 'daf@btp-pilote.ci',
  PDG_EMAIL: 'pdg@btp-pilote.ci',
  SA_EMAIL: 'sa@btp-pilote.ci',
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
  role: 'dt' | 'daf' | 'sa' | 'pdg',
): Promise<void> {
  const email =
    role === 'dt'
      ? BTP_PILOT.DT_EMAIL
      : role === 'daf'
        ? BTP_PILOT.DAF_EMAIL
        : role === 'pdg'
          ? BTP_PILOT.PDG_EMAIL
          : BTP_PILOT.SA_EMAIL
  const login = await request.post(`${API_BASE}/api/v1/auth/login-dashboard`, {
    data: { email, password: BTP_PILOT.PASSWORD },
  })
  expect(login.ok(), await login.text()).toBeTruthy()
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

export async function saPriceAndSubmitFinance(
  request: APIRequestContext,
  requestId: string,
  unitPriceFcfa: number,
): Promise<{
  request: { id: string; status: string }
  finance: { totalAmountFcfa: number; needsPdg: boolean; notifiedRoles: string[] }
}> {
  await loginBtpApi(request, 'sa')
  const detailRes = await request.get(`${API_BASE}/api/v1/procurement/requests/${requestId}`)
  expect(detailRes.ok(), await detailRes.text()).toBeTruthy()
  const detail = (await detailRes.json()) as {
    lines: Array<{ id: string; supplierName?: string | null; paymentMode?: string | null }>
  }
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
      lines: detail.lines.map((l) => ({
        id: l.id,
        unitPriceFcfa,
        supplierName: (l.supplierName ?? '').trim() || 'CimIvoire Distribution',
        paymentMode: (l.paymentMode ?? '').trim() || 'CREDIT',
      })),
    },
  })
  expect(pricing.ok(), await pricing.text()).toBeTruthy()
  const finance = await request.post(`${API_BASE}/api/v1/procurement/requests/${requestId}/submit-finance`, {
    data: {},
  })
  expect(finance.ok(), await finance.text()).toBeTruthy()
  return finance.json() as Promise<{
    request: { id: string; status: string }
    finance: { totalAmountFcfa: number; needsPdg: boolean; notifiedRoles: string[] }
  }>
}

export async function loginBtpManager(page: Page, role: 'dt' | 'daf' | 'sa'): Promise<void> {
  const email =
    role === 'dt' ? BTP_PILOT.DT_EMAIL : role === 'daf' ? BTP_PILOT.DAF_EMAIL : BTP_PILOT.SA_EMAIL

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

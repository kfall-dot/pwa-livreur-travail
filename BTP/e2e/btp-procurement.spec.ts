import { test, expect } from '@playwright/test'
import {
  API_BASE,
  UI_READY_TIMEOUT,
} from './helpers'
import {
  BTP_PILOT,
  binaryPdfFixture,
  dtSubmitDraft,
  loginBtpApi,
  loginBtpManager,
  openAchatsTab,
  resetAndSeedBtp,
  saPriceAndSubmitFinance,
  simulateWhatsappEb,
} from './btp-helpers'

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

test.describe('Achats chantier BTP (procurement)', () => {
  test.describe.configure({ mode: 'serial' })

  let draftId = ''
  let requestId = ''

  test.beforeEach(async ({ request }) => {
    await resetAndSeedBtp(request)
  })

  test('login DT + alias manager@demo.fr (I40)', async ({ request }) => {
    const dt = await request.post(`${API_BASE}/api/v1/auth/login-dashboard`, {
      data: { email: BTP_PILOT.DT_EMAIL, password: BTP_PILOT.PASSWORD },
    })
    expect(dt.ok(), await dt.text()).toBeTruthy()
    const dtBody = (await dt.json()) as { manager: { procurementRole?: string | null } }
    expect(dtBody.manager.procurementRole).toBe('technical_director')

    const demo = await request.post(`${API_BASE}/api/v1/auth/login-dashboard`, {
      data: { email: 'manager@demo.fr', password: BTP_PILOT.PASSWORD },
    })
    expect(demo.ok(), await demo.text()).toBeTruthy()
  })

  test('whatsapp simulate — crée un brouillon EB parsé', async ({ request }) => {
    const result = await simulateWhatsappEb(request)
    draftId = result.draftId

    expect(result.lines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: expect.stringMatching(/ciment/i), quantity: 50, unit: 'sacs' }),
        expect.objectContaining({ label: expect.stringMatching(/fer/i), quantity: 20, unit: 'barres' }),
      ]),
    )

    const login = await request.post(`${API_BASE}/api/v1/auth/login-dashboard`, {
      data: { email: BTP_PILOT.DT_EMAIL, password: BTP_PILOT.PASSWORD },
    })
    expect(login.ok()).toBeTruthy()

    const drafts = await request.get(`${API_BASE}/api/v1/procurement/drafts`)
    expect(drafts.ok()).toBeTruthy()
    const data = (await drafts.json()) as { drafts: Array<{ id: string }> }
    expect(data.drafts.some((d) => d.id === draftId)).toBe(true)
  })

  test('flux DT → DAF → SA → livraison planifiée', async ({ page, request }) => {
    test.setTimeout(120_000)

    const simulated = await simulateWhatsappEb(request)
    draftId = simulated.draftId

    // ── DT : révision et soumission ─────────────────────────────────────────
    await loginBtpManager(page, 'dt')
    await openAchatsTab(page)

    await expect(page.getByTestId('btp-draft-row').first()).toBeVisible({ timeout: UI_READY_TIMEOUT })
    await page.getByTestId('btp-draft-row').first().click()
    await expect(page.getByTestId('mgr-achats-draft-review')).toBeVisible()

    await page.getByTestId('mgr-achats-draft-requester').fill('Chef chantier')
    await page.getByTestId('mgr-achats-sign-pin').fill('1234')
    await page.getByTestId('btp-draft-submit').click()
    await expect(page.getByText(/^EB-\d/)).toBeVisible({ timeout: 15_000 })

    const requestsRes = await request.get(`${API_BASE}/api/v1/procurement/requests`, {
      headers: { Cookie: (await page.context().cookies()).map((c) => `${c.name}=${c.value}`).join('; ') },
    })
    expect(requestsRes.ok()).toBeTruthy()
    const requestsBody = (await requestsRes.json()) as {
      requests: Array<{ id: string; status: string; reference: string }>
    }
    const submitted = requestsBody.requests.find((r) => r.status === 'submitted')
    expect(submitted).toBeTruthy()
    requestId = submitted!.id

    const quoted = await saPriceAndSubmitFinance(request, requestId, 1000)
    expect(quoted.request.status).toBe('daf_review')
    expect(quoted.finance.needsPdg).toBe(false)
    expect(quoted.finance.notifiedRoles).toEqual(['daf'])

    // ── DAF : approbation ────────────────────────────────────────────────────
    const dafLogin = await request.post(`${API_BASE}/api/v1/auth/login-dashboard`, {
      data: { email: BTP_PILOT.DAF_EMAIL, password: BTP_PILOT.PASSWORD },
    })
    expect(dafLogin.ok()).toBeTruthy()
    const approveRes = await request.post(`${API_BASE}/api/v1/procurement/requests/${requestId}/approve`, {
      data: {},
    })
    expect(approveRes.ok(), await approveRes.text()).toBeTruthy()
    const approveBody = (await approveRes.json()) as { request: { status: string } }
    expect(approveBody.request.status).toBe('sa_review')

    // ── SA : BC fournisseur avec compte → po_ready ───────────────────────────
    await loginBtpManager(page, 'sa')
    await openAchatsTab(page)
    await page.getByTestId('mgr-achats-requests').click()
    await page.getByTestId(`mgr-achats-request-${requestId}`).click()
    await expect(page.getByTestId('mgr-achats-create-po')).toBeVisible({ timeout: UI_READY_TIMEOUT })

    const saCookies = (await page.context().cookies()).map((c) => `${c.name}=${c.value}`).join('; ')
    const createPoRes = await request.post(
      `${API_BASE}/api/v1/procurement/requests/${requestId}/create-po`,
      {
        headers: { Cookie: saCookies },
        data: { supplierId: BTP_PILOT.SUPPLIER_ACCOUNT_ID },
      },
    )
    expect(createPoRes.ok(), await createPoRes.text()).toBeTruthy()

    const detailAfterPo = await request.get(`${API_BASE}/api/v1/procurement/requests/${requestId}`, {
      headers: { Cookie: saCookies },
    })
    expect(detailAfterPo.ok()).toBeTruthy()
    const detailAfterPoBody = (await detailAfterPo.json()) as { request: { status: string } }
    expect(detailAfterPoBody.request.status).toBe('po_ready')

    await page.getByRole('button', { name: '← Retour aux demandes' }).click()
    await expect(page.getByTestId(`mgr-achats-request-${requestId}`)).toBeVisible({ timeout: UI_READY_TIMEOUT })
    await page.getByTestId(`mgr-achats-request-${requestId}`).click()
    await expect(page.getByText(/po_ready|BC-/i)).toBeVisible({ timeout: 15_000 })

    // ── Planification livraison → tournée ────────────────────────────────────
    await expect(page.getByTestId('btp-schedule-delivery')).toBeVisible({ timeout: UI_READY_TIMEOUT })
    await expect(page.getByTestId('mgr-achats-schedule-driver')).toHaveCount(0)
    await expect(page.getByTestId('mgr-achats-schedule-date')).toHaveCount(0)

    const scheduleRes = await request.post(
      `${API_BASE}/api/v1/procurement/requests/${requestId}/schedule-delivery`,
      {
        headers: { Cookie: saCookies },
        data: { driverId: BTP_PILOT.DRIVER_ID, date: todayIso() },
      },
    )
    expect(scheduleRes.ok(), await scheduleRes.text()).toBeTruthy()
    const scheduleBody = (await scheduleRes.json()) as { request: { status: string }; tourId: string }
    expect(scheduleBody.request.status).toBe('delivery_scheduled')
    expect(scheduleBody.tourId).toBeTruthy()

    const toursRes = await request.get(
      `${API_BASE}/api/v1/dashboard/tours?date=${todayIso()}`,
      {
        headers: { Cookie: (await page.context().cookies()).map((c) => `${c.name}=${c.value}`).join('; ') },
      },
    )
    expect(toursRes.ok()).toBeTruthy()
    const toursBody = (await toursRes.json()) as { tours: Array<{ id: string; driverId: string }> }
    const btpTour = toursBody.tours.find((t) => t.driverId === BTP_PILOT.DRIVER_ID)
    expect(btpTour).toBeTruthy()
  })

  test('document BC HTML accessible', async ({ request }) => {
    const simulated = await simulateWhatsappEb(request)
    draftId = simulated.draftId

    const dtLogin = await request.post(`${API_BASE}/api/v1/auth/login-dashboard`, {
      data: { email: BTP_PILOT.DT_EMAIL, password: BTP_PILOT.PASSWORD },
    })
    expect(dtLogin.ok()).toBeTruthy()

    const submit = await request.post(`${API_BASE}/api/v1/procurement/drafts/${draftId}/submit`, {
      data: { pin: '1234', requesterName: 'Chef chantier' },
    })
    expect(submit.ok(), await submit.text()).toBeTruthy()
    const submitBody = (await submit.json()) as { request: { id: string } }
    requestId = submitBody.request.id
    expect(submitBody.request).toMatchObject({ status: 'submitted' })

    await saPriceAndSubmitFinance(request, requestId, 1000)

    const dafLogin = await request.post(`${API_BASE}/api/v1/auth/login-dashboard`, {
      data: { email: BTP_PILOT.DAF_EMAIL, password: BTP_PILOT.PASSWORD },
    })
    expect(dafLogin.ok()).toBeTruthy()

    const approve = await request.post(`${API_BASE}/api/v1/procurement/requests/${requestId}/approve`, {
      data: {},
    })
    expect(approve.ok(), await approve.text()).toBeTruthy()

    const saLogin = await request.post(`${API_BASE}/api/v1/auth/login-dashboard`, {
      data: { email: BTP_PILOT.SA_EMAIL, password: BTP_PILOT.PASSWORD },
    })
    expect(saLogin.ok()).toBeTruthy()

    const createPo = await request.post(`${API_BASE}/api/v1/procurement/requests/${requestId}/create-po`, {
      data: { supplierId: BTP_PILOT.SUPPLIER_ACCOUNT_ID },
    })
    expect(createPo.ok(), await createPo.text()).toBeTruthy()
    const poBody = (await createPo.json()) as { purchaseOrder: { id: string } }
    const purchaseOrderId = poBody.purchaseOrder.id

    const doc = await request.get(`${API_BASE}/api/v1/procurement/documents/${purchaseOrderId}/html`)
    expect(doc.ok(), await doc.text()).toBeTruthy()
    const html = await doc.text()
    expect(html).toMatch(/BON DE COMMANDE|Bon de commande/i)
    expect(html).toMatch(/Quantité/i)
    expect(html).toMatch(/Prix unitaire/i)
    expect(html).toMatch(/TOTAL TTC/i)
    expect(html).not.toMatch(/<script/i)
  })

  test('collage WhatsApp DT — brouillon multi-lignes (I37)', async ({ page }) => {
    test.setTimeout(90_000)

    await loginBtpManager(page, 'dt')
    await openAchatsTab(page)

    await expect(page.getByTestId('mgr-achats-paste')).toBeVisible({ timeout: UI_READY_TIMEOUT })
    await page.getByTestId('mgr-achats-paste-text').fill(BTP_PILOT.EB_MESSAGE)
    await page.getByTestId('mgr-achats-paste-submit').click()

    await expect(page.getByTestId('mgr-achats-draft-review')).toBeVisible({ timeout: UI_READY_TIMEOUT })
    await expect(page.getByTestId('mgr-achats-eb-fiche')).toBeVisible()
    await expect(page.getByText('EXPRESSION DU BESOIN')).toBeVisible()
    await expect(page.getByTestId('mgr-achats-line-label-0')).toHaveValue(/ciment/i)
    await expect(page.getByTestId('mgr-achats-line-qty-0')).toHaveValue('50')
    await expect(page.getByTestId('mgr-achats-line-label-1')).toHaveValue(/fer/i)
    await expect(page.getByTestId('mgr-achats-line-qty-1')).toHaveValue('20')
    await expect(page.getByText(BTP_PILOT.EB_MESSAGE)).toBeVisible()
  })

  test('SA ne voit pas les brouillons non soumis (I38)', async ({ request }) => {
    const simulated = await simulateWhatsappEb(request)
    await loginBtpApi(request, 'sa')

    const drafts = await request.get(`${API_BASE}/api/v1/procurement/drafts`)
    expect(drafts.ok()).toBeTruthy()
    const draftsBody = (await drafts.json()) as { drafts: Array<{ id: string }> }
    expect(draftsBody.drafts.some((d) => d.id === simulated.draftId)).toBe(false)

    const paste = await request.post(`${API_BASE}/api/v1/procurement/drafts/from-paste`, {
      data: { bodyText: '12 tonnes sable', siteId: BTP_PILOT.SITE_ID },
    })
    expect(paste.status()).toBe(403)
  })

  test('WhatsApp informel — 3 lignes, fer 8/14, chantier Cocody (I41)', async ({ request }) => {
    const result = await simulateWhatsappEb(
      request,
      'Chef, il nous faut 50 sacs de ciment, 4 bottes de fer 8/14 et une tonne de gravier pour Cocody demain matin',
    )
    expect(result.lines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: expect.stringMatching(/ciment/i), quantity: 50, unit: 'sacs' }),
        expect.objectContaining({
          label: expect.stringMatching(/fer\s*8\s*\/\s*14/i),
          quantity: 4,
          unit: 'bottes',
        }),
        expect.objectContaining({ label: expect.stringMatching(/gravier/i), quantity: 1, unit: 'tonne' }),
      ]),
    )
  })

  test('fiche EB HTML calquée sur FICHE DE BESOIN ACHAT (I42)', async ({ request }) => {
    const result = await simulateWhatsappEb(request)
    const login = await request.post(`${API_BASE}/api/v1/auth/login-dashboard`, {
      data: { email: BTP_PILOT.DT_EMAIL, password: BTP_PILOT.PASSWORD },
    })
    expect(login.ok()).toBeTruthy()

    const fiche = await request.get(`${API_BASE}/api/v1/procurement/drafts/${result.draftId}/html`)
    expect(fiche.ok(), await fiche.text()).toBeTruthy()
    const html = await fiche.text()
    expect(html).toMatch(/EXPRESSION DU BESOIN/)
    expect(html).toMatch(/Désignations/)
    expect(html).toMatch(/Unité/)
    expect(html).toMatch(/Quantité/)
    expect(html).toMatch(/Prix Unitaire/i)
    expect(html).toMatch(/Montant/)
    expect(html).toMatch(/Fournisseur/)
    expect(html).toMatch(/Mode de paiement/)
    expect(html).toMatch(/Observations/)
    expect(html).toMatch(/SERVICE/)
    expect(html).toMatch(/Direction Technique/)
    expect(html).toMatch(/TRAITE PAR/)
    expect(html).toMatch(/VALIDE PAR/)
    expect(html).toMatch(/Kouamé DT/)
    expect(html).toMatch(/ciment/i)
    expect(html).not.toMatch(/<script/i)
  })

  test('bouton fiche EB vierge ouvre le formulaire officiel (I43)', async ({ page }) => {
    test.setTimeout(90_000)

    await loginBtpManager(page, 'dt')
    await openAchatsTab(page)

    await expect(page.getByTestId('mgr-achats-blank-fiche')).toBeVisible({ timeout: UI_READY_TIMEOUT })
    await page.getByTestId('mgr-achats-blank-fiche').click()

    await expect(page.getByTestId('mgr-achats-draft-review')).toBeVisible({ timeout: UI_READY_TIMEOUT })
    await expect(page.getByTestId('mgr-achats-eb-fiche')).toBeVisible()
    await expect(page.getByText('EXPRESSION DU BESOIN')).toBeVisible()
    await expect(page.getByText('Direction Technique')).toBeVisible()
    await expect(page.getByTestId('mgr-achats-draft-requester')).toHaveValue('')
    await expect(page.getByTestId('mgr-achats-line-label-0')).toHaveValue('')
    await expect(page.getByTestId('mgr-achats-draft-site')).toHaveValue('')
    await expect(page.getByTestId('mgr-achats-parse-hints')).toHaveCount(0)
    await expect(page.getByText(/Chantier (détecté|lu dans)/i)).toHaveCount(0)
    await expect(page.getByTestId('mgr-achats-draft-objet')).toBeEditable()
    await expect(page.getByTestId('mgr-achats-draft-needed-by')).toBeEditable()
    await page.getByTestId('mgr-achats-draft-objet').fill('BESOIN - Coffrage Tour A')
    await page.getByTestId('mgr-achats-draft-needed-by').fill('20/08/2026')
    await expect(page.getByTestId('mgr-achats-draft-validate')).toHaveText(/Enregistrer le brouillon/)
    await expect(page.getByTestId('btp-draft-submit')).toHaveText(/Valider/)
    await expect(page.getByTestId('mgr-achats-signoff')).toBeVisible()
    await expect(page.getByTestId('mgr-achats-treated-by')).toHaveText('—')
    await expect(page.getByTestId('mgr-achats-validated-by')).toHaveText(/Kouamé DT/)
  })

  test('DT et SA — accueil Achats, menus tournées masqués (I39)', async ({ page }) => {
    test.setTimeout(120_000)

    await loginBtpManager(page, 'dt')
    await expect(page).toHaveURL(/tab=achats/)
    await expect(page.getByTestId('mgr-sidebar-role')).toHaveText(/directeur technique/i, {
      timeout: UI_READY_TIMEOUT,
    })
    await expect(page.getByTestId('mgr-achats-tab')).toBeVisible()
    await expect(page.getByTestId('mgr-achats-paste')).toBeVisible()
    await expect(page.getByText('Espace Directeur technique')).toBeVisible()
    await expect(page.getByTestId('mgr-tab-planifier')).toHaveCount(0)
    await expect(page.getByTestId('mgr-tab-catalogue')).toHaveCount(0)
    await expect(page.getByTestId('mgr-tab-taches')).toHaveCount(0)

    await loginBtpManager(page, 'sa')
    await expect(page).toHaveURL(/tab=achats/)
    await expect(page.getByTestId('mgr-sidebar-role')).toHaveText(/achats/i, {
      timeout: UI_READY_TIMEOUT,
    })
    await expect(page.getByTestId('mgr-achats-tab')).toBeVisible()
    await expect(page.getByTestId('mgr-achats-paste')).toHaveCount(0)
    await expect(page.getByTestId('mgr-achats-inbox')).toHaveCount(0)
    await expect(page.getByTestId('mgr-achats-requests')).toBeVisible()
    await expect(page.getByText('Espace Service achats')).toBeVisible()
    await expect(page.getByTestId('mgr-tab-planifier')).toBeVisible()
    await expect(page.getByTestId('mgr-tab-catalogue')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Équipe' })).toBeVisible()
    await expect(page.getByTestId('mgr-tab-taches')).toBeVisible()

    await page.getByTestId('mgr-tab-catalogue').click()
    await expect(page.getByTestId('mgr-tab-points')).toBeVisible({ timeout: UI_READY_TIMEOUT })
    await expect(page.getByTestId('mgr-tab-points')).toHaveText('Chantiers')
    await expect(page.getByTestId('mgr-tab-fournisseurs')).toBeVisible()
    await expect(page.getByText('Résidence Cocody — Tour A')).toBeVisible()
    await expect(page.getByTestId('mgr-tab-unites')).toBeVisible()
    await page.getByTestId('mgr-tab-unites').click()
    await expect(page.getByText('Sac', { exact: true })).toBeVisible({ timeout: UI_READY_TIMEOUT })

    await page.getByRole('button', { name: 'Équipe' }).click()
    await expect(page.getByText('Livreurs enregistrés')).toBeVisible({ timeout: UI_READY_TIMEOUT })
    await expect(page.getByText('Livreur BTP Pilote')).toBeVisible()

    await page.getByTestId('mgr-tab-taches').click()
    await expect(page.getByTestId('mgr-tasks-pending')).toBeVisible({ timeout: UI_READY_TIMEOUT })
    await expect(page.getByText('Tâches gestionnaire')).toBeVisible()
  })

  test('SA chiffre PU×qté puis envoie au DAF si < 500 000 XOF (I44)', async ({ request }) => {
    const simulated = await simulateWhatsappEb(request)
    const submitted = await dtSubmitDraft(request, simulated.draftId)
    expect(submitted.status).toBe('submitted')
    expect(submitted.notifiedRoles).toEqual(['purchasing', 'daf'])

    await loginBtpApi(request, 'daf')
    const dafCopy = await request.get(`${API_BASE}/api/v1/procurement/requests`)
    const dafCopyBody = (await dafCopy.json()) as { requests: Array<{ id: string; status: string }> }
    expect(dafCopyBody.requests.some((r) => r.id === submitted.id && r.status === 'submitted')).toBe(true)

    const dtFiche = await request.get(`${API_BASE}/api/v1/procurement/requests/${submitted.id}/eb-html`)
    const dtHtml = await dtFiche.text()
    expect(dtFiche.ok(), dtHtml).toBeTruthy()
    expect(dtHtml).toMatch(/TRAITE PAR/)
    expect(dtHtml).toMatch(/VALIDE PAR/)
    expect(dtHtml).toMatch(/NOM/)
    expect(dtHtml).toMatch(/SIGNATURE/)
    expect(dtHtml).toMatch(/Kouamé DT/)

    await loginBtpApi(request, 'sa')
    const saDetailRes = await request.get(`${API_BASE}/api/v1/procurement/requests/${submitted.id}`)
    expect(saDetailRes.ok(), await saDetailRes.text()).toBeTruthy()
    const saDetail = (await saDetailRes.json()) as {
      lines: Array<{
        id: string
        attachmentFileName?: string | null
        supplierName?: string | null
        paymentMode?: string | null
      }>
    }
    const lineId = saDetail.lines[0]?.id
    expect(lineId).toBeTruthy()
    const pdf = binaryPdfFixture()
    const pdfB64 = pdf.toString('base64')
    const attach = await request.post(
      `${API_BASE}/api/v1/procurement/requests/${submitted.id}/lines/${lineId}/attachment`,
      { data: { fileName: 'devis.pdf', contentType: 'application/pdf', data: pdfB64 } },
    )
    expect(attach.ok(), await attach.text()).toBeTruthy()
    const attached = (await attach.json()) as { lines: Array<{ attachmentFileName?: string | null }> }
    expect(attached.lines.some((l) => l.attachmentFileName === 'devis.pdf')).toBe(true)
    const fileGet = await request.get(
      `${API_BASE}/api/v1/procurement/requests/${submitted.id}/lines/${lineId}/attachment`,
    )
    expect(fileGet.ok(), await fileGet.text()).toBeTruthy()
    expect(fileGet.headers()['content-type']).toMatch(/pdf/)
    const got = Buffer.from(await fileGet.body())
    expect(got.equals(pdf), `PJ corrompue (${got.length} octets)`).toBe(true)

    const removed = await request.delete(
      `${API_BASE}/api/v1/procurement/requests/${submitted.id}/lines/${lineId}/attachment`,
    )
    expect(removed.ok(), await removed.text()).toBeTruthy()
    const removedBody = (await removed.json()) as { lines: Array<{ attachmentFileName?: string | null }> }
    expect(removedBody.lines.every((l) => !l.attachmentFileName)).toBe(true)

    const commercial = await request.patch(
      `${API_BASE}/api/v1/procurement/requests/${submitted.id}/pricing`,
      {
        data: {
          lines: saDetail.lines.map((l, i) => ({
            id: l.id,
            unitPriceFcfa: 1000,
            supplierName: i === 0 ? 'CimIvoire Distribution' : 'Fer & Acier Abidjan',
            paymentMode: 'CREDIT',
          })),
        },
      },
    )
    expect(commercial.ok(), await commercial.text()).toBeTruthy()
    const commercialBody = (await commercial.json()) as {
      lines: Array<{ supplierName?: string | null; paymentMode?: string | null }>
    }
    expect(commercialBody.lines[0]?.supplierName).toBe('CimIvoire Distribution')
    expect(commercialBody.lines[0]?.paymentMode).toBe('CREDIT')

    const quoted = await saPriceAndSubmitFinance(request, submitted.id, 1000)
    expect(quoted.request.status).toBe('daf_review')
    expect(quoted.finance.needsPdg).toBe(false)
    expect(quoted.finance.notifiedRoles).toEqual(['daf'])
    const expectedTotal = simulated.lines.reduce((s, l) => s + Math.round(1000 * l.quantity), 0)
    expect(quoted.finance.totalAmountFcfa).toBe(expectedTotal)

    const saFiche = await request.get(`${API_BASE}/api/v1/procurement/requests/${submitted.id}/eb-html`)
    expect(saFiche.ok(), await saFiche.text()).toBeTruthy()
    const saHtml = await saFiche.text()
    expect(saHtml).toMatch(/TRAITE PAR/)
    expect(saHtml).toMatch(/VALIDE PAR/)
    expect(saHtml).toMatch(/Mamadou SA/)
    expect(saHtml).toMatch(/Kouamé DT/)
    expect(saHtml).toMatch(/CimIvoire Distribution/)
    expect(saHtml).toMatch(/CREDIT/)

    await loginBtpApi(request, 'daf')
    const dafList = await request.get(`${API_BASE}/api/v1/procurement/requests`)
    const dafBody = (await dafList.json()) as { requests: Array<{ id: string; status: string }> }
    expect(dafBody.requests.some((r) => r.id === submitted.id && r.status === 'daf_review')).toBe(true)
  })

  test('SA joint une PJ depuis le bouton visible (I44)', async ({ page, request }) => {
    test.setTimeout(90_000)
    const simulated = await simulateWhatsappEb(request)
    const submitted = await dtSubmitDraft(request, simulated.draftId)

    await loginBtpManager(page, 'sa')
    await openAchatsTab(page)
    await expect(page.getByTestId(`mgr-achats-request-${submitted.id}`)).toBeVisible({ timeout: UI_READY_TIMEOUT })
    await page.getByTestId(`mgr-achats-request-${submitted.id}`).click()
    await expect(page.getByTestId('mgr-achats-attachments')).toBeVisible({ timeout: UI_READY_TIMEOUT })
    await page.getByTestId('mgr-achats-line-supplier-0').selectOption('CimIvoire Distribution')
    await page.getByTestId('mgr-achats-line-payment-0').selectOption('CREDIT')
    await page.getByTestId('mgr-achats-save-pricing').click()
    await expect(page.getByText(/Lignes enregistrées/)).toBeVisible({ timeout: 15_000 })
    await expect(page.getByTestId('mgr-achats-line-supplier-0')).toHaveValue('CimIvoire Distribution')
    await expect(page.getByTestId('mgr-achats-line-payment-0')).toHaveValue('CREDIT')
    await page.getByTestId('mgr-achats-line-attach-0').setInputFiles({
      name: 'devis.pdf',
      mimeType: 'application/pdf',
      buffer: binaryPdfFixture(),
    })
    await expect(page.getByTestId('mgr-achats-line-attachment-0')).toHaveText(/devis\.pdf/, { timeout: 20_000 })
    await page.getByTestId('mgr-achats-line-attach-remove-0').click()
    await expect(page.getByText(/Pièce jointe retirée/)).toBeVisible({ timeout: 15_000 })
    await expect(page.getByTestId('mgr-achats-line-attachment-0')).toHaveCount(0)
  })

  test('joindre une PJ ne vide pas le montant saisi (I49)', async ({ page, request }) => {
    test.setTimeout(90_000)
    const simulated = await simulateWhatsappEb(request)
    const submitted = await dtSubmitDraft(request, simulated.draftId)

    await loginBtpManager(page, 'sa')
    await openAchatsTab(page)
    await expect(page.getByTestId(`mgr-achats-request-${submitted.id}`)).toBeVisible({ timeout: UI_READY_TIMEOUT })
    await page.getByTestId(`mgr-achats-request-${submitted.id}`).click()
    await expect(page.getByTestId('mgr-achats-line-unit-price-0')).toBeVisible({ timeout: UI_READY_TIMEOUT })

    await page.getByTestId('mgr-achats-line-unit-price-0').fill('1500')
    await page.getByTestId('mgr-achats-line-supplier-0').selectOption('CimIvoire Distribution')
    await page.getByTestId('mgr-achats-line-payment-0').selectOption('CREDIT')
    const amountBefore = await page.getByTestId('mgr-achats-line-amount-0').inputValue()
    expect(Number(amountBefore)).toBeGreaterThan(0)

    await page.getByTestId('mgr-achats-line-attach-0').setInputFiles({
      name: 'devis.pdf',
      mimeType: 'application/pdf',
      buffer: binaryPdfFixture(),
    })
    await expect(page.getByTestId('mgr-achats-line-attachment-0')).toHaveText(/devis\.pdf/, { timeout: 20_000 })
    await expect(page.getByTestId('mgr-achats-line-unit-price-0')).toHaveValue('1500')
    await expect(page.getByTestId('mgr-achats-line-amount-0')).toHaveValue(amountBefore)
    await expect(page.getByTestId('mgr-achats-line-supplier-0')).toHaveValue('CimIvoire Distribution')
    await expect(page.getByTestId('mgr-achats-line-payment-0')).toHaveValue('CREDIT')

    await page.getByTestId('mgr-achats-line-attach-remove-0').click()
    await expect(page.getByText(/Pièce jointe retirée/)).toBeVisible({ timeout: 15_000 })
    await expect(page.getByTestId('mgr-achats-line-unit-price-0')).toHaveValue('1500')
    await expect(page.getByTestId('mgr-achats-line-amount-0')).toHaveValue(amountBefore)
  })

  test('cliquer la PJ ouvre l’aperçu dans la page (I50)', async ({ page, request }) => {
    test.setTimeout(90_000)
    const simulated = await simulateWhatsappEb(request)
    const submitted = await dtSubmitDraft(request, simulated.draftId)

    await loginBtpManager(page, 'sa')
    await openAchatsTab(page)
    await expect(page.getByTestId(`mgr-achats-request-${submitted.id}`)).toBeVisible({ timeout: UI_READY_TIMEOUT })
    await page.getByTestId(`mgr-achats-request-${submitted.id}`).click()
    await expect(page.getByTestId('mgr-achats-attachments')).toBeVisible({ timeout: UI_READY_TIMEOUT })
    await page.getByTestId('mgr-achats-line-attach-0').setInputFiles({
      name: 'devis.pdf',
      mimeType: 'application/pdf',
      buffer: binaryPdfFixture(),
    })
    await expect(page.getByTestId('mgr-achats-line-attachment-0')).toHaveText(/devis\.pdf/, { timeout: 20_000 })
    await page.getByTestId('mgr-achats-line-attachment-0').click()
    await expect(page.getByTestId('mgr-achats-attachment-preview')).toBeVisible({ timeout: 20_000 })
    await expect(page.getByTestId('mgr-achats-attachment-preview-name')).toHaveText(/devis\.pdf/)
    await expect(page.locator('[data-testid="mgr-achats-attachment-preview"] iframe')).toBeVisible()
    await page.getByTestId('mgr-achats-attachment-preview-close').click({ force: true })
    await expect(page.getByTestId('mgr-achats-attachment-preview')).toHaveCount(0)
  })

  test('DAF valide le dossier (prix + PJ) puis SA émet le BC (I51)', async ({ page, request }) => {
    test.setTimeout(180_000)
    const simulated = await simulateWhatsappEb(request)
    const submitted = await dtSubmitDraft(request, simulated.draftId)

    await loginBtpApi(request, 'sa')
    const quoted = await saPriceAndSubmitFinance(request, submitted.id, 1000)
    expect(quoted.request.status).toBe('daf_review')

    await loginBtpManager(page, 'daf')
    await openAchatsTab(page)
    await expect(page.getByText('Espace DAF')).toBeVisible({ timeout: UI_READY_TIMEOUT })
    await expect(page.getByTestId(`mgr-achats-request-${submitted.id}`)).toBeVisible({ timeout: UI_READY_TIMEOUT })
    await page.getByTestId(`mgr-achats-request-${submitted.id}`).click()
    await expect(page.getByTestId('mgr-achats-finance-dossier')).toBeVisible({ timeout: UI_READY_TIMEOUT })
    await expect(page.getByTestId('mgr-achats-line-unit-price-0')).not.toHaveText('—')
    await expect(page.getByTestId('mgr-achats-line-attachment-0')).toHaveText(/devis\.pdf/)
    await page.getByTestId('mgr-achats-line-attachment-0').click()
    await expect(page.getByTestId('mgr-achats-attachment-preview-name')).toHaveText(/devis\.pdf/, { timeout: 20_000 })
    await page.getByTestId('mgr-achats-attachment-preview-close').click({ force: true })
    await expect(page.getByTestId('mgr-achats-attachment-preview')).toHaveCount(0)
    await page.getByTestId('btp-approve-btn').click()
    await expect(page.getByText(/Demande approuvée/)).toBeVisible({ timeout: 15_000 })
    await expect(page.getByTestId('mgr-achats-history')).toContainText(/DAF — Montant approuvé/)

    await loginBtpManager(page, 'sa')
    await openAchatsTab(page)
    await expect(page.getByTestId(`mgr-achats-request-${submitted.id}`)).toBeVisible({ timeout: UI_READY_TIMEOUT })
    await page.getByTestId(`mgr-achats-request-${submitted.id}`).click()
    await expect(page.getByTestId('mgr-achats-create-po-block')).toBeVisible({ timeout: UI_READY_TIMEOUT })
    await expect(page.getByTestId('mgr-achats-supplier')).toHaveValue(BTP_PILOT.SUPPLIER_ACCOUNT_ID)
    await page.getByTestId('mgr-achats-create-po').click()
    await expect(page.getByTestId('mgr-achats-document-link')).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText(/BC-/)).toBeVisible()
  })

  test('montant ≥ 500 000 XOF — copie DAF et PDG (I45)', async ({ request }) => {
    const simulated = await simulateWhatsappEb(request)
    const submitted = await dtSubmitDraft(request, simulated.draftId)
    const quoted = await saPriceAndSubmitFinance(request, submitted.id, 8000)
    expect(quoted.finance.totalAmountFcfa).toBeGreaterThanOrEqual(500_000)
    expect(quoted.finance.needsPdg).toBe(true)
    expect(quoted.finance.notifiedRoles).toEqual(['daf', 'pdg'])
    expect(quoted.request.status).toBe('daf_review')

    await loginBtpApi(request, 'pdg')
    const pdgList = await request.get(`${API_BASE}/api/v1/procurement/requests`)
    const pdgBody = (await pdgList.json()) as { requests: Array<{ id: string }> }
    expect(pdgBody.requests.some((r) => r.id === submitted.id)).toBe(true)
  })

  test('collage WhatsApp corrige simen / gravie (I54)', async ({ page }) => {
    test.setTimeout(90_000)
    await loginBtpManager(page, 'dt')
    await openAchatsTab(page)
    await expect(page.getByTestId('mgr-achats-paste')).toBeVisible({ timeout: UI_READY_TIMEOUT })
    await page.getByTestId('mgr-achats-paste-text').fill('50 sacs simen pour Cocody demain')
    await page.getByTestId('mgr-achats-paste-submit').click()
    await expect(page.getByTestId('mgr-achats-draft-review')).toBeVisible({ timeout: UI_READY_TIMEOUT })
    await expect(page.getByTestId('mgr-achats-line-label-0')).toHaveValue(/ciment/i)
  })

  test('Planifier une tournée ouvre le formulaire prérempli (I52)', async ({ page, request }) => {
    test.setTimeout(180_000)
    const simulated = await simulateWhatsappEb(request)
    const submitted = await dtSubmitDraft(request, simulated.draftId)
    await saPriceAndSubmitFinance(request, submitted.id, 1000)
    await loginBtpApi(request, 'daf')
    const approve = await request.post(`${API_BASE}/api/v1/procurement/requests/${submitted.id}/approve`, { data: {} })
    expect(approve.ok(), await approve.text()).toBeTruthy()
    await loginBtpApi(request, 'sa')
    const createPo = await request.post(`${API_BASE}/api/v1/procurement/requests/${submitted.id}/create-po`, {
      data: { supplierId: BTP_PILOT.SUPPLIER_ACCOUNT_ID },
    })
    expect(createPo.ok(), await createPo.text()).toBeTruthy()

    await loginBtpManager(page, 'sa')
    await openAchatsTab(page)
    await page.getByTestId(`mgr-achats-request-${submitted.id}`).click()
    await expect(page.getByTestId('btp-schedule-delivery')).toBeVisible({ timeout: UI_READY_TIMEOUT })
    await expect(page.getByTestId('mgr-achats-schedule-driver')).toHaveCount(0)
    await expect(page.getByTestId('mgr-achats-schedule-date')).toHaveCount(0)
    await page.getByTestId('btp-schedule-delivery').click()
    await expect(page.getByTestId('mgr-planifier-form-title')).toBeVisible({ timeout: UI_READY_TIMEOUT })
    await expect(page.getByTestId('mgr-create-depot')).toHaveValue(/CimIvoire/i)
    await expect(page.getByTestId('mgr-create-tour')).toBeEnabled()
    await expect(page.getByTestId('mgr-stop-supermarket-0')).toHaveValue('sm-btp-cocody')
  })

  test('tournée BC supprimée → on peut en recréer une (I53)', async ({ page, request }) => {
    test.setTimeout(180_000)
    const simulated = await simulateWhatsappEb(request)
    const submitted = await dtSubmitDraft(request, simulated.draftId)
    await saPriceAndSubmitFinance(request, submitted.id, 1000)
    await loginBtpApi(request, 'daf')
    expect(
      (await request.post(`${API_BASE}/api/v1/procurement/requests/${submitted.id}/approve`, { data: {} })).ok(),
    ).toBeTruthy()
    await loginBtpApi(request, 'sa')
    expect(
      (
        await request.post(`${API_BASE}/api/v1/procurement/requests/${submitted.id}/create-po`, {
          data: { supplierId: BTP_PILOT.SUPPLIER_ACCOUNT_ID },
        })
      ).ok(),
    ).toBeTruthy()

    await loginBtpManager(page, 'sa')
    const saCookies = (await page.context().cookies()).map((c) => `${c.name}=${c.value}`).join('; ')
    const scheduleRes = await request.post(
      `${API_BASE}/api/v1/procurement/requests/${submitted.id}/schedule-delivery`,
      { headers: { Cookie: saCookies }, data: { driverId: BTP_PILOT.DRIVER_ID, date: todayIso() } },
    )
    expect(scheduleRes.ok(), await scheduleRes.text()).toBeTruthy()
    const scheduled = (await scheduleRes.json()) as { request: { status: string }; tourId: string }
    expect(scheduled.request.status).toBe('delivery_scheduled')

    const del = await request.delete(`${API_BASE}/api/v1/dashboard/tours/${scheduled.tourId}`, {
      headers: { Cookie: saCookies },
    })
    expect(del.ok(), await del.text()).toBeTruthy()

    const after = await request.get(`${API_BASE}/api/v1/procurement/requests/${submitted.id}`, {
      headers: { Cookie: saCookies },
    })
    const afterBody = (await after.json()) as { request: { status: string }; purchaseOrder?: { tourId?: string | null } }
    expect(afterBody.request.status).toBe('po_ready')
    expect(afterBody.purchaseOrder?.tourId ?? null).toBeFalsy()

    await openAchatsTab(page)
    await page.getByTestId(`mgr-achats-request-${submitted.id}`).click()
    await expect(page.getByTestId('btp-schedule-delivery')).toBeVisible({ timeout: UI_READY_TIMEOUT })
  })

  test('SA refuse l’envoi DAF sans fournisseur, paiement ou PJ (I55)', async ({ request }) => {
    const simulated = await simulateWhatsappEb(request)
    const submitted = await dtSubmitDraft(request, simulated.draftId)
    await loginBtpApi(request, 'sa')
    const detailRes = await request.get(`${API_BASE}/api/v1/procurement/requests/${submitted.id}`)
    expect(detailRes.ok(), await detailRes.text()).toBeTruthy()
    const detail = (await detailRes.json()) as { lines: Array<{ id: string }> }

    const pricesOnly = await request.patch(`${API_BASE}/api/v1/procurement/requests/${submitted.id}/pricing`, {
      data: { lines: detail.lines.map((l) => ({ id: l.id, unitPriceFcfa: 1000 })) },
    })
    expect(pricesOnly.ok(), await pricesOnly.text()).toBeTruthy()
    const missingCommercial = await request.post(
      `${API_BASE}/api/v1/procurement/requests/${submitted.id}/submit-finance`,
      { data: {} },
    )
    expect(missingCommercial.status()).toBe(400)
    expect(await missingCommercial.text()).toMatch(/Fournisseur|pièce jointe/i)

    const commercial = await request.patch(`${API_BASE}/api/v1/procurement/requests/${submitted.id}/pricing`, {
      data: {
        lines: detail.lines.map((l) => ({
          id: l.id,
          unitPriceFcfa: 1000,
          supplierName: 'CimIvoire Distribution',
          paymentMode: 'CREDIT',
        })),
      },
    })
    expect(commercial.ok(), await commercial.text()).toBeTruthy()
    const missingPj = await request.post(
      `${API_BASE}/api/v1/procurement/requests/${submitted.id}/submit-finance`,
      { data: {} },
    )
    expect(missingPj.status()).toBe(400)
    expect(await missingPj.text()).toMatch(/pièce jointe/i)

    const quoted = await saPriceAndSubmitFinance(request, submitted.id, 1000)
    expect(quoted.request.status).toBe('daf_review')
  })
})

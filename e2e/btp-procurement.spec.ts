import { test, expect } from '@playwright/test'
import {
  API_BASE,
  DEMO_MANAGER,
  UI_READY_TIMEOUT,
} from './helpers'
import {
  BTP_PILOT,
  BTP_PINS,
  binaryPdfFixture,
  completePoAfterCdg,
  confirmScheduledBtpDelivery,
  dtSubmitDraft,
  freezeBtpBudget,
  getBtpSiteBudget,
  localTodayIso,
  loginBtpApi,
  approveBtpRequest,
  loginBtpManager,
  openAchatsTab,
  resetAndSeedBtp,
  saPriceAndSubmitFinance,
  saPriceSubmitCdgApprove,
  saPriceLines,
  simulateEbToPo,
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

    const quoted = await saPriceSubmitCdgApprove(request, requestId, 1000)
    expect(quoted.request.status).toBe('daf_review')
    expect(quoted.finance.needsPdg).toBe(false)
    expect(quoted.finance.notifiedRoles).toEqual(['controle_gestion'])

    // ── DAF : approbation ────────────────────────────────────────────────────
    const approveBody = await approveBtpRequest(request, requestId, 'daf')
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
    await expect(page.getByTestId('mgr-achats-document-link')).toBeVisible({ timeout: 15_000 })

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

    await saPriceSubmitCdgApprove(request, requestId, 1000)

    await approveBtpRequest(request, requestId, 'daf')

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
    await expect(page.getByTestId('mgr-achats-line-category-0')).toHaveValue('ciments')
    await expect(page.getByText(BTP_PILOT.EB_MESSAGE)).toBeVisible()
    await expect(page.getByText('Brouillon introuvable')).toHaveCount(0)
    await page.getByTestId('mgr-achats-draft-validate').click()
    await expect(page.getByTestId('mgr-achats-draft-review')).toBeVisible()
    await expect(page.getByText('Brouillon introuvable')).toHaveCount(0)
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
    test.setTimeout(180_000)

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
    await expect(page.getByTestId('mgr-tab-suivi-bc')).toHaveCount(0)
    await expect(page.getByTestId('mgr-tab-suivi-chantier')).toBeVisible()
    await expect(page.getByTestId('mgr-achats-suivi-chantier')).toHaveCount(0)

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
    await expect(page.getByTestId('mgr-tab-suivi-bc')).toBeVisible()
    await expect(page.getByTestId('mgr-tab-suivi-chantier')).toHaveCount(0)
    await expect(page.getByTestId('mgr-achats-suivi-chantier')).toHaveCount(0)

    await page.getByTestId('mgr-tab-catalogue').click()
    await expect(page.getByTestId('mgr-tab-points')).toBeVisible({ timeout: UI_READY_TIMEOUT })
    await expect(page.getByTestId('mgr-tab-points')).toHaveText('Chantiers')
    await page.getByTestId('mgr-tab-points').click()
    await expect(page.getByTestId('mgr-tab-fournisseurs')).toBeVisible()
    await expect(page.getByText('Résidence Cocody — Tour A')).toBeVisible({ timeout: UI_READY_TIMEOUT })
    await expect(page.getByTestId('mgr-tab-unites')).toBeVisible()
    await page.getByTestId('mgr-tab-unites').click()
    await expect(page.getByText('Sac', { exact: true })).toBeVisible({ timeout: UI_READY_TIMEOUT })
    await expect(page.getByText('Tonne', { exact: true })).toBeVisible()
    await expect(page.getByText('Botte', { exact: true })).toBeVisible()

    await page.getByRole('button', { name: 'Équipe' }).click()
    await expect(page.getByText('Livreurs enregistrés')).toBeVisible({ timeout: UI_READY_TIMEOUT })
    await expect(page.getByText('Livreur BTP Pilote')).toBeVisible()

    await page.getByTestId('mgr-tab-taches').click()
    await expect(page.getByTestId('mgr-tasks-pending')).toBeVisible({ timeout: UI_READY_TIMEOUT })
    await expect(page.getByText('Tâches gestionnaire')).toBeVisible()

    await loginBtpManager(page, 'cdg')
    await expect(page).toHaveURL(/tab=achats/)
    await expect(page.getByTestId('mgr-sidebar-role')).toHaveText(/contrôle de gestion/i, {
      timeout: UI_READY_TIMEOUT,
    })
    await expect(page.getByTestId('mgr-achats-tab')).toBeVisible()
    await expect(page.getByText('Espace Contrôle de gestion')).toBeVisible()
    await expect(page.getByTestId('mgr-tab-suivi-chantier')).toBeVisible()
    await expect(page.getByTestId('mgr-tab-planifier')).toHaveCount(0)
  })

  test('SA chiffre PU×qté puis envoie au CdG si < 500 000 XOF (I44)', async ({ request }) => {
    const simulated = await simulateWhatsappEb(request)
    const submitted = await dtSubmitDraft(request, simulated.draftId)
    expect(submitted.status).toBe('submitted')
    expect(submitted.notifiedRoles).toEqual(['purchasing'])

    await loginBtpApi(request, 'daf')
    const dafCopy = await request.get(`${API_BASE}/api/v1/procurement/requests`)
    const dafCopyBody = (await dafCopy.json()) as { requests: Array<{ id: string; status: string }> }
    expect(dafCopyBody.requests.some((r) => r.id === submitted.id)).toBe(false)

    const dtFiche = await request.get(`${API_BASE}/api/v1/procurement/requests/${submitted.id}/eb-html`)
    const dtHtml = await dtFiche.text()
    expect(dtFiche.ok(), dtHtml).toBeTruthy()
    expect(dtHtml).toMatch(/TRAITE PAR/)
    expect(dtHtml).toMatch(/VALIDE PAR/)
    expect(dtHtml).toMatch(/NOM/)
    expect(dtHtml).toMatch(/SIGNATURE/)
    expect(dtHtml).toMatch(/Kouamé DT/)
    expect(dtHtml).toMatch(/rowspan="4"[^>]*>DAF/)
    expect(dtHtml).not.toMatch(/>PDG/)

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
    expect(quoted.request.status).toBe('cdg_review')
    expect(quoted.finance.needsPdg).toBe(false)
    expect(quoted.finance.notifiedRoles).toEqual(['controle_gestion'])
    const expectedTotal = simulated.lines.reduce((s, l) => s + Math.round(1000 * l.quantity), 0)
    expect(quoted.finance.totalAmountFcfa).toBe(expectedTotal)

    await loginBtpApi(request, 'daf')
    const dafHidden = await request.get(`${API_BASE}/api/v1/procurement/requests`)
    const dafHiddenBody = (await dafHidden.json()) as { requests: Array<{ id: string }> }
    expect(dafHiddenBody.requests.some((r) => r.id === submitted.id)).toBe(false)

    const cdgApproved = await approveBtpRequest(request, submitted.id, 'cdg')
    expect(cdgApproved.request.status).toBe('daf_review')

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
    const quoted = await saPriceSubmitCdgApprove(request, submitted.id, 1000)
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
    await page.getByTestId('mgr-achats-sign-pin').fill('5678')
    await page.getByTestId('btp-approve-btn').click()
    await expect(page.getByText(/Demande approuvée/)).toBeVisible({ timeout: 15_000 })
    await expect(page.getByTestId('mgr-achats-history')).toContainText(/DAF — Montant approuvé/)
    await expect(page.getByTestId('mgr-achats-signoff-daf')).toContainText(/Aya DAF/)
    await expect(page.getByTestId('mgr-achats-signoff-daf')).toContainText(/NIP vérifié/)

    await loginBtpManager(page, 'sa')
    await openAchatsTab(page)
    await expect(page.getByTestId(`mgr-achats-request-${submitted.id}`)).toBeVisible({ timeout: UI_READY_TIMEOUT })
    await page.getByTestId(`mgr-achats-request-${submitted.id}`).click()
    await expect(page.getByTestId('mgr-achats-create-po-block')).toBeVisible({ timeout: UI_READY_TIMEOUT })
    await expect(page.getByTestId('mgr-achats-signoff-daf')).toContainText(/Aya DAF/)
    await expect(page.getByTestId('mgr-achats-signoff-daf')).toContainText(/NIP vérifié/)
    await expect(page.getByTestId('mgr-achats-supplier')).toHaveCount(0)
    await expect(page.getByTestId('mgr-achats-create-po')).toHaveText(/Créer le BC/)
    await page.getByTestId('mgr-achats-create-po').click()
    await expect(page.getByTestId('mgr-achats-document-link')).toBeVisible({ timeout: 20_000 })
    await expect(page.getByTestId('mgr-achats-document-link')).toHaveText(/Voir le document/)
    await expect(page.getByTestId('mgr-achats-po-list')).toContainText(/BC-/)
    await expect(page.getByTestId('mgr-achats-create-po')).toBeDisabled()
  })

  test('CdG valide le chiffrage SA puis transmet au DAF (I73)', async ({ page, request }) => {
    test.setTimeout(180_000)
    const simulated = await simulateWhatsappEb(request)
    const submitted = await dtSubmitDraft(request, simulated.draftId)
    const quoted = await saPriceAndSubmitFinance(request, submitted.id, 1000)
    expect(quoted.request.status).toBe('cdg_review')

    await loginBtpApi(request, 'daf')
    const dafHidden = await request.get(`${API_BASE}/api/v1/procurement/requests`)
    const dafHiddenBody = (await dafHidden.json()) as { requests: Array<{ id: string }> }
    expect(dafHiddenBody.requests.some((r) => r.id === submitted.id)).toBe(false)

    await loginBtpManager(page, 'cdg')
    await expect(page).toHaveURL(/tab=achats/)
    await expect(page.getByText('Espace Contrôle de gestion')).toBeVisible({ timeout: UI_READY_TIMEOUT })
    await openAchatsTab(page)
    await expect(page.getByTestId(`mgr-achats-request-${submitted.id}`)).toBeVisible({ timeout: UI_READY_TIMEOUT })
    await page.getByTestId(`mgr-achats-request-${submitted.id}`).click()
    await expect(page.getByTestId('mgr-achats-finance-dossier')).toBeVisible({ timeout: UI_READY_TIMEOUT })
    await page.getByTestId('mgr-achats-sign-pin').fill(BTP_PINS.cdg)
    await page.getByTestId('btp-approve-btn').click()
    await expect(page.getByText(/Demande approuvée/)).toBeVisible({ timeout: 15_000 })
    await expect(page.getByTestId('mgr-achats-history')).toContainText(/Contrôle de gestion — Approuvé/)

    await loginBtpApi(request, 'daf')
    const dafList = await request.get(`${API_BASE}/api/v1/procurement/requests`)
    const dafBody = (await dafList.json()) as { requests: Array<{ id: string; status: string }> }
    expect(dafBody.requests.some((r) => r.id === submitted.id && r.status === 'daf_review')).toBe(true)
  })

  test('montant ≥ 500 000 XOF — après CdG, copie DAF et PDG (I45)', async ({ page, request }) => {
    test.setTimeout(180_000)
    const simulated = await simulateWhatsappEb(request)
    const submitted = await dtSubmitDraft(request, simulated.draftId)
    const quoted = await saPriceAndSubmitFinance(request, submitted.id, 8000)
    expect(quoted.finance.totalAmountFcfa).toBeGreaterThanOrEqual(500_000)
    expect(quoted.finance.needsPdg).toBe(true)
    expect(quoted.finance.notifiedRoles).toEqual(['controle_gestion'])
    expect(quoted.request.status).toBe('cdg_review')

    await loginBtpApi(request, 'pdg')
    const pdgEarly = await request.get(`${API_BASE}/api/v1/procurement/requests`)
    const pdgEarlyBody = (await pdgEarly.json()) as { requests: Array<{ id: string }> }
    expect(pdgEarlyBody.requests.some((r) => r.id === submitted.id)).toBe(false)

    const cdgApproved = await approveBtpRequest(request, submitted.id, 'cdg')
    expect(cdgApproved.request.status).toBe('daf_review')

    const fiche = await request.get(`${API_BASE}/api/v1/procurement/requests/${submitted.id}/eb-html`)
    const html = await fiche.text()
    expect(fiche.ok(), html).toBeTruthy()
    expect(html).toMatch(/rowspan="4"[^>]*>DAF/)
    expect(html).toMatch(/rowspan="4"[^>]*>PDG/)

    await loginBtpApi(request, 'pdg')
    const pdgList = await request.get(`${API_BASE}/api/v1/procurement/requests`)
    const pdgBody = (await pdgList.json()) as { requests: Array<{ id: string }> }
    expect(pdgBody.requests.some((r) => r.id === submitted.id)).toBe(true)

    await loginBtpManager(page, 'sa')
    await openAchatsTab(page)
    await page.getByTestId(`mgr-achats-request-${submitted.id}`).click()
    await expect(page.getByTestId('mgr-achats-signoff-pdg')).toBeVisible({ timeout: UI_READY_TIMEOUT })
    await expect(page.getByTestId('mgr-achats-signoff-daf')).toBeVisible()

    await approveBtpRequest(request, submitted.id, 'daf')
    await loginBtpManager(page, 'pdg')
    await expect(page.getByTestId('mgr-sidebar-role')).toHaveText(/pdg/i, { timeout: UI_READY_TIMEOUT })
    await openAchatsTab(page)
    await page.getByTestId(`mgr-achats-request-${submitted.id}`).click()
    await expect(page.getByTestId('mgr-achats-sign-pin')).toBeVisible({ timeout: UI_READY_TIMEOUT })
    await page.getByTestId('mgr-achats-sign-pin').fill('9999')
    await page.getByTestId('btp-approve-btn').click()
    await expect(page.getByText(/Demande approuvée/)).toBeVisible({ timeout: 15_000 })
    await expect(page.getByTestId('mgr-achats-signoff-daf')).toContainText(/NIP vérifié/)
    await expect(page.getByTestId('mgr-achats-signoff-pdg')).toContainText(/Diabaté PDG/)
    await expect(page.getByTestId('mgr-achats-signoff-pdg')).toContainText(/NIP vérifié/)
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
    await saPriceSubmitCdgApprove(request, submitted.id, 1000)
    await approveBtpRequest(request, submitted.id, 'daf')
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
    await expect(page.getByTestId('mgr-planifier-form').getByText('Fournisseur *', { exact: true })).toBeVisible()
    await expect(page.getByTestId('mgr-planifier-form').getByText('Nom du dépôt *', { exact: true })).toHaveCount(0)
    await expect(page.getByTestId('mgr-create-tour')).toBeEnabled()
    await expect(page.getByTestId('mgr-stop-supermarket-0')).toHaveValue('sm-btp-cocody')
  })

  test('tournée BC supprimée → on peut en recréer une (I53)', async ({ page, request }) => {
    test.setTimeout(180_000)
    const simulated = await simulateWhatsappEb(request)
    const submitted = await dtSubmitDraft(request, simulated.draftId)
    await saPriceSubmitCdgApprove(request, submitted.id, 1000)
    await approveBtpRequest(request, submitted.id, 'daf')
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

  test('SA refuse l’envoi CdG sans fournisseur, paiement ou PJ (I55)', async ({ request }) => {
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

    const quoted = await saPriceSubmitCdgApprove(request, submitted.id, 1000)
    expect(quoted.request.status).toBe('daf_review')
  })

  test('COMPTANT — bon de trésorerie joint avant le CdG (I57)', async ({ page, request }) => {
    test.setTimeout(180_000)
    const simulated = await simulateWhatsappEb(request)
    const submitted = await dtSubmitDraft(request, simulated.draftId)

    await saPriceLines(request, submitted.id, 1000, { paymentMode: 'COMPTANT' })
    const createBt = await request.post(
      `${API_BASE}/api/v1/procurement/requests/${submitted.id}/create-bt`,
      { data: {} },
    )
    expect(createBt.ok(), await createBt.text()).toBeTruthy()
    const beforeFinance = (await createBt.json()) as {
      treasuryOrder: { id: string; reference: string }
    }
    expect(beforeFinance.treasuryOrder?.id).toBeTruthy()

    const htmlRes = await request.get(
      `${API_BASE}/api/v1/procurement/documents/treasury/${beforeFinance.treasuryOrder.id}/html`,
    )
    expect(htmlRes.ok(), await htmlRes.text()).toBeTruthy()
    const html = await htmlRes.text()
    expect(html).toMatch(/Demande d’avance de trésorerie/)
    expect(html).toMatch(/VALIDATION DAF/)
    expect(html).toMatch(/VALIDATION PDG/)
    expect(html).toMatch(/Objet/)
    expect(html).toMatch(/Montant/)
    expect(html).toMatch(/N° de l’avance<\/th><td><\/td>/)
    expect(html).not.toMatch(/N° de l’avance<\/th><td>BT-/)

    const finance = await request.post(
      `${API_BASE}/api/v1/procurement/requests/${submitted.id}/submit-finance`,
      { data: {} },
    )
    expect(finance.ok(), await finance.text()).toBeTruthy()
    const financeBody = (await finance.json()) as { request: { status: string } }
    expect(financeBody.request.status).toBe('cdg_review')
    const cdgApproved = await approveBtpRequest(request, submitted.id, 'cdg')
    expect(cdgApproved.request.status).toBe('daf_review')

    await loginBtpManager(page, 'daf')
    await openAchatsTab(page)
    await page.getByTestId(`mgr-achats-request-${submitted.id}`).click()
    await expect(page.getByTestId('mgr-achats-finance-dossier')).toBeVisible({ timeout: UI_READY_TIMEOUT })
    await expect(page.getByTestId('mgr-achats-treasury-link')).toBeVisible()
    await expect(page.getByTestId('mgr-achats-treasury-link')).toHaveAttribute(
      'href',
      new RegExp(`/documents/treasury/${beforeFinance.treasuryOrder.id}/html`),
    )
    await page.getByTestId('mgr-achats-sign-pin').fill('5678')
    await page.getByTestId('btp-approve-btn').click()
    await expect(page.getByText(/Demande approuvée/)).toBeVisible({ timeout: 15_000 })
    await loginBtpApi(request, 'daf')
    const signedHtmlRes = await request.get(
      `${API_BASE}/api/v1/procurement/documents/treasury/${beforeFinance.treasuryOrder.id}/html`,
    )
    expect(signedHtmlRes.ok(), await signedHtmlRes.text()).toBeTruthy()
    const signedHtml = await signedHtmlRes.text()
    expect(signedHtml).toMatch(/Aya DAF/)
    expect(signedHtml).toMatch(/NIP vérifié/)
    expect(signedHtml).toMatch(/N° de l’avance<\/th><td><\/td>/)
  })

  test('un BC par fournisseur présent sur l’EB (I58)', async ({ request }) => {
    test.setTimeout(120_000)
    const simulated = await simulateWhatsappEb(request)
    const submitted = await dtSubmitDraft(request, simulated.draftId)

    await saPriceSubmitCdgApprove(request, submitted.id, 1000, {
      supplierForLine: (l) =>
        /fer/i.test(l.label ?? '') ? 'Fer & Acier Abidjan' : 'CimIvoire Distribution',
    })
    await approveBtpRequest(request, submitted.id, 'daf')

    await loginBtpApi(request, 'sa')
    const cimentPo = await request.post(`${API_BASE}/api/v1/procurement/requests/${submitted.id}/create-po`, {
      data: { supplierId: BTP_PILOT.SUPPLIER_ACCOUNT_ID },
    })
    expect(cimentPo.ok(), await cimentPo.text()).toBeTruthy()
    const ferPo = await request.post(`${API_BASE}/api/v1/procurement/requests/${submitted.id}/create-po`, {
      data: { supplierId: BTP_PILOT.SUPPLIER_FER_ID },
    })
    expect(ferPo.ok(), await ferPo.text()).toBeTruthy()

    const duplicate = await request.post(`${API_BASE}/api/v1/procurement/requests/${submitted.id}/create-po`, {
      data: { supplierId: BTP_PILOT.SUPPLIER_ACCOUNT_ID },
    })
    expect(duplicate.status()).toBe(400)

    const detailRes = await request.get(`${API_BASE}/api/v1/procurement/requests/${submitted.id}`)
    expect(detailRes.ok(), await detailRes.text()).toBeTruthy()
    const detail = (await detailRes.json()) as {
      request: { status: string }
      purchaseOrders: Array<{ supplierId: string; reference: string }>
    }
    expect(detail.request.status).toBe('po_ready')
    expect(detail.purchaseOrders).toHaveLength(2)
    expect(detail.purchaseOrders.map((p) => p.supplierId).sort()).toEqual(
      [BTP_PILOT.SUPPLIER_ACCOUNT_ID, BTP_PILOT.SUPPLIER_FER_ID].sort(),
    )
    expect(detail.purchaseOrders.every((p) => /^BC-/.test(p.reference))).toBe(true)
  })

  test('paiement hors COMPTANT — section BT masquée (I59)', async ({ page, request }) => {
    test.setTimeout(120_000)
    const simulated = await simulateWhatsappEb(request)
    const submitted = await dtSubmitDraft(request, simulated.draftId)
    await saPriceLines(request, submitted.id, 1000, { paymentMode: 'COMPTANT' })

    await loginBtpManager(page, 'sa')
    await openAchatsTab(page)
    await page.getByTestId(`mgr-achats-request-${submitted.id}`).click()
    await expect(page.getByTestId('mgr-achats-create-bt')).toBeVisible({ timeout: UI_READY_TIMEOUT })

    await page.getByTestId('mgr-achats-line-payment-0').selectOption('CREDIT')
    const paymentCount = await page.getByTestId(/mgr-achats-line-payment-/).count()
    for (let i = 1; i < paymentCount; i++) {
      await page.getByTestId(`mgr-achats-line-payment-${i}`).selectOption('CREDIT')
    }
    await page.getByTestId('mgr-achats-save-pricing').click()
    await expect(page.getByText(/Lignes enregistrées/)).toBeVisible({ timeout: 15_000 })
    await expect(page.getByTestId('mgr-achats-create-bt')).toHaveCount(0)
    await expect(page.getByTestId('mgr-achats-treasury-link')).toHaveCount(0)
  })

  test('Créer les BC génère un BC par fournisseur et une tournée par BC (I60)', async ({ page, request }) => {
    test.setTimeout(180_000)
    const simulated = await simulateWhatsappEb(request)
    const submitted = await dtSubmitDraft(request, simulated.draftId)
    await saPriceSubmitCdgApprove(request, submitted.id, 1000, {
      supplierForLine: (l) =>
        /fer/i.test(l.label ?? '') ? 'Fer & Acier Abidjan' : 'CimIvoire Distribution',
    })
    await approveBtpRequest(request, submitted.id, 'daf')

    await loginBtpManager(page, 'sa')
    await openAchatsTab(page)
    await page.getByTestId(`mgr-achats-request-${submitted.id}`).click()
    await expect(page.getByTestId('mgr-achats-create-po')).toHaveText(/Créer les BC/)
    await page.getByTestId('mgr-achats-create-po').click()
    await expect(page.getByTestId('mgr-achats-document-link')).toBeVisible({ timeout: 20_000 })
    await expect(page.getByTestId('mgr-achats-document-link-1')).toBeVisible()
    await expect(page.getByTestId('mgr-achats-document-print')).toBeVisible()
    await expect(page.getByTestId('mgr-achats-create-po')).toBeDisabled()
    await expect(page.getByTestId('btp-schedule-delivery')).toBeVisible()
    await expect(page.locator('[data-testid^="btp-schedule-delivery-"]')).toHaveCount(1)

    const saCookies = (await page.context().cookies()).map((c) => `${c.name}=${c.value}`).join('; ')
    const detailRes = await request.get(`${API_BASE}/api/v1/procurement/requests/${submitted.id}`, {
      headers: { Cookie: saCookies },
    })
    const detail = (await detailRes.json()) as {
      purchaseOrders: Array<{ id: string }>
    }
    expect(detail.purchaseOrders).toHaveLength(2)

    const first = await request.post(
      `${API_BASE}/api/v1/procurement/requests/${submitted.id}/schedule-delivery`,
      {
        headers: { Cookie: saCookies },
        data: { driverId: BTP_PILOT.DRIVER_ID, date: todayIso(), purchaseOrderId: detail.purchaseOrders[0]!.id },
      },
    )
    expect(first.ok(), await first.text()).toBeTruthy()
    const afterFirst = (await first.json()) as { request: { status: string } }
    expect(afterFirst.request.status).toBe('po_ready')

    const second = await request.post(
      `${API_BASE}/api/v1/procurement/requests/${submitted.id}/schedule-delivery`,
      {
        headers: { Cookie: saCookies },
        data: { driverId: BTP_PILOT.DRIVER_ID, date: todayIso(), purchaseOrderId: detail.purchaseOrders[1]!.id },
      },
    )
    expect(second.ok(), await second.text()).toBeTruthy()
    const afterSecond = (await second.json()) as { request: { status: string } }
    expect(afterSecond.request.status).toBe('delivery_scheduled')
  })

  test('produits de l’EB ajoutés au catalogue (I61)', async ({ request }) => {
    const simulated = await simulateWhatsappEb(
      request,
      '12 sacs ciment special e2e pour Cocody demain',
    )
    await dtSubmitDraft(request, simulated.draftId)
    await loginBtpApi(request, 'sa')
    const products = await request.get(`${API_BASE}/api/v1/dashboard/products`)
    expect(products.ok(), await products.text()).toBeTruthy()
    const body = (await products.json()) as { products: Array<{ label: string }> }
    expect(body.products.some((p) => /ciment special e2e/i.test(p.label))).toBe(true)
  })

  test('tournée BTP conserve l’unité tonne du produit (I62)', async ({ request }) => {
    test.setTimeout(120_000)
    const simulated = await simulateWhatsappEb(request, 'une tonne de gravier pour Cocody demain')
    const submitted = await dtSubmitDraft(request, simulated.draftId)
    const quoted = await saPriceSubmitCdgApprove(request, submitted.id, 1000)
    expect(quoted.request.status).toBe('daf_review')

    await approveBtpRequest(request, submitted.id, 'daf')
    await loginBtpApi(request, 'sa')
    expect(
      (
        await request.post(`${API_BASE}/api/v1/procurement/requests/${submitted.id}/create-po`, {
          data: { supplierId: BTP_PILOT.SUPPLIER_ACCOUNT_ID },
        })
      ).ok(),
    ).toBeTruthy()

    const scheduleRes = await request.post(
      `${API_BASE}/api/v1/procurement/requests/${submitted.id}/schedule-delivery`,
      { data: { driverId: BTP_PILOT.DRIVER_ID, date: localTodayIso() } },
    )
    expect(scheduleRes.ok(), await scheduleRes.text()).toBeTruthy()
    const scheduled = (await scheduleRes.json()) as { tourId: string }
    const tourRes = await request.get(`${API_BASE}/api/v1/dashboard/tours/${scheduled.tourId}`)
    expect(tourRes.ok(), await tourRes.text()).toBeTruthy()
    const tour = (await tourRes.json()) as {
      stops: Array<{ unitType: string; products?: Array<{ unit: string }> | null }>
    }
    expect(tour.stops[0]?.unitType).toBe('tonne')
    expect(tour.stops[0]?.products?.[0]?.unit).toBe('tonne')
  })

  test('SA Suivi — registre BC après livraison confirmée (I63)', async ({ page, request }) => {
    test.setTimeout(180_000)
    const simulated = await simulateWhatsappEb(request)
    const submitted = await dtSubmitDraft(request, simulated.draftId)
    const quoted = await saPriceSubmitCdgApprove(request, submitted.id, 1000)
    expect(quoted.request.status).toBe('daf_review')

    await approveBtpRequest(request, submitted.id, 'daf')
    await loginBtpApi(request, 'sa')
    const poRes = await request.post(`${API_BASE}/api/v1/procurement/requests/${submitted.id}/create-po`, {
      data: { supplierId: BTP_PILOT.SUPPLIER_ACCOUNT_ID },
    })
    expect(poRes.ok(), await poRes.text()).toBeTruthy()

    const emptyReg = await request.get(`${API_BASE}/api/v1/procurement/bc-register`)
    expect(emptyReg.ok(), await emptyReg.text()).toBeTruthy()
    const emptyBody = (await emptyReg.json()) as { rows: Array<{ bon: string }> }
    expect(emptyBody.rows).toEqual([])

    const scheduleRes = await request.post(
      `${API_BASE}/api/v1/procurement/requests/${submitted.id}/schedule-delivery`,
      { data: { driverId: BTP_PILOT.DRIVER_ID, date: localTodayIso() } },
    )
    expect(scheduleRes.ok(), await scheduleRes.text()).toBeTruthy()
    const scheduled = (await scheduleRes.json()) as { tourId: string; purchaseOrders?: Array<{ reference: string }> }
    await confirmScheduledBtpDelivery(request, scheduled.tourId)

    await loginBtpApi(request, 'sa')
    const filled = await request.get(`${API_BASE}/api/v1/procurement/bc-register`)
    expect(filled.ok(), await filled.text()).toBeTruthy()
    const filledBody = (await filled.json()) as {
      month: string | null
      months: Array<{ key: string; label: string }>
      recap: Array<{
        supplierName: string
        totalLabel: string
        rows: Array<{ bon: string; amountLabel: string; siteName: string }>
      }>
      rows: Array<{
        purchaseOrderId: string
        bon: string
        siteName: string
        supplierName: string
        quantities: string
        amountLabel: string
        paymentMode: string
        attachments?: Array<{ lineId: string; fileName: string }>
      }>
    }
    expect(filledBody.rows.length).toBeGreaterThanOrEqual(1)
    expect(filledBody.rows[0]?.bon).toMatch(/^BC-/)
    expect(filledBody.rows[0]?.siteName).toMatch(/Cocody/)
    expect(filledBody.rows[0]?.supplierName).toMatch(/CimIvoire/)
    expect(filledBody.rows[0]?.quantities).not.toBe('—')
    expect(filledBody.rows[0]?.amountLabel).toMatch(/\d/)
    expect(filledBody.rows[0]?.amountLabel).not.toMatch(/CFA/)
    expect(filledBody.rows[0]?.paymentMode).toMatch(/CREDIT/)
    expect(filledBody.rows[0]?.attachments?.length).toBeGreaterThanOrEqual(1)
    expect(filledBody.month).toMatch(/^\d{4}-\d{2}$/)
    expect(filledBody.months.length).toBeGreaterThanOrEqual(1)
    expect(filledBody.recap.length).toBeGreaterThanOrEqual(1)
    expect(filledBody.recap[0]?.supplierName).toMatch(/CimIvoire/)
    expect(filledBody.recap[0]?.rows.length).toBeGreaterThanOrEqual(1)
    expect(filledBody.recap[0]?.totalLabel).not.toMatch(/CFA/)

    const poId = filledBody.rows[0]!.purchaseOrderId
    const patched = await request.patch(`${API_BASE}/api/v1/procurement/bc-register/${poId}`, {
      data: { observation: 'Contrôle SA', verification: 'OK', invoice: 'reçue', justifs: 'complet' },
    })
    expect(patched.ok(), await patched.text()).toBeTruthy()

    await loginBtpManager(page, 'sa')
    await page.getByTestId('mgr-tab-suivi-bc').click()
    await expect(page.getByTestId('mgr-suivi-bc-table')).toBeVisible({ timeout: UI_READY_TIMEOUT })
    await expect(page.getByTestId('mgr-suivi-bc-table')).toContainText(/CHANTIERS/)
    await expect(page.getByTestId('mgr-suivi-bc-table')).toContainText(/MONTANT \(XOF\)/)
    await expect(page.getByTestId('mgr-suivi-bc-table')).toContainText(/BC-/)
    await expect(page.getByTestId('mgr-suivi-bc-table')).toContainText(/CimIvoire/)
    await expect(page.getByTestId('mgr-suivi-bc-filters')).toBeVisible()
    await expect(page.getByTestId('mgr-suivi-bc-filter-supplierName')).toBeVisible()
    await expect(page.getByTestId(`mgr-suivi-bc-observation-${poId}`)).toHaveValue(/Contrôle SA/)
    await expect(page.getByTestId(`mgr-suivi-bc-attach-${poId}`).first()).toBeVisible()
    await expect(page.getByTestId('mgr-suivi-bc-month-tabs')).toBeVisible()
    await page.getByTestId('mgr-suivi-bc-sheet-recap').click()
    await expect(page.getByTestId('mgr-suivi-bc-recap')).toBeVisible()
    await expect(page.getByTestId('mgr-suivi-bc-recap')).toContainText(/CimIvoire/)
    await expect(page.getByTestId('mgr-suivi-bc-recap')).toContainText(/MONTANT \(XOF\)/)
    await expect(page.getByTestId('mgr-suivi-bc-recap')).not.toContainText(/FCFA/)
  })

  test('DT Suivi chantier — stock disponible après livraison (I64)', async ({ page, request }) => {
    test.setTimeout(180_000)
    const simulated = await simulateWhatsappEb(request)
    const submitted = await dtSubmitDraft(request, simulated.draftId)
    await saPriceSubmitCdgApprove(request, submitted.id, 1000)
    await approveBtpRequest(request, submitted.id, 'daf')
    await loginBtpApi(request, 'sa')
    expect(
      (
        await request.post(`${API_BASE}/api/v1/procurement/requests/${submitted.id}/create-po`, {
          data: { supplierId: BTP_PILOT.SUPPLIER_ACCOUNT_ID },
        })
      ).ok(),
    ).toBeTruthy()
    const scheduleRes = await request.post(
      `${API_BASE}/api/v1/procurement/requests/${submitted.id}/schedule-delivery`,
      { data: { driverId: BTP_PILOT.DRIVER_ID, date: localTodayIso() } },
    )
    expect(scheduleRes.ok(), await scheduleRes.text()).toBeTruthy()
    const scheduled = (await scheduleRes.json()) as { tourId: string }
    await confirmScheduledBtpDelivery(request, scheduled.tourId)

    await loginBtpApi(request, 'dt')
    const stockRes = await request.get(`${API_BASE}/api/v1/procurement/site-stock`)
    expect(stockRes.ok(), await stockRes.text()).toBeTruthy()
    const stockBody = (await stockRes.json()) as {
      rows: Array<{ productLabel: string; onHand: number; siteName: string }>
    }
    expect(stockBody.rows.some((r) => /ciment/i.test(r.productLabel) && r.onHand > 0)).toBe(true)

    await loginBtpManager(page, 'dt')
    await page.getByTestId('mgr-tab-suivi-chantier').click()
    await expect(page.getByTestId('mgr-dossiers-stock-table')).toBeVisible({ timeout: UI_READY_TIMEOUT })
    await expect(page.getByTestId('mgr-dossiers-stock-table')).toContainText(/ciment/i)
    await expect(page.getByTestId('mgr-achats-suivi-chantier')).toHaveCount(0)

    await loginBtpApi(request, 'sa')
    const afterDelivery = await request.get(`${API_BASE}/api/v1/procurement/requests/${submitted.id}`)
    expect(afterDelivery.ok(), await afterDelivery.text()).toBeTruthy()
    const afterBody = (await afterDelivery.json()) as { request: { status: string } }
    expect(afterBody.request.status).toBe('delivered')

    await loginBtpManager(page, 'sa')
    await openAchatsTab(page)
    await page.getByTestId(`mgr-achats-request-${submitted.id}`).click()
    await expect(page.getByTestId('mgr-achats-request-detail')).toContainText(/Livré/, { timeout: UI_READY_TIMEOUT })
    await expect(page.getByTestId('mgr-achats-request-detail')).not.toContainText(/Livraison planifiée/)
  })

  test('tournée BTP conserve l’unité botte du fer (I65)', async ({ request }) => {
    test.setTimeout(120_000)
    const simulated = await simulateWhatsappEb(request, '4 bottes de fer 8/14 pour Cocody demain')
    const submitted = await dtSubmitDraft(request, simulated.draftId)
    await saPriceSubmitCdgApprove(request, submitted.id, 1000)
    await approveBtpRequest(request, submitted.id, 'daf')
    await loginBtpApi(request, 'sa')
    expect(
      (
        await request.post(`${API_BASE}/api/v1/procurement/requests/${submitted.id}/create-po`, {
          data: { supplierId: BTP_PILOT.SUPPLIER_ACCOUNT_ID },
        })
      ).ok(),
    ).toBeTruthy()

    const scheduleRes = await request.post(
      `${API_BASE}/api/v1/procurement/requests/${submitted.id}/schedule-delivery`,
      { data: { driverId: BTP_PILOT.DRIVER_ID, date: localTodayIso() } },
    )
    expect(scheduleRes.ok(), await scheduleRes.text()).toBeTruthy()
    const scheduled = (await scheduleRes.json()) as { tourId: string }
    const tourRes = await request.get(`${API_BASE}/api/v1/dashboard/tours/${scheduled.tourId}`)
    expect(tourRes.ok(), await tourRes.text()).toBeTruthy()
    const tour = (await tourRes.json()) as {
      stops: Array<{ unitType: string; products?: Array<{ unit: string }> | null }>
    }
    expect(tour.stops[0]?.unitType).toBe('botte')
    expect(tour.stops[0]?.products?.[0]?.unit).toBe('botte')
    expect(tour.stops[0]?.unitType).not.toBe('colis')
  })

  test('CdG gèle l’enveloppe ; second gel 409 (I66)', async ({ request }) => {
    const first = await freezeBtpBudget(request, 100_000_000)
    expect(first.status, first.body.message).toBe(200)
    expect(first.body.budgetInitialFcfa).toBe(100_000_000)
    expect(first.body.budgetFrozenAt).toBeTruthy()
    expect(first.body.budgetTotalFcfa).toBe(100_000_000)
    const second = await freezeBtpBudget(request, 50_000_000)
    expect(second.status).toBe(409)
    const got = await getBtpSiteBudget(request)
    expect(got.body.budgetInitialFcfa).toBe(100_000_000)
  })

  test('DT DAF SA PDG ne gèlent pas le budget (I67)', async ({ request }) => {
    for (const role of ['dt', 'daf', 'sa', 'pdg'] as const) {
      await loginBtpApi(request, role)
      const res = await request.post(
        `${API_BASE}/api/v1/procurement/sites/${BTP_PILOT.SITE_ID}/budget/freeze`,
        { data: { amountFcfa: 1_000_000, pin: '1234' } },
      )
      expect(res.status(), `${role} freeze`).toBe(403)
    }
  })

  test('DT propose avenant, DAF approuve ; CdG et PDG 403 (I68)', async ({ request }) => {
    const frozen = await freezeBtpBudget(request, 100_000_000)
    expect(frozen.status).toBe(200)

    await loginBtpApi(request, 'cdg')
    const cdgDraft = await request.post(
      `${API_BASE}/api/v1/procurement/sites/${BTP_PILOT.SITE_ID}/budget/amendments`,
      { data: { signedAmountFcfa: 15_000_000, reason: 'Fondations fer complémentaire' } },
    )
    expect(cdgDraft.status()).toBe(403)

    await loginBtpApi(request, 'dt')
    const draftRes = await request.post(
      `${API_BASE}/api/v1/procurement/sites/${BTP_PILOT.SITE_ID}/budget/amendments`,
      { data: { signedAmountFcfa: 15_000_000, reason: 'Fondations fer complémentaire' } },
    )
    expect(draftRes.ok(), await draftRes.text()).toBeTruthy()
    const drafted = (await draftRes.json()) as { amendments: Array<{ id: string; status: string }> }
    const draft = drafted.amendments.find((a) => a.status === 'draft')
    expect(draft).toBeTruthy()

    await loginBtpApi(request, 'cdg')
    const cdgApprove = await request.post(
      `${API_BASE}/api/v1/procurement/sites/${BTP_PILOT.SITE_ID}/budget/amendments/${draft!.id}/approve`,
      { data: { pin: BTP_PINS.cdg } },
    )
    expect(cdgApprove.status()).toBe(403)

    await loginBtpApi(request, 'pdg')
    const pdgApprove = await request.post(
      `${API_BASE}/api/v1/procurement/sites/${BTP_PILOT.SITE_ID}/budget/amendments/${draft!.id}/approve`,
      { data: { pin: BTP_PINS.pdg } },
    )
    expect(pdgApprove.status()).toBe(403)

    await loginBtpApi(request, 'daf')
    const dafApprove = await request.post(
      `${API_BASE}/api/v1/procurement/sites/${BTP_PILOT.SITE_ID}/budget/amendments/${draft!.id}/approve`,
      { data: { pin: BTP_PINS.daf } },
    )
    expect(dafApprove.ok(), await dafApprove.text()).toBeTruthy()
    const approved = (await dafApprove.json()) as {
      budgetInitialFcfa: number
      budgetTotalFcfa: number
      amendments: Array<{ decidedByName: string | null; status: string; createdByName: string | null }>
    }
    expect(approved.budgetInitialFcfa).toBe(100_000_000)
    expect(approved.budgetTotalFcfa).toBe(115_000_000)
    const done = approved.amendments.find((a) => a.status === 'approved')
    expect(done?.createdByName).toMatch(/Kouamé DT/)
    expect(done?.decidedByName).toMatch(/Aya DAF/)
  })

  test('avenant de baisse sous l’engagé refusé (I69)', async ({ request }) => {
    expect((await freezeBtpBudget(request, 500_000)).status).toBe(200)
    const simulated = await simulateWhatsappEb(request)
    const submitted = await dtSubmitDraft(request, simulated.draftId)
    await saPriceSubmitCdgApprove(request, submitted.id, 5000)
    await approveBtpRequest(request, submitted.id, 'daf')
    await loginBtpApi(request, 'sa')
    const po = await request.post(`${API_BASE}/api/v1/procurement/requests/${submitted.id}/create-po`, {
      data: { supplierId: BTP_PILOT.SUPPLIER_ACCOUNT_ID },
    })
    expect(po.ok(), await po.text()).toBeTruthy()

    await loginBtpApi(request, 'dt')
    const draftRes = await request.post(
      `${API_BASE}/api/v1/procurement/sites/${BTP_PILOT.SITE_ID}/budget/amendments`,
      { data: { signedAmountFcfa: -400_000, reason: 'Révision enveloppe trop large' } },
    )
    expect(draftRes.ok(), await draftRes.text()).toBeTruthy()
    const drafted = (await draftRes.json()) as { amendments: Array<{ id: string; status: string }> }
    const draft = drafted.amendments.find((a) => a.status === 'draft')
    expect(draft).toBeTruthy()

    await loginBtpApi(request, 'daf')
    const dafApprove = await request.post(
      `${API_BASE}/api/v1/procurement/sites/${BTP_PILOT.SITE_ID}/budget/amendments/${draft!.id}/approve`,
      { data: { pin: BTP_PINS.daf } },
    )
    expect(dafApprove.status()).toBe(400)
  })

  test('reste à engager = total − BC ; BT exclu (I70)', async ({ request }) => {
    expect((await freezeBtpBudget(request, 10_000_000)).status).toBe(200)
    const simulated = await simulateWhatsappEb(request)
    const submitted = await dtSubmitDraft(request, simulated.draftId)
    await saPriceLines(request, submitted.id, 2000, { paymentMode: 'COMPTANT' })
    await loginBtpApi(request, 'sa')
    const bt = await request.post(`${API_BASE}/api/v1/procurement/requests/${submitted.id}/create-bt`, {
      data: {},
    })
    expect(bt.ok(), await bt.text()).toBeTruthy()
    await loginBtpApi(request, 'cdg')
    const afterBt = await getBtpSiteBudget(request)
    expect(afterBt.body.engagedFcfa).toBe(0)

    await loginBtpApi(request, 'sa')
    const finance = await request.post(
      `${API_BASE}/api/v1/procurement/requests/${submitted.id}/submit-finance`,
      { data: {} },
    )
    expect(finance.ok(), await finance.text()).toBeTruthy()
    await approveBtpRequest(request, submitted.id, 'cdg')
    await approveBtpRequest(request, submitted.id, 'daf')
    await loginBtpApi(request, 'sa')
    const po = await request.post(`${API_BASE}/api/v1/procurement/requests/${submitted.id}/create-po`, {
      data: { supplierId: BTP_PILOT.SUPPLIER_ACCOUNT_ID },
    })
    expect(po.ok(), await po.text()).toBeTruthy()
    const poBody = (await po.json()) as { purchaseOrder?: { amountFcfa?: string | number } }
    const bcAmount = Number(poBody.purchaseOrder?.amountFcfa ?? 0)
    expect(bcAmount).toBeGreaterThan(0)

    await loginBtpApi(request, 'cdg')
    const afterBc = await getBtpSiteBudget(request)
    expect(afterBc.body.engagedFcfa).toBe(bcAmount)
    expect(afterBc.body.remainingFcfa).toBe(10_000_000 - bcAmount)
  })

  test('isolation tenant — autre entreprise 404 sur le budget pilote (I71)', async ({ request }) => {
    let login = await request.post(`${API_BASE}/api/v1/auth/login-dashboard`, {
      data: { email: DEMO_MANAGER.email, password: DEMO_MANAGER.password },
    })
    if (!login.ok()) {
      login = await request.post(`${API_BASE}/api/v1/auth/login-dashboard`, {
        data: { email: 'kfallet@gmail.com', password: DEMO_MANAGER.password },
      })
    }
    expect(login.ok(), await login.text()).toBeTruthy()
    const got = await getBtpSiteBudget(request)
    expect(got.status).toBe(404)
  })

  test('BC au-dessus du reste : warning overBudget, BC créé (I72)', async ({ request }) => {
    expect((await freezeBtpBudget(request, 1000)).status).toBe(200)
    const simulated = await simulateWhatsappEb(request)
    const submitted = await dtSubmitDraft(request, simulated.draftId)
    await saPriceSubmitCdgApprove(request, submitted.id, 5000)
    await approveBtpRequest(request, submitted.id, 'daf')
    await loginBtpApi(request, 'sa')
    const po = await request.post(`${API_BASE}/api/v1/procurement/requests/${submitted.id}/create-po`, {
      data: { supplierId: BTP_PILOT.SUPPLIER_ACCOUNT_ID },
    })
    expect(po.ok(), await po.text()).toBeTruthy()
    const body = (await po.json()) as { overBudget?: boolean; purchaseOrder?: { id: string } }
    expect(body.overBudget).toBe(true)
    expect(body.purchaseOrder?.id).toBeTruthy()
    await loginBtpApi(request, 'cdg')
    const got = await getBtpSiteBudget(request)
    expect(got.body.overBudget).toBe(true)
  })

  test('CdG — % écart feux avenant manquant après BC hors enveloppe (I74)', async ({ page, request }) => {
    test.setTimeout(180_000)
    expect((await freezeBtpBudget(request, 1000)).status).toBe(200)
    const simulated = await simulateWhatsappEb(request)
    const submitted = await dtSubmitDraft(request, simulated.draftId)
    await saPriceSubmitCdgApprove(request, submitted.id, 5000)
    await approveBtpRequest(request, submitted.id, 'daf')
    await loginBtpApi(request, 'sa')
    const po = await request.post(`${API_BASE}/api/v1/procurement/requests/${submitted.id}/create-po`, {
      data: { supplierId: BTP_PILOT.SUPPLIER_ACCOUNT_ID },
    })
    expect(po.ok(), await po.text()).toBeTruthy()

    await loginBtpApi(request, 'cdg')
    const got = await getBtpSiteBudget(request)
    expect(got.body.overBudget).toBe(true)
    expect(got.body.missingAmendment).toBe(true)
    expect(got.body.trafficLight).toBe('alert')
    expect(got.body.engagementPct).toBeGreaterThan(100)
    expect(got.body.varianceFcfa).toBeGreaterThan(0)
    expect(got.body.overrunSinceAt).toBeTruthy()

    const list = await request.get(`${API_BASE}/api/v1/procurement/site-budgets`)
    expect(list.ok(), await list.text()).toBeTruthy()
    const listed = (await list.json()) as { budgets: Array<{ siteId: string; missingAmendment?: boolean }> }
    expect(listed.budgets.some((b) => b.siteId === BTP_PILOT.SITE_ID && b.missingAmendment)).toBe(true)

    await loginBtpManager(page, 'cdg')
    await page.getByTestId('mgr-tab-suivi-chantier').click()
    await expect(page.getByTestId('mgr-suivi-board')).toBeVisible({ timeout: UI_READY_TIMEOUT })
    await expect(page.getByTestId(`mgr-suivi-board-row-${BTP_PILOT.SITE_ID}`)).toContainText(/Manquant/)
    await page.getByTestId(`mgr-suivi-board-row-${BTP_PILOT.SITE_ID}`).click()
    await expect(page.getByTestId('mgr-suivi-feu-alert')).toBeVisible()
    await expect(page.getByTestId('mgr-suivi-enveloppe-pct')).toContainText(/%/)
    await expect(page.getByTestId('mgr-suivi-enveloppe-variance')).toContainText(/\+/)
    await expect(page.getByTestId('mgr-suivi-enveloppe-missing-amendment')).toBeVisible()
  })

  test('CdG Achats — file du jour : à valider, enveloppe non gelée, pipeline (I75)', async ({ page, request }) => {
    test.setTimeout(180_000)
    const simulated = await simulateWhatsappEb(request)
    const submitted = await dtSubmitDraft(request, simulated.draftId)
    const quoted = await saPriceAndSubmitFinance(request, submitted.id, 1000)
    expect(quoted.request.status).toBe('cdg_review')

    await loginBtpManager(page, 'cdg')
    await expect(page.getByTestId('mgr-cdg-file')).toBeVisible({ timeout: UI_READY_TIMEOUT })
    await expect(page.getByTestId('mgr-cdg-file-validate')).toContainText('1')
    await expect(page.getByTestId('mgr-cdg-file-unfrozen')).toContainText(/[1-9]/)
    await expect(page.getByTestId('mgr-cdg-file-pipeline')).toContainText(/EB/)
        // Feature #4 : le board Suivi n'affiche que les chantiers ENGAGÉS — on termine
    // le pipeline (CdG + DAF puis BC par le SA) pour que le chantier apparaisse
    // avec son engagement. Le clic « file du jour » ci-dessus navigue dans l'UI ;
    // l'approbation CdG est effectuée ci-dessous par l'API (approveBtpRequest),
    // donc on ne clique pas sur mgr-cdg-file-validate pour éviter une double
    // validation qui briserait le workflow d'état (cdg_review → daf_review).
    const cdgApproved = await approveBtpRequest(request, submitted.id, 'cdg')
    expect(cdgApproved.request.status).toBe('daf_review')
    await completePoAfterCdg(request, submitted.id)

    await page.getByTestId('mgr-cdg-file-unfrozen').click()
    await expect(page.getByTestId('mgr-suivi-chantier')).toBeVisible({ timeout: UI_READY_TIMEOUT })
    await expect(page.getByTestId('mgr-suivi-board')).toBeVisible({ timeout: UI_READY_TIMEOUT })
    await page.getByTestId(`mgr-suivi-board-row-${BTP_PILOT.SITE_ID}`).click()
    await expect(page.getByTestId('mgr-suivi-enveloppe-empty')).toBeVisible({ timeout: UI_READY_TIMEOUT })
  })

  test('CdG gèle via Suivi chantier ; DT propose ; DAF approuve (UI F01)', async ({ page, request }) => {
    test.setTimeout(180_000)
    // Feature #4 : le board Suivi n'affiche que les chantiers engagés — on pousse
    // une EB jusqu'au bon de commande pour rendre le chantier pilotable depuis le Suivi.
    await simulateEbToPo(request, 1000)
    await loginBtpManager(page, 'cdg')
    await expect(page.getByTestId('mgr-tab-suivi-chantier')).toBeVisible({ timeout: UI_READY_TIMEOUT })
    await page.getByTestId('mgr-tab-suivi-chantier').click()
    await expect(page.getByTestId('mgr-suivi-chantier')).toBeVisible({ timeout: UI_READY_TIMEOUT })
    await page.getByTestId(`mgr-suivi-board-row-${BTP_PILOT.SITE_ID}`).click()
    await expect(page.getByTestId('mgr-suivi-enveloppe-empty')).toBeVisible({ timeout: UI_READY_TIMEOUT })
    await page.getByTestId('mgr-suivi-enveloppe-amount').fill('100000000')
    await page.getByTestId('mgr-suivi-enveloppe-pin').fill(BTP_PINS.cdg)
    await page.getByTestId('mgr-suivi-enveloppe-freeze').click()
    await expect(page.getByTestId('mgr-suivi-enveloppe-initial')).toContainText(/100/, { timeout: UI_READY_TIMEOUT })
    await expect(page.getByTestId('mgr-suivi-enveloppe-freeze')).toHaveCount(0)

    await loginBtpManager(page, 'dt')
    await page.getByTestId('mgr-tab-suivi-chantier').click()
    await page.getByTestId(`mgr-suivi-board-row-${BTP_PILOT.SITE_ID}`).click()
    await expect(page.getByTestId('mgr-suivi-avenant-amount')).toBeVisible({ timeout: UI_READY_TIMEOUT })
    await page.getByTestId('mgr-suivi-avenant-amount').fill('15000000')
    await page.getByTestId('mgr-suivi-avenant-reason').fill('Fondations fer complémentaire')
    await page.getByTestId('mgr-suivi-avenant-submit').click()
    await expect(page.getByTestId('mgr-suivi-enveloppe-history')).toContainText(/draft/, { timeout: UI_READY_TIMEOUT })

    await loginBtpManager(page, 'daf')
    await page.getByTestId('mgr-tab-suivi-chantier').click()
    await page.getByTestId(`mgr-suivi-board-row-${BTP_PILOT.SITE_ID}`).click()
    await expect(page.getByTestId('mgr-suivi-avenant-approve')).toBeVisible({ timeout: UI_READY_TIMEOUT })
    await expect(page.getByTestId('mgr-suivi-enveloppe-freeze')).toHaveCount(0)
    await page.getByTestId('mgr-suivi-avenant-pin').fill(BTP_PINS.daf)
    await page.getByTestId('mgr-suivi-avenant-approve').click()
    await expect(page.getByTestId('mgr-suivi-enveloppe-total')).toContainText(/115/, { timeout: UI_READY_TIMEOUT })

    await loginBtpApi(request, 'cdg')
    const got = await getBtpSiteBudget(request)
    expect(got.body.budgetInitialFcfa).toBe(100_000_000)
    expect(got.body.budgetTotalFcfa).toBe(115_000_000)
  })

  test('CdG — pages indicateurs Koestrem : réalisé livraisons, écart, matériaux, top 3 (I76)', async ({ page, request }) => {
    test.setTimeout(180_000)
    const freeze = await freezeBtpBudget(request, 1_000_000)
    expect(freeze.status).toBe(200)

    const simulated = await simulateWhatsappEb(
      request,
      '50 sacs ciment, 20 barres fer, 10 seaux peinture pour chantier',
    )
    const submitted = await dtSubmitDraft(request, simulated.draftId)
    await saPriceSubmitCdgApprove(request, submitted.id, 1000)
    await approveBtpRequest(request, submitted.id, 'daf')
    await loginBtpApi(request, 'sa')
    expect(
      (
        await request.post(`${API_BASE}/api/v1/procurement/requests/${submitted.id}/create-po`, {
          data: { supplierId: BTP_PILOT.SUPPLIER_ACCOUNT_ID },
        })
      ).ok(),
    ).toBeTruthy()
    const scheduleRes = await request.post(
      `${API_BASE}/api/v1/procurement/requests/${submitted.id}/schedule-delivery`,
      { data: { driverId: BTP_PILOT.DRIVER_ID, date: localTodayIso() } },
    )
    expect(scheduleRes.ok(), await scheduleRes.text()).toBeTruthy()
    const scheduled = (await scheduleRes.json()) as { tourId: string }
    await confirmScheduledBtpDelivery(request, scheduled.tourId)

    await loginBtpApi(request, 'cdg')
    const indRes = await request.get(`${API_BASE}/api/v1/procurement/sites/${BTP_PILOT.SITE_ID}/indicators`)
    expect(indRes.ok(), await indRes.text()).toBeTruthy()
    const ind = (await indRes.json()) as {
      realizedFcfa: number
      varianceFcfa: number | null
      materialsFcfa: number
      materialsSharePct: number | null
      firstExpenseOn: string | null
      top3: Array<{ label: string; amountFcfa: number }>
      byCategory?: Array<{ category: string; amountFcfa: number; shareOfBudgetPct: number | null }>
      daily: Array<{ date: string; realizedFcfa: number }>
    }
    expect(ind.realizedFcfa).toBeGreaterThan(0)
    expect(ind.materialsFcfa).toBe(ind.realizedFcfa)
    expect(ind.materialsSharePct).toBeCloseTo((ind.materialsFcfa / 1_000_000) * 100, 1)
    expect(ind.varianceFcfa).toBe(ind.realizedFcfa - 1_000_000)
    expect(ind.firstExpenseOn).toBe(localTodayIso())
    expect(ind.daily.some((d) => d.date === localTodayIso() && d.realizedFcfa === ind.realizedFcfa)).toBe(true)
    expect(ind.top3.length).toBeGreaterThanOrEqual(1)
    expect(ind.top3.some((p) => /ciment/i.test(p.label))).toBe(true)

    await loginBtpManager(page, 'cdg')
    await page.getByTestId('mgr-tab-suivi-chantier').click()
    // La synthèse (et enveloppe / ventilation / historique / photos) est désormais
    // dans la page « détails » du chantier — on l'ouvre depuis le board.
    await page.getByTestId(`mgr-cdg-row-details-${BTP_PILOT.SITE_ID}`).click()
    await expect(page.getByTestId('mgr-cdg-synthese')).toBeVisible({ timeout: UI_READY_TIMEOUT })
    await page.getByTestId('mgr-cdg-synthese-realized').click()
    await expect(page.getByTestId('mgr-cdg-indicator-page')).toBeVisible()
    await expect(page.getByTestId('mgr-cdg-indicator-page')).toHaveAttribute('data-indicator', 'realized')
    await expect(page.getByTestId('mgr-cdg-indicator-daily')).toBeVisible()
    await expect(page.getByTestId('mgr-cdg-indicator-value')).toContainText(/\d/)
    await page.getByTestId('mgr-cdg-indicator-back').click()
    await page.getByTestId('mgr-cdg-synthese-variance').click()
    await expect(page.getByTestId('mgr-cdg-indicator-page')).toHaveAttribute('data-indicator', 'variance')
    await page.getByTestId('mgr-cdg-indicator-back').click()
    await page.getByTestId('mgr-cdg-synthese-materials').click()
    await expect(page.getByTestId('mgr-cdg-indicator-page')).toHaveAttribute('data-indicator', 'materials')
    await expect(page.getByTestId('mgr-cdg-indicator-categories')).toContainText(/Ciments|ferraille|peinture/i)
    await page.getByTestId('mgr-cdg-indicator-back').click()
    await page.getByTestId('mgr-cdg-synthese-top3').click()
    await expect(page.getByTestId('mgr-cdg-indicator-page')).toHaveAttribute('data-indicator', 'top3')
    await expect(page.getByTestId('mgr-cdg-indicator-daily')).toContainText(/ciment/i)
  })

  test('DT choisit la catégorie de dépense à la création de l’EB (I77)', async ({ page, request }) => {
    test.setTimeout(120_000)
    const simulated = await simulateWhatsappEb(request)
    await loginBtpApi(request, 'dt')
    const draftRes = await request.get(`${API_BASE}/api/v1/procurement/drafts/${simulated.draftId}`)
    expect(draftRes.ok(), await draftRes.text()).toBeTruthy()
    const draftBody = (await draftRes.json()) as {
      draft: { parsedLines: Array<{ label: string; quantity: number; unit: string; spendCategory?: string }> }
    }
    const lines = draftBody.draft.parsedLines.map((l, i) => ({
      ...l,
      spendCategory: i === 0 ? 'ciments' : 'peinture',
    }))
    const patched = await request.patch(`${API_BASE}/api/v1/procurement/drafts/${simulated.draftId}`, {
      data: { parsedLines: lines },
    })
    expect(patched.ok(), await patched.text()).toBeTruthy()
    const submitted = await dtSubmitDraft(request, simulated.draftId)
    const detail = await request.get(`${API_BASE}/api/v1/procurement/requests/${submitted.id}`)
    expect(detail.ok(), await detail.text()).toBeTruthy()
    const body = (await detail.json()) as {
      lines: Array<{ label: string; spendCategory?: string | null }>
    }
    expect(body.lines.some((l) => l.spendCategory === 'ciments')).toBe(true)
    expect(body.lines.some((l) => l.spendCategory === 'peinture')).toBe(true)

    await loginBtpManager(page, 'dt')
    await openAchatsTab(page)
    await page.getByTestId('mgr-achats-requests').click()
    await expect(page.getByTestId(`mgr-achats-request-${submitted.id}`)).toBeVisible({ timeout: UI_READY_TIMEOUT })
    await page.getByTestId(`mgr-achats-request-${submitted.id}`).click()
    await expect(page.getByTestId('mgr-achats-request-detail')).toContainText(/Catégorie/)
    await expect(page.getByTestId('mgr-achats-request-detail')).toContainText(/Ciments/)
    await expect(page.getByTestId('mgr-achats-request-detail')).toContainText(/peinture/i)
  })

  test('DT — compteur Demandes actives après soumission d’une EB (I78)', async ({ page, request }) => {
    test.setTimeout(90_000)
    const simulated = await simulateWhatsappEb(request)
    await dtSubmitDraft(request, simulated.draftId)

    await loginBtpManager(page, 'dt')
    await openAchatsTab(page)
    await expect(page.getByTestId('mgr-achats-inbox')).toBeVisible({ timeout: UI_READY_TIMEOUT })
    await expect(page.getByTestId('mgr-achats-stat-active')).toBeVisible()
    await expect
      .poll(async () => {
        const text = await page.getByTestId('mgr-achats-stat-active').innerText()
        const n = Number((text.match(/\d+/) ?? ['0'])[0])
        return Number.isFinite(n) ? n : 0
      }, { timeout: UI_READY_TIMEOUT })
      .toBeGreaterThan(0)
  })

  test('catalogue TraceO alimenté depuis POINTS FOURNISSEURS DES BC (I79)', async ({ request }) => {
    await loginBtpApi(request, 'sa')
    const sitesRes = await request.get(`${API_BASE}/api/v1/dashboard/supermarkets`)
    expect(sitesRes.ok(), await sitesRes.text()).toBeTruthy()
    const sitesBody = (await sitesRes.json()) as { supermarkets: Array<{ name: string }> }
    const siteNames = sitesBody.supermarkets.map((s) => s.name)
    expect(siteNames.some((n) => /TEBIKOI/i.test(n))).toBe(true)
    expect(siteNames.some((n) => /ANADER BINGERVILLE/i.test(n))).toBe(true)
    expect(siteNames.some((n) => /IMMEUBLE TOURE/i.test(n))).toBe(true)

    const procSites = await request.get(`${API_BASE}/api/v1/procurement/sites`)
    expect(procSites.ok(), await procSites.text()).toBeTruthy()
    const procBody = (await procSites.json()) as { sites: Array<{ name: string }> }
    expect(procBody.sites.some((s) => /TEBIKOI/i.test(s.name))).toBe(true)

    const suppliersRes = await request.get(`${API_BASE}/api/v1/dashboard/suppliers`)
    expect(suppliersRes.ok(), await suppliersRes.text()).toBeTruthy()
    const suppliersBody = (await suppliersRes.json()) as { suppliers: Array<{ name: string }> }
    const supplierNames = suppliersBody.suppliers.map((s) => s.name)
    expect(supplierNames.some((n) => /UBH 01/i.test(n))).toBe(true)
    expect(supplierNames.some((n) => /SOGELUX/i.test(n))).toBe(true)
    expect(supplierNames.some((n) => /CimIvoire/i.test(n))).toBe(true)
  })

  test('tournée BTP conserve l’unité seau (I80)', async ({ request }) => {
    test.setTimeout(120_000)
    const simulated = await simulateWhatsappEb(request, '10 seaux peinture pour chantier')
    expect(simulated.lines.some((l) => /seau/i.test(l.unit))).toBe(true)
    const submitted = await dtSubmitDraft(request, simulated.draftId)
    await saPriceSubmitCdgApprove(request, submitted.id, 1000)
    await approveBtpRequest(request, submitted.id, 'daf')
    await loginBtpApi(request, 'sa')
    expect(
      (
        await request.post(`${API_BASE}/api/v1/procurement/requests/${submitted.id}/create-po`, {
          data: { supplierId: BTP_PILOT.SUPPLIER_ACCOUNT_ID },
        })
      ).ok(),
    ).toBeTruthy()
    const scheduleRes = await request.post(
      `${API_BASE}/api/v1/procurement/requests/${submitted.id}/schedule-delivery`,
      { data: { driverId: BTP_PILOT.DRIVER_ID, date: localTodayIso() } },
    )
    expect(scheduleRes.ok(), await scheduleRes.text()).toBeTruthy()
    const scheduled = (await scheduleRes.json()) as { tourId: string }
    const tourRes = await request.get(`${API_BASE}/api/v1/dashboard/tours/${scheduled.tourId}`)
    expect(tourRes.ok(), await tourRes.text()).toBeTruthy()
    const tour = (await tourRes.json()) as {
      stops: Array<{ unitType: string; products?: Array<{ unit: string }> | null }>
    }
    expect(tour.stops[0]?.unitType).toBe('seau')
    expect(tour.stops[0]?.products?.[0]?.unit).toBe('seau')
    expect(tour.stops[0]?.unitType).not.toBe('colis')
    expect(tour.stops[0]?.unitType).not.toBe('palette')
  })
})

import { test, expect } from '@playwright/test'
import { API_BASE, UI_READY_TIMEOUT } from './helpers'
import {
  binaryPdfFixture,
  getBcRegisterRow,
  listBcRegisterRows,
  loginBtpApi,
  loginBtpManager,
  patchBcFollowupApi,
  resetAndSeedBtp,
  simulateDeliveredBcViaApi,
  transmitBcInvoiceApi,
} from './btp-helpers'

/**
 * Flux « facture fournisseur » SA → comptable (CMPT) — zone la plus régressée du PWA :
 * le n° de facture saisi par le SA disparaissait à chaque bascule d'onglet (registre
 * remonté via `key=`), et la transmission de la copie au comptable n'était couverte
 * par aucun test (voir e2e/INVARIANTS.md I81–I85).
 *
 * Prérequis métier : le registre BC ne liste que les bons **livrés** — chaque test
 * reconstruit donc le parcours EB WhatsApp → BC → livraison confirmée.
 */
const INVOICE_NUMBER = 'FAC-E2E-CMPT-001'
const INVOICE_FILE = `${INVOICE_NUMBER}.pdf`

test.describe('Facture SA → comptable (CMPT)', () => {
  test.beforeEach(async ({ request }) => {
    await resetAndSeedBtp(request)
  })

  test('SA : le n° de facture saisi survit à un changement d’onglet et est persisté (I81)', async ({
    page,
    request,
  }) => {
    test.setTimeout(180_000)
    const bc = await simulateDeliveredBcViaApi(request)

    await loginBtpManager(page, 'sa')
    await page.getByTestId('mgr-tab-suivi-bc').click()
    await expect(page.getByTestId('mgr-suivi-bc-table')).toBeVisible({ timeout: UI_READY_TIMEOUT })
    await expect(page.getByTestId('mgr-suivi-bc-table')).toContainText(bc.bon)

    const invoiceInput = page.getByTestId(`mgr-suivi-bc-invoice-${bc.purchaseOrderId}`)
    await invoiceInput.fill(INVOICE_NUMBER)
    await invoiceInput.blur() // sauvegarde à la sortie du champ (onBlur)
    await expect(invoiceInput).toHaveValue(INVOICE_NUMBER)

    // Régression : le registre était remonté à chaque bascule d'onglet (key=…) et la
    // saisie disparaissait de l'écran comme du store.
    await page.getByTestId('mgr-tab-achats').click()
    await expect(page.getByTestId('mgr-achats-tab')).toBeVisible({ timeout: UI_READY_TIMEOUT })
    await page.getByTestId('mgr-tab-suivi-bc').click()
    await expect(page.getByTestId('mgr-suivi-bc-table')).toBeVisible({ timeout: UI_READY_TIMEOUT })
    await expect(page.getByTestId(`mgr-suivi-bc-invoice-${bc.purchaseOrderId}`)).toHaveValue(
      INVOICE_NUMBER,
    )

    // …et la valeur est bien en base (pas seulement en mémoire React).
    const row = await getBcRegisterRow(request, 'sa', bc.purchaseOrderId)
    expect(row.invoice).toBe(INVOICE_NUMBER)
  })

  test('SA : Transmettre reste verrouillé sans n° + copie, puis passe en ✓ Transmis (I82)', async ({
    page,
    request,
  }) => {
    test.setTimeout(180_000)
    const bc = await simulateDeliveredBcViaApi(request)

    await loginBtpManager(page, 'sa')
    await page.getByTestId('mgr-tab-suivi-bc').click()
    await expect(page.getByTestId('mgr-suivi-bc-table')).toBeVisible({ timeout: UI_READY_TIMEOUT })

    const transmit = page.getByTestId(`mgr-suivi-bc-invoice-transmit-${bc.purchaseOrderId}`)
    // Ni copie ni n° : la transmission au comptable est impossible.
    await expect(transmit).toBeDisabled()

    // Le sélecteur est masqué (display:none) et la ligne cible est mémorisée par
    // `openInvoicePicker` au clic sur 📎 Joindre : un setInputFiles direct ne cible
    // aucune ligne (handleInvoiceFileChange sort si row==null) → on passe par
    // l'événement « filechooser » de Playwright.
    const [chooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.getByTestId(`mgr-suivi-bc-invoice-attach-${bc.purchaseOrderId}`).click(),
    ])
    await chooser.setFiles({
      name: INVOICE_FILE,
      mimeType: 'application/pdf',
      buffer: binaryPdfFixture(),
    })
    await expect(page.getByText(`Facture jointe · ${INVOICE_FILE}`)).toBeVisible({ timeout: 20_000 })
    await expect(page.getByTestId(`mgr-suivi-bc-invoice-preview-${bc.purchaseOrderId}`)).toContainText(
      INVOICE_FILE,
      { timeout: 20_000 },
    )
    // Copie présente mais n° manquant → toujours verrouillé.
    await expect(transmit).toBeDisabled()

    const invoiceInput = page.getByTestId(`mgr-suivi-bc-invoice-${bc.purchaseOrderId}`)
    await invoiceInput.fill(INVOICE_NUMBER)
    await invoiceInput.blur()
    await expect(transmit).toBeEnabled()
    await transmit.click()

    await expect(
      page.getByTestId(`mgr-suivi-bc-invoice-transmitted-${bc.purchaseOrderId}`),
    ).toContainText('Transmis', { timeout: 20_000 })
    await expect(page.getByText(`Facture ${INVOICE_NUMBER} transmise au comptable`)).toBeVisible({
      timeout: 15_000,
    })

    // Persistance : la pastille survit à une bascule d'onglet, le serveur porte le flag.
    await page.getByTestId('mgr-tab-achats').click()
    await page.getByTestId('mgr-tab-suivi-bc').click()
    await expect(
      page.getByTestId(`mgr-suivi-bc-invoice-transmitted-${bc.purchaseOrderId}`),
    ).toBeVisible({ timeout: UI_READY_TIMEOUT })

    const row = await getBcRegisterRow(request, 'sa', bc.purchaseOrderId)
    expect(row.invoiceTransmitted).toBe(true)
    expect(row.invoice).toBe(INVOICE_NUMBER)
    expect(row.invoiceFile?.fileName).toBe(INVOICE_FILE)
  })

  test('CMPT : la facture transmise est « Reçu », consultable et payable — jamais éditable (I83)', async ({
    page,
    request,
  }) => {
    test.setTimeout(180_000)
    const bc = await simulateDeliveredBcViaApi(request)
    await transmitBcInvoiceApi(request, bc.purchaseOrderId, INVOICE_NUMBER)

    await loginBtpManager(page, 'cmpt')
    await expect(page.getByTestId('mgr-tab-comptabilite')).toBeVisible({ timeout: UI_READY_TIMEOUT })

    await page.getByTestId('cmpt-subtab-factures').click()
    const table = page.getByTestId('cmpt-factures-table')
    await expect(table).toBeVisible({ timeout: UI_READY_TIMEOUT })
    await expect(table).toContainText(INVOICE_NUMBER)
    await expect(table).toContainText(bc.bon)
    await expect(page.getByTestId(`cmpt-facture-status-${bc.purchaseOrderId}`)).toHaveText('Reçu')

    // Le comptable consulte : aucun champ de saisie du registre SA n'est monté chez lui.
    await expect(page.getByTestId(`mgr-suivi-bc-invoice-${bc.purchaseOrderId}`)).toHaveCount(0)
    await expect(page.getByTestId('mgr-suivi-bc-table')).toHaveCount(0)

    // Copie de facture consultable dans la page (aperçu), puis refermable.
    await page.getByTestId(`cmpt-facture-open-${bc.purchaseOrderId}`).click()
    await expect(page.getByTestId('cmpt-preview')).toBeVisible({ timeout: 20_000 })
    await expect(page.getByTestId('cmpt-preview')).toContainText(INVOICE_FILE)
    await page.getByTestId('cmpt-preview-close').click()
    await expect(page.getByTestId('cmpt-preview')).toHaveCount(0)

    // Paiement : bouton Oui/Non, valeur conservée après changement de sous-onglet.
    const paid = page.getByTestId(`cmpt-facture-paid-${bc.purchaseOrderId}`)
    await expect(paid).toHaveText('Non')
    await paid.click()
    await expect(paid).toHaveText('Oui', { timeout: 15_000 })
    await expect(page.getByText(/Facture marquée payée/)).toBeVisible({ timeout: 15_000 })

    await page.getByTestId('cmpt-subtab-dashboard').click()
    await page.getByTestId('cmpt-subtab-factures').click()
    await expect(page.getByTestId(`cmpt-facture-paid-${bc.purchaseOrderId}`)).toHaveText('Oui')

    const row = await getBcRegisterRow(request, 'cmpt', bc.purchaseOrderId)
    expect(row.invoicePaid).toBe(true)
    expect(row.invoiceTransmitted).toBe(true)
    expect(row.invoice).toBe(INVOICE_NUMBER)
  })

  test('CMPT : registre et copie lisibles, paiement autorisé, transmission interdite (I84)', async ({
    request,
  }) => {
    test.setTimeout(180_000)
    const bc = await simulateDeliveredBcViaApi(request)
    await transmitBcInvoiceApi(request, bc.purchaseOrderId, INVOICE_NUMBER)

    // Le comptable lit le registre du mois…
    const listed = await listBcRegisterRows(request, 'cmpt')
    expect(listed.rows.some((r) => r.purchaseOrderId === bc.purchaseOrderId)).toBe(true)

    // …et consulte la copie de facture transmise par le SA (PDF).
    await loginBtpApi(request, 'cmpt')
    const file = await request.get(
      `${API_BASE}/api/v1/procurement/bc-register/${bc.purchaseOrderId}/invoice-file`,
    )
    expect(file.status()).toBe(200)
    expect(file.headers()['content-type']).toMatch(/application\/pdf/)

    // Joindre/transmettre une facture reste réservé au SA → 403 pour le comptable.
    const upload = await request.post(
      `${API_BASE}/api/v1/procurement/bc-register/${bc.purchaseOrderId}/invoice-file`,
      {
        data: {
          fileName: 'facture-comptable.pdf',
          contentType: 'application/pdf',
          data: binaryPdfFixture().toString('base64'),
        },
      },
    )
    expect(upload.status()).toBe(403)

    // Le paiement (ce que le comptable pilote) est accepté.
    const paid = await patchBcFollowupApi(request, 'cmpt', bc.purchaseOrderId, { invoicePaid: true })
    expect(paid.status).toBe(200)
    const after = await getBcRegisterRow(request, 'cmpt', bc.purchaseOrderId)
    expect(after.invoicePaid).toBe(true)
  })

  test('CMPT : espace limité à la Comptabilité, KPI du mois et suivi filtrable (I85)', async ({
    page,
    request,
  }) => {
    test.setTimeout(180_000)
    const bc = await simulateDeliveredBcViaApi(request)
    await transmitBcInvoiceApi(request, bc.purchaseOrderId, INVOICE_NUMBER)

    await loginBtpManager(page, 'cmpt')

    // Le rôle comptable n'ouvre que l'espace Comptabilité (ni Achats, ni Suivi BC).
    await expect(page.getByTestId('mgr-tab-comptabilite')).toBeVisible({ timeout: UI_READY_TIMEOUT })
    await expect(page.getByTestId('mgr-tab-achats')).toHaveCount(0)
    await expect(page.getByTestId('mgr-tab-suivi-bc')).toHaveCount(0)

    // Tableau de bord du mois : le BC livré et sa facture sont comptés.
    await expect(page.getByTestId('cmpt-kpi-total-bc')).toContainText('1')
    await expect(page.getByTestId('cmpt-kpi-total-invoices')).toContainText('1')
    await expect(page.getByTestId('cmpt-table-bc-mois')).toContainText(bc.bon)

    // Suivi : même registre, filtré par les modes de paiement présents ce mois.
    await page.getByTestId('cmpt-subtab-suivi').click()
    await expect(page.getByTestId('cmpt-suivi-table')).toContainText(bc.bon)
    await page.getByTestId('cmpt-filter-paymentMode').selectOption('CREDIT')
    await expect(page.getByTestId('cmpt-suivi-table')).toContainText(bc.bon)
  })
})

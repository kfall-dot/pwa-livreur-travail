import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createServer } from 'vite'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

test('les EB créées par le SA et reçues du DT offrent les mêmes commandes commerciales', async () => {
  const server = await createServer({ server: { middlewareMode: true, hmr: false, watch: null } })
  try {
    const { RequestDetailPanel, DraftReviewPanel } = await server.ssrLoadModule('/src/pages/manager/procurement/AchatsTab.tsx')
    const { fetchRequest } = await server.ssrLoadModule('/src/pages/manager/procurement/procurementApi.ts')
    const previousFetch = globalThis.fetch
    try {
      globalThis.fetch = async () => new Response(JSON.stringify({ message: 'Erreur interne du serveur' }), { status: 500, headers: { 'Content-Type': 'application/json' } })
      await assert.rejects(() => fetchRequest('existing-eb'), /Erreur interne du serveur/)
      globalThis.fetch = async () => new Response(JSON.stringify({ message: 'Demande introuvable' }), { status: 404, headers: { 'Content-Type': 'application/json' } })
      await assert.rejects(() => fetchRequest('missing-eb'), /Demande introuvable/)
    } finally {
      globalThis.fetch = previousFetch
    }
    const { ComptabiliteTab } = await server.ssrLoadModule('/src/pages/manager/procurement/ComptabiliteTab.tsx')
    const { useProcurementStore } = await server.ssrLoadModule('/src/stores/procurementStore.ts')
    useProcurementStore.setState({ loading: false, error: null, month: '2026-10',
      months: [{ key: '2026-10', label: 'Octobre 2026' }], rows: [{
        purchaseOrderId: 'bc32', purchaseRequestId: 'eb32', bon: 'BC-2026-0032', status: 'delivered',
        date: '20/10/2026', supplierName: 'Fournisseur', siteName: 'Chantier', paymentMode: 'CREDIT',
        amountFcfa: 10000, amountLabel: '10 000', invoice: '', verification: '—',
      }] })
    const initialAccountingState = { ...useProcurementStore.getInitialState() }
    Object.assign(useProcurementStore.getInitialState(), useProcurementStore.getState())
    const accountingHtml = renderToStaticMarkup(createElement(ComptabiliteTab, { handleAuth: () => false }))
    Object.assign(useProcurementStore.getInitialState(), initialAccountingState)
    const bc32Row = accountingHtml.match(/BC-2026-0032[\s\S]*?<\/tr>/)?.[0] ?? ''
    assert.ok(bc32Row.includes('Livré'), 'le comptable voit le véritable statut du BC32')
    assert.ok(!bc32Row.includes('Validé'), 'la vérification vide ne valide pas le BC')
    const noop = () => {}
    const { SaOverview } = await server.ssrLoadModule('/src/pages/manager/procurement/SaOverview.tsx')
    const overviewHtml = renderToStaticMarkup(createElement(SaOverview, {
      currentManagerId: 'resource-sa', onOpenRequest: noop,
      requests: [
        { id: 'own', reference: 'EB-OWN', status: 'submitted', createdByManagerId: 'resource-sa', createdAt: '2026-10-22T12:00:00Z' },
        { id: 'dt', reference: 'EB-DT', status: 'submitted', createdByManagerId: 'manager-dt', createdAt: '2026-10-22T12:00:00Z' },
      ],
    }))
    const ownRow = overviewHtml.match(/data-testid="mgr-sa-row-own"[\s\S]*?<\/tr>/)?.[0] ?? ''
    const dtRow = overviewHtml.match(/data-testid="mgr-sa-row-dt"[\s\S]*?<\/tr>/)?.[0] ?? ''
    assert.ok(ownRow.includes('Validation SA'), 'une EB initiée par l’adjoint affiche Validation SA')
    assert.ok(dtRow.includes('Chiffrer'), 'une EB reçue du DT conserve Chiffrer')
    const callbacks = Object.fromEntries([
      'onBack', 'onCommentChange', 'onPinChange', 'onSupplierChange', 'onPoAmountChange',
      'onApprove', 'onReject', 'onCreatePo', 'onCreateTreasury', 'onScheduleDelivery',
      'onUnitPriceChange', 'onAmountChange', 'onLineCommercial', 'onSavePricing',
      'onSubmitFinance', 'onUploadAttachment', 'onUploadAttachmentBulk', 'onRemoveAttachment',
      'onReviseQuantities', 'onReviseQuantityChange', 'onReviseCommentChange',
      'onRevisePinChange', 'onReviseModalClose', 'onReviseConfirm',
    ].map((name) => [name, noop]))
    const draftLine = { label: 'Ciment', unit: 'sac', quantity: 10, spendCategory: 'autres_materiaux' }
    const draftHtml = renderToStaticMarkup(createElement(DraftReviewPanel, {
      detail: {
        draft: { id: 'draft-sa', createdAt: '2026-10-22T12:00:00Z', parsedLines: [draftLine] },
        messages: [], sites: [], suppliers: [], parseHints: { source: 'blank_fiche' },
      },
      editLines: [draftLine], editUrgency: 'normal', editSiteId: '', editRequester: 'SA',
      editObjet: 'BESOIN', editNeededBy: '', editPin: '', managerName: 'SA',
      procurementRole: 'purchasing', canEdit: true, actionLoading: false,
      onBack: noop, onLineChange: noop, onAddLine: noop, onRemoveLine: noop,
      onUrgencyChange: noop, onSiteChange: noop, onRequesterChange: noop,
      onObjetChange: noop, onNeededByChange: noop, onPinChange: noop,
      onValidate: noop, onSubmit: noop,
    }))
    assert.ok(draftHtml.includes('Continuer vers validation'))
    for (const control of [
      'mgr-achats-draft-select-all', 'mgr-achats-draft-line-select-0',
      'mgr-achats-draft-bulk-supplier-select', 'mgr-achats-draft-bulk-supplier-assign',
      'mgr-achats-draft-bulk-payment-select', 'mgr-achats-draft-bulk-payment-assign',
    ]) {
      assert.ok(draftHtml.includes(`data-testid="${control}"`), `Création SA : ${control} doit être disponible`)
    }
    for (const creator of ['manager-sa', 'manager-dt']) {
      const html = renderToStaticMarkup(createElement(RequestDetailPanel, {
        ...callbacks,
        detail: {
          request: {
            id: 'request-1', companyId: 'company-1', siteId: 'site-1', reference: 'EB-2026-0001',
            status: 'submitted', createdByManagerId: creator,
            createdAt: '2026-10-22T12:00:00Z', updatedAt: '2026-10-22T12:00:00Z',
          },
          lines: [{ id: 'line-1', purchaseRequestId: 'request-1', label: 'Ciment', unit: 'sac', quantity: 10, displayOrder: 0 }],
          approvalSteps: [], suppliers: [],
        },
        procurementRole: 'purchasing', highlight: null, approvalComment: '', approvalPin: '',
        selectedSupplierId: '', poAmount: '', actionLoading: false, managerName: 'Service achats',
        reviseModalOpen: false, reviseQuantities: {}, reviseComment: '', revisePin: '',
      }))
      for (const control of [
        'mgr-achats-bulk-supplier', 'mgr-achats-bulk-payment', 'mgr-achats-bulk-attachment',
        'mgr-achats-line-select-all', 'mgr-achats-line-select-0',
        'mgr-achats-line-unit-price-0', 'mgr-achats-line-amount-0',
        'mgr-achats-line-supplier-0', 'mgr-achats-line-payment-0',
        'mgr-achats-line-attach-0', 'mgr-achats-save-pricing',
        'mgr-achats-submit-finance', 'mgr-achats-request-eb-fiche-link',
      ]) {
        assert.ok(html.includes(`data-testid="${control}"`), `${creator} : ${control} doit rester disponible`)
      }
    }
    for (const status of ['submitted', 'sa_head_review', 'bc_head_review']) {
      const reviewProps = {
        ...callbacks, onApproveSaBc: noop,
        detail: {
          request: { id: 'pending-1', companyId: 'company-1', siteId: 'site-1', reference: 'EB-2026-0002', status, saReviewerId: 'head-sa', createdAt: '2026-10-22T12:00:00Z' },
          lines: [{ id: 'line-1', purchaseRequestId: 'pending-1', label: 'Ciment', unit: 'sac', quantity: 10, displayOrder: 0 }],
          approvalSteps: [], suppliers: [],
        },
        procurementRole: 'purchasing', highlight: null, approvalComment: '', approvalPin: '',
        selectedSupplierId: '', poAmount: '', actionLoading: false, managerName: 'SA',
        reviseModalOpen: false, reviseQuantities: {}, reviseComment: '', revisePin: '',
      }
      const headHtml = renderToStaticMarkup(createElement(RequestDetailPanel, { ...reviewProps, currentManagerId: 'head-sa', saSupervisorId: null }))
      const readOnlyHtml = renderToStaticMarkup(createElement(RequestDetailPanel, { ...reviewProps, currentManagerId: 'head-sa', saSupervisorId: null, readOnly: true }))
      assert.ok(!readOnlyHtml.includes('data-testid="mgr-achats-save-pricing"'), 'une fiche verrouillée ne permet pas de changer les montants')
      assert.ok(!readOnlyHtml.includes('data-testid="mgr-sa-head-approve"'), 'le chef ne valide pas une fiche prise en charge par une autre personne')
      assert.ok(readOnlyHtml.includes('mgr-achats-request-eb-fiche-link'), 'la consultation et l’impression restent disponibles')
      if (status === 'submitted') {
        const resourceHtml = renderToStaticMarkup(createElement(RequestDetailPanel, { ...reviewProps, currentManagerId: 'resource-sa', saSupervisorId: 'head-sa' }))
        assert.ok(resourceHtml.includes('Soumettre au chef SA'))
        assert.ok(!resourceHtml.includes('Soumettre au CdG'))
        assert.ok(headHtml.includes('Soumettre au CdG'))
        continue
      }
      assert.ok(headHtml.includes('data-testid="mgr-sa-head-pin"'), `${status} : le chef doit saisir son NIP`)
      assert.ok(headHtml.includes('data-testid="mgr-sa-head-approve"'))
      for (const actor of [{ currentManagerId: 'resource-sa', saSupervisorId: 'head-sa' }, { currentManagerId: 'other-head', saSupervisorId: null }]) {
        const html = renderToStaticMarkup(createElement(RequestDetailPanel, { ...reviewProps, ...actor }))
        assert.ok(!html.includes('data-testid="mgr-sa-head-approve"'), `${status} : aucun autre compte ne doit pouvoir valider`)
        assert.ok(!html.includes('data-testid="mgr-achats-save-pricing"'), `${status} : le chiffrage en attente est verrouillé`)
      }
    }
  } finally {
    await server.close()
  }
})

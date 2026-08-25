import { useCallback, useEffect, useRef, useState } from 'react'
import { authFetch } from '../managerApi'
import { toast } from '../../../lib/toast'
import { defaultReplanDate } from '../../../lib/dates'
import {
  approveRequest,
  createPurchaseOrder,
  createTreasuryAdvance,
  documentHtmlUrl,
  treasuryHtmlUrl,
  ebFicheHtmlUrl,
  ebRequestFicheHtmlUrl,
  fetchDraft,
  fetchRequest,
  fetchRequests,
  fetchSuppliers,
  pasteWhatsappDraft,
  createBlankEbFiche,
  rejectRequest,
  submitDraft,
  submitRequestFinance,
  updateDraft,
  updateRequestPricing,
  uploadRequestLineAttachment,
  removeRequestLineAttachment,
  fetchRequestLineAttachment,
  fetchSiteBudget,
  fetchSiteBudgets,
} from './procurementApi'
import type {
  DraftDetailResponse,
  ParsedEbLine,
  ProcurementRole,
  PurchaseRequestDraftRow,
  PurchaseRequestRow,
  RequestDetailResponse,
  SiteBudget,
  ProcurementTourPrefill,
} from './procurementTypes'
import { catalogUnitFromEb } from '../../../../shared/ebCatalog'
import { EB_SPEND_CATEGORIES, ebSpendCategoryLabel, inferEbSpendCategory, normalizeEbSpendCategory } from '../../../../shared/ebSpendCategory'
import { hasComptantLines } from '../../../../shared/saFinanceGate'
import {
  AlertBox,
  canApproveRequest,
  canCreatePo,
  canEditDraft,
  canPriceRequest,
  canRejectRequest,
  canScheduleDelivery,
  css,
  EmptyHint,
  Field,
  formatConfidence,
  formatFcfa,
  LoadingHint,
  approvalDecisionLabel,
  formatApprovalAt,
  PROCUREMENT_ROLE_LABELS,
  ProcurementStatusBadge,
  StatCard,
} from './procurementUi'
import { saFinanceIncompleteMessage } from '../../../../shared/saFinanceGate'

type AchatsView = 'inbox' | 'requests'

const PRE_BC_STATUSES = new Set([
  'submitted',
  'cdg_review',
  'daf_review',
  'sa_review',
  'bt_pending',
  'daf_bt_review',
  'pdg_review',
])
type DriverOption = { id: string; name: string }

function emptyLine(): ParsedEbLine {
  return { label: '', quantity: 1, unit: 'unité', supplierName: '', paymentMode: '', spendCategory: 'autres_materiaux' }
}

function pricingLinesFromDetail(lines: RequestDetailResponse['lines']) {
  return lines.map((l) => ({
    id: l.id,
    unitPriceFcfa: Number(l.unitPriceFcfa ?? 0),
    supplierName: l.supplierName ?? '',
    paymentMode: l.paymentMode ?? '',
  }))
}

/** Joindre/retirer une PJ recharge le détail serveur : on garde le chiffrage local non enregistré. */
function keepUnsavedPricing(
  prev: RequestDetailResponse | null,
  next: RequestDetailResponse,
): RequestDetailResponse {
  if (!prev) return next
  const prevById = new Map(prev.lines.map((l) => [l.id, l]))
  const lines = next.lines.map((line) => {
    const local = prevById.get(line.id)
    if (!local) return line
    return {
      ...line,
      unitPriceFcfa: local.unitPriceFcfa,
      amountFcfa: local.amountFcfa,
      supplierName: local.supplierName,
      paymentMode: local.paymentMode,
    }
  })
  const total = lines.reduce((s, l) => s + Number(l.amountFcfa ?? 0), 0)
  return { ...next, lines, request: { ...next.request, totalAmountFcfa: total } }
}

function attachmentPreviewKind(contentType: string): 'image' | 'pdf' | 'none' {
  if (contentType === 'application/pdf') return 'pdf'
  if (contentType.startsWith('image/') && !/heic|heif/i.test(contentType)) return 'image'
  return 'none'
}

function supplierIdFromLines(
  lines: Array<{ supplierName?: string | null }>,
  suppliers: Array<{ id: string; name: string }>,
): string {
  const names = [...new Set(lines.map((l) => (l.supplierName ?? '').trim()).filter(Boolean))]
  if (names.length === 1) {
    const match = suppliers.find((s) => s.name === names[0])
    if (match) return match.id
  }
  return ''
}

function objetFromLines(lines: ParsedEbLine[], destination?: string | null): string {
  const names = [...new Set(lines.map((l) => l.label.trim()).filter(Boolean))].slice(0, 4)
  if (names.length) return `BESOIN - ${names.join(', ')}`
  if (destination && destination !== 'À préciser') return `BESOIN - ${destination}`
  return 'BESOIN'
}

function linesFromDraft(draft: PurchaseRequestDraftRow): ParsedEbLine[] {
  if (!draft.parsedLines?.length) return [emptyLine()]
  return draft.parsedLines.map((l) => ({
    ...l,
    quantity: Number(l.quantity) || 0,
    spendCategory: normalizeEbSpendCategory(l.spendCategory),
  }))
}

function linesForDraftPatch(lines: ParsedEbLine[]): ParsedEbLine[] {
  return lines.map((l) => ({
    ...l,
    quantity: Number(l.quantity),
    spendCategory: normalizeEbSpendCategory(l.spendCategory),
  }))
}

const PAYMENT_MODES = ['CREDIT', 'COMPTANT', 'CHEQUE', 'VIREMENT'] as const

function SupplierSelect({
  value,
  suppliers,
  disabled,
  required,
  testId,
  onChange,
}: {
  value: string
  suppliers: Array<{ id: string; name: string }>
  disabled?: boolean
  required?: boolean
  testId: string
  onChange: (name: string) => void
}) {
  return (
    <select
      value={value}
      disabled={disabled}
      required={required}
      onChange={(e) => onChange(e.target.value)}
      className="mgr-input"
      data-testid={testId}
    >
      <option value="">À préciser</option>
      {suppliers.map((s) => (
        <option key={s.id} value={s.name}>{s.name}</option>
      ))}
      {value && !suppliers.some((s) => s.name === value) ? (
        <option value={value}>{value}</option>
      ) : null}
    </select>
  )
}

export function AchatsTab({
  handleAuth,
  procurementRole,
  managerName,
  onInboxCountChanged,
  onOpenPlanifier,
  onOpenSuiviChantier,
}: {
  handleAuth: (status: number) => boolean
  procurementRole: ProcurementRole | null
  managerName?: string
  onInboxCountChanged?: () => void
  onOpenPlanifier?: (prefill: ProcurementTourPrefill) => void
  onOpenSuiviChantier?: () => void
}) {
  const [view, setView] = useState<AchatsView>('inbox')
  const [drafts, setDrafts] = useState<PurchaseRequestDraftRow[]>([])
  const [requests, setRequests] = useState<PurchaseRequestRow[]>([])
  const [cdgBudgets, setCdgBudgets] = useState<SiteBudget[]>([])
  const [cdgFocus, setCdgFocus] = useState<'all' | 'validate' | 'pipeline'>('all')
  const [selectedDraftId, setSelectedDraftId] = useState<string | null>(null)
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null)
  const [draftDetail, setDraftDetail] = useState<DraftDetailResponse | null>(null)
  const [requestDetail, setRequestDetail] = useState<RequestDetailResponse | null>(null)
  const [editLines, setEditLines] = useState<ParsedEbLine[]>([emptyLine()])
  const [editUrgency, setEditUrgency] = useState('normal')
  const [editSiteId, setEditSiteId] = useState('')
  const [editRequester, setEditRequester] = useState('')
  const [editObjet, setEditObjet] = useState('BESOIN')
  const [editNeededBy, setEditNeededBy] = useState('')
  const [editPin, setEditPin] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState(false)
  const [approvalComment, setApprovalComment] = useState('')
  const [approvalPin, setApprovalPin] = useState('')
  const [selectedSupplierId, setSelectedSupplierId] = useState('')
  const [poAmount, setPoAmount] = useState('')
  const [, setDrivers] = useState<DriverOption[]>([])
  const [scheduleDriverId, setScheduleDriverId] = useState('')
  const [scheduleDate] = useState(defaultReplanDate())
  const [pasteText, setPasteText] = useState('')
  const [pasteLoading, setPasteLoading] = useState(false)
  const [blankLoading, setBlankLoading] = useState(false)

      const roleLabel = procurementRole ? PROCUREMENT_ROLE_LABELS[procurementRole] : 'Lecture seule'

  const toValidate = requests.filter((r) => r.status === 'cdg_review')
  const pipeline = requests.filter((r) => PRE_BC_STATUSES.has(r.status))
  const unfrozen = cdgBudgets.filter((b) => !b.budgetFrozenAt)
  const missingAmendment = cdgBudgets.filter((b) => b.missingAmendment)
  const pipelineAmount = pipeline.reduce((sum, r) => sum + (r.totalAmountFcfa ?? 0), 0)
  const oldestPipeline = pipeline.reduce<string | null>((oldest, r) => {
    const at = r.submittedAt ?? r.createdAt
    if (!at) return oldest
    if (!oldest || at < oldest) return at
    return oldest
  }, null)
  const visibleRequests =
    procurementRole === 'controle_gestion' && cdgFocus === 'validate'
      ? toValidate
      : procurementRole === 'controle_gestion' && cdgFocus === 'pipeline'
        ? pipeline
        : requests

  useEffect(() => {
    if (procurementRole && procurementRole !== 'technical_director') {
      setView('requests')
    }
  }, [procurementRole])

  const draftLoadGen = useRef(0)
  const selectedDraftIdRef = useRef<string | null>(null)
  useEffect(() => {
    selectedDraftIdRef.current = selectedDraftId
  }, [selectedDraftId])

  const loadLists = useCallback(async () => {
    const keepPanel = Boolean(selectedDraftIdRef.current)
    if (!keepPanel) {
      setLoading(true)
      setError(null)
    }
    try {
      const draftRes = await authFetch('/procurement/drafts?needsReview=true')
      if (handleAuth(draftRes.status)) return
      if (draftRes.ok) {
        const data = await draftRes.json() as { drafts: PurchaseRequestDraftRow[] }
        setDrafts(data.drafts ?? [])
      }
      const rows = await fetchRequests()
      setRequests(rows)
      if (procurementRole === 'controle_gestion') {
        try {
          setCdgBudgets(await fetchSiteBudgets())
        } catch {
          setCdgBudgets([])
        }
      }
    } catch (err) {
      if (!keepPanel && !handleAuth(500)) {
        setError(err instanceof Error ? err.message : 'Erreur chargement achats')
      }
    } finally {
      if (!keepPanel) setLoading(false)
    }
  }, [handleAuth, procurementRole])

  const loadRequests = loadLists

  const loadDraftDetail = useCallback(async (id: string) => {
    const gen = ++draftLoadGen.current
    setLoading(true)
    setError(null)
    try {
      const detail = await fetchDraft(id)
      if (gen !== draftLoadGen.current) return
      setDraftDetail(detail)
      setEditLines(linesFromDraft(detail.draft))
      setEditUrgency(detail.draft.parsedUrgency ?? 'normal')
      setEditSiteId(detail.draft.siteId ?? '')
      const hintName = detail.parseHints?.requesterName
      setEditRequester(hintName && hintName !== 'À identifier' ? hintName : '')
      setEditObjet(
        detail.parseHints?.objet || objetFromLines(linesFromDraft(detail.draft), detail.parseHints?.destination),
      )
      setEditNeededBy(
        detail.parseHints?.neededBy && detail.parseHints.neededBy !== 'À préciser'
          ? detail.parseHints.neededBy
          : '',
      )
      setEditPin('')
    } catch (err) {
      if (gen !== draftLoadGen.current) return
      setError(err instanceof Error ? err.message : 'Brouillon introuvable')
      setSelectedDraftId(null)
      setDraftDetail(null)
    } finally {
      if (gen === draftLoadGen.current) setLoading(false)
    }
  }, [])

  const loadRequestDetail = useCallback(async (id: string) => {
    setLoading(true)
    setError(null)
    try {
      const [detail, suppliers] = await Promise.all([fetchRequest(id), fetchSuppliers()])
      setRequestDetail({
        ...detail,
        suppliers: detail.suppliers?.length ? detail.suppliers : suppliers,
      })
      setSelectedSupplierId(
        detail.request.supplierId
          || supplierIdFromLines(detail.lines, detail.suppliers?.length ? detail.suppliers : suppliers)
          || '',
      )
      setPoAmount(detail.request.totalAmountFcfa != null ? String(detail.request.totalAmountFcfa) : '')
      setApprovalComment('')
      setApprovalPin('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Demande introuvable')
      setSelectedRequestId(null)
    } finally {
      setLoading(false)
    }
  }, [])

  const loadDrivers = useCallback(async () => {
    const res = await authFetch('/dashboard/drivers')
    if (handleAuth(res.status)) return
    const data = await res.json() as { drivers: DriverOption[] }
    const active = (data.drivers ?? []).filter((d) => d.id)
    setDrivers(active)
    if (active[0]) setScheduleDriverId(active[0].id)
  }, [handleAuth])

  useEffect(() => {
    void loadLists()
  }, [view, loadLists])

  useEffect(() => {
    if (!selectedDraftId) {
      draftLoadGen.current += 1
      setDraftDetail(null)
      return
    }
    if (draftDetail?.draft.id === selectedDraftId) return
    void loadDraftDetail(selectedDraftId)
  }, [selectedDraftId, loadDraftDetail, draftDetail?.draft.id])

  useEffect(() => {
    if (selectedRequestId) {
      void loadRequestDetail(selectedRequestId)
      void loadDrivers()
    } else {
      setRequestDetail(null)
    }
  }, [selectedRequestId, loadRequestDetail, loadDrivers])

  const refreshInbox = () => {
    onInboxCountChanged?.()
    void loadLists()
  }

  const handleValidateDraft = async () => {
    if (!selectedDraftId || !canEditDraft(procurementRole)) return
    const validLines = editLines.filter((l) => l.label.trim() && l.quantity > 0)
    if (validLines.length === 0) {
      toast.error('Ajoutez au moins une ligne valide.')
      return
    }
    setActionLoading(true)
    try {
      await updateDraft(selectedDraftId, {
        siteId: editSiteId || null,
        parsedUrgency: editUrgency,
        parsedLines: linesForDraftPatch(validLines),
        requesterName: editRequester.trim(),
        objet: editObjet.trim(),
        neededBy: editNeededBy.trim(),
      })
      toast.success('Brouillon enregistré.')
      await loadDraftDetail(selectedDraftId)
      refreshInbox()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Enregistrement échoué')
    } finally {
      setActionLoading(false)
    }
  }

  const handleSubmitDraft = async () => {
    if (!selectedDraftId || !canEditDraft(procurementRole)) return
    const validLines = editLines.filter((l) => l.label.trim() && l.quantity > 0)
    if (validLines.length === 0) {
      toast.error('Ajoutez au moins une ligne valide.')
      return
    }
    if (procurementRole === 'technical_director' && !editRequester.trim()) {
      toast.error('Saisissez le nom du demandeur.')
      return
    }
    if (!editSiteId) {
      toast.error('Sélectionnez le chantier (SITE).')
      return
    }
    if (procurementRole === 'technical_director' && !editPin.trim()) {
      toast.error('Saisissez le NIP de signature.')
      return
    }
    setActionLoading(true)
    try {
      await updateDraft(selectedDraftId, {
        siteId: editSiteId || null,
        parsedUrgency: editUrgency,
        parsedLines: linesForDraftPatch(validLines),
        requesterName: editRequester.trim(),
        objet: editObjet.trim(),
        neededBy: editNeededBy.trim(),
      })
      const request = await submitDraft(selectedDraftId, {
        pin: editPin.trim() || undefined,
        requesterName: editRequester.trim() || undefined,
        objet: editObjet.trim() || undefined,
        neededBy: editNeededBy.trim() || undefined,
      })
      toast.success(`EB ${request.reference} transmise au Service achats.`)
      setSelectedDraftId(null)
      setSelectedRequestId(null)
      setView('requests')
      refreshInbox()
      void loadRequests()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Soumission échouée')
    } finally {
      setActionLoading(false)
    }
  }

  const handleLineUnitPrice = (lineId: string, unitPriceFcfa: number) => {
    setRequestDetail((prev) => {
      if (!prev) return prev
      const lines = prev.lines.map((l) => {
        if (l.id !== lineId) return l
        const qty = Number(l.quantity)
        const amount = Math.round(Math.max(0, unitPriceFcfa) * (Number.isFinite(qty) ? qty : 0))
        return { ...l, unitPriceFcfa, amountFcfa: amount }
      })
      const total = lines.reduce((s, l) => s + Number(l.amountFcfa ?? 0), 0)
      return { ...prev, lines, request: { ...prev.request, totalAmountFcfa: total } }
    })
  }

  const handleLineAmount = (lineId: string, amountFcfa: number) => {
    setRequestDetail((prev) => {
      if (!prev) return prev
      const lines = prev.lines.map((l) => {
        if (l.id !== lineId) return l
        const qty = Number(l.quantity)
        const unitPrice = qty > 0 ? Math.round((Math.max(0, amountFcfa) / qty) * 100) / 100 : 0
        const amount = Math.round(unitPrice * (Number.isFinite(qty) ? qty : 0))
        return { ...l, unitPriceFcfa: unitPrice, amountFcfa: amount }
      })
      const total = lines.reduce((s, l) => s + Number(l.amountFcfa ?? 0), 0)
      return { ...prev, lines, request: { ...prev.request, totalAmountFcfa: total } }
    })
  }

  const handleLineCommercial = (
    lineId: string,
    patch: { supplierName?: string; paymentMode?: string },
  ) => {
    setRequestDetail((prev) => {
      if (!prev) return prev
      return { ...prev, lines: prev.lines.map((l) => (l.id === lineId ? { ...l, ...patch } : l)) }
    })
  }

  const handleSavePricing = async () => {
    if (!selectedRequestId || !requestDetail) return
    setActionLoading(true)
    try {
      const detail = await updateRequestPricing(selectedRequestId, pricingLinesFromDetail(requestDetail.lines))
      setRequestDetail(detail)
      toast.success('Lignes enregistrées.')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Enregistrement des prix échoué')
    } finally {
      setActionLoading(false)
    }
  }

  const handleSubmitFinance = async () => {
    if (!selectedRequestId || !requestDetail) return
    const incomplete = saFinanceIncompleteMessage(requestDetail.lines)
    if (incomplete) {
      toast.error(incomplete.endsWith('.') ? incomplete : `${incomplete}.`)
      return
    }
    setActionLoading(true)
    try {
      await updateRequestPricing(selectedRequestId, pricingLinesFromDetail(requestDetail.lines))
      const result = await submitRequestFinance(selectedRequestId)
      toast.success(`EB envoyée au Contrôle de gestion (${result.finance.totalAmountFcfa.toLocaleString('fr-FR')} XOF).`)
      const detail = await fetchRequest(selectedRequestId)
      setRequestDetail(detail)
      void loadRequests()
      onInboxCountChanged?.()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Envoi au DAF échoué')
    } finally {
      setActionLoading(false)
    }
  }

  const handleRemoveLineAttachment = async (lineId: string) => {
    if (!selectedRequestId) return
    setActionLoading(true)
    try {
      const detail = await removeRequestLineAttachment(selectedRequestId, lineId)
      setRequestDetail((prev) => keepUnsavedPricing(prev, detail))
      toast.success('Pièce jointe retirée.')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Impossible de retirer la pièce jointe')
    } finally {
      setActionLoading(false)
    }
  }

  const handleUploadLineAttachment = async (lineId: string, file: File) => {
    if (!selectedRequestId) return
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Fichier trop volumineux (max. 5 Mo)')
      return
    }
    setActionLoading(true)
    toast.info(`Envoi de ${file.name}…`)
    try {
      const detail = await uploadRequestLineAttachment(selectedRequestId, lineId, file)
      setRequestDetail((prev) => keepUnsavedPricing(prev, detail))
      toast.success(`Pièce jointe ajoutée : ${file.name}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Pièce jointe refusée')
    } finally {
      setActionLoading(false)
    }
  }

  const handleApprove = async () => {
    if (!selectedRequestId) return
    if (
      (procurementRole === 'daf' || procurementRole === 'pdg' || procurementRole === 'controle_gestion') &&
      !approvalPin.trim()
    ) {
      toast.error('Saisissez le NIP de signature.')
      return
    }
    setActionLoading(true)
    try {
      const detail = await approveRequest(selectedRequestId, {
        comment: approvalComment || undefined,
        pin: approvalPin.trim() || undefined,
      })
      setRequestDetail(detail)
      toast.success('Demande approuvée.')
      void loadRequests()
      onInboxCountChanged?.()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Approbation échouée')
    } finally {
      setActionLoading(false)
    }
  }

  const handleReject = async () => {
    if (!selectedRequestId) return
    if (!approvalComment.trim()) {
      toast.error('Motif de rejet obligatoire.')
      return
    }
    setActionLoading(true)
    try {
      const detail = await rejectRequest(selectedRequestId, { comment: approvalComment })
      setRequestDetail(detail)
      toast.info('Demande rejetée.')
      void loadRequests()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Rejet échoué')
    } finally {
      setActionLoading(false)
    }
  }

  const handleCreateTreasury = async () => {
    if (!selectedRequestId || !requestDetail) return
    setActionLoading(true)
    try {
      await updateRequestPricing(selectedRequestId, pricingLinesFromDetail(requestDetail.lines))
      const detail = await createTreasuryAdvance(selectedRequestId)
      setRequestDetail(detail)
      toast.success('Bon de trésorerie généré.')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Génération du bon de trésorerie échouée')
    } finally {
      setActionLoading(false)
    }
  }

  const handleCreatePo = async (supplierId?: string) => {
    if (!selectedRequestId) return
    setActionLoading(true)
    try {
      const amount = poAmount.trim() ? Number.parseInt(poAmount, 10) : undefined
      const amountFcfa = Number.isFinite(amount) ? amount : undefined
      const detail = await createPurchaseOrder(
        selectedRequestId,
        supplierId
          ? { supplierId, amountFcfa }
          : { allSuppliers: true, amountFcfa },
      )
      setRequestDetail(detail)
      const count = (detail.purchaseOrders ?? []).length
      toast.success(count > 1 ? `${count} bons de commande créés.` : 'Bon de commande créé.')
      void loadRequests()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Création BC échouée')
    } finally {
      setActionLoading(false)
    }
  }

  const handleScheduleDelivery = (purchaseOrderId?: string) => {
    if (!selectedRequestId || !requestDetail?.site) {
      toast.error('Chantier requis.')
      return
    }
    const orders =
      requestDetail.purchaseOrders && requestDetail.purchaseOrders.length > 0
        ? requestDetail.purchaseOrders
        : requestDetail.purchaseOrder
          ? [requestDetail.purchaseOrder]
          : []
    const target =
      (purchaseOrderId ? orders.find((p) => p.id === purchaseOrderId) : null)
      ?? orders.find((p) => !p.tourId)
      ?? orders[0]
    const supplier =
      requestDetail.suppliers?.find((s) => s.id === target?.supplierId)
      ?? requestDetail.supplier
    if (!supplier) {
      toast.error('Fournisseur requis.')
      return
    }
    const supplierName = supplier.name
    const matching = requestDetail.lines.filter(
      (l) => (l.supplierName ?? '').trim().toLowerCase() === supplierName.trim().toLowerCase(),
    )
    const unassigned = requestDetail.lines.filter((l) => !(l.supplierName ?? '').trim())
    const poLines = matching.length > 0 ? matching : unassigned.length > 0 ? unassigned : requestDetail.lines
    onOpenPlanifier?.({
      purchaseRequestId: selectedRequestId,
      purchaseOrderId: target?.id,
      date: scheduleDate,
      driverId: scheduleDriverId || undefined,
      depotName: supplier.name,
      depotAddress: supplier.address ?? '',
      stopName: requestDetail.site.name,
      stopAddress: requestDetail.site.address,
      orderRef: target?.reference || requestDetail.request.reference,
      products: poLines.map((l) => ({
        label: l.label,
        qty: Number(l.quantity),
        unit: catalogUnitFromEb(l.unit),
      })),
    })
  }

  const updateLine = (index: number, patch: Partial<ParsedEbLine>) => {
    setEditLines((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)))
  }

  const removeLine = (index: number) => {
    setEditLines((prev) => (prev.length <= 1 ? [emptyLine()] : prev.filter((_, i) => i !== index)))
  }

  const canPaste = canEditDraft(procurementRole)

  const openDraftInReview = async (draftId: string) => {
    let detail: DraftDetailResponse | null = null
    for (let attempt = 0; attempt < 8; attempt++) {
      try {
        detail = await fetchDraft(draftId)
        break
      } catch {
        await new Promise((r) => setTimeout(r, 250))
      }
    }
    if (!detail) {
      throw new Error('Brouillon créé mais pas encore visible — réessayez.')
    }
    setDraftDetail(detail)
    setEditLines(linesFromDraft(detail.draft))
    setEditUrgency(detail.draft.parsedUrgency ?? 'normal')
    setEditSiteId(detail.draft.siteId ?? '')
    const hintName = detail.parseHints?.requesterName
    setEditRequester(hintName && hintName !== 'À identifier' ? hintName : '')
    setEditObjet(detail.parseHints?.objet || objetFromLines(linesFromDraft(detail.draft), detail.parseHints?.destination))
    setEditNeededBy(
      detail.parseHints?.neededBy && detail.parseHints.neededBy !== 'À préciser'
        ? detail.parseHints.neededBy
        : '',
    )
    setEditPin('')
    setSelectedDraftId(draftId)
  }

  const handlePasteWhatsapp = async () => {
    const bodyText = pasteText.trim()
    if (!bodyText) {
      toast.error('Collez d’abord le message WhatsApp.')
      return
    }
    setPasteLoading(true)
    setError(null)
    try {
      const result = await pasteWhatsappDraft({ bodyText })
      setPasteText('')
      await openDraftInReview(result.draftId)
      toast.success(
        result.lines.length > 0
          ? `Brouillon créé — ${result.lines.length} ligne(s) détectée(s).`
          : 'Brouillon créé — à compléter (aucune ligne détectée).',
      )
      refreshInbox()
      onInboxCountChanged?.()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Collage échoué')
    } finally {
      setPasteLoading(false)
    }
  }

  const handleBlankFiche = async () => {
    setBlankLoading(true)
    setError(null)
    try {
      const result = await createBlankEbFiche()
      await openDraftInReview(result.draftId)
      toast.success('Fiche EB vierge créée — à compléter.')
      refreshInbox()
      onInboxCountChanged?.()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Création de fiche échouée')
    } finally {
      setBlankLoading(false)
    }
  }

  const showDraftReview = view === 'inbox' && selectedDraftId && draftDetail
  const showRequestDetail = view === 'requests' && selectedRequestId && requestDetail

  return (
    <div data-testid="mgr-achats-tab">
      <h2 style={{ ...css.sectionTitle, marginBottom: '0.25rem' }}>
        {procurementRole === 'technical_director'
          ? 'Espace Directeur technique'
          : procurementRole === 'purchasing'
            ? 'Espace Service achats'
            : procurementRole === 'daf'
              ? 'Espace DAF'
              : procurementRole === 'pdg'
                ? 'Espace PDG'
                : procurementRole === 'controle_gestion'
                  ? 'Espace Contrôle de gestion'
                : 'Achats chantier'}
      </h2>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: '1rem' }}>
        {procurementRole === 'technical_director'
          ? 'Coller un besoin WhatsApp, réviser les lignes, puis soumettre l’EB au Service achats.'
          : procurementRole === 'purchasing'
            ? 'Chiffrer les produits, joindre les pièces, puis envoyer l’EB au Contrôle de gestion. Après validation CdG, le dossier part au DAF (et au PDG dès 500 000 XOF).'
            : procurementRole === 'daf'
              ? 'Instruisez le dossier (chiffrage SA + pièces jointes, déjà validé par le CdG) puis approuvez. Le SA émet le BC ensuite.'
              : procurementRole === 'pdg'
                ? 'Dossiers ≥ 500 000 XOF : vérifiez le chiffrage et les pièces, puis approuvez. Le SA émet le BC ensuite.'
                : procurementRole === 'controle_gestion'
                  ? 'Validez le chiffrage SA : après votre NIP, le dossier part au DAF. La file du jour est ci-dessous ; l’enveloppe se gèle dans Suivi chantier.'
                : 'Circuit EB : DT soumet au SA → SA chiffre → CdG → DAF / PDG selon montant → BC → livraison.'}
        {' '}Profil actif : <strong>{roleLabel}</strong>.
      </p>

      {procurementRole === 'controle_gestion' ? (
        <div data-testid="mgr-cdg-file" style={{ display: 'flex', gap: 12, marginBottom: '1.25rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            data-testid="mgr-cdg-file-validate"
            onClick={() => setCdgFocus((f) => (f === 'validate' ? 'all' : 'validate'))}
            style={cdgFocus === 'validate' ? css.cardClickable : css.card}
          >
            <div style={css.meta}>À valider</div>
            <div style={{ fontSize: 28, fontWeight: 800 }}>{toValidate.length}</div>
          </button>
          <button
            type="button"
            data-testid="mgr-cdg-file-unfrozen"
            onClick={() => onOpenSuiviChantier?.()}
            style={css.card}
          >
            <div style={css.meta}>Enveloppes non gelées</div>
            <div style={{ fontSize: 28, fontWeight: 800 }}>{unfrozen.length}</div>
          </button>
          <button
            type="button"
            data-testid="mgr-cdg-file-missing-amendment"
            onClick={() => onOpenSuiviChantier?.()}
            style={css.card}
          >
            <div style={css.meta}>Avenant manquant</div>
            <div style={{ fontSize: 28, fontWeight: 800 }}>{missingAmendment.length}</div>
          </button>
          <button
            type="button"
            data-testid="mgr-cdg-file-pipeline"
            title="EB transmises encore dans le circuit (CdG, DAF, SA, PDG), avant émission du bon de commande. Ce n’est pas le réalisé livré."
            onClick={() => setCdgFocus((f) => (f === 'pipeline' ? 'all' : 'pipeline'))}
            style={cdgFocus === 'pipeline' ? css.cardClickable : css.card}
          >
            <div style={css.meta}>Pipeline hors BC</div>
            <div style={{ fontSize: 18, fontWeight: 800 }}>{formatFcfa(pipelineAmount)}</div>
            <div style={css.meta}>
              {pipeline.length} EB en circuit d’approbation, avant émission du BC
              {oldestPipeline ? ` · depuis ${oldestPipeline.slice(0, 10)}` : ''}
            </div>
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 12, marginBottom: '1.25rem', flexWrap: 'wrap' }}>
          <StatCard label="Brouillons à réviser" value={drafts.length} testId="mgr-achats-stat-drafts" />
          <StatCard
            label="Demandes actives"
            value={requests.filter((r) => !['delivered', 'rejected'].includes(r.status)).length}
            testId="mgr-achats-stat-active"
          />
        </div>
      )}

      <div style={{ display: 'flex', gap: 4, marginBottom: '1.25rem', borderBottom: '1px solid var(--border)' }}>
        {procurementRole === 'technical_director' && (
        <button
          type="button"
          data-testid="mgr-achats-inbox"
          onClick={() => { setView('inbox'); setSelectedRequestId(null) }}
          className={view === 'inbox' ? 'mgr-tab mgr-tab--active' : 'mgr-tab'}
        >
          Boîte EB{drafts.length > 0 ? ` (${drafts.length})` : ''}
        </button>
        )}
        <button
          type="button"
          data-testid="mgr-achats-requests"
          onClick={() => { setView('requests'); setSelectedDraftId(null) }}
          className={view === 'requests' ? 'mgr-tab mgr-tab--active' : 'mgr-tab'}
        >
          Demandes d&apos;achat
        </button>
      </div>

      {error && <AlertBox>{error}</AlertBox>}

      {showDraftReview ? (
        <DraftReviewPanel
          detail={draftDetail}
          editLines={editLines}
          editUrgency={editUrgency}
          editSiteId={editSiteId}
          editRequester={editRequester}
          editObjet={editObjet}
          editNeededBy={editNeededBy}
          editPin={editPin}
          managerName={managerName ?? ''}
          procurementRole={procurementRole}
          canEdit={canEditDraft(procurementRole)}
          actionLoading={actionLoading}
          onBack={() => setSelectedDraftId(null)}
          onLineChange={updateLine}
          onAddLine={() => setEditLines((prev) => [...prev, emptyLine()])}
          onRemoveLine={removeLine}
          onUrgencyChange={setEditUrgency}
          onSiteChange={setEditSiteId}
          onRequesterChange={setEditRequester}
          onObjetChange={setEditObjet}
          onNeededByChange={setEditNeededBy}
          onPinChange={setEditPin}
          onValidate={() => void handleValidateDraft()}
          onSubmit={() => void handleSubmitDraft()}
        />
      ) : showRequestDetail ? (
        <RequestDetailPanel
          detail={requestDetail}
          procurementRole={procurementRole}
          approvalComment={approvalComment}
          approvalPin={approvalPin}
          selectedSupplierId={selectedSupplierId}
          poAmount={poAmount}
          actionLoading={actionLoading}
          onBack={() => setSelectedRequestId(null)}
          onCommentChange={setApprovalComment}
          onPinChange={setApprovalPin}
          onSupplierChange={setSelectedSupplierId}
          onPoAmountChange={setPoAmount}
          onApprove={() => void handleApprove()}
          onReject={() => void handleReject()}
          onCreatePo={(supplierId) => void handleCreatePo(supplierId)}
          onCreateTreasury={() => void handleCreateTreasury()}
          onScheduleDelivery={handleScheduleDelivery}
          onUnitPriceChange={handleLineUnitPrice}
          onAmountChange={handleLineAmount}
          onLineCommercial={handleLineCommercial}
          onSavePricing={() => void handleSavePricing()}
          onSubmitFinance={() => void handleSubmitFinance()}
          onUploadAttachment={(lineId, file) => void handleUploadLineAttachment(lineId, file)}
          onRemoveAttachment={(lineId) => void handleRemoveLineAttachment(lineId)}
          managerName={managerName ?? ''}
        />
      ) : (
        <>
          {canPaste && view === 'inbox' && (
            <div data-testid="mgr-achats-paste" style={{ ...css.card, marginBottom: '1rem' }}>
              <h3 style={{ ...css.sectionTitle, fontSize: 15, marginBottom: 8 }}>Coller un message WhatsApp</h3>
              <p style={css.meta}>
                Copiez le besoin depuis le groupe (plusieurs produits possibles, ex. 50 sacs ciment, 20 barres fer).
              </p>
              <textarea
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                placeholder="Collez ici le message WhatsApp…"
                rows={4}
                className="mgr-input" style={{ width: '100%', marginTop: 8, resize: 'vertical', fontFamily: 'inherit' }}
                data-testid="mgr-achats-paste-text"
              />
              <button
                type="button"
                onClick={() => void handlePasteWhatsapp()}
                disabled={pasteLoading || blankLoading || !pasteText.trim()}
                className="mgr-btn mgr-btn--primary" style={{ marginTop: 10 }}
                data-testid="mgr-achats-paste-submit"
              >
                {pasteLoading ? 'Analyse…' : 'Créer le brouillon'}
              </button>
              <button
                type="button"
                onClick={() => void handleBlankFiche()}
                disabled={pasteLoading || blankLoading}
                className="mgr-btn mgr-btn--outline" style={{ marginTop: 10, marginLeft: 8 }}
                data-testid="mgr-achats-blank-fiche"
              >
                {blankLoading ? 'Création…' : 'Générer une fiche EB vierge'}
              </button>
            </div>
          )}
          {loading && <LoadingHint />}
          {!loading && view === 'inbox' && drafts.length === 0 && (
            <EmptyHint>
              {canPaste
                ? 'Aucun brouillon en attente — collez un message WhatsApp ou générez une fiche vierge.'
                : 'Aucun brouillon EB en attente de révision.'}
            </EmptyHint>
          )}
          {!loading && view === 'requests' && visibleRequests.length === 0 && (
            <EmptyHint>
              {cdgFocus === 'validate'
                ? 'Aucune EB en validation CdG.'
                : cdgFocus === 'pipeline'
                  ? 'Aucune EB en cours avant BC.'
                  : 'Aucune demande d\'achat pour le moment.'}
            </EmptyHint>
          )}
          {!loading && view === 'inbox' && drafts.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {drafts.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  data-testid="btp-draft-row"
                  onClick={() => setSelectedDraftId(d.id)}
                  style={{ ...css.cardClickable, textAlign: 'left', width: '100%' }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontWeight: 700, marginBottom: 4 }}>
                        {d.siteName ?? 'Chantier à confirmer'}
                      </div>
                      <div style={css.meta}>
                        {d.parsedLines?.length ?? 0} ligne(s) · confiance {formatConfidence(d.confidenceScore)}
                      </div>
                    </div>
                    <ProcurementStatusBadge status={d.status} />
                  </div>
                </button>
              ))}
            </div>
          )}
          {!loading && view === 'requests' && visibleRequests.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {visibleRequests.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  data-testid={`mgr-achats-request-${r.id}`}
                  onClick={() => setSelectedRequestId(r.id)}
                  style={{ ...css.cardClickable, textAlign: 'left', width: '100%' }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontWeight: 700, marginBottom: 4 }}>{r.reference}</div>
                      <div style={css.meta}>
                        {r.siteName ?? 'Chantier'} · {formatFcfa(r.totalAmountFcfa)}
                      </div>
                    </div>
                    <ProcurementStatusBadge status={r.status} />
                  </div>
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function firstLineName(comment?: string | null): string {
  return comment?.split('\n')[0]?.replace(/\s*\((DT|SA|DAF|PDG|CDG)\)\s*$/, '').trim() ?? ''
}

function withNipVerified(text: string): string {
  const n = text.replace(/\bPIN vérifié\b/g, 'NIP vérifié').trim()
  if (!n) return 'NIP vérifié'
  return /NIP vérifié/.test(n) ? n : `${n}\nNIP vérifié`
}

function stepDisplayName(step?: { comment?: string | null; managerName?: string | null }): string {
  return firstLineName(step?.comment) || (step?.managerName ?? '').trim()
}

function stepSignature(
  step?: { comment?: string | null; managerName?: string | null; pinVerified?: boolean | null },
  withNip = false,
): string {
  const comment = (step?.comment ?? '').replace(/\bPIN vérifié\b/g, 'NIP vérifié').trim()
  const body = comment || stepDisplayName(step)
  if (withNip || step?.pinVerified) return withNipVerified(body)
  return body
}

function printHtml(url: string) {
  window.open(url, '_blank', 'noopener,noreferrer')
}

function dashOr(value: string): string {
  return value.trim() || '—'
}

function EbFicheSignoff({
  treatedByName,
  treatedByDate,
  treatedBySignature,
  validatedByName,
  validatedByDate,
  validatedBySignature,
  dafName = '',
  dafDate = '',
  dafSignature = '',
  pdgName = '',
  pdgDate = '',
  pdgSignature = '',
  showPdg = false,
}: {
  treatedByName: string
  treatedByDate: string
  treatedBySignature: string
  validatedByName: string
  validatedByDate: string
  validatedBySignature: string
  dafName?: string
  dafDate?: string
  dafSignature?: string
  pdgName?: string
  pdgDate?: string
  pdgSignature?: string
  showPdg?: boolean
}) {
  const head = { ...css.ficheMetaTd, background: '#e8eef4', fontWeight: 700 as const }
  const cell = css.ficheMetaTd
  const finance = {
    ...head,
    width: '16%',
    textAlign: 'center' as const,
    verticalAlign: 'middle' as const,
    minHeight: 140,
  }
  const financeFill = (name: string, date: string, signature: string, requireNip = false) => {
    const sig = signature.replace(/\bPIN vérifié\b/g, 'NIP vérifié').trim()
    let text = sig || [name, date].map((s) => s.trim()).filter(Boolean).join('\n')
    if (!text) return null
    if (requireNip && !/NIP vérifié/.test(text)) text = `${text}\nNIP vérifié`
    return (
      <div style={{ fontWeight: 400, marginTop: 8, whiteSpace: 'pre-line' }}>{text}</div>
    )
  }
  return (
    <table style={css.ficheMeta} data-testid="mgr-achats-signoff">
      <tbody>
        <tr>
          <td style={{ ...head, width: '14%', textAlign: 'center' }} rowSpan={2}>TRAITE PAR</td>
          <td style={head}>NOM</td>
          <td style={head}>DATE</td>
          <td style={head}>SIGNATURE</td>
          <td style={finance} rowSpan={4} data-testid="mgr-achats-signoff-daf">
            DAF
            {financeFill(dafName, dafDate, dafSignature, true)}
          </td>
          {showPdg ? (
            <td style={finance} rowSpan={4} data-testid="mgr-achats-signoff-pdg">
              PDG
              {financeFill(pdgName, pdgDate, pdgSignature, true)}
            </td>
          ) : null}
        </tr>
        <tr>
          <td style={cell} data-testid="mgr-achats-treated-by">{dashOr(treatedByName)}</td>
          <td style={cell} data-testid="mgr-achats-treated-date">{dashOr(treatedByDate)}</td>
          <td style={{ ...cell, whiteSpace: 'pre-wrap' }} data-testid="mgr-achats-treated-sig">
            {dashOr(treatedBySignature)}
          </td>
        </tr>
        <tr>
          <td style={{ ...head, textAlign: 'center' }} rowSpan={2}>VALIDE PAR</td>
          <td style={head}>NOM</td>
          <td style={head}>DATE</td>
          <td style={head}>SIGNATURE</td>
        </tr>
        <tr>
          <td style={cell} data-testid="mgr-achats-validated-by">{dashOr(validatedByName)}</td>
          <td style={cell} data-testid="mgr-achats-validated-date">{dashOr(validatedByDate)}</td>
          <td style={{ ...cell, whiteSpace: 'pre-wrap' }} data-testid="mgr-achats-validated-sig">
            {dashOr(validatedBySignature)}
          </td>
        </tr>
      </tbody>
    </table>
  )
}

function DraftReviewPanel({
  detail,
  editLines,
  editUrgency,
  editSiteId,
  editRequester,
  editObjet,
  editNeededBy,
  editPin,
  managerName,
  procurementRole,
  canEdit,
  actionLoading,
  onBack,
  onLineChange,
  onAddLine,
  onRemoveLine,
  onUrgencyChange,
  onSiteChange,
  onRequesterChange,
  onObjetChange,
  onNeededByChange,
  onPinChange,
  onValidate,
  onSubmit,
}: {
  detail: DraftDetailResponse
  editLines: ParsedEbLine[]
  editUrgency: string
  editSiteId: string
  editRequester: string
  editObjet: string
  editNeededBy: string
  editPin: string
  managerName: string
  procurementRole: ProcurementRole | null
  canEdit: boolean
  actionLoading: boolean
  onBack: () => void
  onLineChange: (index: number, patch: Partial<ParsedEbLine>) => void
  onAddLine: () => void
  onRemoveLine: (index: number) => void
  onUrgencyChange: (v: string) => void
  onSiteChange: (v: string) => void
  onRequesterChange: (v: string) => void
  onObjetChange: (v: string) => void
  onNeededByChange: (v: string) => void
  onPinChange: (v: string) => void
  onValidate: () => void
  onSubmit: () => void
}) {
  const { draft, messages, parseHints } = detail
  const isBlankFiche = parseHints?.source === 'blank_fiche'
  const showParseHints = Boolean(
    !isBlankFiche &&
      parseHints &&
      ((parseHints.destination && parseHints.destination !== 'À préciser') ||
        (parseHints.neededBy && parseHints.neededBy !== 'À préciser') ||
        (parseHints.missingInfo && parseHints.missingInfo.length > 0) ||
        (parseHints.dtActions && parseHints.dtActions.length > 0)),
  )

  return (
    <div data-testid="mgr-achats-draft-review" style={css.section}>
      <button type="button" onClick={onBack} className="mgr-btn mgr-btn--ghost" style={{ marginBottom: '1rem' }}>
        ← Retour à la boîte EB
      </button>

      <h3 style={{ ...css.sectionTitle, fontSize: 16 }}>Révision brouillon EB</h3>
      <p style={css.meta}>
        Confiance parsing : {formatConfidence(draft.confidenceScore)} · reçu le{' '}
        {new Date(draft.createdAt).toLocaleString('fr-FR')}
      </p>

      {showParseHints && parseHints && (
        <div data-testid="mgr-achats-parse-hints" style={{ ...css.transcriptBox, marginTop: '0.75rem' }}>
          {parseHints.destination && parseHints.destination !== 'À préciser' && (
            <div>
              Chantier lu dans le message : <strong>{parseHints.destination}</strong>
              {' '}(vérifier le champ SITE ci-dessous)
            </div>
          )}
          {parseHints.neededBy && parseHints.neededBy !== 'À préciser' && (
            <div>Date besoin : {parseHints.neededBy}</div>
          )}
          {parseHints.missingInfo && parseHints.missingInfo.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <strong>Infos à préciser</strong>
              <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                {parseHints.missingInfo.slice(0, 6).map((info) => (
                  <li key={info}>{info}</li>
                ))}
              </ul>
            </div>
          )}
          {parseHints.dtActions && parseHints.dtActions.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <strong>Actions DT avant validation</strong>
              <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                {parseHints.dtActions.map((action) => (
                  <li key={action}>{action}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {!isBlankFiche && (
        <div style={{ marginTop: '1rem' }}>
          <h4 style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Message WhatsApp original</h4>
          {messages.length === 0 ? (
            <p style={css.meta}>Aucun message source attaché.</p>
          ) : (
            messages.map((m) => (
              <div key={m.id} style={{ marginBottom: 8 }}>
                <div style={css.meta}>
                  {m.fromName ?? m.fromPhone} · {new Date(m.createdAt).toLocaleString('fr-FR')}
                </div>
                <div style={css.messageBox}>{m.bodyText ?? `[${m.messageType}]`}</div>
              </div>
            ))
          )}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.75rem' }}>
        <a
          href={ebFicheHtmlUrl(draft.id)}
          target="_blank"
          rel="noopener noreferrer"
          data-testid="mgr-achats-eb-fiche-link"
          style={{ fontSize: 13, fontWeight: 600 }}
        >
          Imprimer la fiche EB
        </a>
      </div>

      <div style={css.ficheWrap} data-testid="mgr-achats-eb-fiche">
        <h4 style={css.ficheTitle}>EXPRESSION DU BESOIN</h4>
        <table style={css.ficheMeta}>
          <tbody>
            <tr>
              <td style={{ ...css.ficheDemandeur, width: '14%' }} rowSpan={3}>DEMANDEUR</td>
              <td style={css.ficheMetaTd} colSpan={2}>
                <div style={css.ficheLabel}>SITE :</div>
                <select
                  value={editSiteId}
                  disabled={!canEdit}
                  onChange={(e) => onSiteChange(e.target.value)}
                  className="mgr-input"
                  data-testid="mgr-achats-draft-site"
                >
                  <option value="">— Sélectionner —</option>
                  {detail.sites.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </td>
              <td style={css.ficheMetaTd}>
                <div style={css.ficheLabel}>SERVICE:</div>
                <div>Direction Technique</div>
              </td>
            </tr>
            <tr>
              <td style={css.ficheMetaTd} colSpan={2}>
                <div style={css.ficheLabel}>OBJET</div>
                <input
                  value={editObjet}
                  disabled={!canEdit}
                  onChange={(e) => onObjetChange(e.target.value)}
                  placeholder="BESOIN - …"
                  autoComplete="off"
                  className="mgr-input"
                  data-testid="mgr-achats-draft-objet"
                />
              </td>
              <td style={css.ficheMetaTd}>
                <div style={css.ficheLabel}>NOM DEMANDEUR :</div>
                <input
                  value={editRequester}
                  disabled={!canEdit}
                  onChange={(e) => onRequesterChange(e.target.value)}
                  placeholder="Nom du demandeur chantier"
                  autoComplete="off"
                  className="mgr-input"
                  data-testid="mgr-achats-draft-requester"
                />
              </td>
            </tr>
            <tr>
              <td style={css.ficheMetaTd}>
                <div style={css.ficheLabel}>DATE DE TRAITEMENT :</div>
                <div>{new Date(draft.createdAt).toLocaleDateString('fr-FR')}</div>
              </td>
              <td style={css.ficheMetaTd}>
                <div style={css.ficheLabel}>Urgence</div>
                <select
                  value={editUrgency}
                  disabled={!canEdit}
                  onChange={(e) => onUrgencyChange(e.target.value)}
                  className="mgr-input"
                  data-testid="mgr-achats-draft-urgency"
                >
                  <option value="normal">Normal</option>
                  <option value="urgent">Urgent</option>
                </select>
              </td>
              <td style={css.ficheMetaTd}>
                <div style={css.ficheLabel}>DATE DE BESOIN</div>
                <input
                  value={editNeededBy}
                  disabled={!canEdit}
                  onChange={(e) => onNeededByChange(e.target.value)}
                  placeholder="Ex. 20/08/2026 ou demain matin"
                  autoComplete="off"
                  className="mgr-input"
                  data-testid="mgr-achats-draft-needed-by"
                />
              </td>
            </tr>
          </tbody>
        </table>

        <div style={{ overflowX: 'auto' }}>
          <table style={css.lineTable}>
            <thead>
              <tr>
                <th style={css.lineTh}>Réf</th>
                <th style={css.lineTh}>Désignations</th>
                <th style={css.lineTh}>Catégorie</th>
                <th style={css.lineTh}>Unité</th>
                <th style={css.lineTh}>Quantité</th>
                <th style={css.lineTh}>Prix Unitaire</th>
                <th style={css.lineTh}>Montant</th>
                <th style={css.lineTh}>Fournisseur</th>
                <th style={css.lineTh}>Mode de paiement</th>
                {canEdit && <th style={css.lineTh} />}
              </tr>
            </thead>
            <tbody>
              {editLines.map((line, i) => (
                <tr key={i}>
                  <td style={css.lineTd}>{i + 1}</td>
                  <td style={css.lineTd}>
                    <input
                      value={line.label}
                      disabled={!canEdit}
                      onChange={(e) => {
                        const label = e.target.value
                        const inferred = inferEbSpendCategory(label)
                        const keepManual =
                          line.spendCategory &&
                          line.spendCategory !== 'autres_materiaux' &&
                          line.spendCategory !== inferred
                        onLineChange(i, {
                          label,
                          spendCategory: keepManual ? line.spendCategory : inferred,
                        })
                      }}
                      className="mgr-input"
                      data-testid={`mgr-achats-line-label-${i}`}
                      autoComplete="off"
                    />
                  </td>
                  <td style={css.lineTd}>
                    <select
                      value={normalizeEbSpendCategory(line.spendCategory)}
                      disabled={!canEdit}
                      onChange={(e) => onLineChange(i, { spendCategory: e.target.value })}
                      className="mgr-input"
                      data-testid={`mgr-achats-line-category-${i}`}
                    >
                      {EB_SPEND_CATEGORIES.map((c) => (
                        <option key={c.value} value={c.value}>{c.label}</option>
                      ))}
                    </select>
                  </td>
                  <td style={css.lineTd}>
                    <input
                      value={line.unit}
                      disabled={!canEdit}
                      onChange={(e) => onLineChange(i, { unit: e.target.value })}
                      className="mgr-input" style={{ width: 90 }}
                    />
                  </td>
                  <td style={css.lineTd}>
                    <input
                      type="number"
                      min={0}
                      step="any"
                      value={line.quantity}
                      disabled={!canEdit}
                      onChange={(e) => onLineChange(i, { quantity: Number.parseFloat(e.target.value) || 0 })}
                      className="mgr-input" style={{ width: 80 }}
                      data-testid={`mgr-achats-line-qty-${i}`}
                    />
                  </td>
                  <td style={{ ...css.lineTd, color: 'var(--text-muted)' }}>—</td>
                  <td style={{ ...css.lineTd, color: 'var(--text-muted)' }}>—</td>
                  <td style={css.lineTd}>
                    <SupplierSelect
                      value={line.supplierName ?? ''}
                      suppliers={detail.suppliers ?? []}
                      disabled={!canEdit}
                      testId={`mgr-achats-line-supplier-${i}`}
                      onChange={(name) => onLineChange(i, { supplierName: name })}
                    />
                  </td>
                  <td style={css.lineTd}>
                    <select
                      value={line.paymentMode ?? ''}
                      disabled={!canEdit}
                      onChange={(e) => onLineChange(i, { paymentMode: e.target.value })}
                      className="mgr-input"
                      data-testid={`mgr-achats-line-payment-${i}`}
                    >
                      <option value="">À préciser</option>
                      {PAYMENT_MODES.map((m) => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                  </td>
                  {canEdit && (
                    <td style={css.lineTd}>
                      <button type="button" onClick={() => onRemoveLine(i)} className="mgr-btn mgr-btn--danger">×</button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {canEdit && (
          <button type="button" onClick={onAddLine} className="mgr-btn mgr-btn--outline" style={{ margin: 8 }}>
            + Ligne
          </button>
        )}

        <EbFicheSignoff
          treatedByName=""
          treatedByDate=""
          treatedBySignature=""
          validatedByName={
            procurementRole === 'technical_director'
              ? managerName
              : parseHints?.signature?.approbateur ?? ''
          }
          validatedByDate={new Date().toLocaleDateString('fr-FR')}
          validatedBySignature={
            parseHints?.signature?.codePinVerifie
              ? `${parseHints.signature.approbateur} (${parseHints.signature.role})\nNIP vérifié`
              : canEdit && procurementRole === 'technical_director'
                ? 'Saisir le NIP pour signer'
                : ''
          }
        />
      </div>

      {canEdit && (
        <div style={css.actionRow}>
          <input
            type="text"
            name="eb-pin-decoy-user"
            autoComplete="username"
            tabIndex={-1}
            aria-hidden="true"
            style={{ position: 'absolute', opacity: 0, height: 0, width: 0, pointerEvents: 'none' }}
          />
          {procurementRole === 'technical_director' && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
              NIP signature
              <input
                type="password"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={editPin}
                onChange={(e) => onPinChange(e.target.value)}
                placeholder="1234"
                className="mgr-input" style={{ width: 100 }}
                data-testid="mgr-achats-sign-pin"
              />
            </label>
          )}
          <button
            type="button"
            data-testid="mgr-achats-draft-validate"
            onClick={onValidate}
            disabled={actionLoading}
            className="mgr-btn mgr-btn--ghost"
          >
            Enregistrer le brouillon
          </button>
          <button
            type="button"
            data-testid="btp-draft-submit"
            onClick={onSubmit}
            disabled={actionLoading}
            className="mgr-btn mgr-btn--primary"
          >
            Valider
          </button>
        </div>
      )}
      {canEdit && (
        <p style={{ ...css.meta, marginTop: 8 }} data-testid="mgr-achats-draft-actions-hint">
          Enregistrer le brouillon sauvegarde sans signer. Valider vérifie le NIP et transmet l’EB au Service achats.
        </p>
      )}
    </div>
  )
}

function RequestDetailPanel({
  detail,
  procurementRole,
  approvalComment,
  approvalPin,
  selectedSupplierId: _selectedSupplierId,
  poAmount: _poAmount,
  actionLoading,
  onBack,
  onCommentChange,
  onPinChange,
  onSupplierChange: _onSupplierChange,
  onPoAmountChange: _onPoAmountChange,
  onApprove,
  onReject,
  onCreatePo,
  onCreateTreasury,
  onScheduleDelivery,
  onUnitPriceChange,
  onAmountChange,
  onLineCommercial,
  onSavePricing,
  onSubmitFinance,
  onUploadAttachment,
  onRemoveAttachment,
  managerName,
}: {
  detail: RequestDetailResponse
  procurementRole: ProcurementRole | null
  approvalComment: string
  approvalPin: string
  selectedSupplierId: string
  poAmount: string
  actionLoading: boolean
  onBack: () => void
  onCommentChange: (v: string) => void
  onPinChange: (v: string) => void
  onSupplierChange: (v: string) => void
  onPoAmountChange: (v: string) => void
  onApprove: () => void
  onReject: () => void
  onCreatePo: (supplierId?: string) => void
  onCreateTreasury: () => void
  onScheduleDelivery: (purchaseOrderId?: string) => void
  onUnitPriceChange: (lineId: string, unitPriceFcfa: number) => void
  onAmountChange: (lineId: string, amountFcfa: number) => void
  onLineCommercial: (
    lineId: string,
    patch: { supplierName?: string; paymentMode?: string },
  ) => void
  onSavePricing: () => void
  onSubmitFinance: () => void
  onUploadAttachment: (lineId: string, file: File) => void
  onRemoveAttachment: (lineId: string) => void
  managerName: string
}) {
  const { request, lines, approvalSteps, site, supplier, purchaseOrder, purchaseOrders = [], treasuryOrder, suppliers = [] } = detail
  const [siteBudget, setSiteBudget] = useState<SiteBudget | null>(null)
  useEffect(() => {
    const siteId = request.siteId ?? site?.id
    if (!siteId) {
      setSiteBudget(null)
      return
    }
    let cancelled = false
    void fetchSiteBudget(siteId)
      .then((b) => {
        if (!cancelled) setSiteBudget(b)
      })
      .catch(() => {
        if (!cancelled) setSiteBudget(null)
      })
    return () => {
      cancelled = true
    }
  }, [request.siteId, request.status, site?.id])
  const orders = purchaseOrders.length > 0 ? purchaseOrders : (purchaseOrder ? [purchaseOrder] : [])
  const ebSuppliers = suppliers.filter((s) =>
    lines.some((l) => (l.supplierName ?? '').trim().toLowerCase() === s.name.trim().toLowerCase()),
  )
  const showApprove = canApproveRequest(request.status, procurementRole)
  const showReject = canRejectRequest(request.status, procurementRole)
  const showCreatePo = canCreatePo(request.status, procurementRole)
  const allPosCreated =
    ebSuppliers.length > 0 && ebSuppliers.every((s) => orders.some((po) => po.supplierId === s.id))
  const showSchedule = canScheduleDelivery(request.status, procurementRole, orders)
  const pendingOrders = orders.filter((po) => !po.tourId)
  const showTreasury = Boolean(treasuryOrder) && hasComptantLines(lines)
  const canPrice = canPriceRequest(request.status, procurementRole)
  const total = lines.reduce((s, l) => s + Number(l.amountFcfa ?? 0), 0)
  const wouldExceedBudget =
    Boolean(showCreatePo) &&
    siteBudget?.remainingFcfa != null &&
    total > siteBudget.remainingFcfa
  const needsPdg = total >= 500_000
  const saStep = approvalSteps.find((s) => s.role === 'purchasing')
  const dtStep = approvalSteps.find((s) => s.role === 'technical_director')
  const dafStep = approvalSteps.find((s) => s.role === 'daf' && s.decision === 'approved')
  const pdgStep = approvalSteps.find((s) => s.role === 'pdg' && s.decision === 'approved')
  const [preview, setPreview] = useState<{ url: string; fileName: string; contentType: string } | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const previewUrlRef = useRef<string | null>(null)
  const previewGenRef = useRef(0)

  const revokePreview = useCallback(() => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current)
      previewUrlRef.current = null
    }
  }, [])

  useEffect(() => () => revokePreview(), [revokePreview])

  const closePreview = useCallback(() => {
    previewGenRef.current += 1
    revokePreview()
    setPreview(null)
    setPreviewLoading(false)
  }, [revokePreview])

  const handleOpenAttachment = async (lineId: string, fileName: string) => {
    const gen = ++previewGenRef.current
    setPreviewLoading(true)
    try {
      const file = await fetchRequestLineAttachment(request.id, lineId)
      if (gen !== previewGenRef.current) return
      revokePreview()
      const url = URL.createObjectURL(file.blob)
      previewUrlRef.current = url
      setPreview({
        url,
        fileName: file.fileName || fileName,
        contentType: file.contentType,
      })
    } catch (err) {
      if (gen !== previewGenRef.current) return
      toast.error(err instanceof Error ? err.message : 'Pièce jointe introuvable')
    } finally {
      if (gen === previewGenRef.current) setPreviewLoading(false)
    }
  }

  useEffect(() => {
    if (!preview && !previewLoading) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closePreview()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [preview, previewLoading, closePreview])

  return (
    <div data-testid="mgr-achats-request-detail" style={css.section}>
      <button type="button" onClick={onBack} className="mgr-btn mgr-btn--ghost" style={{ marginBottom: '1rem' }}>
        ← Retour aux demandes
      </button>

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div>
          <h3 style={{ ...css.sectionTitle, fontSize: 16, marginBottom: 4 }}>{request.reference}</h3>
          <p style={css.meta}>
            {site?.name ?? request.siteName ?? 'Chantier'} · {formatFcfa(request.totalAmountFcfa)}
            {request.urgency === 'urgent' ? ' · Urgent' : ''}
          </p>
        </div>
        <ProcurementStatusBadge status={request.status} />
      </div>

      {showApprove && (
        <div
          data-testid="mgr-achats-finance-dossier"
          style={{
            marginTop: '1rem',
            border: '1px solid #93c5fd',
            background: '#eff6ff',
            borderRadius: 10,
            padding: '0.85rem 1rem',
          }}
        >
          <h4 style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>Dossier à valider</h4>
          <p style={{ ...css.meta, marginTop: 6, color: '#1e3a5f' }}>
            Montant : <strong>{total.toLocaleString('fr-FR')} XOF</strong>
            {' · '}
            {lines.filter((l) => l.attachmentFileName).length} pièce(s) jointe(s)
          </p>
          <p style={{ fontSize: 13, marginTop: 4 }}>
            {procurementRole === 'controle_gestion'
              ? 'Vérifiez le chiffrage et consultez les pièces jointes, puis approuvez. Le dossier sera transmis au DAF.'
              : 'Vérifiez le chiffrage et consultez les pièces jointes, puis approuvez. Le SA émettra le BC ensuite.'}
          </p>
          {showTreasury && (
            <p style={{ fontSize: 13, marginTop: 8 }}>
              Bon de trésorerie {treasuryOrder!.reference}
              {' · '}
              <a
                href={treasuryHtmlUrl(treasuryOrder!.id)}
                target="_blank"
                rel="noopener noreferrer"
                data-testid="mgr-achats-treasury-link"
              >
                Voir la fiche trésorerie
              </a>
              {' · '}
              <button
                type="button"
                data-testid="mgr-achats-treasury-print"
                onClick={() => printHtml(treasuryHtmlUrl(treasuryOrder!.id))}
                className="mgr-btn mgr-btn--ghost" style={{ padding: 0, fontWeight: 600 }}
              >
                Imprimer
              </button>
            </p>
          )}
        </div>
      )}

      {request.requestedByName && (
        <p style={{ ...css.meta, marginTop: 8 }}>
          Demandé par {request.requestedByName}
          {request.requestedByPhone ? ` (${request.requestedByPhone})` : ''}
        </p>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: '0.5rem' }}>
        <a
          href={ebRequestFicheHtmlUrl(request.id)}
          target="_blank"
          rel="noopener noreferrer"
          data-testid="mgr-achats-request-eb-fiche-link"
          style={{ fontSize: 13, fontWeight: 600 }}
        >
          Imprimer la fiche EB
        </a>
      </div>

      <div style={css.ficheWrap} data-testid="mgr-achats-request-eb-fiche">
        <h4 style={css.ficheTitle}>EXPRESSION DU BESOIN</h4>
        <table style={css.ficheMeta}>
          <tbody>
            <tr>
              <td style={css.ficheDemandeur} rowSpan={2}>DEMANDEUR</td>
              <td style={css.ficheMetaTd}>
                <div style={css.ficheLabel}>SITE :</div>
                <div>{site?.name ?? request.siteName ?? '—'}</div>
              </td>
              <td style={css.ficheMetaTd}>
                <div style={css.ficheLabel}>SERVICE:</div>
                <div>Direction Technique</div>
              </td>
            </tr>
            <tr>
              <td style={css.ficheMetaTd}>
                <div style={css.ficheLabel}>OBJET</div>
                <div>{objetFromLines(lines.map((l) => ({ label: l.label, quantity: Number(l.quantity), unit: l.unit })), site?.name)}</div>
              </td>
              <td style={css.ficheMetaTd}>
                <div style={css.ficheLabel}>NOM DEMANDEUR :</div>
                <div>{request.requestedByName ?? '—'}</div>
              </td>
            </tr>
          </tbody>
        </table>
        <div style={{ overflowX: 'auto' }}>
          <table style={css.lineTable}>
            <thead>
              <tr>
                <th style={css.lineTh}>Réf</th>
                <th style={css.lineTh}>Désignations</th>
                <th style={css.lineTh}>Catégorie</th>
                <th style={css.lineTh}>Unité</th>
                <th style={css.lineTh}>Quantité</th>
                <th style={css.lineTh}>Prix Unitaire</th>
                <th style={css.lineTh}>Montant</th>
                <th style={css.lineTh}>Fournisseur{canPrice ? ' *' : ''}</th>
                <th style={css.lineTh}>Mode de paiement{canPrice ? ' *' : ''}</th>
                <th style={css.lineTh}>Pièce jointe{canPrice ? ' *' : ''}</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={l.id}>
                  <td style={css.lineTd}>{i + 1}</td>
                  <td style={css.lineTd}>{l.label}</td>
                  <td style={css.lineTd}>{ebSpendCategoryLabel(l.spendCategory)}</td>
                  <td style={css.lineTd}>{l.unit}</td>
                  <td style={css.lineTd}>{l.quantity}</td>
                  <td style={css.lineTd}>
                    {canPrice ? (
                      <input
                        type="number"
                        min={0}
                        step="1"
                        value={l.unitPriceFcfa ?? ''}
                        onChange={(e) => onUnitPriceChange(l.id, Number.parseFloat(e.target.value) || 0)}
                        className="mgr-input" style={{ width: 110 }}
                        data-testid={`mgr-achats-line-unit-price-${i}`}
                      />
                    ) : (
                      <span
                        data-testid={`mgr-achats-line-unit-price-${i}`}
                        style={{ color: Number(l.unitPriceFcfa) ? undefined : 'var(--text-muted)' }}
                      >
                        {l.unitPriceFcfa != null && Number(l.unitPriceFcfa) > 0
                          ? Number(l.unitPriceFcfa).toLocaleString('fr-FR')
                          : '—'}
                      </span>
                    )}
                  </td>
                  <td style={css.lineTd}>
                    {canPrice ? (
                      <input
                        type="number"
                        min={0}
                        step="1"
                        value={l.amountFcfa ?? ''}
                        onChange={(e) => onAmountChange(l.id, Number.parseFloat(e.target.value) || 0)}
                        className="mgr-input" style={{ width: 120 }}
                        data-testid={`mgr-achats-line-amount-${i}`}
                      />
                    ) : (
                      <span
                        data-testid={`mgr-achats-line-amount-${i}`}
                        style={{ color: Number(l.amountFcfa) ? undefined : 'var(--text-muted)' }}
                      >
                        {l.amountFcfa != null && Number(l.amountFcfa) > 0
                          ? Number(l.amountFcfa).toLocaleString('fr-FR')
                          : '—'}
                      </span>
                    )}
                  </td>
                  <td style={css.lineTd}>
                    {canPrice ? (
                      <SupplierSelect
                        value={l.supplierName ?? ''}
                        suppliers={suppliers}
                        required
                        testId={`mgr-achats-line-supplier-${i}`}
                        onChange={(name) => onLineCommercial(l.id, { supplierName: name })}
                      />
                    ) : (
                      l.supplierName ?? '—'
                    )}
                  </td>
                  <td style={css.lineTd}>
                    {canPrice ? (
                      <select
                        value={l.paymentMode ?? ''}
                        required
                        onChange={(e) => onLineCommercial(l.id, { paymentMode: e.target.value })}
                        className="mgr-input"
                        data-testid={`mgr-achats-line-payment-${i}`}
                      >
                        <option value="">À préciser</option>
                        {PAYMENT_MODES.map((m) => (
                          <option key={m} value={m}>{m}</option>
                        ))}
                      </select>
                    ) : (
                      l.paymentMode ?? '—'
                    )}
                  </td>
                  <td style={css.lineTd}>
                    {l.attachmentFileName ? (
                      <button
                        type="button"
                        data-testid={`mgr-achats-line-attachment-name-${i}`}
                        onClick={() => void handleOpenAttachment(l.id, l.attachmentFileName ?? '')}
                        className="mgr-btn mgr-btn--ghost"
                        style={{
                          padding: 0,
                          textDecoration: 'underline',
                          color: 'var(--accent, #0b4a2c)',
                        }}
                      >
                        {l.attachmentFileName}
                      </button>
                    ) : (
                      <span style={{ color: 'var(--text-muted)' }}>—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {canPrice && (
          <p style={{ ...css.meta, marginTop: 8 }} data-testid="mgr-achats-amount-hint">
            Le montant se calcule automatiquement : prix unitaire × quantité (saisir le montant recalcule le PU).
          </p>
        )}
        <EbFicheSignoff
          treatedByName={stepDisplayName(saStep) || (canPrice ? managerName : '')}
          treatedByDate={
            saStep
              ? new Date(saStep.createdAt).toLocaleDateString('fr-FR')
              : canPrice
                ? new Date().toLocaleDateString('fr-FR')
                : ''
          }
          treatedBySignature={saStep ? stepSignature(saStep) : (canPrice ? 'Chiffrage en cours' : '')}
          validatedByName={stepDisplayName(dtStep)}
          validatedByDate={dtStep ? new Date(dtStep.createdAt).toLocaleDateString('fr-FR') : ''}
          validatedBySignature={dtStep ? stepSignature(dtStep, true) : ''}
          dafName={stepDisplayName(dafStep)}
          dafDate={dafStep ? new Date(dafStep.createdAt).toLocaleDateString('fr-FR') : ''}
          dafSignature={dafStep ? stepSignature(dafStep, true) : ''}
          pdgName={stepDisplayName(pdgStep)}
          pdgDate={pdgStep ? new Date(pdgStep.createdAt).toLocaleDateString('fr-FR') : ''}
          pdgSignature={pdgStep ? stepSignature(pdgStep, true) : ''}
          showPdg={needsPdg}
        />
      </div>

      {(canPrice || lines.some((l) => l.attachmentFileName)) && (
        <div
          data-testid="mgr-achats-attachments"
          style={{ marginTop: '1rem', border: '1px solid var(--border)', borderRadius: 10, padding: '1rem 1.25rem' }}
        >
          <h4 style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>Pièces jointes</h4>
          <p style={{ ...css.meta, marginBottom: 10 }}>
            Un devis, une photo ou un Excel par produit
            {canPrice ? ' — obligatoire avant envoi au DAF.' : '.'}
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {lines.map((l, i) => (
              <div
                key={l.id}
                style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}
              >
                <span style={{ fontSize: 13, minWidth: 160, flex: '1 1 160px' }}>
                  {i + 1}. {l.label || 'Ligne'}
                </span>
                {l.attachmentFileName ? (
                  <button
                    type="button"
                    data-testid={`mgr-achats-line-attachment-${i}`}
                    onClick={() => void handleOpenAttachment(l.id, l.attachmentFileName ?? '')}
                    disabled={previewLoading}
                    className="mgr-btn mgr-btn--ghost"
                    style={{
                      textDecoration: 'underline',
                      color: 'var(--accent, #0b4a2c)',
                    }}
                  >
                    {previewLoading ? 'Ouverture…' : `Consulter ${l.attachmentFileName}`}
                  </button>
                ) : (
                  <span style={{ ...css.meta }}>—</span>
                )}
                {canPrice && (
                  <label
                    className="mgr-btn mgr-btn--outline"
                    style={{
                      margin: 0,
                      display: 'inline-flex',
                      alignItems: 'center',
                      cursor: actionLoading ? 'wait' : 'pointer',
                    }}
                  >
                    {l.attachmentFileName ? 'Remplacer' : 'Joindre un fichier'}
                    <input
                      type="file"
                      accept=".pdf,.png,.jpg,.jpeg,.webp,.heic,.heif,.xls,.xlsx,application/pdf,image/*"
                      data-testid={`mgr-achats-line-attach-${i}`}
                      disabled={actionLoading}
                      style={{ display: 'none' }}
                      onChange={(e) => {
                        const file = e.target.files?.[0]
                        if (file) onUploadAttachment(l.id, file)
                        e.target.value = ''
                      }}
                    />
                  </label>
                )}
                {canPrice && l.attachmentFileName ? (
                  <button
                    type="button"
                    data-testid={`mgr-achats-line-attach-remove-${i}`}
                    onClick={() => onRemoveAttachment(l.id)}
                    disabled={actionLoading}
                    className="mgr-btn mgr-btn--danger"
                  >
                    Retirer
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      )}

      {approvalSteps.length > 0 && (
        <div style={{ marginTop: '1rem' }} data-testid="mgr-achats-history">
          <h4 style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Historique</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {approvalSteps.map((s) => (
              <div key={s.id} style={{ fontSize: 13 }}>
                <strong>{PROCUREMENT_ROLE_LABELS[s.role]}</strong>
                {' — '}
                {approvalDecisionLabel(s.role, s.decision)}
                {s.comment ? ` : ${s.comment}` : ''}
                <span style={css.meta}> · {formatApprovalAt(s.createdAt)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {orders.length > 0 && (
        <div style={{ marginTop: '1rem' }} data-testid="mgr-achats-po-list">
          <h4 style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Bons de commande</h4>
          {orders.map((po, i) => {
            const name = suppliers.find((s) => s.id === po.supplierId)?.name
              ?? (supplier && supplier.id === po.supplierId ? supplier.name : null)
            return (
              <p key={po.id} style={{ fontSize: 13, margin: '0 0 6px' }}>
                {po.reference} ({po.docType.toUpperCase()})
                {name ? ` — ${name}` : ''}
                {' · '}
                <a
                  href={documentHtmlUrl(po.id)}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-testid={i === 0 ? 'mgr-achats-document-link' : `mgr-achats-document-link-${i}`}
                >
                  Voir le document
                </a>
                {' · '}
                <button
                  type="button"
                  data-testid={i === 0 ? 'mgr-achats-document-print' : `mgr-achats-document-print-${i}`}
                  onClick={() => printHtml(documentHtmlUrl(po.id))}
                  className="mgr-btn mgr-btn--ghost" style={{ padding: 0, fontWeight: 600 }}
                >
                  Imprimer
                </button>
              </p>
            )
          })}
        </div>
      )}

      {showTreasury && !showApprove && (
        <div style={{ marginTop: '1rem' }}>
          <h4 style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Bon de trésorerie</h4>
          <p style={{ fontSize: 13 }}>
            {treasuryOrder!.reference}
            {' · '}
            <a
              href={treasuryHtmlUrl(treasuryOrder!.id)}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="mgr-achats-treasury-link"
            >
              Voir la fiche trésorerie
            </a>
            {' · '}
            <button
              type="button"
              data-testid="mgr-achats-treasury-print"
              onClick={() => printHtml(treasuryHtmlUrl(treasuryOrder!.id))}
              className="mgr-btn mgr-btn--ghost" style={{ padding: 0, fontWeight: 600 }}
            >
              Imprimer
            </button>
          </p>
        </div>
      )}

      {canPrice && (
        <div style={{ marginTop: '1.25rem', borderTop: '1px solid var(--border)', paddingTop: '1rem' }} data-testid="mgr-achats-sa-pricing">
          <p style={css.meta}>
            Montant total : <strong>{total.toLocaleString('fr-FR')} XOF</strong>
            {' — '}
            {needsPdg
              ? '≥ 500 000 XOF : après le CdG, le DAF et le PDG valident.'
              : '< 500 000 XOF : après le CdG, le DAF valide.'}
            {' Fournisseur, mode de paiement et PJ sont obligatoires sur chaque ligne.'}
            {hasComptantLines(lines) ? ' Mode COMPTANT : générez le bon de trésorerie avant l’envoi au CdG.' : ''}
          </p>
          {hasComptantLines(lines) && (
            <div style={{ marginBottom: 10 }}>
              <button
                type="button"
                data-testid="mgr-achats-create-bt"
                onClick={onCreateTreasury}
                disabled={actionLoading}
                className="mgr-btn mgr-btn--outline"
              >
                {treasuryOrder ? 'Regénérer le bon de trésorerie' : 'Générer le bon de trésorerie'}
              </button>
            </div>
          )}
          <div style={css.actionRow}>
            <button
              type="button"
              data-testid="mgr-achats-save-pricing"
              onClick={onSavePricing}
              disabled={actionLoading}
              className="mgr-btn mgr-btn--ghost"
            >
              Enregistrer les lignes
            </button>
            <button
              type="button"
              data-testid="mgr-achats-submit-finance"
              onClick={onSubmitFinance}
              disabled={actionLoading}
              className="mgr-btn mgr-btn--primary"
            >
              Soumettre au CdG
            </button>
          </div>
        </div>
      )}

      {showCreatePo && (
        <div
          data-testid="mgr-achats-create-po-block"
          style={{ marginTop: '1.25rem', borderTop: '1px solid var(--border)', paddingTop: '1rem' }}
        >
          <h4 style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
            {ebSuppliers.length <= 1 ? 'Émettre le bon de commande' : 'Émettre les bons de commande'}
          </h4>
          <p style={{ ...css.meta, marginBottom: 10 }}>
            {ebSuppliers.length <= 1
              ? 'Un BC pour le fournisseur de l’EB.'
              : 'Un BC par fournisseur présent sur l’EB.'}
            {' '}Montant total : <strong>{total.toLocaleString('fr-FR')} XOF</strong>
            {siteBudget?.remainingFcfa != null
              ? ` — reste à engager : ${siteBudget.remainingFcfa.toLocaleString('fr-FR')} FCFA`
              : ''}
          </p>
          {wouldExceedBudget && (
            <p data-testid="mgr-achats-over-budget" style={{ ...css.meta, color: '#b45309', marginBottom: 10 }}>
              Warning : ce BC ferait dépasser l’enveloppe du chantier. Vous pouvez quand même créer le BC.
            </p>
          )}
          {ebSuppliers.length > 0 && (
            <div data-testid="mgr-achats-po-suppliers" style={{ marginTop: 8 }}>
              {ebSuppliers.map((s) => {
                const existing = orders.find((po) => po.supplierId === s.id)
                return (
                  <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{s.name}</span>
                    {existing ? (
                      <span style={css.meta}>{existing.reference}</span>
                    ) : (
                      <button
                        type="button"
                        data-testid={`mgr-achats-create-po-${s.id}`}
                        onClick={() => onCreatePo(s.id)}
                        disabled={actionLoading}
                        className="mgr-btn mgr-btn--outline"
                      >
                        Créer le BC
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          )}
          <button
            type="button"
            data-testid="mgr-achats-create-po"
            onClick={() => onCreatePo()}
            disabled={actionLoading || allPosCreated}
            className="mgr-btn mgr-btn--primary"
            style={{
              marginTop: 10,
              ...(allPosCreated ? { opacity: 0.55, cursor: 'not-allowed', background: '#9ca3af' } : {}),
            }}
          >
            Créer {ebSuppliers.length <= 1 ? 'le BC' : 'les BC'}
          </button>
        </div>
      )}

      {(showApprove || showReject || showSchedule) && (
        <div style={{ marginTop: '1.25rem', borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
          {(showApprove || showReject) && (
            <Field label="Commentaire (optionnel sauf rejet)">
              <textarea
                value={approvalComment}
                onChange={(e) => onCommentChange(e.target.value)}
                rows={2}
                className="mgr-input" style={{ resize: 'vertical' }}
                data-testid="mgr-achats-comment"
              />
            </Field>
          )}
          {showApprove && (procurementRole === 'daf' || procurementRole === 'pdg' || procurementRole === 'controle_gestion') && (
            <Field label="NIP signature">
              <input
                type="password"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={approvalPin}
                onChange={(e) => onPinChange(e.target.value)}
                placeholder="••••"
                className="mgr-input" style={{ width: 120 }}
                data-testid="mgr-achats-sign-pin"
              />
            </Field>
          )}

          {showSchedule && (
            <div style={{ marginTop: showApprove || showReject ? '0.75rem' : 0 }}>
              <p style={{ ...css.meta, marginBottom: 10 }}>
                Une tournée par BC. Ouvre Planifier, préremplie pour ce fournisseur. Le livreur et la date se saisissent dans Planifier.
              </p>
              {pendingOrders.map((po, i) => {
                const name = suppliers.find((s) => s.id === po.supplierId)?.name
                  ?? (supplier && supplier.id === po.supplierId ? supplier.name : null)
                return (
                  <button
                    key={po.id}
                    type="button"
                    data-testid={i === 0 ? 'btp-schedule-delivery' : `btp-schedule-delivery-${po.id}`}
                    onClick={() => onScheduleDelivery(po.id)}
                    disabled={actionLoading}
                    className="mgr-btn mgr-btn--primary" style={{ marginTop: 8, marginRight: 8 }}
                  >
                    Planifier une tournée{name ? ` — ${name}` : ''}
                  </button>
                )
              })}
            </div>
          )}

          {(showApprove || showReject) && (
          <div style={css.actionRow}>
            {showApprove && (
              <button
                type="button"
                data-testid="btp-approve-btn"
                onClick={onApprove}
                disabled={actionLoading}
                className="mgr-btn mgr-btn--primary"
              >
                Approuver
              </button>
            )}
            {showReject && (
              <button
                type="button"
                data-testid="mgr-achats-reject"
                onClick={onReject}
                disabled={actionLoading}
                className="mgr-btn mgr-btn--danger"
              >
                Rejeter
              </button>
            )}
          </div>
          )}
        </div>
      )}

      {(preview || previewLoading) && (
        <div
          data-testid="mgr-achats-attachment-preview"
          role="dialog"
          aria-modal="true"
          aria-label={preview?.fileName ?? 'Pièce jointe'}
          onClick={closePreview}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 80,
            background: 'rgba(15, 23, 42, 0.55)',
            display: 'flex',
            padding: 16,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#fff',
              borderRadius: 10,
              margin: 'auto',
              width: 'min(960px, 100%)',
              height: 'min(90vh, 800px)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                padding: '10px 14px',
                borderBottom: '1px solid var(--border)',
                flexShrink: 0,
                position: 'relative',
                zIndex: 2,
                background: '#fff',
              }}
            >
              <strong data-testid="mgr-achats-attachment-preview-name" style={{ fontSize: 14 }}>
                {preview?.fileName ?? 'Ouverture…'}
              </strong>
              <div style={{ display: 'flex', gap: 8 }}>
                {preview ? (
                  <a href={preview.url} download={preview.fileName} className="mgr-btn mgr-btn--outline">
                    Télécharger
                  </a>
                ) : null}
                <button
                  type="button"
                  data-testid="mgr-achats-attachment-preview-close"
                  onClick={closePreview}
                  className="mgr-btn mgr-btn--ghost"
                >
                  Fermer
                </button>
              </div>
            </div>
            <div style={{ flex: 1, minHeight: 0, position: 'relative', overflow: 'hidden', background: '#0f172a' }}>
              {preview && attachmentPreviewKind(preview.contentType) === 'image' ? (
                <img
                  src={preview.url}
                  alt={preview.fileName}
                  style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', display: 'block', margin: '0 auto' }}
                />
              ) : preview && attachmentPreviewKind(preview.contentType) === 'pdf' ? (
                <iframe
                  title={preview.fileName}
                  src={preview.url}
                  style={{
                    position: 'absolute',
                    inset: 0,
                    width: '100%',
                    height: '100%',
                    border: 0,
                    background: '#fff',
                  }}
                />
              ) : (
                <p style={{ color: '#fff', padding: 24, fontSize: 14 }}>
                  {previewLoading
                    ? 'Chargement de la pièce jointe…'
                    : 'Aperçu indisponible pour ce type de fichier — utilisez Télécharger.'}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

import { useCallback, useEffect, useRef, useState } from 'react'
import { authFetch } from '../managerApi'
import { toast } from '../../../lib/toast'
import { defaultReplanDate } from '../../../lib/dates'
import {
  approveRequest,
  approveSaBc,
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
  fetchSites,
  pasteWhatsappDraft,
  createBlankEbFiche,
  archiveDraft,
  rejectRequest,
  resolveDocumentChain,
  reviseRequestQuantities,
  submitDraft,
  submitRequestFinance,
  updateDraft,
  updateRequestPricing,
  uploadRequestLineAttachment,
  uploadRequestLinesAttachment,
  removeRequestLineAttachment,
  fetchRequestLineAttachment,
  fetchSiteBudget,
  fetchSiteBudgets,
} from './procurementApi'
import { DocumentChain } from './DocumentChain'
import type {
  DocumentChainMatch,
  DraftDetailResponse,
  ParsedEbLine,
  ProcurementRole,
  PurchaseRequestDraftRow,
  PurchaseRequestRow,
  RequestDetailResponse,
  SiteBudget,
  SiteRow,
  ProcurementTourPrefill,
} from './procurementTypes'
import { catalogUnitFromEb } from '../../../../shared/ebCatalog'
import { ebSpendCategoryLabel, inferEbSpendCategory, normalizeEbSpendCategory } from '../../../../shared/ebSpendCategory'
import { CHARGE_FAMILIES, chargeNatureFamily, chargeNaturesByFamily } from '../../../../shared/chargeNatures'
import { hasComptantLines } from '../../../../shared/saFinanceGate'
import { versionBadge, versionSuffix } from '../../../../shared/requestVersion'
import {
  AlertBox,
  canApproveRequest,
  canCreatePo,
  canEditDraft,
  canPriceRequest,
  canRejectRequest,
  canReviseRequest,
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
import { SaOverview } from './SaOverview'
import { useProcurementEditLock } from './useProcurementEditLock'
import { saFinanceIncompleteMessage } from '../../../../shared/saFinanceGate'

type AchatsView = 'inbox' | 'requests'

const thStyle: React.CSSProperties = {
  padding: '10px 12px',
  textAlign: 'left',
  fontSize: 11,
  fontWeight: 700,
  color: 'var(--text-muted)',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  borderBottom: '2px solid var(--border-strong)',
}

const tdStyle: React.CSSProperties = {
  padding: '10px 12px',
  borderBottom: '1px solid var(--border)',
  verticalAlign: 'middle',
}

const PRE_BC_STATUSES = new Set([
  'sa_head_review',
  'bc_head_review',
  'submitted',
  'cdg_review',
  'daf_review',
  'sa_review',
  'bt_pending',
  'daf_bt_review',
  'pdg_review',
])
type DriverOption = { id: string; name: string }

/** Nature par défaut d'une ligne main d'œuvre — fourre-tout de la famille (miroir d'`autres_materiaux`). */
const DEFAULT_LABOR_NATURE = 'mo_divers'

function emptyLine(kind: 'material' | 'labor' = 'material'): ParsedEbLine {
  if (kind === 'labor') {
    // Un salaire ne démarre JAMAIS en matériaux : nature MO et paiement comptant d'office.
    return { label: '', quantity: 1, unit: 'jour', supplierName: '', paymentMode: 'COMPTANT', spendCategory: DEFAULT_LABOR_NATURE }
  }
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

/**
 * Ouvre le détail d'une demande puis amène la zone à traiter (chiffrage SA)
 * au centre de l'écran. Le détail se charge en asynchrone : on sonde le DOM
 * brièvement (le flag exact vaut true quand la zone est déjà visible).
 */
function scrollToChiffrageZone(): void {
  let tries = 0
  const tick = () => {
    tries += 1
    const el = document.querySelector('[data-chiffrage-zone]')
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }
    if (tries < 20) setTimeout(tick, 150)
  }
  setTimeout(tick, 150)
}

/** Joindre/retirer une PJ recharge le détail serveur : on garde le chiffrage local non enregistré. */
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
    // Concept : la main d'œuvre ne passe pas par le circuit SA et se paie
    // toujours comptant — normalisé avant envoi au serveur.
    ...(chargeNatureFamily(l.spendCategory) === 'main_oeuvre' ? { paymentMode: 'COMPTANT' } : {}),
  }))
}

const PAYMENT_MODES = ['CREDIT', 'COMPTANT', 'CHEQUE', 'VIREMENT'] as const

/** Libellés lisibles pour les modes de paiement — les codes bruts (CREDIT…) étaient illisibles dans les listes. */
const PAYMENT_MODE_LABELS: Record<(typeof PAYMENT_MODES)[number], string> = {
  CREDIT: 'Crédit',
  COMPTANT: 'Comptant',
  CHEQUE: 'Chèque',
  VIREMENT: 'Virement',
}

/** Une ligne est de main d'œuvre quand sa nature de charge appartient à la famille main_oeuvre. */
function isLaborLine(spendCategory?: string | null): boolean {
  return chargeNatureFamily(spendCategory) === 'main_oeuvre'
}

// ── Largeurs de colonnes des tables de lignes EB (table-layout fixe) ────────
// Un <select>/<input> a une largeur minimale quasi nulle : dans un calcul de
// largeurs automatique, ce sont ces colonnes que la compression tronque en
// premier (« Désignations », « Nature », « Fournisseur »). Avec un layout fixe
// les largeurs sont garanties ; sous la largeur minimale la table défile
// horizontalement (overflow-x) au lieu de comprimer les champs.
const EB_LINE_TABLE_MIN_WIDTH = 1026
const lineTableFixed = {
  ...css.lineTable,
  tableLayout: 'fixed' as const,
  minWidth: EB_LINE_TABLE_MIN_WIDTH,
}
const EB_SA_TABLE_MIN_WIDTH = 1254
const saTableFixed = {
  ...css.lineTable,
  tableLayout: 'fixed' as const,
  minWidth: EB_SA_TABLE_MIN_WIDTH,
}
const lineColWidth = (w: number) => ({ ...css.lineTh, width: w }) as React.CSSProperties

function SupplierSelect({
  value,
  suppliers,
  disabled,
  required,
  placeholder = 'À préciser',
  testId,
  onChange,
}: {
  value: string
  suppliers: Array<{ id: string; name: string }>
  disabled?: boolean
  required?: boolean
  /** Libellé de l'option vide — « À préciser » par ligne, « Choisir… » pour une saisie groupée. */
  placeholder?: string
  testId: string
  onChange: (name: string) => void
}) {
  return (
    <select
      value={value}
      disabled={disabled}
      required={required}
      onChange={(e) => onChange(e.target.value)}
      style={css.input}
      data-testid={testId}
    >
      <option value="">{placeholder}</option>
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
  focusRequestId,
  onFocusConsumed,
}: {
  handleAuth: (status: number) => boolean
  procurementRole: ProcurementRole | null
  managerName?: string
  onInboxCountChanged?: () => void
  onOpenPlanifier?: (prefill: ProcurementTourPrefill, remainingToursAfter: number) => void
  onOpenSuiviChantier?: () => void
  focusRequestId?: string | null
  onFocusConsumed?: () => void
}) {
  const [view, setView] = useState<AchatsView>('inbox')
  const [saActor, setSaActor] = useState<{ id: string; supervisorId: string | null }>({ id: '', supervisorId: null })
  useEffect(() => {
    if (procurementRole !== 'purchasing') return
    let cancelled = false
    const loadSaActor = async () => {
      try {
        const res = await authFetch('/auth/me')
        if (!res.ok) throw new Error('Profil SA indisponible')
        const data = await res.json() as { manager: { id: string; saSupervisorId?: string | null } }
        if (!cancelled) setSaActor({ id: data.manager.id, supervisorId: data.manager.saSupervisorId ?? null })
      } catch {
        if (!cancelled) setSaActor({ id: '', supervisorId: null })
      }
    }
    void loadSaActor()
    window.addEventListener('focus', loadSaActor)
    return () => { cancelled = true; window.removeEventListener('focus', loadSaActor) }
  }, [procurementRole])
  const [drafts, setDrafts] = useState<PurchaseRequestDraftRow[]>([])
  const [requesterSites, setRequesterSites] = useState<SiteRow[]>([])
  const [createSiteId, setCreateSiteId] = useState('')
  const [requests, setRequests] = useState<PurchaseRequestRow[]>([])
  const [cdgBudgets, setCdgBudgets] = useState<SiteBudget[]>([])
  const [cdgFocus, setCdgFocus] = useState<'all' | 'validate' | 'pipeline'>('all')
  const [selectedDraftId, setSelectedDraftId] = useState<string | null>(null)
  const [createdDraftId, setCreatedDraftId] = useState<string | null>(null)
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
  // Résolveur d'identifiants : réf. collée, pièce trouvée (surlignée) et erreur.
  const [chainRef, setChainRef] = useState('')
  const [chainLookup, setChainLookup] = useState<DocumentChainMatch | null>(null)
  const [chainLookupError, setChainLookupError] = useState<string | null>(null)
  const [chainLookupLoading, setChainLookupLoading] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)
  const [approvalComment, setApprovalComment] = useState('')
  const [approvalPin, setApprovalPin] = useState('')
  const [reviseModalOpen, setReviseModalOpen] = useState(false)
  const [reviseQuantities, setReviseQuantities] = useState<Record<string, string>>({})
  const [reviseComment, setReviseComment] = useState('')
  const [revisePin, setRevisePin] = useState('')
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
  const pipelineAmount = pipeline.reduce((sum, r) => sum + Number(r.totalAmountFcfa ?? 0), 0)
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

  // Filtrage recherche + statut
  const [searchQuery, setSearchQuery] = useState('')
  const [activeFilter, setActiveFilter] = useState<'all' | 'pre_bc' | 'po_ready' | 'delivery_scheduled'>('all')

  let filteredRequests = visibleRequests
  if (activeFilter === 'pre_bc') filteredRequests = filteredRequests.filter((r) => PRE_BC_STATUSES.has(r.status))
  else if (activeFilter === 'po_ready') filteredRequests = filteredRequests.filter((r) => r.status === 'po_ready')
  else if (activeFilter === 'delivery_scheduled') filteredRequests = filteredRequests.filter((r) => r.status === 'delivery_scheduled')

  if (searchQuery.trim()) {
    const q = searchQuery.toLowerCase()
    filteredRequests = filteredRequests.filter((r) =>
      (r.reference ?? '').toLowerCase().includes(q)
      || (r.siteName ?? '').toLowerCase().includes(q)
    )
  }

  useEffect(() => {
    if (procurementRole === 'site_manager') {
      setView('inbox')
    } else if (procurementRole && procurementRole !== 'technical_director') {
      setView('requests')
    }
  }, [procurementRole])

  useEffect(() => {
    if (procurementRole !== 'site_manager') return
    let cancelled = false
    void fetchSites().then((rows) => {
      if (cancelled) return
      setRequesterSites(rows)
      setCreateSiteId((current) => current && rows.some((site) => site.id === current)
        ? current
        : rows.length === 1 ? rows[0].id : '')
    }).catch(() => {
      if (!cancelled) setRequesterSites([])
    })
    return () => { cancelled = true }
  }, [procurementRole])

  const draftLoadGen = useRef(0)
  const selectedDraftIdRef = useRef<string | null>(null)
  useEffect(() => {
    selectedDraftIdRef.current = selectedDraftId
  }, [selectedDraftId])

  const loadLists = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent === true
    const keepPanel = Boolean(selectedDraftIdRef.current)
    if (!keepPanel && !silent) {
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
      if (!keepPanel && !silent && !handleAuth(500)) {
        setError(err instanceof Error ? err.message : 'Erreur chargement achats')
      }
    } finally {
      if (!keepPanel && !silent) setLoading(false)
    }
  }, [handleAuth, procurementRole])

  // Rafraîchissement automatique silencieux : les statuts avancent côté serveur
  // (CdG/DAF/PDG/SA) — l'interface converge sans rechargement manuel.
  useEffect(() => {
    if (!procurementRole) return
    const tick = () => { void loadLists({ silent: true }) }
    const id = window.setInterval(tick, 30_000)
    const onVisible = () => { if (document.visibilityState === 'visible') tick() }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
    }
  }, [loadLists, procurementRole])

  const loadRequests = loadLists

  const loadDraftDetail = useCallback(async (id: string) => {
    const gen = ++draftLoadGen.current
    // Réactivité : pas de spinner global ici — le contenu de l'onglet reste
    // affiché et interactif pendant le chargement du détail (hint local).
    setError(null)
    try {
      const detail = await fetchDraft(id)
      if (gen !== draftLoadGen.current) return
      setDraftDetail(detail)
      setEditLines(linesFromDraft(detail.draft))
      setEditUrgency(detail.draft.parsedUrgency ?? 'normal')
      setEditSiteId(detail.draft.siteId ?? '')
      const hintName = detail.parseHints?.requesterName
      setEditRequester(hintName && hintName !== 'À identifier' ? hintName : (procurementRole === 'site_manager' || procurementRole === 'purchasing') ? managerName ?? '' : '')
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
    }
  }, [managerName, procurementRole])

  const loadRequestDetail = useCallback(async (id: string) => {
    // Réactivité : pas de spinner global — voir loadDraftDetail.
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

  // Retour depuis Planifier (demande multi-livraisons) : rouvrir la demande
  // pour planifier les tournées suivantes (un BC = une tournée).
  useEffect(() => {
    if (!focusRequestId) return
    setView('inbox')
    setSelectedRequestId(focusRequestId)
    setChainLookup(null)
    onFocusConsumed?.()
    scrollToChiffrageZone()
    // onFocusConsumed volontairement omis : callback stable du parent
  }, [focusRequestId])

  const refreshInbox = () => {
    onInboxCountChanged?.()
    void loadLists()
  }

  const handleDeleteDraft = async (draftId: string) => {
    if (!window.confirm('Supprimer ce brouillon d’EB ? Cette action est irréversible.')) return
    setActionLoading(true)
    try {
      await archiveDraft(draftId)
      toast.success('Brouillon supprimé.')
      if (selectedDraftId === draftId) {
        setSelectedDraftId(null)
        setDraftDetail(null)
      }
      refreshInbox()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Suppression échouée')
    } finally {
      setActionLoading(false)
    }
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
    if (procurementRole === 'site_manager' && !editRequester.trim()) {
      toast.error('Saisissez le nom du chef de chantier demandeur.')
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
      toast.success(
        procurementRole === 'purchasing'
          ? `EB ${request.reference} créée — complétez les factures puis soumettez au Contrôle de gestion.`
          : request.status === 'dt_review'
          ? `EB ${request.reference} soumise au DT pour approbation.`
          : request.status === 'cdg_review'
          ? `EB ${request.reference} transmise directement au Contrôle de gestion.`
          : `EB ${request.reference} transmise au Service achats.`,
      )
      setSelectedDraftId(null)
      if (procurementRole === 'purchasing') setRequestDetail(null)
      setSelectedRequestId(procurementRole === 'purchasing' ? request.id : null)
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
    patch: {
      supplierName?: string
      paymentMode?: string
      attachmentBlobKey?: string | null
      attachmentFileName?: string | null
      attachmentContentType?: string | null
    },
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
    if (!saActor.id) {
      toast.error('Le profil SA doit être chargé avant la soumission. Actualisez la page.')
      return
    }
    // Garde : EB déjà partie au CdG (statut périmé dans l'UI, double-clic…) → rien à faire
    if (requestDetail.request.status !== 'submitted' && requestDetail.request.status !== 'sa_head_review') {
      toast.info('Cette EB a déjà été envoyée au Contrôle de gestion — aucune action nécessaire.')
      return
    }
    const incomplete = saFinanceIncompleteMessage(requestDetail.lines)
    if (incomplete) {
      toast.error(incomplete.endsWith('.') ? incomplete : `${incomplete}.`)
      return
    }
    setActionLoading(true)
    try {
      if (requestDetail.request.status === 'submitted') await updateRequestPricing(selectedRequestId, pricingLinesFromDetail(requestDetail.lines))
      const result = await submitRequestFinance(selectedRequestId, approvalPin || undefined)
      setApprovalPin('')
      toast.success(result.request.status === 'sa_head_review' ? 'Chiffrage transmis au chef SA pour validation.' : `EB envoyée au Contrôle de gestion (${result.finance.totalAmountFcfa.toLocaleString('fr-FR').replace(/\u202F/g, ' ')} XOF).`)
      const detail = await fetchRequest(selectedRequestId)
      setRequestDetail(detail)
      void loadRequests()
      onInboxCountChanged?.()
    } catch (err) {
      const msg = err instanceof Error ? err.message : ''
      // Si l'EB a été envoyée entre-temps (double-clic / autre onglet), message neutre au lieu de l'erreur de prix
      if (msg.includes('qu’avant envoi au CdG')) {
        toast.info('Cette EB a déjà été envoyée au Contrôle de gestion — aucune action nécessaire.')
      } else {
        toast.error(msg || 'Soumission au CdG échouée')
      }
    } finally {
      setActionLoading(false)
    }
  }

  const handleApproveSaBc = async () => {
    if (!selectedRequestId) return
    setActionLoading(true)
    try {
      setRequestDetail(await approveSaBc(selectedRequestId, approvalPin))
      setApprovalPin('')
      toast.success('BC validés et signés par le chef SA.')
      refreshInbox()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Validation du BC impossible')
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

  // Facture partagée : un seul envoi couvrant toutes les lignes cochées — le
  // serveur écrit une seule clé de blob que chaque ligne référence.
  const handleBulkUploadLineAttachments = async (lineIds: string[], file: File) => {
    if (!selectedRequestId || lineIds.length === 0) return
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Fichier trop volumineux (max. 5 Mo)')
      return
    }
    setActionLoading(true)
    toast.info(`Envoi de ${file.name} sur ${lineIds.length} ligne${lineIds.length > 1 ? 's' : ''}…`)
    try {
      const detail = await uploadRequestLinesAttachment(selectedRequestId, lineIds, file)
      setRequestDetail((prev) => keepUnsavedPricing(prev, detail))
      toast.success(
        `Facture partagée ajoutée à ${lineIds.length} ligne${lineIds.length > 1 ? 's' : ''} : ${file.name}`,
      )
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

  const openReviseModal = () => {
    if (!requestDetail) return
    const initial: Record<string, string> = {}
    for (const l of requestDetail.lines) {
      initial[l.id] = String(Number.parseInt(String(l.quantity), 10) || 0)
    }
    setReviseQuantities(initial)
    setReviseComment('')
    setRevisePin('')
    setReviseModalOpen(true)
  }

  const handleReviseQuantities = async () => {
    if (!selectedRequestId) return
    const quantities = Object.entries(reviseQuantities)
      .map(([id, qty]) => ({ id, quantity: Number.parseInt(qty, 10) }))
      .filter((q) => Number.isFinite(q.quantity) && q.quantity >= 0)
    if (quantities.length === 0) {
      toast.error('Aucune quantité à réviser.')
      return
    }
    if (quantities.every((q) => q.quantity === 0)) {
      toast.error('Au moins une quantité doit être supérieure à 0.')
      return
    }
    // La révision vaut visa du PDG : le NIP est exigé par le serveur.
    const pin = revisePin.trim()
    if (!pin) {
      toast.error('NIP de signature requis.')
      return
    }
    setActionLoading(true)
    try {
      const detail = await reviseRequestQuantities(selectedRequestId, {
        quantities,
        comment: reviseComment.trim() || undefined,
        pin,
      })
      setRequestDetail(detail)
      setReviseModalOpen(false)
      setReviseComment('')
      setRevisePin('')
      setReviseQuantities({})
      toast.success(
        `Demande révisée (version ${detail.request.version ?? '?'}). Renvoyée au SA.`,
      )
      void loadRequests()
      onInboxCountChanged?.()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Révision des quantités échouée')
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
    // Tournées restantes après celle-ci (autres BC sans tournée) — permet au parent
    // de ramener le SA dans Achats au lieu du Suivi si la demande a plusieurs livraisons.
    const remainingToursAfter = orders.filter((p) => p.id !== target?.id && !p.tourId).length
    onOpenPlanifier?.(
      {
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
      },
      remainingToursAfter,
    )
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
    setEditRequester(hintName && hintName !== 'À identifier' ? hintName : (procurementRole === 'site_manager' || procurementRole === 'purchasing') ? managerName ?? '' : '')
    setEditObjet(detail.parseHints?.objet || objetFromLines(linesFromDraft(detail.draft), detail.parseHints?.destination))
    setEditNeededBy(
      detail.parseHints?.neededBy && detail.parseHints.neededBy !== 'À préciser'
        ? detail.parseHints.neededBy
        : '',
    )
    setEditPin('')
    setCreatedDraftId(draftId)
    setSelectedDraftId(draftId)
    setSelectedRequestId(null)
    setView('inbox')
  }

  const handlePasteWhatsapp = async () => {
    const bodyText = pasteText.trim()
    if (!bodyText) {
      toast.error('Collez d’abord le message WhatsApp.')
      return
    }
    if (procurementRole === 'site_manager' && !createSiteId) {
      toast.error('Sélectionnez le chantier avant de créer l’EB.')
      return
    }
    setPasteLoading(true)
    setError(null)
    try {
      const result = await pasteWhatsappDraft({ bodyText, siteId: createSiteId || undefined })
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
    if (procurementRole === 'site_manager' && !createSiteId) {
      toast.error('Sélectionnez le chantier avant de créer l’EB.')
      return
    }
    setBlankLoading(true)
    setError(null)
    try {
      const result = await createBlankEbFiche({ siteId: createSiteId || undefined })
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

  /**
   * Résolveur d'identifiants : on colle une réf. (`EB-…`, `BT-…`, `BC-…`,
   * `RCT-…`) ou un id technique → on ouvre l'EB de la pièce et son maillon est
   * surligné dans la chaîne documentaire.
   */
  const handleChainLookup = async () => {
    const ref = chainRef.trim()
    if (!ref) return
    setChainLookupLoading(true)
    setChainLookupError(null)
    try {
      const resolved = await resolveDocumentChain(ref)
      setChainLookup(resolved.matched)
      setSelectedDraftId(null)
      setSelectedRequestId(resolved.requestId)
      setView('requests')
      toast.success(`Pièce retrouvée : ${resolved.matched.reference}`)
    } catch (err) {
      setChainLookup(null)
      setChainLookupError(err instanceof Error ? err.message : 'Pièce introuvable')
    } finally {
      setChainLookupLoading(false)
    }
  }

  const showDraftReview = view === 'inbox' && selectedDraftId && draftDetail
  const showRequestDetail = view === 'requests' && selectedRequestId && requestDetail
  const editLock = useProcurementEditLock(
    view === 'inbox' ? 'drafts' : 'requests',
    view === 'inbox' ? selectedDraftId : selectedRequestId,
    view === 'inbox' ? draftDetail?.draft.status ?? '' : requestDetail?.request.status ?? '',
    view === 'inbox' && selectedDraftId === createdDraftId,
  )

  return (
    <div data-testid="mgr-achats-tab">
      <h2 style={{ ...css.sectionTitle, marginBottom: '0.25rem' }}>
        {procurementRole === 'technical_director'
          ? 'Espace Direction technique'
          : procurementRole === 'purchasing'
            ? 'Espace Service achats'
            : procurementRole === 'daf'
              ? 'Espace DAF'
              : procurementRole === 'pdg'
                ? 'Espace PDG'
                : procurementRole === 'controle_gestion'
                  ? 'Espace Contrôle de gestion'
                : procurementRole === 'site_manager' ? 'EB de mon chantier' : 'Achats chantier'}
      </h2>
      {procurementRole === 'purchasing' && (
        <button
          type="button"
          data-testid="mgr-achats-create-eb"
          disabled={blankLoading || pasteLoading || actionLoading}
          onClick={() => void handleBlankFiche()}
          style={{ ...css.btnGold, margin: '0.5rem 0 1rem' }}
        >
          {blankLoading ? 'Création…' : '+ Créer une EB'}
        </button>
      )}
      <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: '1rem' }}>
        {procurementRole === 'site_manager'
          ? 'Créez une EB pour un chantier qui vous est affecté, vérifiez les lignes et soumettez-la au DT pour approbation. Vous pourrez suivre son avancement ensuite.'
          : procurementRole === 'technical_director'
          ? 'Coller un besoin WhatsApp, réviser les lignes, puis soumettre l’EB au Service achats.'
          : procurementRole === 'purchasing'
            ? 'Créez vos EB sans validation du DT, ou chiffrez les EB reçues. Renseignez les fournisseurs et paiements, joignez les factures, puis soumettez au Contrôle de gestion. Le circuit DAF / PDG reste inchangé.'
            : procurementRole === 'daf'
              ? 'Instruisez le dossier (chiffrage SA + pièces jointes, déjà validé par le CdG) puis approuvez. Le SA émet le BC ensuite.'
              : procurementRole === 'pdg'
                ? 'Dossiers ≥ 500 000 XOF : vérifiez le chiffrage et les pièces, puis approuvez. Le SA émet le BC ensuite.'
                : procurementRole === 'controle_gestion'
                  ? 'Validez le chiffrage SA : après votre NIP, le dossier part au DAF. La file du jour est ci-dessous ; l’enveloppe se gèle dans Suivi chantier.'
                : 'Circuit EB : DT soumet au SA → SA chiffre → CdG → DAF / PDG selon montant → BC → livraison.'}
        {' '}Profil actif : <strong>{roleLabel}</strong>.
      </p>

      {/* Dashboard SA (maquette sa-dashboard) — uniquement pour le Service achats. */}
      {procurementRole === 'purchasing' && !saActor.supervisorId && requests.some((r) => r.saReviewerId === saActor.id && (r.status === 'sa_head_review' || r.status === 'bc_head_review')) && (
        <div style={{ ...css.card, marginBottom: 16 }} data-testid="mgr-sa-head-queue">
          <h3>Préparations de l’équipe à valider</h3>
          {requests.filter((r) => r.saReviewerId === saActor.id && (r.status === 'sa_head_review' || r.status === 'bc_head_review')).map((r) => (
            <button key={r.id} type="button" style={{ ...css.btnOutline, margin: 4 }} onClick={() => { setView('requests'); setSelectedDraftId(null); setSelectedRequestId(r.id); scrollToChiffrageZone() }}>
              {r.reference} — {r.status === 'sa_head_review' ? 'Valider le chiffrage' : 'Signer les BC'}
            </button>
          ))}
        </div>
      )}
      {procurementRole === 'purchasing' && (
        <SaOverview
          requests={requests}
          currentManagerId={saActor.id}
          onOpenRequest={(id) => {
            setView('requests')
            setSelectedRequestId(id)
            scrollToChiffrageZone()
          }}
        />
      )}

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
          <StatCard label={procurementRole === 'site_manager' ? 'Mes brouillons' : 'Brouillons à réviser'} value={drafts.length} testId="mgr-achats-stat-drafts" />
          <StatCard
            label="Demandes actives"
            value={requests.filter((r) => !['delivered', 'rejected'].includes(r.status)).length}
            testId="mgr-achats-stat-active"
          />
        </div>
      )}

      <div style={{ display: 'flex', gap: 4, marginBottom: '1.25rem', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
        {(procurementRole === 'technical_director' || procurementRole === 'site_manager' || procurementRole === 'purchasing') && (
        <button
          type="button"
          data-testid="mgr-achats-inbox"
          onClick={() => { setView('inbox'); setSelectedRequestId(null) }}
          style={view === 'inbox' ? css.tabActive : css.tab}
        >
          {procurementRole === 'site_manager' || procurementRole === 'purchasing' ? 'Mes brouillons' : 'Boîte EB'}{drafts.length > 0 ? ` (${drafts.length})` : ''}
        </button>
        )}
        <button
          type="button"
          data-testid="mgr-achats-requests"
          onClick={() => { setView('requests'); setSelectedDraftId(null) }}
          style={view === 'requests' ? css.tabActive : css.tab}
        >
          {procurementRole === 'site_manager' ? 'Mes EB en validation' : 'Demandes d\'achat'}
        </button>
      </div>

      {/* Résolveur d'identifiants : n'importe quelle pièce → sa chaîne (I97). */}
      <div
        style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap' }}
        data-testid="mgr-chain-lookup"
      >
        <input
          type="text"
          value={chainRef}
          onChange={(e) => setChainRef(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void handleChainLookup()
          }}
          placeholder="Retrouver une pièce : EB-2026-0007, BT-…, BC-…, RCT-…"
          aria-label="Retrouver une pièce par identifiant"
          data-testid="mgr-chain-lookup-input"
          style={{
            minWidth: 300,
            padding: '9px 12px',
            border: '1px solid var(--border)',
            borderRadius: 10,
            fontSize: 13,
            background: 'var(--bg-elevated)',
            color: 'var(--text)',
            outline: 'none',
          }}
        />
        <button
          type="button"
          className="btn"
          style={{ padding: '9px 14px', fontSize: 13 }}
          data-testid="mgr-chain-lookup-submit"
          disabled={chainLookupLoading || !chainRef.trim()}
          onClick={() => void handleChainLookup()}
        >
          {chainLookupLoading ? 'Recherche…' : 'Retrouver'}
        </button>
        {chainLookupError ? (
          <span style={{ ...css.meta, color: '#b91c1c' }} data-testid="mgr-chain-lookup-error">
            {chainLookupError}
          </span>
        ) : null}
      </div>

      {error && <AlertBox>{error}</AlertBox>}
      {(showDraftReview || showRequestDetail) && (
        <div style={{ ...css.card, marginBottom: 16 }} data-testid="mgr-eb-edit-lock" role="status">
          <strong>{editLock.ownedByMe ? 'Vous prenez en charge cette demande.' : editLock.ownerName ? `Demande prise en charge par ${editLock.ownerName} — lecture seule.` : 'Demande en lecture seule.'}</strong>
          <div style={{ ...css.actionRow, marginTop: 8 }}>
            {editLock.ownedByMe ? (
              <button type="button" style={css.btnOutline} disabled={editLock.busy || actionLoading} onClick={() => void editLock.release()} data-testid="mgr-eb-release-lock">Libérer la demande</button>
            ) : editLock.canClaim && !editLock.ownerName ? (
              <button type="button" style={css.btnGold} disabled={editLock.busy} onClick={() => void editLock.acquire()} data-testid="mgr-eb-acquire-lock">{editLock.busy ? 'Prise en charge…' : 'Prendre en charge'}</button>
            ) : null}
            <button type="button" style={css.btnGhost} disabled={actionLoading} onClick={() => { setSelectedDraftId(null); setSelectedRequestId(null) }}>Fermer la fiche</button>
          </div>
          <p style={css.meta}>Une seule personne peut modifier la demande à la fois. Le verrou expire après deux minutes sans renouvellement et se libère à la fermeture de la fiche.</p>
          {editLock.error && <p style={{ ...css.meta, color: '#b45309' }}>{editLock.error}</p>}
        </div>
      )}

      {showDraftReview ? (
        <DraftReviewPanel
          key={draftDetail.draft.id}
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
          canEdit={canEditDraft(procurementRole) && editLock.ownedByMe}
          actionLoading={actionLoading}
          onBack={() => setSelectedDraftId(null)}
          onLineChange={updateLine}
          onAddLine={(kind) => setEditLines((prev) => [...prev, emptyLine(kind)])}
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
          readOnly={!editLock.ownedByMe}
          currentManagerId={saActor.id}
          saSupervisorId={saActor.supervisorId}
          onApproveSaBc={() => void handleApproveSaBc()}
          procurementRole={procurementRole}
          highlight={chainLookup}
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
          onUploadAttachmentBulk={(lineIds, file) => void handleBulkUploadLineAttachments(lineIds, file)}
          onRemoveAttachment={(lineId) => void handleRemoveLineAttachment(lineId)}
          managerName={managerName ?? ''}
          onReviseQuantities={openReviseModal}
          reviseModalOpen={reviseModalOpen}
          reviseQuantities={reviseQuantities}
          reviseComment={reviseComment}
          revisePin={revisePin}
          onRevisePinChange={setRevisePin}
          onReviseQuantityChange={(lineId, value) =>
            setReviseQuantities((prev) => ({ ...prev, [lineId]: value }))
          }
          onReviseCommentChange={setReviseComment}
          onReviseModalClose={() => setReviseModalOpen(false)}
          onReviseConfirm={() => void handleReviseQuantities()}
        />
      ) : (
        <>
          {canPaste && view === 'inbox' && (
            <div data-testid="mgr-achats-paste" style={{ ...css.card, marginBottom: '1rem' }}>
              {procurementRole === 'purchasing' && (
                <p style={css.meta}>Créez une EB, renseignez les prix, fournisseurs et modes de paiement, puis ajoutez les factures avant de soumettre au Contrôle de gestion. Ces EB ne nécessitent pas de validation du DT.</p>
              )}
              {procurementRole === 'site_manager' && (
                <>
                  <p style={css.meta}>Vous pouvez créer une EB uniquement pour un chantier qui vous est affecté.</p>
                  <Field label="Chantier">
                    <select value={createSiteId} onChange={(e) => setCreateSiteId(e.target.value)} style={css.input} data-testid="mgr-achats-create-site">
                      <option value="">Choisir un chantier…</option>
                      {requesterSites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}
                    </select>
                  </Field>
                  {requesterSites.length === 0 && (
                    <p style={{ ...css.meta, color: '#b45309' }}>Aucun chantier ne vous est affecté. Demandez au DT de vous affecter à un chantier avant de créer une EB.</p>
                  )}
                </>
              )}
              <h3 style={{ ...css.sectionTitle, fontSize: 15, marginBottom: 8 }}>Coller un message WhatsApp</h3>
              <p style={css.meta}>
                Copiez le besoin depuis le groupe (plusieurs produits possibles, ex. 50 sacs ciment, 20 barres fer).
              </p>
              <textarea
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                placeholder="Collez ici le message WhatsApp…"
                rows={4}
                style={{ ...css.input, width: '100%', marginTop: 8, resize: 'vertical', fontFamily: 'inherit' }}
                data-testid="mgr-achats-paste-text"
              />
              <button
                type="button"
                onClick={() => void handlePasteWhatsapp()}
                disabled={pasteLoading || blankLoading || !pasteText.trim()}
                style={{ ...css.btnGold, marginTop: 10 }}
                data-testid="mgr-achats-paste-submit"
              >
                {pasteLoading ? 'Analyse…' : 'Créer le brouillon'}
              </button>
              <button
                type="button"
                onClick={() => void handleBlankFiche()}
                disabled={pasteLoading || blankLoading}
                style={{ ...css.btnOutline, marginTop: 10, marginLeft: 8 }}
                data-testid="mgr-achats-blank-fiche"
              >
                {blankLoading ? 'Création…' : 'Générer une fiche EB vierge'}
              </button>
            </div>
          )}
          {loading && <LoadingHint />}
          {/* Réactivité : pendant l'ouverture d'un détail, la liste reste visible
              et interactive — seul un hint local s'affiche. */}
          {!loading && selectedDraftId && !draftDetail && (
            <LoadingHint>Ouverture de l&apos;EB…</LoadingHint>
          )}
          {!loading && selectedRequestId && !requestDetail && (
            <LoadingHint>Ouverture de la demande…</LoadingHint>
          )}
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
          {!loading && view === 'requests' && filteredRequests.length === 0 && (
            <EmptyHint>
              {searchQuery || activeFilter !== 'all'
                ? 'Aucune demande ne correspond à votre recherche.'
                : cdgFocus === 'validate'
                  ? 'Aucune EB en validation CdG.'
                  : cdgFocus === 'pipeline'
                    ? 'Aucune EB en cours avant BC.'
                    : 'Aucune demande d\'achat pour le moment.'}
            </EmptyHint>
          )}
          {!loading && view === 'requests' && requests.length > 0 && (
            <>
              {/* ---- Cartes KPI ---- */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 16 }}>
                <StatCard label="En attente" value={requests.filter((r) => PRE_BC_STATUSES.has(r.status)).length} tone="warn" />
                <StatCard label="BC émis" value={requests.filter((r) => r.status === 'po_ready').length} tone="info" />
                <StatCard label="Livraison planifiée" value={requests.filter((r) => r.status === 'delivery_scheduled').length} tone="brand" />
              </div>
            </>
          )}
          {!loading && view === 'requests' && requests.length > 0 && (
            <>
              {/* ---- Barre d'outils : recherche + filtres ---- */}
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 220, position: 'relative' }}>
                  <input
                    type="search"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Recherche par référence, chantier…"
                    style={{
                      width: '100%',
                      padding: '10px 14px 10px 38px',
                      border: '1px solid var(--border)',
                      borderRadius: 10,
                      fontSize: 13,
                      background: 'var(--bg-elevated)',
                      color: 'var(--text)',
                      outline: 'none',
                      transition: 'border-color .15s',
                    }}
                    onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--action)')}
                    onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
                  />
                  <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-faint)', pointerEvents: 'none' }}>🔍</span>
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {(['all', 'pre_bc', 'po_ready', 'delivery_scheduled'] as const).map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setActiveFilter(f)}
                      style={{
                        padding: '7px 14px',
                        borderRadius: 20,
                        border: '1px solid',
                        borderColor: activeFilter === f ? 'var(--action)' : 'var(--border)',
                        background: activeFilter === f ? 'var(--action)' : 'var(--bg-elevated)',
                        color: activeFilter === f ? '#fff' : 'var(--text)',
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: 'pointer',
                        transition: 'all .15s',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {f === 'all' ? 'Toutes' : f === 'pre_bc' ? 'En attente' : f === 'po_ready' ? 'BC émis' : 'Livraison planifiée'}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
          {!loading && view === 'inbox' && drafts.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {drafts.map((d) => (
                <div
                  key={d.id}
                  style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}
                >
                  <button
                    type="button"
                    data-testid="btp-draft-row"
                    onClick={() => setSelectedDraftId(d.id)}
                    style={{ ...css.cardClickable, textAlign: 'left', flex: 1, minWidth: 0 }}
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
                  {procurementRole === 'technical_director' && (
                    <button
                      type="button"
                      data-testid="btp-draft-delete"
                      aria-label={`Supprimer le brouillon ${d.id}`}
                      title="Supprimer le brouillon"
                      disabled={actionLoading}
                      onClick={(ev) => {
                        ev.stopPropagation()
                        void handleDeleteDraft(d.id)
                      }}
                      style={{
                        alignSelf: 'center',
                        border: '1px solid var(--border, #e5e7eb)',
                        background: 'var(--bg, #fff)',
                        borderRadius: 8,
                        padding: '6px 10px',
                        color: '#b91c1c',
                        fontSize: 13,
                        cursor: 'pointer',
                      }}
                    >
                      Supprimer
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
          {!loading && view === 'requests' && filteredRequests.length > 0 && (
            <div style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', boxShadow: 'var(--shadow-sm)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: 'var(--bg)' }}>
                    <th style={thStyle}>Référence</th>
                    <th style={thStyle}>Chantier</th>
                    <th style={thStyle}>Statut</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Montant</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRequests.map((r, idx) => (
                    <tr
                      key={r.id}
                      data-testid={`mgr-achats-request-${r.id}`}
                      onClick={() => { setSelectedRequestId(r.id); setChainLookup(null) }}
                      style={{
                        cursor: 'pointer',
                        background: idx % 2 === 0 ? 'var(--bg-elevated)' : '#faf9f7',
                        transition: 'background .15s',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--brand-light)')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = idx % 2 === 0 ? 'var(--bg-elevated)' : '#faf9f7')}
                    >
                      <td style={tdStyle}>
                        <span style={{ fontWeight: 700 }}>{r.reference}</span>
                        {versionBadge(r.version) && (
                          <span
                            style={{ marginLeft: 6, fontSize: 11, fontWeight: 700, color: '#b91c1c' }}
                            data-testid={`mgr-achats-ref-version-${r.id}`}
                          >
                            {versionBadge(r.version)}
                          </span>
                        )}
                      </td>
                      <td style={tdStyle}>
                        <span style={{ color: 'var(--text)' }}>{r.siteName ?? 'Chantier'}</span>
                      </td>
                      <td style={tdStyle}>
                        <ProcurementStatusBadge status={r.status} />
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600 }}>
                        {formatFcfa(r.totalAmountFcfa)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ padding: '10px 12px', background: 'var(--bg)', borderTop: '1px solid var(--border)', fontSize: 12, color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>{filteredRequests.length} demande{filteredRequests.length > 1 ? 's' : ''} affichée{filteredRequests.length > 1 ? 's' : ''}</span>
                <span>{visibleRequests.length} au total</span>
              </div>
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

export function DraftReviewPanel({
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
  onAddLine: (kind?: 'material' | 'labor') => void
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
  const [selectedDraftLines, setSelectedDraftLines] = useState<number[]>([])
  const [draftBulkSupplier, setDraftBulkSupplier] = useState('')
  const [draftBulkPayment, setDraftBulkPayment] = useState('')
  const draftSelected = editLines.map((line, index) => ({ line, index }))
    .filter(({ index }) => selectedDraftLines.includes(index))
  const applyDraftSupplier = () => {
    if (!draftBulkSupplier) return
    for (const { index } of draftSelected) onLineChange(index, { supplierName: draftBulkSupplier })
  }
  const applyDraftPayment = () => {
    if (!draftBulkPayment) return
    for (const { line, index } of draftSelected) {
      onLineChange(index, { paymentMode: isLaborLine(line.spendCategory) ? 'COMPTANT' : draftBulkPayment })
    }
  }
  const editorRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const editor = editorRef.current
      if (!editor) return
      editor.scrollIntoView({ behavior: 'smooth', block: 'start' })
      editor.querySelector<HTMLSelectElement>('[data-testid="mgr-achats-draft-site"]')
        ?.focus({ preventScroll: true })
    })
    return () => cancelAnimationFrame(frame)
  }, [draft.id])
  const isBlankFiche = parseHints?.source === 'blank_fiche'

  // Catalogue produits pour la liste déroulante de désignation.
  // Charge une fois au montage — suggestions seulement, la saisie libre reste possible.
  const [designations, setDesignations] = useState<string[]>([])
  useEffect(() => {
    let cancelled = false
    authFetch('/dashboard/products')
      .then(async (res) => {
        if (!res.ok) return
        const data = (await res.json()) as {
          products?: Array<{ label: string; active?: boolean }>
        }
        if (cancelled) return
        setDesignations(
          (data.products ?? [])
            .filter((p) => p.active !== false)
            .map((p) => p.label)
            .filter(Boolean),
        )
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [managerName, procurementRole])

  const showParseHints = Boolean(
    !isBlankFiche &&
      parseHints &&
      ((parseHints.destination && parseHints.destination !== 'À préciser') ||
        (parseHints.neededBy && parseHints.neededBy !== 'À préciser') ||
        (parseHints.missingInfo && parseHints.missingInfo.length > 0) ||
        (parseHints.dtActions && parseHints.dtActions.length > 0)),
  )

  // ── Option D — sections séparées (maquette eb2) ────────────────────────────
  // Deux tables distinctes, chacune avec ses propres en-têtes de colonnes
  // (« Fournisseur / Mode de paiement » vs « Bénéficiaire / Paiement ») et sa
  // nature filtrée sur la famille : un salaire ne peut plus démarrer « autres
  // matériaux » ni être édité depuis une nature hors main d'œuvre.
  const lineEntries = editLines.map((line, index) => ({ line, index }))
  const materialEntries = lineEntries.filter(({ line }) => !isLaborLine(line.spendCategory))
  const laborEntries = lineEntries.filter(({ line }) => isLaborLine(line.spendCategory))

  // EB homogène obligatoire (I111) : soit 100 % matériaux (circuit SA), soit
  // 100 % hors SA (main d'œuvre / engins / frais → CdG direct). Une EB mixte
  // est refusée à la soumission — le DT crée des EB distinctes par famille.
  const lineFamilies = new Set(
    editLines
      .filter((l) => l.label.trim() && l.quantity > 0)
      .map((l) => chargeNatureFamily(normalizeEbSpendCategory(l.spendCategory)) ?? 'materiaux'),
  )
  const mixedEb = lineFamilies.has('materiaux') && lineFamilies.size > 1

  const sectionTotal = (list: Array<{ line: ParsedEbLine }>): number | null => {
    if (list.length === 0) return null
    const amounts = list.map(({ line }) =>
      line.amount ?? (line.unitPrice != null ? line.unitPrice * Number(line.quantity || 0) : null),
    )
    return amounts.every((v): v is number => v != null) ? amounts.reduce((s, v) => s + v, 0) : null
  }

  const renderSectionHead = (title: string, count: number, total: number | null, labor: boolean) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '16px 0 8px' }}>
      <h3 style={{ margin: 0, fontSize: 15, color: 'var(--text)' }}>{title}</h3>
      <span
        style={{
          background: '#eef2ee',
          color: 'var(--brand)',
          border: '1px solid #cfe0d4',
          borderRadius: 20,
          padding: '2px 10px',
          fontSize: 11,
          fontWeight: 700,
        }}
      >
        {count === 1 ? '1 ligne' : `${count} lignes`}
      </span>
      {labor && (
        <span
          style={{
            background: '#f0f7f1',
            color: 'var(--brand)',
            border: '1px solid #cfe0d4',
            borderRadius: 20,
            padding: '5px 12px',
            fontSize: 12,
            fontWeight: 700,
            whiteSpace: 'nowrap',
          }}
        >
          🔒 Comptant
        </span>
      )}
      {total != null && (
        <span style={{ marginLeft: 'auto', color: 'var(--brand)', fontWeight: 800, fontSize: 13 }}>
          {total.toLocaleString('fr-FR').replace(/\u202F/g, ' ')} F
        </span>
      )}
    </div>
  )

  

  const renderLineRow = (line: ParsedEbLine, i: number, labor: boolean) => (
    <tr key={i} style={labor ? { background: '#faf6ec' } : undefined}>
      {procurementRole === 'purchasing' && canEdit && (
        <td style={css.lineTd}>
          <input
            type="checkbox"
            checked={selectedDraftLines.includes(i)}
            onChange={() => setSelectedDraftLines((current) => current.includes(i) ? current.filter((index) => index !== i) : [...current, i])}
            aria-label={`Sélectionner la ligne ${i + 1}`}
            data-testid={`mgr-achats-draft-line-select-${i}`}
          />
        </td>
      )}
      <td style={labor ? { ...css.lineTd, borderLeft: '3px solid var(--action)' } : css.lineTd}>{i + 1}</td>
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
          style={css.input}
          data-testid={`mgr-achats-line-label-${i}`}
          list="eb-designations"
          autoComplete="off"
        />
      </td>
      <td style={css.lineTd}>
        <select
          value={normalizeEbSpendCategory(line.spendCategory)}
          disabled={!canEdit}
          onChange={(e) => {
            const nature = e.target.value
            // Concept : la main d'œuvre se paie toujours comptant —
            // bascule automatique dès que la nature appartient à cette famille.
            const family = chargeNatureFamily(nature)
            onLineChange(i, {
              spendCategory: nature,
              ...(family === 'main_oeuvre' ? { paymentMode: 'COMPTANT' } : {}),
            })
          }}
          style={css.input}
          data-testid={`mgr-achats-line-category-${i}`}
          aria-label="Nature de charge"
        >
          {labor ? (
            // Section main d'œuvre : seules les natures de la famille sont proposées.
            chargeNaturesByFamily('main_oeuvre').map((n) => (
              <option key={n.value} value={n.value}>{n.label}</option>
            ))
          ) : (
            // Sections matériaux/engins/frais : les natures hors SA restent groupées.
            CHARGE_FAMILIES.filter((f) => f.value !== 'main_oeuvre').map((f) => (
              <optgroup key={f.value} label={f.label}>
                {chargeNaturesByFamily(f.value).map((n) => (
                  <option key={n.value} value={n.value}>{n.label}</option>
                ))}
              </optgroup>
            ))
          )}
        </select>
      </td>
      <td style={css.lineTd}>
        <input
          value={line.unit}
          disabled={!canEdit}
          onChange={(e) => onLineChange(i, { unit: e.target.value })}
          style={{ ...css.input, width: 90 }}
        />
      </td>
      <td style={css.lineTd}>
        <input
          type="number"
          min={0}
          step="any"
          value={line.quantity}
          disabled={!canEdit}
          onChange={(e) => {
            const quantity = Number.parseFloat(e.target.value) || 0
            onLineChange(i, {
              quantity,
              // Le montant suit la quantité quand un PU est déjà saisi.
              ...(line.unitPrice != null ? { amount: Math.round(Math.max(0, line.unitPrice) * quantity) } : {}),
            })
          }}
          style={{ ...css.input, width: 80 }}
          data-testid={`mgr-achats-line-qty-${i}`}
        />
      </td>
      <td style={css.lineTd}>
        <input
          type="number"
          min={0}
          step="1"
          value={line.unitPrice ?? ''}
          disabled={!canEdit}
          onChange={(e) => {
            // Saisie DT : le PU entraîne le montant (PU × quantité).
            const unitPrice = Number.parseFloat(e.target.value)
            if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
              onLineChange(i, { unitPrice: undefined, amount: undefined })
              return
            }
            onLineChange(i, {
              unitPrice,
              amount: Math.round(unitPrice * (Number(line.quantity) || 0)),
            })
          }}
          style={{ ...css.input, width: 110 }}
          data-testid={`mgr-achats-line-unit-price-${i}`}
        />
      </td>
      <td style={css.lineTd}>
        <input
          type="number"
          min={0}
          step="1"
          value={line.amount ?? ''}
          disabled={!canEdit}
          onChange={(e) => {
            // Saisie directe du montant → PU recalculé (double entrée).
            const amount = Number.parseFloat(e.target.value)
            const qty = Number(line.quantity) || 0
            if (!Number.isFinite(amount) || amount <= 0 || qty <= 0) {
              onLineChange(i, { amount: undefined })
              return
            }
            onLineChange(i, {
              amount: Math.round(amount),
              unitPrice: Math.round((amount / qty) * 100) / 100,
            })
          }}
          style={{ ...css.input, width: 120 }}
          data-testid={`mgr-achats-draft-line-amount-${i}`}
        />
      </td>
      <td style={css.lineTd}>
        {labor ? (
          <input
            value={line.supplierName ?? ''}
            disabled={!canEdit}
            onChange={(e) => onLineChange(i, { supplierName: e.target.value })}
            style={css.input}
            placeholder="Nom du bénéficiaire"
            data-testid={`mgr-achats-line-supplier-${i}`}
            aria-label="Bénéficiaire"
            list="eb-beneficiaries"
            autoComplete="off"
          />
        ) : (
          <SupplierSelect
            value={line.supplierName ?? ''}
            suppliers={detail.suppliers ?? []}
            disabled={!canEdit}
            testId={`mgr-achats-line-supplier-${i}`}
            onChange={(name) => onLineChange(i, { supplierName: name })}
          />
        )}
      </td>
      {procurementRole === 'purchasing' && (
        <td style={css.lineTd}>
          <select
            value={labor ? 'COMPTANT' : line.paymentMode ?? ''}
            disabled={!canEdit || labor}
            onChange={(e) => onLineChange(i, { paymentMode: e.target.value })}
            style={css.input}
            aria-label="Mode de paiement"
            data-testid={`mgr-achats-draft-line-payment-${i}`}
          >
            <option value="">À préciser</option>
            {PAYMENT_MODES.map((mode) => <option key={mode} value={mode}>{PAYMENT_MODE_LABELS[mode]}</option>)}
          </select>
        </td>
      )}
      {canEdit && (
        <td style={css.lineTd}>
          <button type="button" onClick={() => { setSelectedDraftLines([]); onRemoveLine(i) }} style={css.btnDanger}>×</button>
        </td>
      )}
    </tr>
  )

  return (
    <div ref={editorRef} data-testid="mgr-achats-draft-review" style={{ ...css.section, scrollMarginTop: 24 }}>
      <button type="button" onClick={onBack} style={{ ...css.btnGhost, marginBottom: '1rem' }}>
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
                  style={css.input}
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
                  style={css.input}
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
                  style={css.input}
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
                  style={css.input}
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
                  style={css.input}
                  data-testid="mgr-achats-draft-needed-by"
                />
              </td>
            </tr>
          </tbody>
        </table>

        {procurementRole === 'purchasing' && canEdit && (
          <div data-testid="mgr-achats-draft-bulk-commercial" style={{ ...css.card, margin: '1rem 0', display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: 12 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="checkbox"
                checked={editLines.length > 0 && draftSelected.length === editLines.length}
                onChange={() => setSelectedDraftLines(draftSelected.length === editLines.length ? [] : editLines.map((_, index) => index))}
                data-testid="mgr-achats-draft-select-all"
              />
              Tout sélectionner
            </label>
            <label>
              Fournisseur
              <SupplierSelect
                value={draftBulkSupplier}
                suppliers={detail.suppliers ?? []}
                onChange={setDraftBulkSupplier}
                testId="mgr-achats-draft-bulk-supplier-select"
                placeholder="Choisir…"
              />
            </label>
            <button type="button" style={css.btnOutline} disabled={!draftBulkSupplier || draftSelected.length === 0 || actionLoading} onClick={applyDraftSupplier} data-testid="mgr-achats-draft-bulk-supplier-assign">
              Affecter le fournisseur ({draftSelected.length})
            </button>
            <label>
              Mode de paiement
              <select value={draftBulkPayment} onChange={(e) => setDraftBulkPayment(e.target.value)} style={css.input} data-testid="mgr-achats-draft-bulk-payment-select">
                <option value="">Choisir…</option>
                {PAYMENT_MODES.map((mode) => <option key={mode} value={mode}>{PAYMENT_MODE_LABELS[mode]}</option>)}
              </select>
            </label>
            <button type="button" style={css.btnOutline} disabled={!draftBulkPayment || draftSelected.length === 0 || actionLoading} onClick={applyDraftPayment} data-testid="mgr-achats-draft-bulk-payment-assign">
              Affecter le paiement ({draftSelected.length})
            </button>
            <p style={{ ...css.meta, flexBasis: '100%', margin: 0 }}>Cochez les lignes d’un même groupe, puis affectez le fournisseur et le paiement. La sélection est conservée entre les deux actions. Enregistrez ensuite le brouillon. La main d’œuvre reste payable comptant.</p>
          </div>
        )}
        {mixedEb && (
          <div
            data-testid="mgr-achats-mixed-eb-warning"
            style={{
              background: '#fff7ed',
              border: '1px solid #fdba74',
              color: '#9a3412',
              borderRadius: 8,
              padding: '8px 14px',
              fontSize: 12,
              fontWeight: 700,
              margin: '8px 0',
            }}
          >
            EB mixte interdite : matériaux d’un côté, main d’œuvre / engins / frais de l’autre —
            créez deux EB distinctes (la main d’œuvre part directement au CdG).
          </div>
        )}
        {canEditDraft(procurementRole) && (
          <div style={{ margin: '12px 0' }}>
            <div style={css.actionRow}>
              <button type="button" disabled={!canEdit || actionLoading} onClick={() => onAddLine('material')} style={css.btnOutline} data-testid="mgr-achats-draft-add-material">
                + Ligne matériau
              </button>
              <button type="button" disabled={!canEdit || actionLoading} onClick={() => onAddLine('labor')} style={css.btnOutline} data-testid="mgr-achats-draft-add-labor">
                + Ligne main d’œuvre
              </button>
            </div>
            {!canEdit && <p style={css.meta}>Pour ajouter des lignes, cliquez sur « Prendre en charge » en haut de la fiche. Si une autre personne a pris en charge le brouillon, attendez qu’elle le libère.</p>}
          </div>
        )}
        {materialEntries.length > 0 && (
          <>
            {renderSectionHead('🧱 Matériaux & fournitures', materialEntries.length, sectionTotal(materialEntries), false)}
            <div style={{ overflowX: 'auto' }}>
              <table style={lineTableFixed}>
                <thead>
                  <tr>
                    {procurementRole === 'purchasing' && canEdit && <th style={lineColWidth(48)}>Choix</th>}
                    <th style={lineColWidth(56)}>Réf</th>
                    <th style={lineColWidth(240)}>Désignations</th>
                    <th style={lineColWidth(190)}>Catégorie</th>
                    <th style={lineColWidth(80)}>Unité</th>
                    <th style={lineColWidth(80)}>Quantité</th>
                    <th style={lineColWidth(110)}>PU</th>
                    <th style={lineColWidth(120)}>Montant</th>
                    <th style={lineColWidth(210)}>Fournisseur</th>
                    {procurementRole === 'purchasing' && <th style={lineColWidth(150)}>Paiement</th>}
                    {canEdit && <th style={lineColWidth(40)} />}
                  </tr>
                </thead>
                <tbody>
                  {materialEntries.map(({ line, index: i }) => renderLineRow(line, i, false))}
                </tbody>
              </table>
            </div>
          </>
        )}


        {laborEntries.length > 0 && (
          <>
            {renderSectionHead('👷 Main d’œuvre', laborEntries.length, sectionTotal(laborEntries), true)}
            <div style={{ overflowX: 'auto' }}>
              <table style={lineTableFixed}>
                <thead>
                  <tr>
                    {procurementRole === 'purchasing' && canEdit && <th style={lineColWidth(48)}>Choix</th>}
                    <th style={lineColWidth(56)}>Réf</th>
                    <th style={lineColWidth(240)}>Désignations</th>
                    <th style={lineColWidth(190)}>Catégorie</th>
                    <th style={lineColWidth(80)}>Unité</th>
                    <th style={lineColWidth(80)}>Quantité</th>
                    <th style={lineColWidth(110)}>PU</th>
                    <th style={lineColWidth(120)}>Montant</th>
                    <th style={lineColWidth(210)}>Bénéficiaire</th>
                    {procurementRole === 'purchasing' && <th style={lineColWidth(150)}>Paiement</th>}
                    {canEdit && <th style={lineColWidth(40)} />}
                  </tr>
                </thead>
                <tbody>
                  {laborEntries.map(({ line, index: i }) => renderLineRow(line, i, true))}
                </tbody>
              </table>
            </div>
          </>
        )}







        <datalist id="eb-designations">
          {designations.map((label) => (
            <option key={label} value={label} />
          ))}
        </datalist>
        <datalist id="eb-beneficiaries">
          {Array.from(
            new Set([
              ...editLines
                .map((l) => (l.supplierName ?? '').trim())
                .filter(Boolean),
              ...(detail.suppliers ?? []).map((s) => s.name),
            ]),
          ).map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '8px 8px 0' }}>
          💡 Lignes main d’œuvre fondées + filet orange : impossibles à confondre avec un matériau.
          Le paiement est un badge ; le bénéficiaire propose les noms déjà utilisés (anti-doublons).
        </p>

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
                style={{ ...css.input, width: 100 }}
                data-testid="mgr-achats-sign-pin"
              />
            </label>
          )}
          <button
            type="button"
            data-testid="mgr-achats-draft-validate"
            onClick={onValidate}
            disabled={actionLoading}
            style={{ ...css.btnGhost, ...(actionLoading ? { opacity: 0.6, cursor: 'wait' } : {}) }}
          >
            {actionLoading ? 'Enregistrement…' : 'Enregistrer le brouillon'}
          </button>
          <button
            type="button"
            data-testid="btp-draft-submit"
            onClick={onSubmit}
            disabled={actionLoading || mixedEb}
            style={{ ...css.btnGold, ...(actionLoading ? { opacity: 0.6, cursor: 'wait' } : {}) }}
          >
            {actionLoading ? 'Transmission…' : procurementRole === 'site_manager' ? 'Soumettre au DT' : procurementRole === 'purchasing' ? 'Continuer vers validation' : 'Valider'}
          </button>
        </div>
      )}
      {canEdit && (
        <p style={{ ...css.meta, marginTop: 8 }} data-testid="mgr-achats-draft-actions-hint">
          {procurementRole === 'site_manager'
            ? 'Enregistrer le brouillon sauvegarde vos modifications. La soumission transmet l’EB au DT pour approbation.'
            : procurementRole === 'purchasing'
            ? 'Créez l’EB pour ajouter les factures et finaliser le chiffrage, puis soumettez-la au Contrôle de gestion.'
            : 'Enregistrer le brouillon sauvegarde sans signer. Valider vérifie le NIP et transmet l’EB au Service achats.'}
        </p>
      )}
    </div>
  )
}

export function RequestDetailPanel({
  readOnly = false,
  currentManagerId,
  saSupervisorId,
  onApproveSaBc,
  detail,
  procurementRole,
  highlight,
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
  onUploadAttachmentBulk,
  onRemoveAttachment,
  managerName,
  onReviseQuantities,
  reviseModalOpen,
  reviseQuantities,
  reviseComment,
  revisePin,
  onReviseQuantityChange,
  onReviseCommentChange,
  onRevisePinChange,
  onReviseModalClose,
  onReviseConfirm,
}: {
  readOnly?: boolean
  currentManagerId?: string
  saSupervisorId?: string | null
  onApproveSaBc?: () => void
  detail: RequestDetailResponse
  procurementRole: ProcurementRole | null
  /** Pièce retrouvée par le résolveur d'identifiants : son maillon est surligné. */
  highlight: DocumentChainMatch | null
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
    patch: {
      supplierName?: string
      paymentMode?: string
      attachmentBlobKey?: string | null
      attachmentFileName?: string | null
      attachmentContentType?: string | null
    },
  ) => void
  onSavePricing: () => void
  onSubmitFinance: () => void
  onUploadAttachment: (lineId: string, file: File) => void
  onUploadAttachmentBulk: (lineIds: string[], file: File) => void
  onRemoveAttachment: (lineId: string) => void
  managerName: string
  onReviseQuantities: () => void
  reviseModalOpen: boolean
  reviseQuantities: Record<string, string>
  reviseComment: string
  revisePin: string
  onReviseQuantityChange: (lineId: string, value: string) => void
  onReviseCommentChange: (value: string) => void
  onRevisePinChange: (value: string) => void
  onReviseModalClose: () => void
  onReviseConfirm: () => void
}) {
  const { request, lines, approvalSteps, site, supplier, purchaseOrder, purchaseOrders = [], treasuryOrders = [], suppliers = [] } = detail
  const editorRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (procurementRole !== 'purchasing') return
    const frame = requestAnimationFrame(() => {
      const editor = editorRef.current
      if (!editor) return
      editor.scrollIntoView({ behavior: 'smooth', block: 'start' })
      const heading = editor.querySelector<HTMLHeadingElement>('h3')
      if (heading) {
        heading.tabIndex = -1
        heading.focus({ preventScroll: true })
      }
    })
    return () => cancelAnimationFrame(frame)
  }, [request.id, procurementRole])
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
  const showApprove = !readOnly && canApproveRequest(request.status, procurementRole)
  const showReject = !readOnly && canRejectRequest(request.status, procurementRole)
  const showCreatePo = !readOnly && canCreatePo(request.status, procurementRole)
  const allPosCreated =
    ebSuppliers.length > 0 && ebSuppliers.every((s) => orders.some((po) => po.supplierId === s.id))
  const showSchedule = !readOnly && canScheduleDelivery(request.status, procurementRole, orders)
  const showRevise = !readOnly && canReviseRequest(request.status, procurementRole)
  const nextVersion = (request.version ?? 1) + 1
  const pendingOrders = orders.filter((po) => !po.tourId)
  const showTreasury = Boolean(treasuryOrders?.[0]) && hasComptantLines(lines)
  const canPrice = !readOnly && canPriceRequest(request.status, procurementRole)
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

  // Saisie unique du mode de paiement : la valeur choisie dans la barre n'écrit
  // rien tant que l'un des deux boutons n'est pas actionné (pas de sauvegarde serveur,
  // l'enregistrement reste le bouton « Enregistrer les lignes »).
  const [bulkPaymentMode, setBulkPaymentMode] = useState('')
  /** Lignes encore sans mode de paiement (le contrôle SA l'exige sur chaque ligne). */
  const linesWithoutPaymentMode = lines.filter((l) => !(l.paymentMode ?? '').trim())
  const applyPaymentModeToLines = (targets: typeof lines) => {
    for (const l of targets) onLineCommercial(l.id, { paymentMode: isLaborLine(l.spendCategory) ? 'COMPTANT' : bulkPaymentMode })
  }
  /** Complète uniquement les lignes vides : n'écrase aucune saisie existante. */
  const handleBulkPaymentFillEmpty = () => {
    if (!bulkPaymentMode) return
    applyPaymentModeToLines(linesWithoutPaymentMode)
  }
  /**
   * Applique le mode de paiement aux lignes cochées (sélection explicite, comme
   * pour le fournisseur et la facture partagée). La confirmation n'apparaît que
   * si des lignes cochées portent déjà un mode différent.
   */
  const handleBulkPaymentAssignSelected = () => {
    if (!bulkPaymentMode || selectedLines.length === 0) return
    const conflicting = selectedLines.filter(
      (l) => (l.paymentMode ?? '').trim() !== '' && (l.paymentMode ?? '') !== bulkPaymentMode,
    )
    if (conflicting.length > 0) {
      const ok = window.confirm(
        `Remplacer le mode de paiement déjà saisi sur ${conflicting.length} ligne${conflicting.length > 1 ? 's' : ''} ?`,
      )
      if (!ok) return
    }
    applyPaymentModeToLines(selectedLines)
  }

  // Même mécanique que le mode de paiement, mais SANS écrasement global : le
  // fournisseur détermine le découpage en bons de commande (un BC par
  // fournisseur présent sur les lignes, cf. `ebSuppliers` / `allPosCreated`).
  // Réaffecter en masse peut donc fusionner deux achats distincts — l'action
  // passe par une sélection explicite, jamais par un « appliquer à toutes ».
  const [bulkSupplierName, setBulkSupplierName] = useState('')
  const [selectedLineIds, setSelectedLineIds] = useState<string[]>([])
  /** Lignes encore sans fournisseur (le contrôle SA l'exige sur chaque ligne). */
  const linesWithoutSupplier = lines.filter((l) => !(l.supplierName ?? '').trim())
  /** Sélection effective : les identifiants périmés (détail rechargé) sont ignorés. */
  const selectedLines = lines.filter((l) => selectedLineIds.includes(l.id))
  const allLinesSelected = lines.length > 0 && selectedLines.length === lines.length
  const toggleLineSelection = (lineId: string) => {
    setSelectedLineIds((prev) =>
      prev.includes(lineId) ? prev.filter((id) => id !== lineId) : [...prev, lineId],
    )
  }
  const toggleAllLines = () => {
    setSelectedLineIds(allLinesSelected ? [] : lines.map((l) => l.id))
  }
  /** Clés de blob portées par plusieurs lignes : la facture est partagée. */
  const sharedAttachmentKeys = new Set(
    lines
      .map((l) => l.attachmentBlobKey ?? '')
      .filter((k) => k !== '' && lines.filter((l) => l.attachmentBlobKey === k).length > 1),
  )
  /** Complète uniquement les lignes vides : n'écrase aucun fournisseur existant. */
  const handleBulkSupplierFillEmpty = () => {
    if (!bulkSupplierName) return
    for (const l of linesWithoutSupplier) {
      onLineCommercial(l.id, { supplierName: bulkSupplierName })
    }
  }
  /**
   * Affecte le fournisseur choisi aux lignes cochées. La confirmation n'apparaît
   * que si des lignes sélectionnées changent réellement de fournisseur, et le
   * message rappelle la conséquence — un simple décompte de lignes laisserait
   * croire à un changement anodin alors que le nombre de bons de commande peut
   * varier.
   */
  const handleBulkSupplierAssignSelected = () => {
    if (!bulkSupplierName || selectedLines.length === 0) return
    const target = bulkSupplierName.trim().toLowerCase()
    const moved = selectedLines.filter((l) => {
      const current = (l.supplierName ?? '').trim().toLowerCase()
      return current !== '' && current !== target
    })
    const attachedLines = moved.filter((l) => (l.attachmentBlobKey ?? '').trim() !== '')
    if (moved.length > 0) {
      let message =
        `Réaffecter ${moved.length} ligne${moved.length > 1 ? 's' : ''} à un autre fournisseur ?\n\n` +
        'Un bon de commande est émis par fournisseur présent sur les lignes : ce changement peut modifier leur découpage.'
      if (attachedLines.length > 0) {
        message += `\n\n${attachedLines.length} ligne${attachedLines.length > 1 ? 's' : ''} porte${attachedLines.length > 1 ? 'nt' : ''} une pièce jointe : elle sera retirée de ${attachedLines.length > 1 ? 'ces' : 'cette'} ligne${attachedLines.length > 1 ? 's' : ''}.`
      }
      const ok = window.confirm(message)
      if (!ok) return
    }
    for (const l of selectedLines) {
      const detach = attachedLines.some((a) => a.id === l.id)
      onLineCommercial(l.id, {
        supplierName: bulkSupplierName,
        ...(detach
          ? { attachmentBlobKey: null, attachmentFileName: null, attachmentContentType: null }
          : {}),
      })
    }
  }

  /** Avertit avant de réaffecter une ligne qui porte une pièce jointe, puis retire la PJ immédiatement. */
  const handleLineSupplierChange = (line: (typeof lines)[number], name: string) => {
    const oldSupplier = (line.supplierName ?? '').trim()
    const newSupplier = (name ?? '').trim()
    const willDetach =
      oldSupplier !== '' &&
      newSupplier !== '' &&
      oldSupplier !== newSupplier &&
      (line.attachmentBlobKey ?? '').trim() !== ''
    if (willDetach) {
      const ok = window.confirm(
        'Cette ligne porte une pièce jointe. Changer de fournisseur retirera la pièce jointe de cette ligne. Continuer ?',
      )
      if (!ok) return
    }
    onLineCommercial(line.id, {
      supplierName: name,
      ...(willDetach
        ? { attachmentBlobKey: null, attachmentFileName: null, attachmentContentType: null }
        : {}),
    })
  }

  // Facture partagée : une même facture jointe en un seul envoi aux lignes
  // cochées (typiquement toutes les lignes d'un même fournisseur). Remplacer
  // une PJ existante demande confirmation, comme pour le mode de paiement.
  const linesWithoutAttachment = lines.filter((l) => !(l.attachmentFileName ?? '').trim())
  const handleBulkAttachmentPick = (file: File) => {
    if (selectedLines.length === 0) return
    const withAttachment = selectedLines.filter((l) => (l.attachmentFileName ?? '').trim())
    if (withAttachment.length > 0) {
      const ok = window.confirm(
        `Remplacer la pièce jointe déjà présente sur ${withAttachment.length} ligne${withAttachment.length > 1 ? 's' : ''} ?\n\n` +
          'La facture choisie sera partagée par toutes les lignes cochées.',
      )
      if (!ok) return
    }
    onUploadAttachmentBulk(
      selectedLines.map((l) => l.id),
      file,
    )
    setSelectedLineIds([])
  }

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
    <div ref={editorRef} data-testid="mgr-achats-request-detail" style={{ ...css.section, scrollMarginTop: 24 }}>
      <button type="button" onClick={onBack} style={{ ...css.btnGhost, marginBottom: '1rem' }}>
        ← Retour aux demandes
      </button>

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div>
          <h3 style={{ ...css.sectionTitle, fontSize: 16, marginBottom: 4 }}>{request.reference}{versionSuffix(request.version)}</h3>
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
            Montant : <strong>{total.toLocaleString('fr-FR').replace(/\u202F/g, ' ')} XOF</strong>
            {' · '}
            {lines.filter((l) => l.attachmentFileName).length} pièce(s) jointe(s)
          </p>
          <p style={{ fontSize: 13, marginTop: 4 }}>
            {procurementRole === 'controle_gestion'
              ? 'Vérifiez le chiffrage et consultez les pièces jointes, puis approuvez. Le dossier sera transmis au DAF.'
              : 'Vérifiez le chiffrage et consultez les pièces jointes, puis approuvez. Le SA émettra le BC ensuite.'}
          </p>
          {showTreasury && (
            <p
              data-testid="mgr-achats-bt-approve-notice"
              style={{
                fontSize: 12,
                marginTop: 8,
                padding: '6px 10px',
                borderRadius: 8,
                background: '#fef9c3',
                border: '1px solid #fde047',
                color: '#713f12',
              }}
            >
              {procurementRole === 'daf' || procurementRole === 'pdg'
                ? 'Votre approbation (NIP) vaut aussi validation du bon de trésorerie : votre signature sera apposée sur la Demande d’avance de trésorerie.'
                : 'Le bon de trésorerie joint sera également approuvé : le DAF puis le PDG y apposeront leur signature.'}
            </p>
          )}
           {showTreasury &&
             treasuryOrders!.map((b) => (
               <p key={b.id} style={{ fontSize: 13, marginTop: 8 }}>
                 Bon de trésorerie {b.reference}
                 {' · '}
                 <a
                   href={treasuryHtmlUrl(b.id)}
                   target="_blank"
                   rel="noopener noreferrer"
                   data-testid={`mgr-achats-treasury-link-${b.id}`}
                 >
                   Voir la fiche trésorerie
                 </a>
                 {' · '}
                 <button
                   type="button"
                   data-testid={`mgr-achats-treasury-print-${b.id}`}
                   onClick={() => printHtml(treasuryHtmlUrl(b.id))}
                   style={{ ...css.btnGhost, padding: 0, fontWeight: 600 }}
                 >
                   Imprimer
                 </button>
               </p>
             ))
           }
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
        <h4 style={css.ficheTitle}>EXPRESSION DU BESOIN{versionSuffix(request.version)}</h4>
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
        {/* `data-chiffrage-zone` englobe la barre ET le tableau : l'arrivée automatique
            sur la zone de chiffrage (scrollToChiffrageZone) montre donc aussi la saisie
            groupée, et la barre ne défile pas horizontalement avec le tableau. */}
        <div data-chiffrage-zone>
          {canPrice && (
            <div
              data-testid="mgr-achats-bulk-supplier"
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'flex-end',
                gap: 8,
                padding: '10px 12px',
                background: '#f9fafb',
                border: '1px solid #e5e7eb',
                borderBottom: 'none',
              }}
            >
              <label
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                  flex: '1 1 180px',
                  minWidth: 150,
                }}
              >
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '.04em',
                    color: '#6b7280',
                  }}
                >
                  Fournisseur
                </span>
                <SupplierSelect
                  value={bulkSupplierName}
                  suppliers={suppliers}
                  placeholder="Choisir…"
                  testId="mgr-achats-bulk-supplier-select"
                  onChange={setBulkSupplierName}
                />
              </label>
              <button
                type="button"
                data-testid="mgr-achats-bulk-supplier-fill"
                onClick={handleBulkSupplierFillEmpty}
                disabled={!bulkSupplierName || linesWithoutSupplier.length === 0}
                style={{
                  ...css.btnGhost,
                  ...(!bulkSupplierName || linesWithoutSupplier.length === 0
                    ? { opacity: 0.5, cursor: 'not-allowed' }
                    : {}),
                }}
              >
                Compléter les lignes vides
              </button>
              <button
                type="button"
                data-testid="mgr-achats-bulk-supplier-assign"
                onClick={handleBulkSupplierAssignSelected}
                disabled={!bulkSupplierName || selectedLines.length === 0}
                style={{
                  ...css.btnOutline,
                  ...(!bulkSupplierName || selectedLines.length === 0
                    ? { opacity: 0.5, cursor: 'not-allowed' }
                    : {}),
                }}
              >
                Affecter la sélection{selectedLines.length > 0 ? ` (${selectedLines.length})` : ''}
              </button>
              <span
                style={{ ...css.meta, flex: '1 1 100%' }}
                data-testid="mgr-achats-bulk-supplier-count"
              >
                {linesWithoutSupplier.length > 0
                  ? `${linesWithoutSupplier.length} ligne${linesWithoutSupplier.length > 1 ? 's' : ''} sans fournisseur.`
                  : 'Fournisseur renseigné sur toutes les lignes.'}
                {selectedLines.length > 0
                  ? ` ${selectedLines.length} ligne${selectedLines.length > 1 ? 's' : ''} sélectionnée${selectedLines.length > 1 ? 's' : ''}.`
                  : ''}
              </span>
            </div>
          )}
          {canPrice && (
            <div
              data-testid="mgr-achats-bulk-payment"
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'flex-end',
                gap: 8,
                padding: '10px 12px',
                background: '#f9fafb',
                border: '1px solid #e5e7eb',
              }}
            >
              <label
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                  flex: '1 1 180px',
                  minWidth: 150,
                }}
              >
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '.04em',
                    color: '#6b7280',
                  }}
                >
                  Mode de paiement
                </span>
                <select
                  value={bulkPaymentMode}
                  onChange={(e) => setBulkPaymentMode(e.target.value)}
                  style={css.input}
                  data-testid="mgr-achats-bulk-payment-select"
                >
                  <option value="">Choisir…</option>
                  {PAYMENT_MODES.map((m) => (
                    <option key={m} value={m}>{PAYMENT_MODE_LABELS[m]}</option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                data-testid="mgr-achats-bulk-payment-fill"
                onClick={handleBulkPaymentFillEmpty}
                disabled={!bulkPaymentMode || linesWithoutPaymentMode.length === 0}
                style={{
                  ...css.btnGhost,
                  ...(!bulkPaymentMode || linesWithoutPaymentMode.length === 0
                    ? { opacity: 0.5, cursor: 'not-allowed' }
                    : {}),
                }}
              >
                Compléter les lignes vides
              </button>
              <button
                type="button"
                data-testid="mgr-achats-bulk-payment-assign"
                onClick={handleBulkPaymentAssignSelected}
                disabled={!bulkPaymentMode || selectedLines.length === 0}
                style={{
                  ...css.btnOutline,
                  ...(!bulkPaymentMode || selectedLines.length === 0
                    ? { opacity: 0.5, cursor: 'not-allowed' }
                    : {}),
                }}
              >
                Affecter la sélection{selectedLines.length > 0 ? ` (${selectedLines.length})` : ''}
              </button>
              <span
                style={{ ...css.meta, flex: '1 1 100%' }}
                data-testid="mgr-achats-bulk-payment-count"
              >
                {linesWithoutPaymentMode.length > 0
                  ? `${linesWithoutPaymentMode.length} ligne${linesWithoutPaymentMode.length > 1 ? 's' : ''} sans mode de paiement.`
                  : 'Mode de paiement renseigné sur toutes les lignes.'}
                {selectedLines.length > 0
                  ? ` ${selectedLines.length} ligne${selectedLines.length > 1 ? 's' : ''} sélectionnée${selectedLines.length > 1 ? 's' : ''}.`
                  : ''}
              </span>
            </div>
          )}
          {canPrice && (
            <div
              data-testid="mgr-achats-bulk-attachment"
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                gap: 8,
                padding: '10px 12px',
                background: '#f9fafb',
                border: '1px solid #e5e7eb',
              }}
            >
              <label
                data-testid="mgr-achats-bulk-attachment-apply"
                style={{
                  ...css.btnOutline,
                  margin: 0,
                  display: 'inline-flex',
                  alignItems: 'center',
                  cursor: actionLoading || selectedLines.length === 0 ? 'not-allowed' : 'pointer',
                  ...(selectedLines.length === 0 ? { opacity: 0.5 } : {}),
                }}
              >
                Joindre la facture aux lignes cochées
                {selectedLines.length > 0 ? ` (${selectedLines.length})` : ''}
                <input
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg,.webp,.heic,.heif,.xls,.xlsx,application/pdf,image/*"
                  data-testid="mgr-achats-bulk-attachment-input"
                  disabled={actionLoading || selectedLines.length === 0}
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) handleBulkAttachmentPick(file)
                    e.target.value = ''
                  }}
                />
              </label>
              <span
                style={{ ...css.meta, flex: '1 1 100%' }}
                data-testid="mgr-achats-bulk-attachment-count"
              >
                {linesWithoutAttachment.length > 0
                  ? `${linesWithoutAttachment.length} ligne${linesWithoutAttachment.length > 1 ? 's' : ''} sans pièce jointe.`
                  : 'Pièce jointe renseignée sur toutes les lignes.'}
                {' '}
                Un seul envoi : la facture est partagée par les lignes cochées, typiquement toutes celles d'un même fournisseur.
              </span>
            </div>
          )}
          <div style={{ overflowX: 'auto' }}>
            <table style={saTableFixed}>
              <thead>
                <tr>
                  {canPrice && (
                    <th style={lineColWidth(40)}>
                      <input
                        type="checkbox"
                        checked={allLinesSelected}
                        onChange={toggleAllLines}
                        aria-label="Sélectionner toutes les lignes"
                        data-testid="mgr-achats-line-select-all"
                      />
                    </th>
                  )}
                  <th style={lineColWidth(44)}>Réf</th>
                  <th style={lineColWidth(200)}>Désignations</th>
                  <th style={lineColWidth(140)}>Catégorie</th>
                  <th style={lineColWidth(70)}>Unité</th>
                  <th style={lineColWidth(70)}>Quantité</th>
                  <th style={lineColWidth(110)}>PU</th>
                  <th style={lineColWidth(120)}>Montant</th>
                  <th style={lineColWidth(180)}>Fournisseur / Bénéficiaire{canPrice ? ' *' : ''}</th>
                  <th style={lineColWidth(140)}>Mode de paiement{canPrice ? ' *' : ''}</th>
                  <th style={lineColWidth(140)}>Pièce jointe{canPrice ? ' *' : ''}</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => (
                  <tr key={l.id}>
                    {canPrice && (
                      <td style={css.lineTd}>
                        <input
                          type="checkbox"
                          checked={selectedLineIds.includes(l.id)}
                          onChange={() => toggleLineSelection(l.id)}
                          aria-label={`Sélectionner la ligne ${i + 1}`}
                          data-testid={`mgr-achats-line-select-${i}`}
                        />
                      </td>
                    )}
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
                          style={{ ...css.input, width: 110 }}
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
                          style={{ ...css.input, width: 120 }}
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
                        isLaborLine(l.spendCategory) ? (
                          <input
                            value={l.supplierName ?? ''}
                            onChange={(e) => onLineCommercial(l.id, { supplierName: e.target.value })}
                            style={css.input}
                            placeholder="Nom du bénéficiaire"
                            data-testid={`mgr-achats-line-supplier-${i}`}
                            aria-label="Bénéficiaire"
                          />
                        ) : (
                          <SupplierSelect
                            value={l.supplierName ?? ''}
                            suppliers={suppliers}
                            required
                            testId={`mgr-achats-line-supplier-${i}`}
                            onChange={(name) => handleLineSupplierChange(l, name)}
                          />
                        )
                      ) : (
                        l.supplierName ?? '—'
                      )}
                    </td>
                    <td style={css.lineTd}>
                      {canPrice ? (
                        isLaborLine(l.spendCategory) ? (
                          <select
                            value="COMPTANT"
                            disabled
                            onChange={(e) => onLineCommercial(l.id, { paymentMode: e.target.value })}
                            style={css.input}
                            data-testid={`mgr-achats-line-payment-${i}`}
                            title="La main d'œuvre est toujours payée comptant"
                          >
                            <option value="COMPTANT">Comptant (obligatoire)</option>
                          </select>
                        ) : (
                          <select
                            value={l.paymentMode ?? ''}
                            required
                            onChange={(e) => onLineCommercial(l.id, { paymentMode: e.target.value })}
                            style={css.input}
                            data-testid={`mgr-achats-line-payment-${i}`}
                          >
                            <option value="">À préciser</option>
                            {PAYMENT_MODES.map((m) => (
                              <option key={m} value={m}>{PAYMENT_MODE_LABELS[m]}</option>
                            ))}
                          </select>
                        )
                      ) : (
                        isLaborLine(l.spendCategory) ? 'Comptant' : l.paymentMode ?? '—'
                      )}
                    </td>
                    <td style={css.lineTd}>
                      {l.attachmentFileName ? (
                        <button
                          type="button"
                          data-testid={`mgr-achats-line-attachment-name-${i}`}
                          onClick={() => void handleOpenAttachment(l.id, l.attachmentFileName ?? '')}
                          style={{
                            ...css.btnGhost,
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
            {canPrice
              ? ' — obligatoire avant envoi au DAF. Cochez plusieurs lignes du tableau pour leur joindre la même facture en un seul envoi.'
              : '.'}
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
                    style={{
                      ...css.btnGhost,
                      textDecoration: 'underline',
                      color: 'var(--accent, #0b4a2c)',
                    }}
                  >
                    {previewLoading ? 'Ouverture…' : `Consulter ${l.attachmentFileName}`}
                  </button>
                ) : (
                  <span style={{ ...css.meta }}>—</span>
                )}
                {l.attachmentBlobKey && sharedAttachmentKeys.has(l.attachmentBlobKey) && (
                  <span
                    style={{ ...css.meta, color: 'var(--accent, #0b4a2c)' }}
                    data-testid={`mgr-achats-line-attachment-shared-${i}`}
                  >
                    · facture partagée
                  </span>
                )}
                {canPrice && (
                  <label
                    style={{
                      ...css.btnOutline,
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
                    style={css.btnDanger}
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
                  style={{ ...css.btnGhost, padding: 0, fontWeight: 600 }}
                >
                  Imprimer
                </button>
              </p>
            )
          })}
        </div>
      )}

      {showTreasury && !showApprove &&
        treasuryOrders!.map((b) => (
          <div key={b.id} style={{ marginTop: '1rem' }}>
            <h4 style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Bon de trésorerie {b.reference}</h4>
            <p style={{ fontSize: 13 }}>
              <a
                href={treasuryHtmlUrl(b.id)}
                target="_blank"
                rel="noopener noreferrer"
                data-testid={`mgr-achats-treasury-link-${b.id}`}
              >
                Voir la fiche trésorerie
              </a>
              {' · '}
              <button
                type="button"
                data-testid={`mgr-achats-treasury-print-${b.id}`}
                onClick={() => printHtml(treasuryHtmlUrl(b.id))}
                style={{ ...css.btnGhost, padding: 0, fontWeight: 600 }}
              >
                Imprimer
              </button>
            </p>
          </div>
        ))}

      <DocumentChain
        requestId={request.id}
        canAttachBl={!readOnly && procurementRole === 'purchasing'}
        highlight={highlight}
      />

      {canPrice && (
        <div style={{ marginTop: '1.25rem', borderTop: '1px solid var(--border)', paddingTop: '1rem' }} data-testid="mgr-achats-sa-pricing">
          <p style={css.meta}>
            Montant total : <strong>{total.toLocaleString('fr-FR').replace(/\u202F/g, ' ')} XOF</strong>
            {' — '}
            {needsPdg
              ? '≥ 500 000 XOF : après le CdG, le DAF et le PDG valident.'
              : '< 500 000 XOF : après le CdG, le DAF valide.'}
            {' Fournisseur (ou bénéficiaire pour la main d’œuvre, payée comptant) et pièces jointes sont obligatoires sur chaque ligne.'}
            {hasComptantLines(lines) ? ' Mode COMPTANT : générez le bon de trésorerie avant l’envoi au CdG.' : ''}
          </p>
          {hasComptantLines(lines) && (
            <div style={{ marginBottom: 10 }}>
              <button
                type="button"
                data-testid="mgr-achats-create-bt"
                onClick={onCreateTreasury}
                disabled={actionLoading}
                style={{ ...css.btnOutline, ...(actionLoading ? { opacity: 0.6, cursor: 'wait' } : {}) }}
              >
                {actionLoading ? 'Génération…' : treasuryOrders?.length ? 'Regénérer le bon de trésorerie' : 'Générer le bon de trésorerie'}
              </button>
            </div>
          )}
          <div style={css.actionRow}>
            <button
              type="button"
              data-testid="mgr-achats-save-pricing"
              onClick={onSavePricing}
              disabled={actionLoading}
              style={{ ...css.btnGhost, ...(actionLoading ? { opacity: 0.6, cursor: 'wait' } : {}) }}
            >
              {actionLoading ? 'Enregistrement…' : 'Enregistrer les lignes'}
            </button>
            <button
              type="button"
              data-testid="mgr-achats-submit-finance"
              onClick={onSubmitFinance}
              disabled={actionLoading || !currentManagerId}
              style={{ ...css.btnGold, ...(actionLoading ? { opacity: 0.6, cursor: 'wait' } : {}) }}
            >
              {actionLoading ? 'Envoi…' : !currentManagerId ? 'Vérification du profil SA…' : saSupervisorId ? 'Soumettre au chef SA' : 'Soumettre au CdG'}
            </button>
          </div>
        </div>
      )}

      {(request.status === 'sa_head_review' || request.status === 'bc_head_review') && (
        <div style={{ ...css.card, margin: '1rem 0' }} data-testid="mgr-sa-head-review">
          <strong>{request.status === 'sa_head_review' ? 'Chiffrage en attente de validation du chef SA' : 'BC en attente de signature du chef SA'}</strong>
          {!readOnly && procurementRole === 'purchasing' && currentManagerId === request.saReviewerId && !saSupervisorId ? (
            <div style={{ ...css.actionRow, marginTop: 12 }}>
              <label>NIP du chef SA
                <input type="password" inputMode="numeric" autoComplete="one-time-code" value={approvalPin} onChange={(e) => onPinChange(e.target.value)} style={css.input} data-testid="mgr-sa-head-pin" />
              </label>
              <button type="button" style={css.btnGold} disabled={actionLoading || !approvalPin.trim()} onClick={request.status === 'sa_head_review' ? onSubmitFinance : onApproveSaBc} data-testid="mgr-sa-head-approve">
                {actionLoading ? 'Validation…' : request.status === 'sa_head_review' ? 'Valider le chiffrage et transmettre au CdG' : 'Valider et signer les BC'}
              </button>
            </div>
          ) : <p style={css.meta}>Seul le chef SA désigné peut valider cette préparation. La poursuite du circuit reste bloquée jusqu’à son visa.</p>}
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
            {' '}Montant total : <strong>{total.toLocaleString('fr-FR').replace(/\u202F/g, ' ')} XOF</strong>
            {siteBudget?.remainingFcfa != null
              ? ` — reste à engager : ${siteBudget.remainingFcfa.toLocaleString('fr-FR').replace(/\u202F/g, ' ')}`
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
                        style={css.btnOutline}
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
            style={{
              ...css.btnGold,
              marginTop: 10,
              ...(allPosCreated ? { opacity: 0.55, cursor: 'not-allowed', background: '#9ca3af' } : {}),
            }}
          >
            Créer {ebSuppliers.length <= 1 ? 'le BC' : 'les BC'}
          </button>
        </div>
      )}

      {(showApprove || showReject || showSchedule || showRevise) && (
        <div style={{ marginTop: '1.25rem', borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
          {(showApprove || showReject || showRevise) && (
            <Field label="Commentaire (optionnel sauf rejet)">
              <textarea
                value={approvalComment}
                onChange={(e) => onCommentChange(e.target.value)}
                rows={2}
                style={{ ...css.input, resize: 'vertical' }}
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
                style={{ ...css.input, width: 120 }}
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
                    style={{ ...css.btnGold, marginTop: 8, marginRight: 8 }}
                  >
                    Planifier une tournée{name ? ` — ${name}` : ''}
                  </button>
                )
              })}
            </div>
          )}

          {(showApprove || showReject || showRevise) && (
          <div style={css.actionRow}>
            {showRevise && (
              <button
                type="button"
                data-testid="mgr-achats-revise-quantities"
                onClick={onReviseQuantities}
                disabled={actionLoading}
                style={{ ...css.btnOutline, ...(actionLoading ? { opacity: 0.6, cursor: 'wait' } : {}) }}
              >
                Réviser les quantités
              </button>
            )}
            {showApprove && (
              <button
                type="button"
                data-testid="btp-approve-btn"
                onClick={onApprove}
                disabled={actionLoading}
                style={{ ...css.btnGold, ...(actionLoading ? { opacity: 0.6, cursor: 'wait' } : {}) }}
              >
                {actionLoading ? 'Approbation…' : 'Approuver'}
              </button>
            )}
            {showReject && (
              <button
                type="button"
                data-testid="mgr-achats-reject"
                onClick={onReject}
                disabled={actionLoading}
                style={{ ...css.btnDanger, ...(actionLoading ? { opacity: 0.6, cursor: 'wait' } : {}) }}
              >
                {actionLoading ? 'Rejet…' : 'Rejeter'}
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
                  <a href={preview.url} download={preview.fileName} style={css.btnOutline}>
                    Télécharger
                  </a>
                ) : null}
                <button
                  type="button"
                  data-testid="mgr-achats-attachment-preview-close"
                  onClick={closePreview}
                  style={css.btnGhost}
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

      {reviseModalOpen && (
        <div
          data-testid="mgr-achats-revise-modal"
          role="dialog"
          aria-modal="true"
          aria-label="Réviser les quantités"
          onClick={onReviseModalClose}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 90,
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
              width: 'min(560px, 100%)',
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              boxShadow: '0 20px 50px rgba(2, 6, 23, 0.35)',
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
              }}
            >
              <strong style={{ fontSize: 14 }}>Réviser les quantités — version {nextVersion}</strong>
              <button
                type="button"
                data-testid="mgr-achats-revise-close"
                onClick={onReviseModalClose}
                style={css.btnGhost}
              >
                Fermer
              </button>
            </div>
            <div style={{ padding: 14, overflow: 'auto' }}>
              <p style={{ ...css.meta, marginBottom: 12 }}>
                Ajustez les quantités commandées. La demande révisée sera renvoyée au SA et notifiée au DT, au CdG et au DAF.
                Un nouveau numéro de version ({nextVersion}) sera attribué, et le bon de trésorerie sera régénéré.
                Le NIP du PDG est requis : la révision vaut visa.
              </p>
              {lines.map((l, i) => (
                <div
                  key={l.id}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}
                >
                  <span style={{ ...css.meta, minWidth: 24 }}>{i + 1}.</span>
                  <span style={{ flex: 1, fontSize: 13 }}>{l.label || 'Ligne'}</span>
                  <span style={{ ...css.meta, minWidth: 28, textAlign: 'right' }}>{l.unit}</span>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={reviseQuantities[l.id] ?? ''}
                    onChange={(e) => onReviseQuantityChange(l.id, e.target.value)}
                    style={{ ...css.input, width: 96 }}
                    data-testid={`mgr-achats-revise-qty-${i}`}
                  />
                </div>
              ))}
              <Field label="Commentaire de révision (optionnel)">
                <textarea
                  value={reviseComment}
                  onChange={(e) => onReviseCommentChange(e.target.value)}
                  rows={2}
                  style={{ ...css.input, resize: 'vertical' }}
                  data-testid="mgr-achats-revise-comment"
                />
              </Field>
              <Field label="NIP signature PDG">
                <input
                  type="password"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={revisePin}
                  onChange={(e) => onRevisePinChange(e.target.value)}
                  placeholder="••••"
                  style={{ ...css.input, width: 120 }}
                  data-testid="mgr-achats-revise-pin"
                />
              </Field>
            </div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: 8,
                padding: '10px 14px',
                borderTop: '1px solid var(--border)',
              }}
            >
              <button type="button" onClick={onReviseModalClose} style={css.btnGhost}>
                Annuler
              </button>
              <button
                type="button"
                data-testid="mgr-achats-revise-confirm"
                onClick={onReviseConfirm}
                disabled={actionLoading}
                style={{ ...css.btnGold, ...(actionLoading ? { opacity: 0.6, cursor: 'wait' } : {}) }}
              >
                {actionLoading ? 'Envoi…' : 'Valider la révision'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}



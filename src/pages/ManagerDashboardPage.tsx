import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { TraceOMark } from '../components/brand/TraceOMark'
import { DemoBanner } from '../components/DemoBanner'
import { confirmDeletion } from '../lib/confirmDeletion'
import { CI_PHONE_INPUT_TITLE, CI_PHONE_PLACEHOLDER } from '../lib/phone'
import { defaultReplanDate } from '../lib/dates'
import { toast } from '../lib/toast'
import { isValidContactEmail, normalizeContactEmail } from '../../shared/email'
import { authFetch, fetchSupermarkets, setSupermarketActiveState } from './manager/managerApi'
import { FournisseursTab } from './manager/FournisseursTab'
import { SITE_TYPES, isSiteType } from '../../shared/catalogEnums'
import { STATUSES, todayIso, tourLifecycleLabel } from './manager/managerConstants'
import {
  emptyStop,
  type DeliveryRow,
  type DriverRow,
  type ManagerRow,
  type ManagerInviteRow,
  type ProductRow,
  type UnitRow,
  type StopDraft,
  type Supermarket,
  type TaskPayload,
  type TaskRow,
  type TourRow,
  normalizeSupermarkets,
  normalizeSupermarket,
  isSupermarketActive,
} from './manager/managerTypes'
import {
  AlertBox,
  css,
  DashboardStatusBadge,
  EmptyHint,
  Field,
  LoadingHint,
  Row,
  StatCard,
  Toggle,
} from './manager/managerUi'
import { formatPartialTaskLine, ProductQuantityList, suiviQuantityDisplay } from './manager/productHelpers'
import { buildStopApiPayload, matchSupermarketId, validateStopProducts } from './manager/stopFormHelpers'
import { useCompanyUnits } from './manager/useCompanyUnits'
import { ReplanBanner, StopsValidationHint, TourStopFormCard } from './manager/TourStopFormCard'
import { DeliveryDetailModal } from './manager/modals/DeliveryDetailModal'
import { EditDriverModal } from './manager/modals/EditDriverModal'
import { EditManagerModal } from './manager/modals/EditManagerModal'
import { EditProductModal } from './manager/modals/EditProductModal'
import { EditUnitModal } from './manager/modals/EditUnitModal'
import { EditSupermarketModal } from './manager/modals/EditSupermarketModal'
import { EditTourModal } from './manager/modals/EditTourModal'
import { AchatsTab } from './manager/procurement/AchatsTab'
import { SuiviBcTab } from './manager/procurement/SuiviBcTab'
import { SuiviChantierTab } from './manager/procurement/SuiviChantierTab'
import { MaJourneeTab } from './manager/procurement/MaJourneeTab'
import { fetchDraftInboxCount } from './manager/procurement/procurementApi'
import type { ProcurementRole, ProcurementTourPrefill } from './manager/procurement/procurementTypes'
import { PROCUREMENT_ROLE_LABELS, canSeeSuiviChantier, isProcurementWorkspaceRole, isSiteManagerRole } from './manager/procurement/procurementUi'

type Tab = 'suivi' | 'suiviBc' | 'suiviChantier' | 'planifier' | 'livreurs' | 'gestionnaires' | 'points' | 'produits' | 'unites' | 'fournisseurs' | 'taches' | 'achats' | 'maJournee'

const TAB_FROM_QUERY = new Set<Tab>([
  'suivi',
  'suiviBc',
  'suiviChantier',
  'planifier',
  'livreurs',
  'gestionnaires',
  'points',
  'produits',
  'unites',
  'fournisseurs',
  'taches',
  'achats',
])

function tabFromSearchParam(value: string | null): Tab | null {
  if (!value || !TAB_FROM_QUERY.has(value as Tab)) return null
  return value as Tab
}

const LOGISTICS_ONLY_TABS = new Set<Tab>([
  'planifier',
  'livreurs',
  'gestionnaires',
  'points',
  'produits',
  'unites',
  'fournisseurs',
  'taches',
  'suiviBc',
])

/** SA : mêmes onglets manager (Planifier, Catalogue, Équipe, Tâches, Suivi BC) que le gestionnaire. */
const SA_MANAGER_TABS = new Set<Tab>([
  'planifier',
  'livreurs',
  'gestionnaires',
  'points',
  'produits',
  'unites',
  'fournisseurs',
  'taches',
  'suiviBc',
])

// ─── Main component ───────────────────────────────────────────────────────────

export function ManagerDashboardPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const initialTab = tabFromSearchParam(searchParams.get('tab'))
  const [tab, setTab] = useState<Tab>(initialTab ?? 'suivi')

  useEffect(() => {
    const fromUrl = tabFromSearchParam(searchParams.get('tab'))
    if (fromUrl) setTab(fromUrl)
  }, [searchParams])
  const [managerName, setManagerName] = useState('')
  const [currentManagerId, setCurrentManagerId] = useState('')
  const [managerRole, setManagerRole] = useState<'admin' | 'manager'>('manager')
  const [procurementRole, setProcurementRole] = useState<ProcurementRole | null>(null)
  const [procurementInboxCount, setProcurementInboxCount] = useState(0)
  const [pendingEditTourId, setPendingEditTourId] = useState<string | null>(null)
  const [pendingReplanTourId, setPendingReplanTourId] = useState<string | null>(null)
  const [pendingReplanDeliveryId, setPendingReplanDeliveryId] = useState<string | null>(null)
  const [pendingReplanHintDate, setPendingReplanHintDate] = useState<string | null>(null)
  const [pendingDeliveryId, setPendingDeliveryId] = useState<string | null>(null)
  const [pendingSuiviDate, setPendingSuiviDate] = useState<string | null>(null)
  const [pendingPlanifierDate, setPendingPlanifierDate] = useState<string | null>(null)
  const [pendingProcurementPrefill, setPendingProcurementPrefill] = useState<ProcurementTourPrefill | null>(null)
  // Demande multi-livraisons : après enregistrement d'une tournée, si d'autres BC
  // restent à planifier, on ramène le SA dans Achats (demande rouverte) au lieu du Suivi.
  const [pendingProcurementRemainingTours, setPendingProcurementRemainingTours] = useState(0)
  const [pendingProcurementFocusRequest, setPendingProcurementFocusRequest] = useState<string | null>(null)
  const [suiviRefreshKey, setSuiviRefreshKey] = useState(0)
  const [pendingTaskCount, setPendingTaskCount] = useState(0)
  const [catalogRefreshKey, setCatalogRefreshKey] = useState(0)
  const [hideE2eDbWarning, setHideE2eDbWarning] = useState(false)
  const appliedProcurementHome = useRef(false)

  const bumpCatalog = useCallback(() => {
    setCatalogRefreshKey((k) => k + 1)
  }, [])

  const handleAuth = useCallback((status: number) => {
    if (status === 401 || status === 403) {
      navigate('/manager/login')
      return true
    }
    return false
  }, [navigate])

  const loadPendingTaskCount = useCallback(async () => {
    const res = await authFetch('/dashboard/manager-tasks')
    if (handleAuth(res.status)) return
    const data = await res.json() as { count: number }
    setPendingTaskCount(data.count ?? 0)
  }, [handleAuth])

  const loadProcurementInboxCount = useCallback(async () => {
    try {
      const count = await fetchDraftInboxCount()
      setProcurementInboxCount(count)
    } catch {
      setProcurementInboxCount(0)
    }
  }, [])

  useEffect(() => {
    void authFetch('/auth/me').then(async (res) => {
      if (handleAuth(res.status)) return
      if (!res.ok) {
        navigate('/manager/login')
        return
      }
      const data = await res.json() as {
        manager?: {
          email?: string
          name?: string
          id?: string
          role?: 'admin' | 'manager'
          procurementRole?: ProcurementRole | null
        }
      }
      setManagerName(data.manager?.name || data.manager?.email || '')
      setCurrentManagerId(data.manager?.id ?? '')
      setManagerRole(data.manager?.role === 'admin' ? 'admin' : 'manager')
      setProcurementRole(data.manager?.procurementRole ?? null)
      void loadPendingTaskCount()
      void loadProcurementInboxCount()
    })
  }, [navigate, handleAuth, loadPendingTaskCount, loadProcurementInboxCount])

  useEffect(() => {
    if (managerName) void loadPendingTaskCount()
  }, [tab, managerName, loadPendingTaskCount])

  useEffect(() => {
    if (managerName && tab === 'achats') void loadProcurementInboxCount()
  }, [tab, managerName, loadProcurementInboxCount])

  useEffect(() => {
    if (appliedProcurementHome.current) return
    if (!procurementRole) return
    appliedProcurementHome.current = true
    if (searchParams.get('tab')) return
    if (isSiteManagerRole(procurementRole)) {
      setTab('maJournee')
    }
    if (isProcurementWorkspaceRole(procurementRole)) {
      setTab('achats')
    }
  }, [procurementRole, searchParams])

  useEffect(() => {
    if (isSiteManagerRole(procurementRole) && tab !== 'maJournee' && tab !== 'suiviChantier') {
      setTab('maJournee')
      return
    }
    if (!isProcurementWorkspaceRole(procurementRole)) return
    if (procurementRole === 'purchasing' && SA_MANAGER_TABS.has(tab)) return
    if (tab === 'suiviChantier') {
      if (!canSeeSuiviChantier(procurementRole) && !isSiteManagerRole(procurementRole)) setTab('achats')
      return
    }
    if (LOGISTICS_ONLY_TABS.has(tab)) setTab('achats')
  }, [procurementRole, tab])

  const logout = () => {
    void authFetch('/auth/logout-dashboard', { method: 'POST' }).finally(() => {
      navigate('/manager/login')
    })
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'suivi',    label: 'Suivi livraisons' },
    { id: 'suiviBc',  label: 'Suivi' },
    { id: 'suiviChantier', label: 'Suivi chantier' },
    { id: 'planifier', label: 'Planifier une tournée' },
    { id: 'livreurs', label: 'Équipe' },
    { id: 'points',   label: 'Chantiers' },
    { id: 'fournisseurs', label: 'Fournisseurs' },
    { id: 'produits', label: 'Catalogue produits' },
    { id: 'unites',   label: 'Unités de mesure' },
    { id: 'taches',   label: pendingTaskCount > 0 ? `Tâches (${pendingTaskCount})` : 'Tâches' },
    { id: 'achats',   label: 'Achats chantier' },
  ]

  const procurementWorkspace = isProcurementWorkspaceRole(procurementRole)
  const sidebarRoleLabel = procurementRole ? PROCUREMENT_ROLE_LABELS[procurementRole] : 'Manager'

  const sidebarItems: { id: Tab | 'catalogue'; label: string; tab?: Tab; badge?: number }[] = isSiteManagerRole(procurementRole)
    ? [
        { id: 'maJournee', label: 'Ma journée', tab: 'maJournee' },
        { id: 'suiviChantier' as const, label: 'Suivi chantier', tab: 'suiviChantier' as Tab },
      ]
    : procurementWorkspace
    ? [
        { id: 'achats', label: 'Achats chantier', tab: 'achats', badge: procurementInboxCount },
        ...(canSeeSuiviChantier(procurementRole)
          ? [{ id: 'suiviChantier' as const, label: 'Suivi chantier', tab: 'suiviChantier' as Tab }]
          : []),
        ...(procurementRole === 'purchasing'
          ? [
              { id: 'planifier' as const, label: 'Planifier une tournée', tab: 'planifier' as Tab },
              { id: 'catalogue' as const, label: 'Catalogue' },
              { id: 'livreurs' as const, label: 'Équipe', tab: 'livreurs' as Tab },
              { id: 'taches' as const, label: 'Tâches', tab: 'taches' as Tab, badge: pendingTaskCount },
              { id: 'suiviBc' as const, label: 'Suivi', tab: 'suiviBc' as Tab },
            ]
          : []),
        { id: 'suivi', label: 'Livraisons', tab: 'suivi' },
      ]
    : [
        { id: 'suivi', label: 'Suivi livraisons', tab: 'suivi' },
        { id: 'planifier', label: 'Planifier une tournée', tab: 'planifier' },
        { id: 'achats', label: 'Achats chantier', tab: 'achats', badge: procurementInboxCount },
        { id: 'catalogue', label: 'Catalogue' },
        { id: 'livreurs', label: 'Équipe', tab: 'livreurs' },
        { id: 'taches', label: 'Tâches', tab: 'taches', badge: pendingTaskCount },
      ]

  const isCatalogueTab = tab === 'points' || tab === 'produits' || tab === 'unites' || tab === 'fournisseurs'
  const isEquipeTab = tab === 'livreurs' || tab === 'gestionnaires'
  const isAdmin = managerRole === 'admin'

  useEffect(() => {
    if (!isAdmin && tab === 'gestionnaires') setTab('livreurs')
  }, [isAdmin, tab])

  const isSidebarActive = (item: (typeof sidebarItems)[number]) => {
    if (item.id === 'catalogue') return isCatalogueTab
    if (item.id === 'livreurs') return isEquipeTab
    return item.tab === tab
  }

  const openSidebarItem = (item: (typeof sidebarItems)[number]) => {
    if (item.id === 'catalogue') {
      setTab(isCatalogueTab ? tab : 'points')
      return
    }
    if (item.id === 'livreurs') {
      setTab(isEquipeTab ? tab : 'livreurs')
      return
    }
    if (item.tab) setTab(item.tab)
  }

  const openDeliveryFromTask = (deliveryId: string) => {
    setPendingDeliveryId(deliveryId)
    setTab('suivi')
  }

  const openTourFromTask = (tourId: string) => {
    setPendingEditTourId(tourId)
    setTab('planifier')
  }

  const replanReturnTabRef = useRef<Tab | null>(null)

  const openReplanFromTask = (
    tourId: string,
    deliveryId?: string,
    sourceDate?: string,
    returnTab: Tab = 'suivi',
  ) => {
    replanReturnTabRef.current = returnTab
    setPendingReplanTourId(tourId)
    setPendingReplanDeliveryId(deliveryId ?? null)
    setPendingReplanHintDate(sourceDate ?? null)
    setTab('planifier')
  }

  const handleReplanCancelled = useCallback((sourceDate?: string | null) => {
    setPendingReplanTourId(null)
    setPendingReplanDeliveryId(null)
    setPendingReplanHintDate(null)
    const returnTab = replanReturnTabRef.current
    replanReturnTabRef.current = null
    if (returnTab === 'suivi' && sourceDate) setPendingSuiviDate(sourceDate)
    if (returnTab) setTab(returnTab)
    toast.info(
      sourceDate
        ? `Replanification annulée — retour au suivi du ${new Date(sourceDate + 'T12:00:00').toLocaleDateString('fr-FR')}`
        : 'Replanification annulée',
    )
  }, [])

  const handleInlineReplanStart = useCallback(() => {
    replanReturnTabRef.current = null
  }, [])

  const bumpTasks = () => { void loadPendingTaskCount() }

  return (
    <div className="manager-shell" style={css.layout}>
      <DemoBanner role="manager" />
      {import.meta.env.VITE_E2E_DB_WARNING === '1' && !hideE2eDbWarning && (
        <div
          role="status"
          data-testid="mgr-e2e-db-warning"
          style={{
            background: '#fff7ed',
            borderBottom: '1px solid #fdba74',
            color: '#9a3412',
            padding: '8px 16px',
            fontSize: 13,
            display: 'flex',
            justifyContent: 'space-between',
            gap: 12,
            alignItems: 'center',
          }}
        >
          <span>
            Base de tests locale : <code>npm run regression</code> et les tests E2E
            réinitialisent ces données.
          </span>
          <button
            type="button"
            onClick={() => setHideE2eDbWarning(true)}
            style={{ ...css.btnGhost, padding: '2px 8px' }}
            aria-label="Masquer l’avertissement base de tests"
          >
            ×
          </button>
        </div>
      )}
      <aside className="manager-sidebar" style={css.sidebar} aria-label="Navigation gestionnaire">
        <div className="manager-sidebar__brand" style={css.sidebarBrand}>
          <TraceOMark onBrand layout="badge" withMotto={false} />
          <div className="manager-sidebar__role" data-testid="mgr-sidebar-role">
            {sidebarRoleLabel}
          </div>
        </div>
        <nav style={css.sidebarNav}>
          {sidebarItems.map((item) => {
            const active = isSidebarActive(item)
            const label =
              item.badge && item.badge > 0 ? `${item.label} (${item.badge})` : item.label
            return (
              <button
                key={item.id}
                type="button"
                data-testid={
                  item.tab === 'suiviBc'
                    ? 'mgr-tab-suivi-bc'
                    : item.tab === 'suiviChantier'
                      ? 'mgr-tab-suivi-chantier'
                      : item.tab
                        ? `mgr-tab-${item.tab}`
                        : 'mgr-tab-catalogue'
                }
                onClick={() => openSidebarItem(item)}
                className={active ? 'manager-sidebar__item manager-sidebar__item--active' : 'manager-sidebar__item'}
                style={active ? css.sidebarItemActive : css.sidebarItem}
              >
                {label}
              </button>
            )
          })}
        </nav>
        <div className="manager-sidebar__footer">
          <div className="manager-sidebar__footer-label">Connecté</div>
          <div className="manager-sidebar__footer-name">
            {managerName || 'Gestionnaire'}
          </div>
        </div>
      </aside>

      <div className="manager-main" style={css.main}>
        <header className="manager-header" style={css.mainHeader}>
          <div>
            <p className="manager-header__eyebrow">
              TraceO® · {procurementRole ? PROCUREMENT_ROLE_LABELS[procurementRole] : 'Gestionnaire'}
            </p>
            <h1 className="manager-header__title">
              {isEquipeTab ? 'Équipe' : (tabs.find((t) => t.id === tab)?.label ?? 'Tableau de bord')}
            </h1>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {isAdmin && (
              <Link to="/manager/security" style={{ ...css.btnGhost, textDecoration: 'none' }}>
                Sécurité 2FA
              </Link>
            )}
            <button type="button" onClick={logout} style={css.btnGhost}>Déconnexion</button>
          </div>
        </header>

        <div className="manager-content" style={css.mainContent}>
          {isEquipeTab && (
            <nav style={css.catalogueSubnav} aria-label="Sous-navigation équipe">
              <button
                type="button"
                data-testid="mgr-tab-livreurs"
                onClick={() => setTab('livreurs')}
                style={tab === 'livreurs' ? css.tabActive : css.tab}
              >
                Livreurs
              </button>
              {isAdmin && (
                <button
                  type="button"
                  data-testid="mgr-tab-gestionnaires"
                  onClick={() => setTab('gestionnaires')}
                  style={tab === 'gestionnaires' ? css.tabActive : css.tab}
                >
                  Gestionnaires
                </button>
              )}
            </nav>
          )}
          {isCatalogueTab && (
            <nav style={css.catalogueSubnav} aria-label="Sous-navigation catalogue">
              <button
                type="button"
                data-testid="mgr-tab-points"
                onClick={() => setTab('points')}
                style={tab === 'points' ? css.tabActive : css.tab}
              >
                Chantiers
              </button>
              <button
                type="button"
                data-testid="mgr-tab-fournisseurs"
                onClick={() => setTab('fournisseurs')}
                style={tab === 'fournisseurs' ? css.tabActive : css.tab}
              >
                Fournisseurs
              </button>
              <button
                type="button"
                data-testid="mgr-tab-produits"
                onClick={() => setTab('produits')}
                style={tab === 'produits' ? css.tabActive : css.tab}
              >
                Catalogue produits
              </button>
              <button
                type="button"
                data-testid="mgr-tab-unites"
                onClick={() => setTab('unites')}
                style={tab === 'unites' ? css.tabActive : css.tab}
              >
                Unités de mesure
              </button>
            </nav>
          )}
        {tab === 'suivi'    && (
          <SuiviTab
            handleAuth={handleAuth}
            procurementRole={procurementRole}
            refreshKey={suiviRefreshKey}
            onEditTour={(tourId, tourDate) => {
              setPendingPlanifierDate(tourDate)
              setTab('planifier')
              setPendingEditTourId(tourId)
            }}
            onReplanTour={(tourId, sourceDate) => openReplanFromTask(tourId, undefined, sourceDate, 'suivi')}
            pendingDeliveryId={pendingDeliveryId}
            onPendingDeliveryConsumed={() => setPendingDeliveryId(null)}
            pendingDate={pendingSuiviDate}
            onPendingDateConsumed={() => setPendingSuiviDate(null)}
            pendingTaskCount={pendingTaskCount}
            onGoToTasks={() => setTab('taches')}
          />
        )}
        {tab === 'planifier' && (
          <PlanifierTab
            handleAuth={handleAuth}
            catalogRefreshKey={catalogRefreshKey}
            useFournisseurLabels={Boolean(procurementRole)}
            initialEditTourId={pendingEditTourId}
            onEditConsumed={() => setPendingEditTourId(null)}
            initialPlanifierDate={pendingPlanifierDate}
            onPlanifierDateConsumed={() => setPendingPlanifierDate(null)}
            initialProcurementPrefill={pendingProcurementPrefill}
            onProcurementPrefillConsumed={() => setPendingProcurementPrefill(null)}
            onTourSaved={(savedDate) => {
              setSuiviRefreshKey((k) => k + 1)
              setPendingSuiviDate(savedDate)
              if (pendingProcurementRemainingTours > 0) {
                // Demande multi-livraisons : d'autres BC restent à planifier →
                // retour dans Achats avec la demande rouverte (via focusRequestId).
                setPendingProcurementRemainingTours(0)
                setTab('achats')
              } else {
                setPendingProcurementFocusRequest(null)
                setTab('suivi')
              }
            }}
            initialReplanTourId={pendingReplanTourId}
            initialReplanDeliveryId={pendingReplanDeliveryId}
            initialReplanHintDate={pendingReplanHintDate}
            onReplanConsumed={() => {
              setPendingReplanTourId(null)
              setPendingReplanDeliveryId(null)
              setPendingReplanHintDate(null)
            }}
            onTourCreated={(date) => {
              toast.success('Tournée créée — le livreur a été notifié.')
              setPendingSuiviDate(date)
              setSuiviRefreshKey((k) => k + 1)
              setTab('suivi')
            }}
            onReplanCancelled={handleReplanCancelled}
            onInlineReplanStart={handleInlineReplanStart}
            onTasksChanged={bumpTasks}
          />
        )}
        {tab === 'livreurs' && <LivreursTab handleAuth={handleAuth} onTasksChanged={bumpTasks} />}
        {tab === 'gestionnaires' && isAdmin && (
          <GestionnairesTab handleAuth={handleAuth} currentManagerId={currentManagerId} />
        )}
        {tab === 'points'   && <PointsTab handleAuth={handleAuth} onPointsChanged={bumpCatalog} />}
        {tab === 'fournisseurs' && <FournisseursTab handleAuth={handleAuth} />}
        {tab === 'produits' && <ProduitsTab handleAuth={handleAuth} onCatalogChanged={bumpCatalog} catalogRefreshKey={catalogRefreshKey} />}
        {tab === 'unites'   && <UnitesTab handleAuth={handleAuth} onCatalogChanged={bumpCatalog} />}
        {tab === 'taches'   && (
          <TachesTab
            handleAuth={handleAuth}
            onOpenDelivery={openDeliveryFromTask}
            onOpenTour={openTourFromTask}
            onReplanTour={(tourId, deliveryId) => openReplanFromTask(tourId, deliveryId, undefined, 'taches')}
            onTasksChanged={bumpTasks}
          />
        )}
        {tab === 'achats' && (
          <AchatsTab
            handleAuth={handleAuth}
            procurementRole={procurementRole}
            managerName={managerName}
            onInboxCountChanged={loadProcurementInboxCount}
            focusRequestId={pendingProcurementFocusRequest}
            onFocusConsumed={() => setPendingProcurementFocusRequest(null)}
            onOpenPlanifier={(prefill, remainingToursAfter) => {
              setPendingProcurementPrefill(prefill)
              setPendingProcurementRemainingTours(remainingToursAfter)
              setPendingProcurementFocusRequest(prefill.purchaseRequestId ?? null)
              setTab('planifier')
            }}
            onOpenSuiviChantier={() => setTab('suiviChantier')}
          />
        )}
        {tab === 'suiviBc' && <SuiviBcTab handleAuth={handleAuth} />}
        {tab === 'suiviChantier' && (
          <SuiviChantierTab handleAuth={handleAuth} procurementRole={procurementRole} />
        )}
        {tab === 'maJournee' && <MaJourneeTab handleAuth={handleAuth} />}
        </div>
      </div>
    </div>
  )
}

// ─── Tab: Suivi livraisons ────────────────────────────────────────────────────

interface SuiviTourGroup {
  tourId: string
  tourDate: string
  driverName: string
  depotName: string
  deliveries: DeliveryRow[]
  deliveredCount: number
}

function groupDeliveriesByTour(deliveries: DeliveryRow[]): SuiviTourGroup[] {
  const groups: SuiviTourGroup[] = []
  const byTour = new Map<string, SuiviTourGroup>()
  for (const d of deliveries) {
    let group = byTour.get(d.tourId)
    if (!group) {
      group = {
        tourId: d.tourId,
        tourDate: d.tourDate,
        driverName: d.driverName,
        depotName: d.depotName,
        deliveries: [],
        deliveredCount: 0,
      }
      byTour.set(d.tourId, group)
      groups.push(group)
    }
    group.deliveries.push(d)
    if (d.status === 'delivered') group.deliveredCount += 1
  }
  return groups
}

function SuiviTab({
  handleAuth,
  procurementRole,
  onEditTour,
  onReplanTour,
  pendingDeliveryId,
  onPendingDeliveryConsumed,
  pendingDate,
  onPendingDateConsumed,
  refreshKey,
  pendingTaskCount,
  onGoToTasks,
}: {
  handleAuth: (s: number) => boolean
  procurementRole: ProcurementRole | null
  onEditTour?: (tourId: string, tourDate: string) => void
  onReplanTour?: (tourId: string, sourceDate: string) => void
  pendingDeliveryId?: string | null
  onPendingDeliveryConsumed?: () => void
  pendingDate?: string | null
  onPendingDateConsumed?: () => void
  refreshKey?: number
  pendingTaskCount?: number
  onGoToTasks?: () => void
}) {
  // Modification des tournées/livraisons réservée au Service Achats (SA).
  const canModify = procurementRole === 'purchasing'
  const [date, setDate] = useState(() => pendingDate ?? todayIso())
  const [status, setStatus] = useState('all')
  const [deliveries, setDeliveries] = useState<DeliveryRow[]>([])
  const [total, setTotal] = useState(0)
  const [validated, setValidated] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [collapsedTours, setCollapsedTours] = useState<Set<string>>(() => new Set())

  const tourGroups = useMemo(() => groupDeliveriesByTour(deliveries), [deliveries])
  const allTourIds = useMemo(() => tourGroups.map((g) => g.tourId), [tourGroups])
  const statusFiltered = status !== 'all'

  const fetch_ = useCallback(async () => {
    setLoading(true); setError(null)
    const res = await authFetch(`/dashboard/deliveries?date=${date}&status=${status}`)
    if (handleAuth(res.status)) return
    const data = await res.json() as { deliveries: DeliveryRow[]; total: number; validated: number }
    setDeliveries(data.deliveries ?? [])
    setTotal(data.total ?? 0)
    setValidated(data.validated ?? 0)
    setCollapsedTours(new Set())
    setLoading(false)
  }, [date, status, handleAuth])

  const toggleTour = (tourId: string) => {
    setCollapsedTours((prev) => {
      const next = new Set(prev)
      if (next.has(tourId)) next.delete(tourId)
      else next.add(tourId)
      return next
    })
  }

  const expandAllTours = () => setCollapsedTours(new Set())
  const collapseAllTours = () => setCollapsedTours(new Set(allTourIds))

  const deleteTour = async (tourId: string, driverName: string, deliveredCount: number) => {
    if (deliveredCount > 0) {
      window.alert('Impossible de supprimer : au moins un arrêt est déjà livré.')
      return
    }
    if (!confirmDeletion(`Supprimer définitivement la tournée de « ${driverName} » et tous ses arrêts ?`)) {
      return
    }
    const res = await authFetch(`/dashboard/tours/${encodeURIComponent(tourId)}`, { method: 'DELETE' })
    if (handleAuth(res.status)) return
    const data = (await res.json()) as { message?: string }
    if (!res.ok) {
      window.alert(data.message ?? 'Suppression impossible')
      return
    }
    void fetch_()
  }

  useEffect(() => { void fetch_() }, [fetch_])

  useEffect(() => {
    if (refreshKey === undefined || refreshKey === 0) return
    void fetch_()
  }, [refreshKey, fetch_])

  useEffect(() => {
    if (pendingDate) {
      setDate(pendingDate)
      onPendingDateConsumed?.()
    }
  }, [pendingDate, onPendingDateConsumed])

  useEffect(() => {
    if (pendingDeliveryId) {
      setSelectedId(pendingDeliveryId)
      const tourId = deliveries.find((d) => d.deliveryId === pendingDeliveryId)?.tourId
      if (tourId) {
        setCollapsedTours((prev) => {
          const next = new Set(prev)
          next.delete(tourId)
          return next
        })
      }
      onPendingDeliveryConsumed?.()
    }
  }, [pendingDeliveryId, onPendingDeliveryConsumed, deliveries])

  return (
    <div>
      {(pendingTaskCount ?? 0) > 0 && (
        <div style={{ background: '#f3faf6', border: '1px solid #c5d9cc', borderRadius: 10, padding: '0.75rem 1rem', marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <p style={{ margin: 0, fontSize: 14 }}>
            <strong>{pendingTaskCount}</strong> tâche(s) en attente (confirmations, partielles, non effectuées…).
          </p>
          <button type="button" onClick={onGoToTasks} style={css.btnGold}>Voir les tâches</button>
        </div>
      )}

      {/* Stats */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: '1.5rem' }}>
        <StatCard label="Livraisons" value={total} />
        <StatCard label="Validées" value={validated} />
        <StatCard label="En attente" value={total - validated} />
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: '1rem' }}>
        <label style={css.label}>Date</label>
        <input type="date" data-testid="mgr-suivi-date" value={date} onChange={(e) => setDate(e.target.value)} style={{ ...css.inputCompact, width: 150 }} />
        <label style={css.label}>Statut</label>
        <select value={status} onChange={(e) => setStatus(e.target.value)} style={{ ...css.inputCompact, width: 160 }}>
          {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <button onClick={() => void fetch_()} style={css.btnGold}>Filtrer</button>
      </div>

      {error && <AlertBox>{error}</AlertBox>}

      {loading && <LoadingHint />}

      {!loading && deliveries.length === 0 && (
        <EmptyHint>Aucune livraison pour ce filtre.</EmptyHint>
      )}

      {deliveries.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <span style={{ fontSize: 13, color: '#6b7280' }}>
              {tourGroups.length} tournée{tourGroups.length > 1 ? 's' : ''} · {deliveries.length} livraison{deliveries.length > 1 ? 's' : ''}
              {statusFiltered ? ' (filtre statut actif)' : ''}
            </span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" onClick={expandAllTours} style={css.btnOutline}>Tout déplier</button>
              <button type="button" onClick={collapseAllTours} style={css.btnOutline}>Tout replier</button>
            </div>
          </div>

          {tourGroups.map((group) => {
            const collapsed = collapsedTours.has(group.tourId)
            const canReplan = group.deliveredCount < group.deliveries.length
            const progressLabel = statusFiltered
              ? `${group.deliveries.length} arrêt${group.deliveries.length > 1 ? 's' : ''} affiché${group.deliveries.length > 1 ? 's' : ''}`
              : `${group.deliveredCount}/${group.deliveries.length} livré${group.deliveries.length > 1 ? 's' : ''}`

            return (
              <div
                key={group.tourId}
                style={{ background: '#fff', borderRadius: 10, border: '1px solid var(--border)', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,.04)' }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 12,
                    padding: '12px 14px',
                    background: '#faf8f5',
                    borderBottom: collapsed ? 'none' : '1px solid var(--border)',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => toggleTour(group.tourId)}
                    style={{
                      flex: 1,
                      display: 'block',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      textAlign: 'left',
                      padding: 0,
                    }}
                  >
                    <div style={{ fontWeight: 700, fontSize: 14, color: '#111827' }}>
                      <span style={{ marginRight: 8, color: '#6b7280' }}>{collapsed ? '▸' : '▾'}</span>
                      {group.driverName}
                    </div>
                    <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2, paddingLeft: 22 }}>
                      {group.depotName} · {progressLabel}
                      {' · '}
                      <span data-testid={`mgr-suivi-tour-status-${group.tourId}`}>
                        {tourLifecycleLabel(group.deliveredCount, group.deliveries.length)}
                      </span>
                    </div>
                  </button>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {canModify && canReplan && (
                      <button
                        type="button"
                        data-testid={`mgr-suivi-replan-${group.tourId}`}
                        onClick={() => onReplanTour?.(group.tourId, group.tourDate)}
                        style={css.btnOutline}
                      >
                        Replanifier
                      </button>
                    )}
                    {canModify && (
                      <button
                        type="button"
                        data-testid={`mgr-suivi-edit-${group.tourId}`}
                        onClick={() => onEditTour?.(group.tourId, group.tourDate)}
                        style={css.btnOutline}
                      >
                        Modifier la tournée
                      </button>
                    )}
                    {canModify && group.deliveredCount === 0 && (
                      <button
                        type="button"
                        data-testid={`mgr-suivi-delete-${group.tourId}`}
                        onClick={() => void deleteTour(group.tourId, group.driverName, group.deliveredCount)}
                        style={css.btnDanger}
                      >
                        Supprimer
                      </button>
                    )}
                    {!canModify && (
                      <span style={{ fontSize: 12, color: 'var(--muted, #667)' }}>
                        Consultation — seule la Direction des Achats (SA) peut modifier.
                      </span>
                    )}
                  </div>
                </div>

                {!collapsed && (
                  <div style={css.deliveryCardGrid}>
                    {group.deliveries.map((d) => (
                      <button
                        key={d.deliveryId}
                        type="button"
                        onClick={() => setSelectedId(d.deliveryId)}
                        style={{ ...css.deliveryCard, textAlign: 'left' }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
                          <div style={{ fontWeight: 700, fontSize: 14, color: '#111827' }}>{d.deliveryName}</div>
                          <DashboardStatusBadge status={d.status} declarationOutcome={d.declarationOutcome} />
                        </div>
                        <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 8 }}>{d.deliveryAddress}</div>
                        <ProductQuantityList
                          compact
                          lines={suiviQuantityDisplay(d.products, d.units, d.unitType)}
                        />
                        <div style={{ marginTop: 10, fontSize: 12, fontWeight: 600, color: '#0b4a2c' }}>
                          Voir détail ›
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {selectedId && (
        <DeliveryDetailModal
          deliveryId={selectedId}
          canModify={procurementRole === 'purchasing'}
          onClose={() => setSelectedId(null)}
          onEditTour={(tourId, tourDate) => { setSelectedId(null); onEditTour?.(tourId, tourDate) }}
        />
      )}
    </div>
  )
}

// ─── Tab: Planifier une tournée ───────────────────────────────────────────────

function PlanifierTab({
  handleAuth,
  catalogRefreshKey = 0,
  useFournisseurLabels = false,
  initialEditTourId,
  onEditConsumed,
  initialPlanifierDate,
  onPlanifierDateConsumed,
  initialProcurementPrefill,
  onProcurementPrefillConsumed,
  onTourSaved,
  initialReplanTourId,
  initialReplanDeliveryId,
  initialReplanHintDate,
  onReplanConsumed,
  onTourCreated,
  onReplanCancelled,
  onInlineReplanStart,
  onTasksChanged,
}: {
  handleAuth: (s: number) => boolean
  catalogRefreshKey?: number
  useFournisseurLabels?: boolean
  initialEditTourId?: string | null
  onEditConsumed?: () => void
  initialPlanifierDate?: string | null
  onPlanifierDateConsumed?: () => void
  initialProcurementPrefill?: ProcurementTourPrefill | null
  onProcurementPrefillConsumed?: () => void
  onTourSaved?: (savedDate: string) => void
  initialReplanTourId?: string | null
  initialReplanDeliveryId?: string | null
  initialReplanHintDate?: string | null
  onReplanConsumed?: () => void
  onTourCreated?: (date: string) => void
  onReplanCancelled?: (sourceDate?: string | null) => void
  onInlineReplanStart?: () => void
  onTasksChanged?: () => void
}) {
  const [date, setDate] = useState(todayIso)
  const [tours, setTours] = useState<TourRow[]>([])
  const [drivers, setDrivers] = useState<DriverRow[]>([])
  const [driversLoading, setDriversLoading] = useState(true)
  const [driversError, setDriversError] = useState<string | null>(null)
  const [supermarkets, setSupermarkets] = useState<Supermarket[]>([])
  const [catalogReady, setCatalogReady] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [replanSourceDate, setReplanSourceDate] = useState<string | null>(null)
  const [replanSourceTourId, setReplanSourceTourId] = useState<string | null>(null)
  const [replanKind, setReplanKind] = useState<'tour' | 'partial'>('tour')
  const [newTour, setNewTour] = useState(() => ({
    driverId: '',
    date: todayIso(),
    depotName: '',
    depotAddress: '',
    tourStart: '06:00',
    tourEnd: '18:00',
  }))
  const [stops, setStops] = useState<StopDraft[]>([emptyStop()])
  const [editTourId, setEditTourId] = useState<string | null>(initialEditTourId ?? null)
  const [formVersion, setFormVersion] = useState(0)
  const [replanLoading, setReplanLoading] = useState(false)
  const [replanSessionActive, setReplanSessionActive] = useState(false)
  const replanLoadRef = useRef(0)
  const replanIntentRef = useRef<{ tourId?: string; hintSourceDate?: string | null } | null>(null)
  const createFormRef = useRef<HTMLElement | null>(null)
  const procurementRequestIdRef = useRef<string | null>(null)
  const procurementOrderIdRef = useRef<string | null>(null)

  const resetCreateForm = useCallback(() => {
    replanLoadRef.current += 1
    replanIntentRef.current = null
    setReplanLoading(false)
    setReplanSessionActive(false)
    setNewTour({
      driverId: '',
      date: todayIso(),
      depotName: '',
      depotAddress: '',
      tourStart: '06:00',
      tourEnd: '18:00',
    })
    setStops([emptyStop()])
    setReplanSourceDate(null)
    setReplanSourceTourId(null)
    setReplanKind('tour')
    setCreateError(null)
    procurementRequestIdRef.current = null
    procurementOrderIdRef.current = null
    setFormVersion((v) => v + 1)
  }, [])

  const isReplanActive = !!(
    replanSessionActive
    || replanSourceDate
    || replanSourceTourId
    || replanLoading
    || initialReplanTourId
  )

  const cancelReplan = useCallback(() => {
    const wasReplan = !!(
      replanSessionActive
      || replanSourceDate
      || replanSourceTourId
      || replanLoading
      || replanIntentRef.current
      || initialReplanTourId
    )
    const sourceDate =
      replanSourceDate
      ?? replanIntentRef.current?.hintSourceDate
      ?? initialReplanHintDate
      ?? null

    replanLoadRef.current += 1
    resetCreateForm()

    if (wasReplan) {
      onReplanCancelled?.(sourceDate)
    }
  }, [
    replanSessionActive,
    replanSourceDate,
    replanSourceTourId,
    replanLoading,
    initialReplanTourId,
    initialReplanHintDate,
    resetCreateForm,
    onReplanCancelled,
  ])

  useEffect(() => {
    if (initialEditTourId) {
      setEditTourId(initialEditTourId)
      onEditConsumed?.()
      void authFetch(`/dashboard/tours/${initialEditTourId}`)
        .then((r) => r.json())
        .then((data: { tour?: { date?: string } }) => {
          if (data.tour?.date) setDate(data.tour.date)
        })
        .catch(() => {})
    }
  }, [initialEditTourId, onEditConsumed])

  useEffect(() => {
    if (initialPlanifierDate) {
      setDate(initialPlanifierDate)
      onPlanifierDateConsumed?.()
    }
  }, [initialPlanifierDate, onPlanifierDateConsumed])

  useEffect(() => {
    if (!initialProcurementPrefill || !catalogReady) return
    const p = initialProcurementPrefill
    const smId = matchSupermarketId(supermarkets, p.stopName, p.stopAddress)
    procurementRequestIdRef.current = p.purchaseRequestId
    procurementOrderIdRef.current = p.purchaseOrderId ?? null
    setNewTour({
      driverId: p.driverId ?? '',
      date: p.date,
      depotName: p.depotName,
      depotAddress: p.depotAddress,
      tourStart: '06:00',
      tourEnd: '18:00',
    })
    setDate(p.date)
    setStops([
      {
        ...emptyStop(),
        supermarketId: smId || undefined,
        name: p.stopName,
        address: p.stopAddress,
        orderRef: p.orderRef,
        instructions: `Livraison matériaux — ${p.orderRef}`,
        products: p.products.map((x) => ({ label: x.label, qty: String(x.qty), unit: x.unit })),
      },
    ])
    setFormVersion((v) => v + 1)
    onProcurementPrefillConsumed?.()
    window.setTimeout(() => {
      createFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 50)
  }, [initialProcurementPrefill, onProcurementPrefillConsumed, catalogReady, supermarkets])

  const loadReplanTemplate = useCallback(async (
    tourId: string,
    partialDeliveryId?: string,
    hintSourceDate?: string | null,
  ) => {
    const loadId = ++replanLoadRef.current
    replanIntentRef.current = { tourId, hintSourceDate: hintSourceDate ?? null }
    setReplanSessionActive(true)
    setReplanLoading(true)
    setCreateError(null)
    const url = partialDeliveryId
      ? `/dashboard/deliveries/${encodeURIComponent(partialDeliveryId)}/partial-replan-template`
      : `/dashboard/tours/${encodeURIComponent(tourId)}/replan-template`
    let res: Response
    try {
      res = await authFetch(url)
    } catch {
      if (loadId !== replanLoadRef.current) return
      setReplanLoading(false)
      setCreateError('Impossible de charger la replanification')
      return
    }
    if (loadId !== replanLoadRef.current) return
    if (handleAuth(res.status)) {
      setReplanLoading(false)
      return
    }
    const data = await res.json() as {
      sourceDate?: string
      replanKind?: 'tour' | 'partial'
      driverId?: string
      depotName?: string
      depotAddress?: string
      stops?: Array<{
        name: string
        address: string
        lat: string
        lng: string
        instructions: string
        orderRef: string
        contactPhone: string
        timeWindowStart: string
        timeWindowEnd: string
        requiredPhotos: string
        supermarketId?: string
        products: Array<{ label: string; qty: string; unit: string }>
      }>
      message?: string
    }
    if (loadId !== replanLoadRef.current) return
    if (!res.ok) {
      setReplanLoading(false)
      setCreateError(data.message ?? 'Impossible de charger la replanification')
      return
    }
    const sourceDate = data.sourceDate ?? hintSourceDate ?? null
    const replanDate = defaultReplanDate(sourceDate)
    replanIntentRef.current = { tourId, hintSourceDate: sourceDate }
    setReplanSourceDate(sourceDate)
    setReplanLoading(false)
    setReplanKind(data.replanKind ?? (partialDeliveryId ? 'partial' : 'tour'))
    setReplanSourceTourId(partialDeliveryId ? null : tourId)
    setNewTour((p) => ({
      ...p,
      driverId: data.driverId ?? p.driverId,
      date: replanDate,
      depotName: data.depotName ?? p.depotName,
      depotAddress: data.depotAddress ?? p.depotAddress,
    }))
    setStops((data.stops ?? []).map((s) => ({
      supermarketId: s.supermarketId || matchSupermarketId(supermarkets, s.name, s.address),
      lat: s.lat,
      lng: s.lng,
      name: s.name,
      address: s.address,
      instructions: s.instructions,
      units: '1',
      unitType: 'colis',
      weightKg: '0',
      orderRef: s.orderRef,
      contactPhone: s.contactPhone,
      timeWindowStart: s.timeWindowStart,
      timeWindowEnd: s.timeWindowEnd,
      requiredPhotos: s.requiredPhotos,
      products: s.products.length > 0 ? s.products : [],
    })))
    if ((data.stops ?? []).length === 0) setStops([emptyStop()])
    setFormVersion((v) => v + 1)
    createFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [handleAuth, supermarkets])

  useEffect(() => {
    if (initialReplanTourId) {
      setReplanSessionActive(true)
      replanIntentRef.current = {
        tourId: initialReplanTourId,
        hintSourceDate: initialReplanHintDate ?? null,
      }
    }
  }, [initialReplanTourId, initialReplanHintDate])

  useEffect(() => {
    if (!initialReplanTourId || supermarkets.length === 0) return
    void loadReplanTemplate(
      initialReplanTourId,
      initialReplanDeliveryId ?? undefined,
      initialReplanHintDate ?? undefined,
    )
    onReplanConsumed?.()
  // Ne pas re-déclencher quand loadReplanTemplate change (ex. chargement supermarchés)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialReplanTourId, initialReplanDeliveryId, initialReplanHintDate, supermarkets.length])

  const toursFetchGen = useRef(0)
  const fetchTours = useCallback(async (d: string) => {
    const gen = ++toursFetchGen.current
    const res = await authFetch(`/dashboard/tours?date=${d}`)
    if (gen !== toursFetchGen.current) return
    if (handleAuth(res.status)) return
    const data = await res.json() as { tours: TourRow[] }
    if (gen !== toursFetchGen.current) return
    setTours(data.tours ?? [])
  }, [handleAuth])

  useEffect(() => { void fetchTours(date) }, [date, fetchTours])

  const loadSupermarkets = useCallback(async () => {
    try {
      const res = await fetchSupermarkets()
      if (handleAuth(res.status)) return
      if (!res.ok) return
      const data = await res.json() as { supermarkets: Supermarket[] }
      setSupermarkets(normalizeSupermarkets(data.supermarkets ?? []))
    } finally {
      setCatalogReady(true)
    }
  }, [handleAuth])

  const loadDrivers = useCallback(async () => {
    setDriversLoading(true)
    setDriversError(null)
    try {
      const res = await authFetch('/dashboard/drivers')
      if (handleAuth(res.status)) return
      const data = await res.json() as { drivers?: DriverRow[]; message?: string }
      if (!res.ok) {
        setDrivers([])
        setDriversError(data.message ?? 'Impossible de charger les livreurs')
        return
      }
      setDrivers(data.drivers ?? [])
    } catch {
      setDrivers([])
      setDriversError('Impossible de charger les livreurs')
    } finally {
      setDriversLoading(false)
    }
  }, [handleAuth])

  useEffect(() => {
    void loadDrivers()
    void loadSupermarkets()
  }, [loadDrivers, loadSupermarkets])

  useEffect(() => {
    if (catalogRefreshKey === 0) return
    void loadSupermarkets()
  }, [catalogRefreshKey, loadSupermarkets])

  const addStop = () => setStops((p) => [...p, emptyStop()])
  const removeStop = (idx: number) => {
    const stop = stops[idx]
    const label = stop?.name?.trim() || `arrêt ${idx + 1}`
    if (!confirmDeletion(`Retirer « ${label} » du brouillon de tournée ?`)) return
    setStops((p) => p.filter((_, i) => i !== idx))
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault(); setCreateError(null); setCreating(true)
    const invalidPoint = stops.some((s) => !s.supermarketId?.trim())
    const invalidProducts = stops.some((s) => s.products.filter((p) => p.label.trim()).length === 0)
    const duplicateProducts = stops
      .map((s) => validateStopProducts(s.products, s.name.trim() || undefined))
      .find((msg) => msg != null)
    if (invalidPoint || invalidProducts || duplicateProducts) {
      setCreateError(
        duplicateProducts ??
          (invalidPoint
            ? 'Chaque arrêt doit provenir du catalogue Chantiers.'
            : 'Chaque arrêt doit avoir au moins un produit attendu.'),
      )
      setCreating(false)
      return
    }
    try {
      const createdDate = newTour.date
      const res = await authFetch('/dashboard/tours', {
        method: 'POST',
        body: JSON.stringify({
          driverId: newTour.driverId,
          date: newTour.date,
          depotName: newTour.depotName,
          depotAddress: newTour.depotAddress,
          ...(replanSourceTourId ? { replannedFromTourId: replanSourceTourId } : {}),
          ...(procurementRequestIdRef.current
            ? {
                purchaseRequestId: procurementRequestIdRef.current,
                ...(procurementOrderIdRef.current
                  ? { purchaseOrderId: procurementOrderIdRef.current }
                  : {}),
              }
            : {}),
          stops: stops.map((s) => {
            const sm = supermarkets.find((p) => p.id === s.supermarketId)
            return buildStopApiPayload(s, sm)
          }),
        }),
      })
      const data = await res.json() as { ok?: boolean; message?: string }
      if (!res.ok) throw new Error(data.message ?? 'Erreur')
      setNewTour((p) => ({ ...p, driverId: '', depotName: '', depotAddress: '' }))
      setStops([emptyStop()])
      setReplanSourceDate(null)
      setReplanSourceTourId(null)
      setReplanKind('tour')
      setReplanSessionActive(false)
      procurementRequestIdRef.current = null
      procurementOrderIdRef.current = null
      await fetchTours(createdDate)
      setDate(createdDate)
      onTasksChanged?.()
      onTourCreated?.(createdDate)
    } catch (err) { setCreateError(err instanceof Error ? err.message : 'Erreur') }
    finally { setCreating(false) }
  }

  const dateFr = new Date(date + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <div>
      <Row>
        <Field label="Date à planifier">
          <input type="date" data-testid="mgr-planifier-date" value={date} onChange={(e) => setDate(e.target.value)} style={css.input} />
        </Field>
      </Row>

      <section style={css.section}>
        <h2 style={css.sectionTitle}>Tournées du {dateFr}</h2>
        {tours.length === 0
          ? <EmptyHint>Aucune tournée planifiée pour cette date.</EmptyHint>
          : tours.map((t) => (
            <div key={t.tourId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid var(--border)', gap: 8, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontWeight: 700 }}>{t.driverName}</div>
                <div style={{ fontSize: 12, color: '#6b7280' }}>{t.totalStops} arrêt(s) · {t.delivered} livré(s) · {t.depotName}</div>
                <div style={{ fontSize: 11, color: 'var(--brand)', marginTop: 2 }} data-testid={`mgr-planifier-tour-status-${t.tourId}`}>
                  {tourLifecycleLabel(t.delivered, t.totalStops)}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {t.delivered < t.totalStops && (
                  <button
                    type="button"
                    data-testid={`mgr-planifier-replan-${t.tourId}`}
                    onClick={() => {
                      onInlineReplanStart?.()
                      void loadReplanTemplate(t.tourId, undefined, t.tourDate)
                    }}
                    style={css.btnOutline}
                  >
                    Replanifier
                  </button>
                )}
                <button type="button" onClick={() => setEditTourId(t.tourId)} style={css.btnOutline}>Modifier</button>
                {t.delivered === 0 && (
                  <button
                    type="button"
                    data-testid={`mgr-planifier-delete-${t.tourId}`}
                    onClick={async () => {
                      if (!confirmDeletion(`Supprimer définitivement la tournée de « ${t.driverName} » (${t.totalStops} arrêt${t.totalStops > 1 ? 's' : ''}) ?`)) {
                        return
                      }
                      const res = await authFetch(`/dashboard/tours/${encodeURIComponent(t.tourId)}`, { method: 'DELETE' })
                      const data = (await res.json()) as { message?: string }
                      if (!res.ok) {
                        window.alert(data.message ?? 'Suppression impossible')
                        return
                      }
                      void fetchTours(date)
                      onTourSaved?.(date)
                      onTasksChanged?.()
                    }}
                    style={css.btnDanger}
                  >
                    Supprimer
                  </button>
                )}
              </div>
            </div>
          ))
        }
      {editTourId && (
        <EditTourModal
          tourId={editTourId}
          drivers={drivers}
          supermarkets={supermarkets}
          onClose={() => setEditTourId(null)}
          onSaved={(savedDate) => {
            setEditTourId(null)
            if (savedDate !== date) setDate(savedDate)
            void fetchTours(savedDate)
            onTourSaved?.(savedDate)
            onTasksChanged?.()
          }}
        />
      )}
      </section>

      <section ref={createFormRef} style={css.section}>
        <h2 style={css.sectionTitle} data-testid="mgr-planifier-form-title">Planifier une tournée</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 0, marginBottom: '1rem' }}>
          Crée une tournée, assigne les livraisons au livreur et lui envoie un SMS. Les chantiers viennent de l’onglet « Chantiers » ; les quantités se saisissent dans « Produits attendus ». Après création, redirection vers Suivi livraisons.
        </p>

        {(isReplanActive) && (
          <ReplanBanner
            sourceDate={replanSourceDate ?? initialReplanHintDate ?? date}
            targetDate={newTour.date}
            kind={replanKind}
            loading={replanLoading}
            onDismiss={cancelReplan}
          />
        )}
        {createError && <AlertBox>{createError}</AlertBox>}
        {replanSourceDate && <StopsValidationHint stops={stops} />}

        <form onSubmit={(e) => void handleCreate(e)} data-testid="mgr-planifier-form">
          <Row>
            <Field label="Date de tournée *" style={{ flex: 1 }}>
              <input type="date" value={newTour.date} required style={css.input} onChange={(e) => setNewTour((p) => ({ ...p, date: e.target.value }))} />
            </Field>
            <Field label="Livreur *" style={{ flex: 2 }}>
              <select
                data-testid="mgr-create-driver"
                value={newTour.driverId}
                required
                disabled={driversLoading || drivers.filter((d) => d.status === 'active').length === 0}
                style={css.input}
                onChange={(e) => setNewTour((p) => ({ ...p, driverId: e.target.value }))}
              >
                <option value="">
                  {driversLoading
                    ? 'Chargement des livreurs…'
                    : drivers.filter((d) => d.status === 'active').length === 0
                      ? 'Aucun livreur actif'
                      : 'Choisir un livreur'}
                </option>
                {drivers.filter((d) => d.status === 'active').map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
              {driversError && (
                <p style={{ margin: '0.35rem 0 0', fontSize: 13, color: 'var(--color-danger, #b91c1c)' }}>
                  {driversError}{' '}
                  <button
                    type="button"
                    onClick={() => void loadDrivers()}
                    style={{ ...css.btnOutline, padding: '2px 8px', fontSize: 13 }}
                  >
                    Réessayer
                  </button>
                </p>
              )}
              {!driversLoading && !driversError && drivers.filter((d) => d.status === 'active').length === 0 && (
                <p style={{ margin: '0.35rem 0 0', fontSize: 13, color: 'var(--color-muted, #64748b)' }}>
                  Ajoutez ou réactivez un livreur dans l’onglet Équipe.
                </p>
              )}
            </Field>
          </Row>
          <Row>
            <Field label="Créneau début">
              <input type="time" value={newTour.tourStart} style={css.input} onChange={(e) => setNewTour((p) => ({ ...p, tourStart: e.target.value }))} />
            </Field>
            <Field label="Créneau fin">
              <input type="time" value={newTour.tourEnd} style={css.input} onChange={(e) => setNewTour((p) => ({ ...p, tourEnd: e.target.value }))} />
            </Field>
          </Row>
          <Row>
            <Field label={useFournisseurLabels ? 'Fournisseur *' : 'Nom du dépôt *'} style={{ flex: 1 }}>
              <input type="text" data-testid="mgr-create-depot" value={newTour.depotName} required placeholder={useFournisseurLabels ? 'Ex: CimIvoire' : 'Ex: Entrepôt Nord'} style={css.input} onChange={(e) => setNewTour((p) => ({ ...p, depotName: e.target.value }))} />
            </Field>
          </Row>
          <Row>
            <Field label={useFournisseurLabels ? 'Adresse du fournisseur *' : 'Adresse du dépôt *'} style={{ flex: 1 }}>
              <input type="text" data-testid="mgr-create-depot-address" value={newTour.depotAddress} required placeholder={useFournisseurLabels ? 'Adresse du fournisseur' : '12 Rue des Logistiques, Abidjan…'} style={css.input} onChange={(e) => setNewTour((p) => ({ ...p, depotAddress: e.target.value }))} />
            </Field>
          </Row>

          <div style={{ marginTop: '1.5rem' }}>
            <h3 style={{ margin: '0 0 0.75rem', fontSize: 15, fontWeight: 700 }}>Arrêts / livraisons</h3>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 0.75rem' }}>Plusieurs produits par arrêt. Chaque arrêt = un magasin, un OTP à la livraison.</p>

            {stops.map((s, idx) => (
              <TourStopFormCard
                key={`${formVersion}-${idx}`}
                stop={s}
                index={idx}
                supermarkets={supermarkets}
                catalogRefreshKey={catalogRefreshKey}
                canRemove={stops.length > 1}
                onRemove={() => removeStop(idx)}
                onChange={(next) => setStops((prev) => prev.map((st, i) => i === idx ? next : st))}
              />
            ))}
            <button type="button" onClick={addStop} style={{ ...css.btnOutline, marginBottom: '1rem' }}>+ Ajouter un arrêt</button>
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button type="submit" data-testid="mgr-create-tour" disabled={creating} style={css.btnGold}>
              {creating ? 'Création…' : replanSourceDate
                ? (replanKind === 'partial' ? 'Créer la tournée pour le reliquat' : 'Créer la tournée replanifiée')
                : 'Créer la tournée et notifier le livreur'}
            </button>
            <button type="button" data-testid="mgr-replan-cancel" onClick={cancelReplan} style={css.btnGhost}>
              {isReplanActive ? 'Annuler la replanification' : 'Annuler'}
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}

// ─── Tab: Livreurs ────────────────────────────────────────────────────────────

function LivreursTab({ handleAuth, onTasksChanged }: { handleAuth: (s: number) => boolean; onTasksChanged?: () => void }) {
  const [drivers, setDrivers] = useState<DriverRow[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ name: '', phone: '', pin: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editId, setEditId] = useState<string | null>(null)

  const fetchDrivers = useCallback(async () => {
    setLoading(true)
    try {
      const res = await authFetch('/dashboard/drivers')
      if (handleAuth(res.status)) return
      const data = await res.json() as { drivers: DriverRow[] }
      setDrivers(data.drivers ?? [])
    } finally {
      setLoading(false)
    }
  }, [handleAuth])

  useEffect(() => { void fetchDrivers() }, [fetchDrivers])

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault(); setError(null); setSaving(true)
    try {
      const res = await authFetch('/dashboard/drivers', { method: 'POST', body: JSON.stringify(form) })
      const data = await res.json() as { ok?: boolean; message?: string }
      if (!res.ok) throw new Error(data.message ?? 'Erreur')
      setForm({ name: '', phone: '', pin: '' })
      toast.success('Livreur ajouté avec succès.')
      await fetchDrivers()
    } catch (err) { setError(err instanceof Error ? err.message : 'Erreur') }
    finally { setSaving(false) }
  }

  const toggleStatus = async (d: DriverRow) => {
    const newStatus = d.status === 'active' ? 'suspended' : 'active'
    if (newStatus === 'suspended') {
      if (!confirmDeletion(`Désactiver le livreur « ${d.name} » ? Il ne pourra plus se connecter.`)) return
    }
    await authFetch(`/dashboard/drivers/${d.id}`, { method: 'PATCH', body: JSON.stringify({ status: newStatus }) })
    await fetchDrivers()
    if (newStatus === 'suspended') onTasksChanged?.()
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: '2rem', alignItems: 'start' }}>
      <section style={css.section}>
        <h2 style={css.sectionTitle}>Ajouter un livreur</h2>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 1rem' }}>Créez un compte livreur (téléphone + PIN pour la PWA) ou modifiez un livreur existant.</p>
        {error && <AlertBox>{error}</AlertBox>}
        <form onSubmit={(e) => void handleAdd(e)}>
          <h3 style={{ fontSize: 14, margin: '0 0 0.75rem' }}>Nouveau livreur</h3>
          <Field label="Nom *"><input type="text" value={form.name} required style={css.input} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} /></Field>
          <div style={{ marginBottom: 8 }} />
          <Field label="Téléphone *">
            <input
              type="tel"
              name="new-driver-phone"
              autoComplete="off"
              value={form.phone}
              required
              placeholder={CI_PHONE_PLACEHOLDER}
              title={CI_PHONE_INPUT_TITLE}
              style={css.input}
              onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
            />
          </Field>
          <div style={{ marginBottom: 8 }} />
          <Field label="PIN *">
            <input
              type="password"
              name="new-driver-pin"
              autoComplete="new-password"
              value={form.pin}
              required
              minLength={4}
              maxLength={8}
              style={css.input}
              onChange={(e) => setForm((p) => ({ ...p, pin: e.target.value }))}
            />
          </Field>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button type="submit" disabled={saving} style={css.btnGold}>{saving ? 'Ajout…' : 'Ajouter le livreur'}</button>
            <button type="button" onClick={() => setForm({ name: '', phone: '', pin: '' })} style={css.btnGhost}>Annuler</button>
          </div>
        </form>
      </section>

      <section style={css.section}>
        <h3 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 1rem' }}>Livreurs enregistrés</h3>
        {loading && <LoadingHint>Chargement des livreurs…</LoadingHint>}
        {!loading && drivers.length === 0 && (
          <EmptyHint>Aucun livreur enregistré. Ajoutez-en un à gauche.</EmptyHint>
        )}
        {!loading && drivers.length > 0 && (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead><tr style={{ background: '#f5f0e8' }}>
              {['Nom', 'Téléphone', 'Statut', ''].map((h) => <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.8 }}>{h}</th>)}
            </tr></thead>
            <tbody>{drivers.map((d, i) => (
              <tr key={d.id} style={{ borderTop: '1px solid var(--border)', background: i % 2 === 0 ? '#fff' : '#faf8f5' }}>
                <td style={css.td}>{d.name}</td>
                <td style={css.td}>{d.phone}</td>
                <td style={css.td}><Toggle active={d.status === 'active'} onChange={() => void toggleStatus(d)} /></td>
                <td style={css.td}><button type="button" onClick={() => setEditId(d.id)} style={css.btnOutline}>Modifier</button></td>
              </tr>
            ))}</tbody>
          </table>
        )}
        {editId && <EditDriverModal id={editId} drivers={drivers} onClose={() => { setEditId(null); void fetchDrivers() }} />}
      </section>
    </div>
  )
}

// ─── Tab: Gestionnaires ───────────────────────────────────────────────────────

function GestionnairesTab({
  handleAuth,
  currentManagerId,
}: {
  handleAuth: (s: number) => boolean
  currentManagerId: string
}) {
  const [managers, setManagers] = useState<ManagerRow[]>([])
  const [invites, setInvites] = useState<ManagerInviteRow[]>([])
  const [form, setForm] = useState({ name: '', email: '', procurementRole: '' })
  const [lastInviteLink, setLastInviteLink] = useState<{ url: string; email: string } | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editId, setEditId] = useState<string | null>(null)

  const fetchManagers = useCallback(async () => {
    const res = await authFetch('/dashboard/managers')
    if (handleAuth(res.status)) return
    const data = await res.json() as { managers: ManagerRow[] }
    setManagers(data.managers ?? [])
  }, [handleAuth])

  const fetchInvites = useCallback(async () => {
    const res = await authFetch('/dashboard/managers/invites')
    if (handleAuth(res.status)) return
    const data = await res.json() as { invites: ManagerInviteRow[] }
    setInvites(data.invites ?? [])
  }, [handleAuth])

  const refreshAll = useCallback(async () => {
    await Promise.all([fetchManagers(), fetchInvites()])
  }, [fetchManagers, fetchInvites])

  useEffect(() => { void refreshAll() }, [refreshAll])

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSaving(true)
    try {
      const res = await authFetch('/dashboard/managers/invite', { method: 'POST', body: JSON.stringify(form) })
      const data = await res.json() as { ok?: boolean; message?: string; inviteUrl?: string }
      if (!res.ok) throw new Error(data.message ?? 'Erreur')
      setForm({ name: '', email: '', procurementRole: '' })
      if (data.inviteUrl) setLastInviteLink({ url: data.inviteUrl, email: form.email })
      toast.success('Invitation créée. Si l’e-mail n’arrive pas, copiez le lien affiché ci-dessous.')
      await refreshAll()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur')
    } finally {
      setSaving(false)
    }
  }

  const cancelInvite = async (invite: ManagerInviteRow) => {
    if (!confirmDeletion(`Annuler l'invitation pour « ${invite.email} » ?`)) return
    const res = await authFetch(`/dashboard/managers/invites/${encodeURIComponent(invite.id)}`, { method: 'DELETE' })
    if (handleAuth(res.status)) return
    await refreshAll()
  }

  const resendInvite = async (invite: ManagerInviteRow) => {
    const res = await authFetch(`/dashboard/managers/invites/${encodeURIComponent(invite.id)}/resend`, { method: 'POST' })
    if (handleAuth(res.status)) return
    const data = (await res.json()) as { message?: string; inviteUrl?: string }
    if (!res.ok) {
      toast.error(data.message ?? 'Renvoi impossible')
      return
    }
    if (data.inviteUrl) setLastInviteLink({ url: data.inviteUrl, email: invite.email })
    toast.success('Invitation renvoyée. Lien affiché ci-dessous si besoin.')
    await refreshAll()
  }

  const removeManager = async (m: ManagerRow) => {
    if (m.id === currentManagerId) {
      window.alert('Vous ne pouvez pas supprimer votre propre compte.')
      return
    }
    if (!confirmDeletion(`Supprimer le gestionnaire « ${m.name} » (${m.email}) ?`)) return
    const res = await authFetch(`/dashboard/managers/${encodeURIComponent(m.id)}`, { method: 'DELETE' })
    if (handleAuth(res.status)) return
    const data = (await res.json()) as { message?: string }
    if (!res.ok) {
      toast.error(data.message ?? 'Suppression impossible')
      return
    }
    toast.success('Gestionnaire supprimé.')
    await refreshAll()
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: '2rem', alignItems: 'start' }}>
      <section style={css.section}>
        <h2 style={css.sectionTitle}>Inviter un gestionnaire</h2>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 1rem' }}>
          Un e-mail d&apos;invitation sera envoyé. Le collègue choisira son mot de passe via un lien sécurisé (valable 72 h).
        </p>
        {error && <AlertBox>{error}</AlertBox>}
        <form onSubmit={(e) => void handleInvite(e)}>
          <Field label="Nom *">
            <input type="text" value={form.name} required style={css.input} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} data-testid="mgr-invite-name" />
          </Field>
          <div style={{ marginBottom: 8 }} />
          <Field label="E-mail *">
            <input
              type="email"
              value={form.email}
              required
              autoComplete="off"
              style={css.input}
              data-testid="mgr-invite-email"
              onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
            />
          </Field>
          <div style={{ marginBottom: 8 }} />
          <Field label="Rôle (optionnel)">
            <select
              value={form.procurementRole}
              style={css.input}
              data-testid="mgr-invite-role"
              onChange={(e) => setForm((p) => ({ ...p, procurementRole: e.target.value }))}
            >
              <option value="">— Gestionnaire général —</option>
              <option value="site_manager">Chef de chantier</option>
              <option value="technical_director">Directeur technique (DT)</option>
              <option value="site_controller">Conducteur de travaux</option>
              <option value="purchasing">Service achats</option>
              <option value="controle_gestion">Contrôle de gestion</option>
              <option value="daf">DAF</option>
              <option value="pdg">PDG</option>
            </select>
          </Field>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button type="submit" disabled={saving} style={css.btnGold} data-testid="mgr-invite-send">{saving ? 'Envoi…' : 'Envoyer l\'invitation'}</button>
            <button type="button" onClick={() => setForm({ name: '', email: '', procurementRole: '' })} style={css.btnGhost}>Annuler</button>
          </div>
        </form>
        {lastInviteLink && (
          <div style={{ marginTop: 16, background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '0.75rem', fontSize: 13 }}>
            <strong>Lien d'invitation pour {lastInviteLink.email}</strong>
            <p style={{ margin: '0.5rem 0', wordBreak: 'break-all' }}>
              Si l'e-mail n'arrive pas (configuration e-mail incomplète), copiez ce lien et envoyez-le à la personne (WhatsApp, SMS…) :
            </p>
            <code style={{ display: 'block', fontSize: 12, wordBreak: 'break-all', background: '#fff', padding: 6, borderRadius: 4 }}>{lastInviteLink.url}</code>
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button
                type="button"
                style={css.btnGhost}
                onClick={() => {
                  void navigator.clipboard.writeText(lastInviteLink.url)
                  toast.success('Lien copié')
                }}
              >
                Copier le lien
              </button>
              <button type="button" style={css.btnGhost} onClick={() => setLastInviteLink(null)}>Masquer</button>
            </div>
          </div>
        )}
      </section>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        {invites.length > 0 && (
          <section style={css.section}>
            <h3 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 1rem' }}>Invitations en attente</h3>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f5f0e8' }}>
                  {['Nom', 'E-mail', 'Expire', ''].map((h) => (
                    <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: 0.8 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {invites.map((inv, i) => (
                  <tr key={inv.id} style={{ borderTop: '1px solid var(--border)', background: i % 2 === 0 ? '#fff' : '#faf8f5' }}>
                    <td style={css.td}>{inv.name}</td>
                    <td style={css.td}>{inv.email}</td>
                    <td style={css.td}>{new Date(inv.expiresAt).toLocaleString('fr-FR')}</td>
                    <td style={css.td}>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button type="button" onClick={() => void resendInvite(inv)} style={css.btnOutline}>Renvoyer</button>
                        <button type="button" onClick={() => void cancelInvite(inv)} style={css.btnDanger}>Annuler</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        <section style={css.section}>
          <h3 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 1rem' }}>Gestionnaires de l&apos;entreprise</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f5f0e8' }}>
                {['Nom', 'E-mail', 'Rôle', ''].map((h) => (
                  <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: 0.8 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {managers.map((m, i) => (
                <tr key={m.id} style={{ borderTop: '1px solid var(--border)', background: i % 2 === 0 ? '#fff' : '#faf8f5' }}>
                  <td style={css.td}>
                    {m.name}
                    {m.id === currentManagerId && (
                      <span style={{ marginLeft: 8, fontSize: 11, color: '#0b4a2c', fontWeight: 700 }}>(vous)</span>
                    )}
                  </td>
                  <td style={css.td}>{m.email}</td>
                  <td style={css.td}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: m.role === 'admin' ? '#0b4a2c' : '#6b7280' }}>
                      {m.role === 'admin' ? 'Admin' : 'Gestionnaire'}
                    </span>
                  </td>
                  <td style={css.td}>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <button type="button" onClick={() => setEditId(m.id)} style={css.btnOutline}>Modifier</button>
                      {m.id !== currentManagerId && (
                        <button type="button" onClick={() => void removeManager(m)} style={css.btnDanger}>Supprimer</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {managers.length === 0 && <EmptyHint>Aucun gestionnaire enregistré.</EmptyHint>}
          {editId && (
            <EditManagerModal
              id={editId}
              managers={managers}
              onClose={() => { setEditId(null); void refreshAll() }}
            />
          )}
        </section>
      </div>
    </div>
  )
}

// ─── Tab: Chantiers ───────────────────────────────────────────────────────────

function PointsTab({
  handleAuth,
  onPointsChanged,
}: {
  handleAuth: (s: number) => boolean
  onPointsChanged?: () => void
}) {
  const [points, setPoints] = useState<Supermarket[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({
    name: '',
    address: '',
    contactPhone: '',
    contactName: '',
    contactEmail: '',
    lat: '',
    lng: '',
    siteType: 'prive',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editId, setEditId] = useState<string | null>(null)

  const emptyChantierForm = {
    name: '',
    address: '',
    contactPhone: '',
    contactName: '',
    contactEmail: '',
    lat: '',
    lng: '',
    siteType: 'prive',
  }

  const fetchPoints = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetchSupermarkets()
      if (handleAuth(res.status)) return
      const data = await res.json() as { supermarkets?: Supermarket[]; message?: string }
      if (!res.ok) throw new Error(data.message ?? 'Impossible de charger les chantiers.')
      setPoints(normalizeSupermarkets(data.supermarkets ?? []))
    } catch (err) {
      setPoints([])
      setError(err instanceof Error ? err.message : 'Impossible de charger les chantiers.')
    } finally {
      setLoading(false)
    }
  }, [handleAuth])

  useEffect(() => {
    void fetchPoints()
  }, [fetchPoints])

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault(); setError(null); setSaving(true)
    try {
      const email = form.contactEmail.trim()
      if (!email) throw new Error('E-mail responsable obligatoire.')
      if (!isValidContactEmail(email)) throw new Error('E-mail responsable invalide.')
      const payload = {
        name: form.name.trim(),
        address: form.address.trim(),
        contactPhone: form.contactPhone.trim(),
        contactName: form.contactName.trim() || undefined,
        contactEmail: normalizeContactEmail(email),
        lat: form.lat.trim() || undefined,
        lng: form.lng.trim() || undefined,
        siteType: isSiteType(form.siteType) ? form.siteType : 'prive',
      }
      const res = await authFetch('/dashboard/supermarkets', { method: 'POST', body: JSON.stringify(payload) })
      const data = await res.json() as { ok?: boolean; message?: string }
      if (!res.ok) throw new Error(data.message ?? 'Erreur')
      setForm(emptyChantierForm)
      toast.success('Chantier ajouté avec succès.')
      await fetchPoints()
      onPointsChanged?.()
    } catch (err) { setError(err instanceof Error ? err.message : 'Erreur') }
    finally { setSaving(false) }
  }

  const toggleActive = async (p: Supermarket) => {
    const currentlyActive = isSupermarketActive(p.active)
    const nextActive = !currentlyActive
    if (currentlyActive && !confirmDeletion(`Désactiver le chantier « ${p.name} » ?`)) return
    setError(null)
    setPoints((prev) => prev.map((x) => (x.id === p.id ? { ...x, active: nextActive } : x)))
    try {
      const res = await setSupermarketActiveState(p.id, nextActive)
      if (handleAuth(res.status)) return
      const body = await res.json() as { message?: string; supermarket?: Supermarket }
      if (!res.ok) throw new Error(body.message ?? 'Impossible de modifier le statut du chantier.')
      if (body.supermarket) {
        setPoints((prev) => prev.map((x) => (x.id === p.id ? normalizeSupermarket(body.supermarket!) : x)))
      }
      onPointsChanged?.()
    } catch (err) {
      setPoints((prev) => prev.map((x) => (x.id === p.id ? { ...x, active: currentlyActive } : x)))
      setError(err instanceof Error ? err.message : 'Impossible de modifier le statut du chantier.')
    }
  }

  const changeSiteType = async (p: Supermarket, siteType: string) => {
    if (!isSiteType(siteType)) return
    const previous = isSiteType(p.siteType) ? p.siteType : 'prive'
    setPoints((prev) => prev.map((x) => (x.id === p.id ? { ...x, siteType } : x)))
    try {
      const res = await authFetch(`/dashboard/supermarkets/${p.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ siteType }),
      })
      if (handleAuth(res.status)) return
      const body = await res.json() as { message?: string; supermarket?: Supermarket }
      if (!res.ok) throw new Error(body.message ?? 'Impossible de modifier le type.')
      if (body.supermarket) {
        setPoints((prev) => prev.map((x) => (x.id === p.id ? normalizeSupermarket(body.supermarket!) : x)))
      }
    } catch (err) {
      setPoints((prev) => prev.map((x) => (x.id === p.id ? { ...x, siteType: previous } : x)))
      setError(err instanceof Error ? err.message : 'Impossible de modifier le type.')
    }
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 380px) 1fr', gap: '2rem', alignItems: 'start' }}>
      <section style={css.section}>
        <h2 style={css.sectionTitle}>Ajouter un chantier</h2>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 1rem' }}>
          Enregistrez un chantier (adresse, contact OTP, type Privé ou Public). Les coordonnées GPS pour le géofencing sont <strong>déduites automatiquement de l&apos;adresse</strong> ; vous pouvez les ajuster manuellement si besoin.
        </p>
        {error && <AlertBox>{error}</AlertBox>}
        <form onSubmit={(e) => void handleAdd(e)}>
          <h3 style={{ fontSize: 14, margin: '0 0 0.75rem' }}>Nouveau chantier</h3>
          <Field label="Nom *"><input type="text" value={form.name} required style={css.input} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} /></Field>
          <div style={{ marginBottom: 8 }} />
          <Field label="Type">
            <select
              value={form.siteType}
              style={css.input}
              data-testid="mgr-chantier-type-new"
              onChange={(e) => setForm((p) => ({ ...p, siteType: e.target.value }))}
            >
              {SITE_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </Field>
          <div style={{ marginBottom: 8 }} />
          <Field label="Adresse *"><input type="text" value={form.address} required style={css.input} onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))} /></Field>
          <p style={{ fontSize: 11, color: '#999', margin: '2px 0 8px' }}>Ville et pays recommandés pour un géocodage fiable (ex. « 123 rue Example, Abidjan, Côte d&apos;Ivoire »).</p>
          <Row>
            <Field label="Tél. responsable (OTP) *">
              <input
                type="tel"
                value={form.contactPhone}
                required
                placeholder={CI_PHONE_PLACEHOLDER}
                title={CI_PHONE_INPUT_TITLE}
                style={css.input}
                onChange={(e) => setForm((p) => ({ ...p, contactPhone: e.target.value }))}
              />
            </Field>
            <Field label="Nom responsable"><input type="text" value={form.contactName} style={css.input} onChange={(e) => setForm((p) => ({ ...p, contactName: e.target.value }))} /></Field>
          </Row>
          <div style={{ marginBottom: 8 }} />
          <Field label="E-mail responsable *"><input type="email" required value={form.contactEmail} style={css.input} onChange={(e) => setForm((p) => ({ ...p, contactEmail: e.target.value }))} /></Field>
          <div style={{ marginBottom: 10 }} />
          <button type="button" disabled style={{ ...css.btnOutline, opacity: 0.5, marginBottom: 8 }}>Prévisualiser le GPS depuis l&apos;adresse</button>
          <Row>
            <Field label="Latitude (optionnel)"><input type="text" value={form.lat} placeholder="auto" style={css.input} onChange={(e) => setForm((p) => ({ ...p, lat: e.target.value }))} /></Field>
            <Field label="Longitude (optionnel)"><input type="text" value={form.lng} placeholder="auto" style={css.input} onChange={(e) => setForm((p) => ({ ...p, lng: e.target.value }))} /></Field>
          </Row>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button type="submit" disabled={saving} style={css.btnGold}>{saving ? 'Ajout…' : 'Ajouter le chantier'}</button>
            <button type="button" onClick={() => setForm(emptyChantierForm)} style={css.btnGhost}>Annuler</button>
          </div>
        </form>
      </section>

      <section style={css.section}>
        <h3 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 1rem' }}>Chantiers enregistrés</h3>
        {loading && <LoadingHint>Chargement des chantiers…</LoadingHint>}
        {!loading && error && <AlertBox>{error} <button type="button" onClick={() => void fetchPoints()} style={{ ...css.btnOutline, marginLeft: 8 }}>Réessayer</button></AlertBox>}
        {!loading && !error && (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead><tr style={{ background: '#f5f0e8' }}>
            {['Nom', 'Type', 'Adresse', 'GPS', 'Statut', ''].map((h) => <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: 0.8 }}>{h}</th>)}
          </tr></thead>
          <tbody>{points.map((p, i) => {
            const active = isSupermarketActive(p.active)
            const siteType = isSiteType(p.siteType) ? p.siteType : 'prive'
            return (
            <tr key={p.id} style={{ borderTop: '1px solid var(--border)', background: i % 2 === 0 ? '#fff' : '#faf8f5', opacity: active ? 1 : 0.72 }}>
              <td style={css.td}>{p.name}</td>
              <td style={css.td}>
                <select
                  value={siteType}
                  style={{ ...css.input, minWidth: 110, padding: '4px 8px' }}
                  data-testid={`mgr-chantier-type-${p.id}`}
                  onChange={(e) => void changeSiteType(p, e.target.value)}
                >
                  {SITE_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </td>
              <td style={{ ...css.td, maxWidth: 200, fontSize: 12 }}>{p.address}</td>
              <td style={css.td}>{p.lat && p.lng ? `${p.lat}, ${p.lng}` : '—'}</td>
              <td style={css.td}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Toggle active={active} onChange={() => void toggleActive(p)} />
                  <span data-testid={`mgr-point-status-${p.id}`} style={{ fontSize: 12, fontWeight: 600, color: active ? '#0b4a2c' : '#9ca3af' }}>
                    {active ? 'Actif' : 'Inactif'}
                  </span>
                </div>
              </td>
              <td style={css.td}><button type="button" onClick={() => setEditId(p.id)} style={css.btnOutline}>Modifier</button></td>
            </tr>
          )})}</tbody>
        </table>
        )}
        {editId && (
          <EditSupermarketModal
            id={editId}
            points={points}
            onClose={() => { setEditId(null); void fetchPoints() }}
          />
        )}
        {!loading && !error && points.length === 0 && <EmptyHint>Aucun chantier enregistré.</EmptyHint>}
      </section>
    </div>
  )
}

// ─── Tab: Catalogue produits ──────────────────────────────────────────────────

function ProduitsTab({
  handleAuth,
  onCatalogChanged,
  catalogRefreshKey = 0,
}: {
  handleAuth: (s: number) => boolean
  onCatalogChanged?: () => void
  catalogRefreshKey?: number
}) {
  const { activeUnits, loading: unitsLoading } = useCompanyUnits(catalogRefreshKey)
  const [prods, setProds] = useState<ProductRow[]>([])
  const [form, setForm] = useState({ label: '', unit: 'palette', displayOrder: '0' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editId, setEditId] = useState<string | null>(null)

  const fetchProds = useCallback(async () => {
    const res = await authFetch('/dashboard/products')
    if (handleAuth(res.status)) return
    const data = await res.json() as { products: ProductRow[] }
    setProds(data.products ?? [])
  }, [handleAuth])

  useEffect(() => { void fetchProds() }, [fetchProds])

  useEffect(() => {
    if (activeUnits.length > 0 && !activeUnits.some((u) => u.code === form.unit)) {
      setForm((p) => ({ ...p, unit: activeUnits[0]!.code }))
    }
  }, [activeUnits, form.unit])

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault(); setError(null); setSaving(true)
    try {
      const res = await authFetch('/dashboard/products', { method: 'POST', body: JSON.stringify({ label: form.label.trim(), unit: form.unit, displayOrder: Number(form.displayOrder) || 0 }) })
      const data = await res.json() as { ok?: boolean; message?: string; product?: ProductRow }
      if (!res.ok) throw new Error(data.message ?? 'Erreur')
      setForm({ label: '', unit: 'palette', displayOrder: '0' })
      toast.success('Produit ajouté.')
      if (data.product) {
        setProds((prev) => [...prev.filter((p) => p.id !== data.product!.id), data.product!])
      }
      await fetchProds()
      onCatalogChanged?.()
    } catch (err) { setError(err instanceof Error ? err.message : 'Erreur') }
    finally { setSaving(false) }
  }

  const toggleActive = async (p: ProductRow) => {
    if (p.active && !confirmDeletion(`Désactiver le produit « ${p.label} » ?`)) return
    await authFetch(`/dashboard/products/${p.id}`, { method: 'PATCH', body: JSON.stringify({ active: !p.active }) })
    await fetchProds()
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: '2rem', alignItems: 'start' }}>
      <section style={css.section}>
        <h2 style={css.sectionTitle}>Catalogue produits</h2>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 1rem' }}>Référentiel partagé entre tous les gérants de votre entreprise. Les produits actifs apparaissent dans <em>Planifier une tournée</em> et dans la déclaration livreur (livraison partielle).</p>
        {error && <AlertBox>{error}</AlertBox>}
        <form onSubmit={(e) => void handleAdd(e)}>
          <h3 style={{ fontSize: 14, margin: '0 0 0.75rem' }}>Nouveau produit</h3>
          <Field label="Libellé *"><input type="text" value={form.label} required placeholder="ex. Œufs bio calibre L" style={css.input} onChange={(e) => setForm((p) => ({ ...p, label: e.target.value }))} /></Field>
          <div style={{ marginBottom: 8 }} />
          <Field label="Unité *">
            <select value={form.unit} required disabled={unitsLoading || activeUnits.length === 0} style={css.input} onChange={(e) => setForm((p) => ({ ...p, unit: e.target.value }))}>
              {activeUnits.map((u) => <option key={u.id} value={u.code}>{u.label}</option>)}
            </select>
          </Field>
          {activeUnits.length === 0 && !unitsLoading && (
            <p style={{ fontSize: 12, color: '#b45309', margin: '0 0 8px' }}>Ajoutez d&apos;abord une unité dans l&apos;onglet « Unités de mesure ».</p>
          )}
          <div style={{ marginBottom: 8 }} />
          <Field label="Ordre d'affichage"><input type="number" value={form.displayOrder} min="0" style={css.input} onChange={(e) => setForm((p) => ({ ...p, displayOrder: e.target.value }))} /></Field>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button type="submit" disabled={saving} style={css.btnGold}>{saving ? 'Ajout…' : 'Ajouter le produit'}</button>
            <button type="button" onClick={() => setForm({ label: '', unit: 'palette', displayOrder: '0' })} style={css.btnGhost}>Annuler</button>
          </div>
        </form>
      </section>

      <section style={css.section}>
        <h3 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 1rem' }}>Produits enregistrés</h3>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead><tr style={{ background: '#f5f0e8' }}>
            {['Libellé', 'Unité', 'Ordre', 'Statut', ''].map((h) => <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: 0.8 }}>{h}</th>)}
          </tr></thead>
          <tbody>{prods.map((p, i) => (
            <tr key={p.id} style={{ borderTop: '1px solid var(--border)', background: i % 2 === 0 ? '#fff' : '#faf8f5' }}>
              <td style={css.td}>{p.label}</td>
              <td style={css.td}>{p.unit}</td>
              <td style={css.td}>{p.displayOrder}</td>
              <td style={css.td}><Toggle active={p.active} onChange={() => void toggleActive(p)} /></td>
              <td style={css.td}><button onClick={() => setEditId(p.id)} style={css.btnOutline}>Modifier</button></td>
            </tr>
          ))}</tbody>
        </table>
        {editId && (
          <EditProductModal
            id={editId}
            products={prods}
            units={activeUnits}
            onClose={() => { setEditId(null); void fetchProds() }}
          />
        )}
        {prods.length === 0 && <EmptyHint>Aucun produit enregistré.</EmptyHint>}
      </section>
    </div>
  )
}

// ─── Tab: Unités de mesure ────────────────────────────────────────────────────

function UnitesTab({
  handleAuth,
  onCatalogChanged,
}: {
  handleAuth: (s: number) => boolean
  onCatalogChanged?: () => void
}) {
  const [units, setUnits] = useState<UnitRow[]>([])
  const [form, setForm] = useState({ code: '', label: '', displayOrder: '0' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editId, setEditId] = useState<string | null>(null)

  const fetchUnits = useCallback(async () => {
    const res = await authFetch('/dashboard/units')
    if (handleAuth(res.status)) return
    const data = await res.json() as { units: UnitRow[] }
    setUnits(data.units ?? [])
  }, [handleAuth])

  useEffect(() => { void fetchUnits() }, [fetchUnits])

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault(); setError(null); setSaving(true)
    try {
      const res = await authFetch('/dashboard/units', {
        method: 'POST',
        body: JSON.stringify({
          code: form.code.trim() || undefined,
          label: form.label.trim(),
          displayOrder: Number(form.displayOrder) || 0,
        }),
      })
      const data = await res.json() as { ok?: boolean; message?: string; unit?: UnitRow }
      if (!res.ok) throw new Error(data.message ?? 'Erreur')
      setForm({ code: '', label: '', displayOrder: '0' })
      toast.success('Unité ajoutée.')
      if (data.unit) {
        setUnits((prev) => [...prev.filter((u) => u.id !== data.unit!.id), data.unit!])
      }
      await fetchUnits()
      onCatalogChanged?.()
    } catch (err) { setError(err instanceof Error ? err.message : 'Erreur') }
    finally { setSaving(false) }
  }

  const toggleActive = async (u: UnitRow) => {
    if (u.active && !confirmDeletion(`Désactiver l'unité « ${u.label} » ?`)) return
    await authFetch(`/dashboard/units/${u.id}`, { method: 'PATCH', body: JSON.stringify({ active: !u.active }) })
    await fetchUnits()
    onCatalogChanged?.()
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: '2rem', alignItems: 'start' }}>
      <section style={css.section}>
        <h2 style={css.sectionTitle}>Unités de mesure</h2>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 1rem' }}>
          Définissez les unités utilisables dans le catalogue produits et lors de la planification des tournées (palette, fût, litre…).
        </p>
        {error && <AlertBox>{error}</AlertBox>}
        <form onSubmit={(e) => void handleAdd(e)}>
          <h3 style={{ fontSize: 14, margin: '0 0 0.75rem' }}>Nouvelle unité</h3>
          <Field label="Libellé affiché *">
            <input type="text" value={form.label} required placeholder="ex. Fût" style={css.input} onChange={(e) => setForm((p) => ({ ...p, label: e.target.value }))} />
          </Field>
          <div style={{ marginBottom: 8 }} />
          <Field label="Code (optionnel)">
            <input type="text" value={form.code} placeholder="auto depuis le libellé" style={css.input} onChange={(e) => setForm((p) => ({ ...p, code: e.target.value }))} />
          </Field>
          <p style={{ fontSize: 11, color: '#999', margin: '2px 0 8px' }}>Le code est technique (ex. <code>fut</code>) et sert dans les exports et l&apos;API.</p>
          <Field label="Ordre d'affichage">
            <input type="number" value={form.displayOrder} min="0" style={css.input} onChange={(e) => setForm((p) => ({ ...p, displayOrder: e.target.value }))} />
          </Field>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button type="submit" disabled={saving} style={css.btnGold}>{saving ? 'Ajout…' : 'Ajouter l\'unité'}</button>
            <button type="button" onClick={() => setForm({ code: '', label: '', displayOrder: '0' })} style={css.btnGhost}>Annuler</button>
          </div>
        </form>
      </section>

      <section style={css.section}>
        <h3 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 1rem' }}>Unités enregistrées</h3>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead><tr style={{ background: '#f5f0e8' }}>
            {['Libellé', 'Code', 'Ordre', 'Statut', ''].map((h) => <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: 0.8 }}>{h}</th>)}
          </tr></thead>
          <tbody>{units.map((u, i) => (
            <tr key={u.id} style={{ borderTop: '1px solid var(--border)', background: i % 2 === 0 ? '#fff' : '#faf8f5' }}>
              <td style={css.td}>{u.label}</td>
              <td style={css.td}><code>{u.code}</code></td>
              <td style={css.td}>{u.displayOrder}</td>
              <td style={css.td}><Toggle active={u.active} onChange={() => void toggleActive(u)} /></td>
              <td style={css.td}><button onClick={() => setEditId(u.id)} style={css.btnOutline}>Modifier</button></td>
            </tr>
          ))}</tbody>
        </table>
        {editId && (
          <EditUnitModal
            id={editId}
            units={units}
            onClose={() => { setEditId(null); void fetchUnits(); onCatalogChanged?.() }}
          />
        )}
        {units.length === 0 && <EmptyHint>Aucune unité enregistrée.</EmptyHint>}
      </section>
    </div>
  )
}

// ─── Tab: Tâches ──────────────────────────────────────────────────────────────

function TachesTab({
  handleAuth,
  onOpenDelivery,
  onOpenTour,
  onReplanTour,
  onTasksChanged,
}: {
  handleAuth: (s: number) => boolean
  onOpenDelivery?: (deliveryId: string, tourDate?: string) => void
  onOpenTour?: (tourId: string, tourDate?: string) => void
  onReplanTour?: (tourId: string, deliveryId?: string) => void
  onTasksChanged?: () => void
}) {
  const [view, setView] = useState<'pending' | 'resolved'>('pending')
  const [tasks, setTasks] = useState<TaskRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchTasks = useCallback(async () => {
    setLoading(true)
    setError(null)
    const query = view === 'resolved' ? '?status=resolved' : ''
    const res = await authFetch(`/dashboard/manager-tasks${query}`)
    if (handleAuth(res.status)) return
    const data = await res.json() as { tasks: TaskRow[]; count: number }
    setTasks(data.tasks ?? [])
    setLoading(false)
  }, [handleAuth, view])

  useEffect(() => { void fetchTasks() }, [fetchTasks])

  const resolve = async (id: string) => {
    setLoading(true)
    try {
      await authFetch(`/dashboard/manager-tasks/${id}/resolve`, { method: 'POST' })
      await fetchTasks()
      onTasksChanged?.()
    } catch {
      setError('Erreur lors de la clôture de la tâche')
    } finally {
      setLoading(false)
    }
  }

  const taskType = (t: TaskRow) => t.type === 'delivery_partial' ? 'partial_delivery' : t.type === 'delivery_failed' ? 'missed_delivery' : t.type

  const formatResolvedAt = (value?: string | null) => {
    if (!value) return null
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return null
    return d.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })
  }

  return (
    <div>
      <h2 style={{ ...css.sectionTitle, marginBottom: '0.25rem' }}>Tâches gestionnaire</h2>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: '1rem' }}>
        Actions générées automatiquement : livraison confirmée, livraison partielle, livraison annulée par le livreur,
        livraison non effectuée, réaffectation de tournée.
      </p>

      <div style={{ display: 'flex', gap: 4, marginBottom: '1.25rem', borderBottom: '1px solid var(--border)' }}>
        <button
          type="button"
          data-testid="mgr-tasks-pending"
          onClick={() => setView('pending')}
          style={view === 'pending' ? css.tabActive : css.tab}
        >
          En attente
        </button>
        <button
          type="button"
          data-testid="mgr-tasks-resolved"
          onClick={() => setView('resolved')}
          style={view === 'resolved' ? css.tabActive : css.tab}
        >
          Traitées
        </button>
      </div>

      {error && <AlertBox>{error}</AlertBox>}
      {loading && tasks.length === 0 && <LoadingHint />}
      {!loading && tasks.length === 0 && (
        <EmptyHint>
          {view === 'pending' ? 'Aucune tâche en attente.' : 'Aucune tâche traitée pour le moment.'}
        </EmptyHint>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {tasks.map((t) => {
          const type = taskType(t)
          const payload = (t.payload ?? {}) as TaskPayload
          const deliveryId = payload.deliveryId ?? t.deliveryId ?? undefined
          const tourDate = payload.tourDate ?? t.deliveryDate
          const refusedPreview =
            type === 'partial_delivery' && payload.refusedLines?.length
              ? payload.refusedLines.map((l) => `• ${formatPartialTaskLine(l)}`).join('\n')
              : null
          const resolvedLabel = formatResolvedAt(t.resolvedAt)

          const showReplanBtn =
            view === 'pending' &&
            (type === 'partial_delivery' ||
              type === 'missed_delivery' ||
              type === 'delivery_cancelled' ||
              type === 'reassign_tour') &&
            t.relatedTourId &&
            onReplanTour &&
            t.canReplan === true &&
            (type !== 'partial_delivery' || !!deliveryId)

          const showDeliveryBtn =
            (type === 'partial_delivery' ||
              type === 'missed_delivery' ||
              type === 'delivery_confirmed' ||
              type === 'delivery_cancelled' ||
              type === 'otp_manager_assist') &&
            deliveryId &&
            onOpenDelivery

          const showTourBtn =
            (type === 'reassign_tour' || type === 'missed_delivery' || type === 'delivery_cancelled') &&
            t.relatedTourId &&
            onOpenTour

          return (
            <div
              key={t.id}
              data-testid={`mgr-task-${t.id}`}
              style={{
                background: '#fff',
                border: '1px solid var(--border)',
                borderRadius: 10,
                padding: '1rem 1.25rem',
                boxShadow: '0 1px 3px rgba(0,0,0,.04)',
                opacity: view === 'resolved' ? 0.95 : 1,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', marginBottom: 4 }}>
                <div style={{ fontWeight: 700 }}>{t.title || t.description}</div>
                {view === 'resolved' && resolvedLabel && (
                  <span style={{ fontSize: 11, color: '#6b7280', whiteSpace: 'nowrap' }}>
                    Traitée le {resolvedLabel}
                  </span>
                )}
              </div>
              {t.description && t.title && (
                <p style={{ fontSize: 13, color: '#666', margin: '0 0 8px', whiteSpace: 'pre-wrap' }}>{t.description}</p>
              )}
              {refusedPreview && (
                <pre style={{ fontSize: 12, color: '#444', background: '#f9fafb', padding: 8, borderRadius: 6, margin: '0 0 10px', whiteSpace: 'pre-wrap' }}>{refusedPreview}</pre>
              )}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {showDeliveryBtn && (
                  <button
                    type="button"
                    style={css.btnGold}
                    onClick={() => onOpenDelivery!(deliveryId!, tourDate)}
                  >
                    Voir la livraison
                  </button>
                )}
                {showTourBtn && (
                  <button
                    type="button"
                    style={css.btnGold}
                    onClick={() => onOpenTour!(t.relatedTourId!, tourDate)}
                  >
                    Ouvrir la tournée
                  </button>
                )}
                {showReplanBtn && (
                  <button
                    type="button"
                    style={css.btnOutline}
                    onClick={() => onReplanTour!(
                      t.relatedTourId!,
                      type === 'partial_delivery' ? deliveryId : undefined
                    )}
                  >
                    Replanifier
                  </button>
                )}
                {view === 'pending' && (
                  <button type="button" disabled={loading} onClick={() => void resolve(t.id)} style={css.btnOutline}>
                    Marquer traitée
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

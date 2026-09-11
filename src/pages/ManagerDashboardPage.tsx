import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { TraceOMark } from '../components/brand/TraceOMark'
import { DemoBanner } from '../components/DemoBanner'
import { confirmDeletion } from '../lib/confirmDeletion'
import { CI_PHONE_INPUT_TITLE, CI_PHONE_PLACEHOLDER } from '../lib/phone'
import { defaultReplanDate } from '../lib/dates'
import { toast } from '../lib/toast'
import { isValidContactEmail, normalizeContactEmail } from '../../shared/email'
import { authFetch, fetchSupermarkets, setSupermarketActiveState } from './manager/managerApi'
import { CatalogueTab } from './manager/CatalogueTab'
import { SITE_TYPES, isSiteType } from '../../shared/catalogEnums'
import { todayIso, tourLifecycleLabel } from './manager/managerConstants'
import {
  emptyStop,
  type DeliveryRow,
  type DriverRow,
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
  EmptyHint,
  Field,
  LoadingHint,
  Row,
  Toggle,
} from './manager/managerUi'
import { formatPartialTaskLine, suiviQuantityDisplay, formatProductQuantityLine } from './manager/productHelpers'
import { buildStopApiPayload, matchSupermarketId, validateStopProducts } from './manager/stopFormHelpers'
import { useCompanyUnits } from './manager/useCompanyUnits'
import { ReplanBanner, StopsValidationHint, TourStopFormCard } from './manager/TourStopFormCard'
import { DeliveryDetailModal } from './manager/modals/DeliveryDetailModal'
import { EditProductModal } from './manager/modals/EditProductModal'
import { EditUnitModal } from './manager/modals/EditUnitModal'
import { EditSupermarketModal } from './manager/modals/EditSupermarketModal'
import { EditTourModal } from './manager/modals/EditTourModal'
import { AchatsTab } from './manager/procurement/AchatsTab'
import { SuiviBcTab } from './manager/procurement/SuiviBcTab'
import { SuiviChantierTab } from './manager/procurement/SuiviChantierTab'
import { MaJourneeTab } from './manager/procurement/MaJourneeTab'
import { fetchDraftInboxCount } from './manager/procurement/procurementApi'
import { NotificationBell } from '../components/NotificationBell'
import type { ProcurementRole, ProcurementTourPrefill } from './manager/procurement/procurementTypes'
import { PROCUREMENT_ROLE_LABELS, canSeeSuiviChantier, isProcurementWorkspaceRole, isSiteManagerRole } from './manager/procurement/procurementUi'
import EquipeTab from './manager/EquipeTab'

type Tab = 'suivi' | 'suiviBc' | 'suiviChantier' | 'planifier' | 'livreurs' | 'gestionnaires' | 'points' | 'produits' | 'unites' | 'fournisseurs' | 'taches' | 'achats' | 'maJournee'
/* Icônes et sections de la sidebar — reproduit la maquette docs/mockups/sidebar-manager-v1.html */
const SIDEBAR_ICONS: Partial<Record<string, string>> = {
  maJournee: '🗓️',
  achats: '🛒',
  suiviChantier: '🏗️',
  suiviBc: '📋',
  suivi: '🚚',
  planifier: '📅',
  catalogue: '📦',
  livreurs: '👥',
  gestionnaires: '👥',
  taches: '✅',
}
const SIDEBAR_SECTIONS = ['Général', 'Gestion', 'Planification'] as const
function sidebarSectionOf(id: string): string {
  if (id === 'maJournee') return 'Général'
  if (id === 'planifier' || id === 'catalogue' || id === 'livreurs' || id === 'gestionnaires' || id === 'taches') return 'Planification'
  return 'Gestion'
}

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

  // Force le remount des onglets de suivi pour rafraîchir les données à chaque changement
  const activeTabRef = useRef<Tab>(tab)
  useEffect(() => {
    if (activeTabRef.current !== tab) {
      activeTabRef.current = tab
      setSuiviRefreshKey((k) => k + 1)
    }
  }, [tab])
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
  const managerInitials =
    (managerName || 'G')
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => (w[0] || '').toUpperCase())
      .join('')
      .slice(0, 2) || 'G'

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
      setTab(isCatalogueTab ? tab : 'produits')
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
          <div className="manager-sidebar__subtitle" style={css.sidebarSubtitle}>Gestion de chantier</div>
        </div>
        <nav style={css.sidebarNav}>
          {SIDEBAR_SECTIONS.map((section) => {
            const items = sidebarItems.filter((item) => sidebarSectionOf(item.id) === section)
            if (items.length === 0) return null
            return (
              <Fragment key={section}>
                <div className="manager-sidebar__section" style={css.sidebarSection}>{section}</div>
                {items.map((item) => {
                  const active = isSidebarActive(item)
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
                      <span className="manager-sidebar__icon" style={css.sidebarIcon} aria-hidden="true">
                        {SIDEBAR_ICONS[item.id] ?? '•'}
                      </span>
                      <span className="manager-sidebar__item-label">{item.label}</span>
                      {item.badge && item.badge > 0 && (
                        <span className="manager-sidebar__badge" style={css.sidebarBadge}>{item.badge}</span>
                      )}
                    </button>
                  )
                })}
              </Fragment>
            )
          })}
        </nav>
        <div className="manager-sidebar__footer" style={css.sidebarUser}>
          <div className="manager-sidebar__avatar" style={css.sidebarAvatar}>{managerInitials}</div>
          <div className="manager-sidebar__user-info" style={css.sidebarUserInfo}>
            <div className="manager-sidebar__footer-name">{managerName || 'Gestionnaire'}</div>
            <div className="manager-sidebar__role" data-testid="mgr-sidebar-role">{sidebarRoleLabel}</div>
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
            <NotificationBell />
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
            procurementRole={procurementRole}
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
        {tab === 'livreurs' && <EquipeTab key={`livreurs-${suiviRefreshKey}`} handleAuth={handleAuth} isAdmin={isAdmin} canInviteManagers={isAdmin} initialChip="livreurs" />}
          {tab === 'gestionnaires' && isAdmin && (
          <EquipeTab key={`gestionnaires-${suiviRefreshKey}`} handleAuth={handleAuth} isAdmin={isAdmin} canInviteManagers={isAdmin} currentManagerId={currentManagerId} initialChip="gestionnaires" />
        )}
        {tab === 'points'   && <PointsTab key={`points-${suiviRefreshKey}`} handleAuth={handleAuth} onPointsChanged={bumpCatalog} />}
        {(tab === 'produits' || tab === 'unites' || tab === 'fournisseurs') && (
          <CatalogueTab key={`catalog-${suiviRefreshKey}`} initialChip={tab === 'fournisseurs' ? 'fournisseurs' : tab === 'unites' ? 'unites' : 'produits'} />
        )}
        {tab === 'taches'   && (
          <TachesTab
            key={`taches-${suiviRefreshKey}`}
            handleAuth={handleAuth}
            onOpenDelivery={openDeliveryFromTask}
            onOpenTour={openTourFromTask}
            onReplanTour={(tourId, deliveryId) => openReplanFromTask(tourId, deliveryId, undefined, 'taches')}
            onTasksChanged={bumpTasks}
          />
        )}
        {tab === 'achats' && (
          <AchatsTab
            key={`achats-${suiviRefreshKey}`}
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
        {tab === 'suiviBc' && <SuiviBcTab key={`suiviBc-${suiviRefreshKey}`} handleAuth={handleAuth} />}
        {tab === 'suiviChantier' && (
          <SuiviChantierTab key={`suiviChantier-${suiviRefreshKey}`} handleAuth={handleAuth} procurementRole={procurementRole} />
        )}
        {tab === 'maJournee' && <MaJourneeTab key={`maJournee-${suiviRefreshKey}`} handleAuth={handleAuth} />}
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
// CSS maquette livraison-manager-v1 (copié tel quel, sélecteurs scopés sous .lvm)
const LM_CSS = `
.lvm{font-family:'Inter',-apple-system,'Segoe UI',sans-serif;color:#1e293b}
.lvm .page-header{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;margin-bottom:20px;flex-wrap:wrap}
.lvm .page-header h1{font-size:22px;font-weight:800;color:#1e3a5f;margin:0}
.lvm .page-header .sub{font-size:13px;color:#64748b;margin-top:4px}
.lvm .role-pill{background:#1e3a5f;color:#fff;border-radius:999px;padding:5px 14px;font-size:12px;font-weight:600;white-space:nowrap}
.lvm .header-actions{display:flex;gap:8px}
.lvm .btn{border:1px solid #cbd5e1;background:#fff;color:#334155;border-radius:8px;padding:8px 14px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit}
.lvm .btn-primary{background:#1e3a5f;border-color:#1e3a5f;color:#fff}
.lvm .kpi-row{display:grid;grid-template-columns:repeat(5,1fr);gap:12px;margin-bottom:20px}
.lvm .kpi{background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:14px 16px}
.lvm .kpi .label{font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:#64748b;font-weight:600}
.lvm .kpi .value{font-size:24px;font-weight:800;margin-top:4px;color:#1e3a5f}
.lvm .kpi .value.warn{color:#b45309}
.lvm .kpi .value.ok{color:#15803d}
.lvm .kpi .detail{font-size:12px;color:#64748b;margin-top:2px}
.lvm .kpi .icon{float:right;font-size:17px}
.lvm .filters{background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:12px 16px;display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:16px}
.lvm .filters select,.lvm .filters input{border:1px solid #cbd5e1;border-radius:8px;padding:7px 10px;font-size:13px;color:#334155;background:#fff;font-family:inherit}
.lvm .filters .spacer{flex:1}
.lvm .chip{border-radius:999px;padding:5px 12px;font-size:12px;font-weight:600;background:#f1f5f9;color:#475569;cursor:pointer;border:none;font-family:inherit}
.lvm .chip.active{background:#1e3a5f;color:#fff}
.lvm .card{background:#fff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden}
.lvm .card-head{display:flex;justify-content:space-between;align-items:center;padding:14px 16px;border-bottom:1px solid #e2e8f0}
.lvm .card-head h2{font-size:14px;font-weight:700;color:#1e3a5f;margin:0}
.lvm table{width:100%;border-collapse:collapse;font-size:13px}
.lvm thead th{text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.4px;color:#64748b;font-weight:700;padding:10px 14px;background:#f8fafc;border-bottom:1px solid #e2e8f0;white-space:nowrap}
.lvm tbody td{padding:12px 14px;border-bottom:1px solid #f1f5f9;vertical-align:middle}
.lvm tbody tr:hover{background:#f8fafc;cursor:pointer}
.lvm .ref{font-weight:700;color:#1e3a5f}
.lvm .muted{color:#94a3b8;font-size:12px}
.lvm .mono{font-variant-numeric:tabular-nums}
.lvm .badge{border-radius:999px;padding:3px 10px;font-size:11.5px;font-weight:700;white-space:nowrap;display:inline-block}
.lvm .b-pending{background:#fef3c7;color:#92400e}
.lvm .b-progress{background:#dbeafe;color:#1d4ed8}
.lvm .b-otp{background:#ede9fe;color:#6d28d9}
.lvm .b-delivered{background:#dcfce7;color:#15803d}
.lvm .b-failed{background:#fee2e2;color:#b91c1c}
.lvm .qty-bar{width:110px;height:7px;background:#f1f5f9;border-radius:4px;overflow:hidden;margin-top:4px}
.lvm .qty-bar>div{height:100%;background:#1e3a5f;border-radius:4px}
.lvm .qty-bar>div.partial{background:#f59e0b}
.lvm .row-actions{display:flex;gap:6px}
.lvm .btn-sm{border:1px solid #cbd5e1;background:#fff;border-radius:7px;padding:4px 10px;font-size:12px;font-weight:600;color:#334155;cursor:pointer;white-space:nowrap;font-family:inherit}
.lvm .btn-sm.gold{background:#b45309;border-color:#b45309;color:#fff}
.lvm .btn-sm.danger{background:#b91c1c;border-color:#b91c1c;color:#fff}
.lvm .tourbar{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px}
.lvm .tour-chip{display:inline-flex;align-items:center;gap:8px;background:#fff;border:1px solid #e2e8f0;border-radius:999px;padding:6px 8px 6px 14px;font-size:12.5px;font-weight:600;color:#334155}
.lvm .tour-chip .mini{border:none;background:#f1f5f9;border-radius:999px;padding:3px 10px;font-size:11px;font-weight:700;color:#334155;cursor:pointer;font-family:inherit}
.lvm .note{margin-top:18px;font-size:12.5px;color:#64748b;line-height:1.6}
.lvm .note b{color:#334155}
`

// Statuts maquette livraison-manager-v1 : classes badge + libellés
function lmStatusClass(status: string | null | undefined, declarationOutcome?: string | null): string {
  const s = (status ?? '').toLowerCase()
  if (s.includes('deliver') || s.includes('validat')) return 'b-delivered'
  if (declarationOutcome === 'partial' || declarationOutcome === 'refused' || s.includes('partial') || s.includes('fail') || s.includes('refus')) return 'b-failed'
  if (s.includes('otp')) return 'b-otp'
  if (s.includes('progress')) return 'b-progress'
  return 'b-pending'
}

function lmStatusLabel(status: string | null | undefined, declarationOutcome?: string | null): string {
  const s = (status ?? '').toLowerCase()
  if (s.includes('deliver') || s.includes('validat')) return 'Livrée'
  if (declarationOutcome === 'refused' || s.includes('refus')) return 'Refusée'
  if (declarationOutcome === 'partial' || s.includes('partial') || s.includes('fail')) return 'Écart'
  if (s.includes('otp')) return 'OTP envoyé'
  if (s.includes('progress')) return 'En cours'
  return 'En attente'
}


function SuiviTab({
  handleAuth,
  procurementRole,
  onEditTour,
  // REPLAN DÉSACTIVÉ — bouton retiré ; prop conservée pour compatibilité.
  onReplanTour: _onReplanTour,
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
  // Modification des tournées/livraisons : réservée au SA. Les gestionnaires
  // sans rôle BTP (héritage, rôle null) conservent l'accès complet.
  // Modifier une tournée est réservé au Service Achats (SA) — même pour les
  // managers sans rôle achats (consultation seule).
  const canModify = procurementRole === 'purchasing'
  const [date, setDate] = useState(() => pendingDate ?? todayIso())
  const [status, setStatus] = useState('all')
  const [deliveries, setDeliveries] = useState<DeliveryRow[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const tourGroups = useMemo(() => groupDeliveriesByTour(deliveries), [deliveries])

  const kpi = useMemo(() => {
    let pending = 0, progress = 0, otp = 0, delivered = 0, failed = 0
    for (const d of deliveries) {
      const s = (d.status ?? '').toLowerCase()
      if (s.includes('deliver') || s.includes('validat')) delivered++
      else if (s.includes('partial') || s.includes('fail') || s.includes('refus') || d.declarationOutcome === 'partial' || d.declarationOutcome === 'refused') failed++
      else if (s.includes('otp')) otp++
      else if (s.includes('progress')) progress++
      else pending++
    }
    return { pending, progress, otp, delivered, failed }
  }, [deliveries])

  const fetch_ = useCallback(async () => {
    setLoading(true); setError(null)
    const res = await authFetch(`/dashboard/deliveries?date=${date}&status=${status}`)
    if (handleAuth(res.status)) return
    const data = await res.json() as { deliveries: DeliveryRow[]; total: number; validated: number }
    setDeliveries(data.deliveries ?? [])
    setTotal(data.total ?? 0)
    setLoading(false)
  }, [date, status, handleAuth])

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
      onPendingDeliveryConsumed?.()
    }
  }, [pendingDeliveryId, onPendingDeliveryConsumed, deliveries])

  return (
    <div className="lvm">
      <style>{LM_CSS}</style>

      {(pendingTaskCount ?? 0) > 0 && procurementRole !== 'technical_director' && (
        <div style={{ background: '#f3faf6', border: '1px solid #c5d9cc', borderRadius: 10, padding: '0.75rem 1rem', marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <p style={{ margin: 0, fontSize: 14 }}>
            <strong>{pendingTaskCount}</strong> tâche(s) en attente (confirmations, partielles, non effectuées…).
          </p>
          <button type="button" onClick={onGoToTasks} className="btn-sm gold">Voir les tâches</button>
        </div>
      )}

      <div className="page-header">
        <div>
          <h1>🚚 Livraisons</h1>
          <div className="sub">Suivi en temps réel des livraisons — photos, quantités déclarées, OTP.</div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <div className="header-actions">
            <button type="button" className="btn" onClick={() => toast.info('Export CSV : bientôt disponible')}>Exporter CSV</button>
            <button type="button" className="btn btn-primary" onClick={() => void fetch_()}>Actualiser</button>
          </div>
        </div>
      </div>

      <div className="kpi-row">
        <div className="kpi"><span className="icon">📦</span><div className="label">En attente</div><div className="value">{kpi.pending}</div><div className="detail">planifiées, non démarrées</div></div>
        <div className="kpi"><span className="icon">🛣️</span><div className="label">En cours</div><div className="value warn">{kpi.progress}</div><div className="detail">livreur parti du dépôt</div></div>
        <div className="kpi"><span className="icon">🔐</span><div className="label">OTP envoyé</div><div className="value warn">{kpi.otp}</div><div className="detail">en attente de saisie client</div></div>
        <div className="kpi"><span className="icon">✅</span><div className="label">Livrées</div><div className="value ok">{kpi.delivered}</div><div className="detail">sur {total} prévues</div></div>
        <div className="kpi"><span className="icon">⚠️</span><div className="label">Échecs / écarts</div><div className="value warn">{kpi.failed}</div><div className="detail">quantité ≠ attendue</div></div>
      </div>

      <div className="filters">
        <button type="button" className={status === 'all' ? 'chip active' : 'chip'} onClick={() => setStatus('all')}>Toutes</button>
        <button type="button" className={status === 'otp_sent' ? 'chip active' : 'chip'} onClick={() => setStatus('otp_sent')}>OTP bloqué</button>
        <button type="button" className={status === 'partial' ? 'chip active' : 'chip'} onClick={() => setStatus('partial')}>Écarts</button>
        <button type="button" className={status === 'delivered' ? 'chip active' : 'chip'} onClick={() => setStatus('delivered')}>Livrées</button>
        <span className="spacer" />
        <label style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>Date</label>
        <input type="date" data-testid="mgr-suivi-date" value={date} onChange={(e) => setDate(e.target.value)} />
        <button type="button" className="btn btn-primary" onClick={() => void fetch_()}>Filtrer</button>
      </div>

      {error && <AlertBox>{error}</AlertBox>}
      {loading && <LoadingHint />}
      {!loading && deliveries.length === 0 && <EmptyHint>Aucune livraison pour ce filtre.</EmptyHint>}

      {tourGroups.length > 0 && (
        <div className="tourbar">
          {tourGroups.map((group) => (
            <span key={group.tourId} className="tour-chip">
              🛣️ {group.driverName} · {group.deliveries.length} livraison{group.deliveries.length > 1 ? 's' : ''}
              {canModify && (
                <>
                  <button type="button" data-testid={`mgr-suivi-edit-${group.tourId}`} className="mini" onClick={() => onEditTour?.(group.tourId, group.tourDate)}>Modifier</button>
                  {group.deliveredCount === 0 && (
                    <button type="button" data-testid={`mgr-suivi-delete-${group.tourId}`} className="mini" onClick={() => void deleteTour(group.tourId, group.driverName, group.deliveredCount)}>Supprimer</button>
                  )}
                </>
              )}
            </span>
          ))}
        </div>
      )}

      {deliveries.length > 0 && (
        <div className="card">
          <div className="card-head">
            <h2>Livraisons du {date.split('-').reverse().join('/')}</h2>
            <span className="muted">{deliveries.length} livraison{deliveries.length > 1 ? 's' : ''} · {tourGroups.length} tournée{tourGroups.length > 1 ? 's' : ''} · clic sur une ligne pour le détail</span>
          </div>
          <table data-testid="mgr-suivi-deliveries-table">
            <thead>
              <tr>
                <th>Référence</th><th>Chantier / Magasin</th><th>Livreur</th><th>Statut</th><th>Quantités</th><th>Dépôt</th><th aria-hidden="true"></th>
              </tr>
            </thead>
            <tbody>
              {deliveries.map((d) => {
                const cls = lmStatusClass(d.status, d.declarationOutcome)
                const label = lmStatusLabel(d.status, d.declarationOutcome)
                const q = suiviQuantityDisplay(d.products, d.units, d.unitType)
                return (
                  <tr key={d.deliveryId} onClick={() => setSelectedId(d.deliveryId)}>
                    <td className="ref">{d.deliveryId.slice(0, 8).toUpperCase()}</td>
                    <td>
                      <div style={{ fontWeight: 700, color: '#1e3a5f' }}>{d.deliveryName}</div>
                      <div className="muted">{d.deliveryAddress}</div>
                    </td>
                    <td>{d.driverName}</td>
                    <td><span className={`badge ${cls}`}>{label}</span></td>
                    <td className="mono">
                      {q[0] ? (
                        <>
                          {formatProductQuantityLine(q[0])}
                          <div className="qty-bar"><div className={d.declarationOutcome && d.declarationOutcome !== 'complete' ? 'partial' : ''} /></div>
                        </>
                      ) : <span className="muted">—</span>}
                    </td>
                    <td className="muted">{d.depotName}</td>
                    <td>
                      <div className="row-actions" onClick={(e) => e.stopPropagation()}>
                        <button type="button" className="btn-sm gold" onClick={() => setSelectedId(d.deliveryId)}>Détail</button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="note"><b>Astuce :</b> cliquez sur une ligne pour ouvrir le détail complet — photos reçues, quantités déclarées vs attendues, assistance OTP et historique.</p>

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

const PL_CSS = `
.pl{max-width:1180px}
.pl h1{font-size:22px;font-weight:800;color:#1e3a5f;margin:0}
.pl-sub{color:#64748b;font-size:13px;margin:4px 0 0}
.pl-topbar{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;margin-bottom:6px;flex-wrap:wrap}
.pl-actions{display:flex;gap:8px}
.pl-btn{border:1px solid #e2e8f0;background:#fff;border-radius:8px;padding:8px 14px;font-size:13px;font-weight:600;color:#1e3a5f;cursor:pointer;font-family:inherit}
.pl-btn-primary{background:#1e3a5f;border-color:#1e3a5f;color:#fff}
.pl-btn-gold{background:#fdf3e0;border-color:#ecd9b0;color:#b7791f}
.pl-btn:disabled{opacity:.55;cursor:not-allowed}
.pl-alert{background:#fffbeb;border:1px solid #fde68a;border-radius:12px;padding:12px 16px;font-size:13px;color:#b45309;margin:16px 0}
.pl-cols{display:grid;grid-template-columns:340px 1fr;gap:16px;align-items:start}
.pl-card{background:#fff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;margin-bottom:16px}
.pl-card-head{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:14px 16px;border-bottom:1px solid #e2e8f0;flex-wrap:wrap}
.pl-card-head h2,.pl-card-head h3{font-size:14px;font-weight:700;color:#1e3a5f;margin:0}
.pl-card-body{padding:16px}
.pl-field{margin-bottom:14px}
.pl-field label{display:block;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#64748b;margin-bottom:6px}
.pl-field input,.pl-field select{width:100%;border:1px solid #cbd5e1;border-radius:8px;padding:9px 12px;font-size:13px;font-family:inherit;color:#334155;background:#fff;box-sizing:border-box}
.pl-pill{display:inline-block;padding:2px 10px;border-radius:999px;font-size:11px;font-weight:700;white-space:nowrap}
.pl-pill-amber{background:#fffbeb;color:#b45309}
.pl-pill-navy{background:#eef3f8;color:#1e3a5f}
.pl-tour{display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;padding:12px 0;border-bottom:1px solid #f1f5f9}
.pl-tour:last-child{border-bottom:none}
.pl-tour .nm{font-weight:700;font-size:13px;color:#1e3a5f}
.pl-tour .meta{font-size:12px;color:#64748b}
.pl-summary{display:flex;gap:14px;align-items:center;flex-wrap:wrap;background:#1e3a5f;color:#fff;border-radius:12px;padding:14px 18px;margin-top:16px}
.pl-summary .big{font-size:17px;font-weight:800}
.pl-summary .lbl{font-size:11px;text-transform:uppercase;letter-spacing:.5px;opacity:.75}
.pl-summary .sep{width:1px;height:26px;background:rgba(255,255,255,.25)}
.pl-summary .spacer{flex:1}
.pl-summary .pl-btn-primary{background:#fff;color:#1e3a5f;border-color:#fff}
.pl-hint{font-size:11.5px;color:#64748b;margin-top:5px}
@media (max-width: 900px){.pl-cols{grid-template-columns:1fr}}
`

function PlanifierTab({
  handleAuth,
  catalogRefreshKey = 0,
  useFournisseurLabels = false,
  procurementRole = null,
  initialEditTourId,
  onEditConsumed,
  initialPlanifierDate,
  onPlanifierDateConsumed,
  initialProcurementPrefill,
  onProcurementPrefillConsumed,
  onTourSaved,
  // REPLAN DÉSACTIVÉ — bouton retiré ; prop conservée pour compatibilité.
  onInlineReplanStart: _onInlineReplanStart,
  initialReplanTourId,
  initialReplanDeliveryId,
  initialReplanHintDate,
  onReplanConsumed,
  onTourCreated,
  onReplanCancelled,
  onTasksChanged,
}: {
  handleAuth: (s: number) => boolean
  catalogRefreshKey?: number
  useFournisseurLabels?: boolean
  /** Modifier une tournée est réservé au Service Achats (SA). */
  procurementRole?: ProcurementRole | null
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
  const createFormRef = useRef<HTMLFormElement | null>(null)
  // Lien BC du brouillon en cours — en state (lu pendant le rendu pour les
  // verrous produits ; un ref déclencherait react-hooks/refs).
  const [procurementRequestId, setProcurementRequestId] = useState<string | null>(null)
  const [procurementOrderId, setProcurementOrderId] = useState<string | null>(null)

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
    setProcurementRequestId(null)
    setProcurementOrderId(null)
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
    setProcurementRequestId(p.purchaseRequestId)
    setProcurementOrderId(p.purchaseOrderId ?? null)
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
      purchaseRequestId?: string
      purchaseOrderId?: string
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
    // Conserver le lien BC pour le verrouillage des produits lors de la replan
    if (data.purchaseRequestId) {
      setProcurementRequestId(data.purchaseRequestId)
      setProcurementOrderId(data.purchaseOrderId ?? null)
    } else {
      setProcurementRequestId(null)
      setProcurementOrderId(null)
    }
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
          ...(procurementRequestId
            ? {
                purchaseRequestId: procurementRequestId,
                ...(procurementOrderId
                  ? { purchaseOrderId: procurementOrderId }
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
      setProcurementRequestId(null)
      setProcurementOrderId(null)
      await fetchTours(createdDate)
      setDate(createdDate)
      onTasksChanged?.()
      onTourCreated?.(createdDate)
    } catch (err) { setCreateError(err instanceof Error ? err.message : 'Erreur') }
    finally { setCreating(false) }
  }

  const dateFr = new Date(date + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <div className="pl">
      <style>{PL_CSS}</style>
      <div className="pl-topbar">
        <div>
          <h1>Planifier une tournée</h1>
          <p className="pl-sub">Créez la tournée d'un livreur : dépôt de départ, arrêts, produits et créneau horaire — 06:00 → 18:00.</p>
        </div>
        <div className="pl-actions">
          <button type="button" data-testid="mgr-replan-cancel" onClick={cancelReplan} className="pl-btn">
            {isReplanActive ? 'Annuler la replanification' : 'Annuler'}
          </button>
          <button type="submit" form="pl-form" data-testid="mgr-create-tour" className="pl-btn pl-btn-primary" disabled={creating}>
            {creating ? 'Création…' : '💾 Enregistrer la tournée'}
          </button>
        </div>
      </div>

      {createError && <div className="pl-alert"><span>⚠️ {createError}</span></div>}
      {isReplanActive && (
        <ReplanBanner
          sourceDate={replanSourceDate ?? initialReplanHintDate ?? date}
          targetDate={newTour.date}
          kind={replanKind}
          loading={replanLoading}
          onDismiss={cancelReplan}
        />
      )}

      <form ref={createFormRef} id="pl-form" onSubmit={(e) => void handleCreate(e)} data-testid="mgr-planifier-form">
        <div className="pl-cols">
          <div className="pl-col">
            <div className="pl-card">
              <div className="pl-card-head">
                <h2 data-testid="mgr-planifier-form-title">Paramètres de la tournée</h2>
                {replanSourceDate ? <span className="pl-pill pl-pill-amber">Replanification</span> : <span className="pl-pill pl-pill-navy">Brouillon</span>}
              </div>
              <div className="pl-card-body">
                <div className="pl-field">
                  <label>Date de la tournée *</label>
                  <input type="date" data-testid="mgr-planifier-date" value={newTour.date} required onChange={(e) => setNewTour((p) => ({ ...p, date: e.target.value }))} />
                  <div className="pl-hint">La tournée apparaîtra dans le dashboard du livreur à cette date.</div>
                </div>
                <div className="pl-field">
                  <label>Créneau horaire</label>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input type="time" value={newTour.tourStart} onChange={(e) => setNewTour((p) => ({ ...p, tourStart: e.target.value }))} />
                    <span style={{ color: '#94a3b8' }}>→</span>
                    <input type="time" value={newTour.tourEnd} onChange={(e) => setNewTour((p) => ({ ...p, tourEnd: e.target.value }))} />
                  </div>
                </div>
                <div className="pl-field">
                  <label>Livreur *</label>
                  <select
                    data-testid="mgr-create-driver"
                    value={newTour.driverId}
                    required
                    disabled={driversLoading || drivers.filter((d) => d.status === 'active').length === 0}
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
                    <p style={{ margin: '6px 0 0', fontSize: 13, color: '#b91c1c' }}>
                      {driversError}{' '}
                      <button type="button" onClick={() => void loadDrivers()} className="pl-btn" style={{ padding: '2px 8px', fontSize: 12 }}>Réessayer</button>
                    </p>
                  )}
                  {!driversLoading && !driversError && drivers.filter((d) => d.status === 'active').length === 0 && (
                    <p className="pl-hint">Ajoutez ou réactivez un livreur dans l'onglet Équipe.</p>
                  )}
                </div>
                <div className="pl-field">
                  <label>{useFournisseurLabels ? 'Fournisseur *' : 'Nom du dépôt *'}</label>
                  <input type="text" data-testid="mgr-create-depot" value={newTour.depotName} required placeholder={useFournisseurLabels ? 'Ex: CimIvoire' : 'Ex: Entrepôt Nord'} onChange={(e) => setNewTour((p) => ({ ...p, depotName: e.target.value }))} />
                </div>
                <div className="pl-field">
                  <label>{useFournisseurLabels ? 'Adresse du fournisseur *' : 'Adresse du dépôt *'}</label>
                  <input type="text" data-testid="mgr-create-depot-address" value={newTour.depotAddress} required placeholder={useFournisseurLabels ? 'Adresse du fournisseur' : '12 Rue des Logistiques, Abidjan…'} onChange={(e) => setNewTour((p) => ({ ...p, depotAddress: e.target.value }))} />
                </div>
              </div>
            </div>
          </div>

            <div className="pl-col">
              <div className="pl-card">
                <div className="pl-card-head">
                  <h2>Arrêts de la tournée ({stops.length})</h2>
                  <button type="button" onClick={addStop} className="pl-btn pl-btn-gold">+ Ajouter un arrêt</button>
                </div>
                <div className="pl-card-body">
                  {replanSourceDate && <StopsValidationHint stops={stops} />}
                  {stops.map((s, idx) => (
                    <TourStopFormCard
                      key={`${formVersion}-${idx}`}
                      stop={s}
                      index={idx}
                      supermarkets={supermarkets}
                      catalogRefreshKey={catalogRefreshKey}
                      canRemove={stops.length > 1}
                      productsLocked={!!procurementRequestId}
                      onRemove={() => removeStop(idx)}
                      onChange={(next) => setStops((prev) => prev.map((st, i) => i === idx ? next : st))}
                    />
                  ))}
                </div>
              </div>
              <div className="pl-summary">
                <div><div className="lbl">Livreur</div><div className="big">{drivers.find((d) => d.id === newTour.driverId)?.name ?? '—'}</div></div>
                <div className="sep" />
                <div><div className="lbl">Date</div><div className="big">{new Date(newTour.date + 'T12:00:00').toLocaleDateString('fr-FR')}</div></div>
                <div className="sep" />
                <div><div className="lbl">Arrêts</div><div className="big">{stops.length}</div></div>
                <div className="sep" />
                <div><div className="lbl">Créneau</div><div className="big">{newTour.tourStart} → {newTour.tourEnd}</div></div>
                <div className="spacer" />
              </div>
            </div>
        </div>
      </form>

      <div className="pl-card">
        <div className="pl-card-head"><h2>Tournées du {dateFr}</h2></div>
        <div className="pl-card-body">
        {tours.length === 0
          ? <EmptyHint>Aucune tournée planifiée pour cette date.</EmptyHint>
          : tours.map((t) => (
            <div key={t.tourId} className="pl-tour">
              <div>
                <div className="nm">{t.driverName}</div>
                <div className="meta">{t.totalStops} arrêt(s) · {t.delivered} livré(s) · {t.depotName}</div>
                <div style={{ fontSize: 11, color: 'var(--brand)', marginTop: 2 }} data-testid={`mgr-planifier-tour-status-${t.tourId}`}>
                  {tourLifecycleLabel(t.delivered, t.totalStops)}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {/* REPLAN DÉSACTIVÉ — bouton « Replanifier » retiré (on garde « Modifier »).
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
                */}
                {/* Modifier une tournée : réservé au Service Achats (SA). */}
                {procurementRole === 'purchasing' && (
                  <button type="button" onClick={() => setEditTourId(t.tourId)} style={css.btnOutline}>Modifier</button>
                )}
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
        </div>
      </div>
    </div>
  )
}

// ─── Tab: Livreurs ────────────────────────────────────────────────────────────

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

export function ProduitsTab({
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

export function UnitesTab({
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
  // REPLAN DÉSACTIVÉ — bouton retiré ; prop conservée pour compatibilité.
  onReplanTour: _onReplanTour,
  onTasksChanged,
}: {
  handleAuth: (s: number) => boolean
  onOpenDelivery?: (deliveryId: string, tourDate?: string) => void
  onOpenTour?: (tourId: string, tourDate?: string) => void
  onReplanTour?: (tourId: string, deliveryId?: string) => void
  onTasksChanged?: () => void
}) {
  const [view, setView] = useState<'pending' | 'resolved'>('pending')
  const [filter, setFilter] = useState('all')
  const [pendingTasks, setPendingTasks] = useState<TaskRow[]>([])
  const [resolvedTasks, setResolvedTasks] = useState<TaskRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchStatus = useCallback(async (status: 'pending' | 'resolved') => {
    const query = status === 'resolved' ? '?status=resolved' : ''
    const res = await authFetch(`/dashboard/manager-tasks${query}`)
    if (handleAuth(res.status)) return
    const data = await res.json() as { tasks: TaskRow[]; count: number }
    if (status === 'resolved') setResolvedTasks(data.tasks ?? [])
    else setPendingTasks(data.tasks ?? [])
  }, [handleAuth])

  const fetchTasks = useCallback(async () => {
    setLoading(true)
    setError(null)
    await Promise.all([fetchStatus('pending'), fetchStatus('resolved')])
    setLoading(false)
  }, [fetchStatus])

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

  const formatWhen = (value?: string | null) => {
    if (!value) return null
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return null
    return d.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })
  }
  const resolvedLabel = (t: TaskRow) => formatWhen(t.resolvedAt)
  const createdLabel = (t: TaskRow) => formatWhen(t.createdAt) ?? ''

  const isToday = (value?: string | null) => {
    if (!value) return false
    const d = new Date(value)
    return !Number.isNaN(d.getTime()) && d.toDateString() === new Date().toDateString()
  }

  const tasks = view === 'resolved' ? resolvedTasks : pendingTasks
  const visibleTasks = filter === 'all' ? tasks : tasks.filter((t) => taskType(t) === filter)

  const pendingCount = pendingTasks.length
  const resolvedToday = resolvedTasks.filter((t) => isToday(t.resolvedAt)).length
  const urgentCount = pendingTasks.filter((t) => taskType(t) === 'missed_delivery').length
  const resolveRate = pendingCount + resolvedToday > 0 ? Math.round((resolvedToday / (pendingCount + resolvedToday)) * 100) : 0

  const typeCounts = pendingTasks.reduce((acc, t) => {
    const k = taskType(t)
    acc[k] = (acc[k] ?? 0) + 1
    return acc
  }, {} as Record<string, number>)

  const KPIS = [
    { label: 'En attente', value: pendingCount, detail: `${urgentCount} urgence(s) à traiter`, icon: '🕐' },
    { label: "Traitées aujourd'hui", value: resolvedToday, detail: 'clôturées depuis minuit', icon: '✅' },
    { label: 'Taux de traitement', value: `${resolveRate}%`, detail: `${resolvedToday} traitées · ${pendingCount} restantes`, icon: '📈', bar: true },
    { label: 'Urgentes', value: urgentCount, detail: 'non effectuée(s)', icon: '⚠️', tone: '#dc2626' },
  ]

  const TASK_META: Record<string, { label: string; tagBg: string; tagColor: string; iconBg: string; iconColor: string; icon: string }> = {
    partial_delivery: { label: 'Livraison partielle', tagBg: '#fef3c7', tagColor: '#b45309', iconBg: '#fef3c7', iconColor: '#b45309', icon: '📦' },
    missed_delivery: { label: 'Non effectuée', tagBg: '#fee2e2', tagColor: '#b91c1c', iconBg: '#fee2e2', iconColor: '#dc2626', icon: '🚚' },
    reassign_tour: { label: 'Réaffectation', tagBg: '#dbeafe', tagColor: '#1e40af', iconBg: '#dbeafe', iconColor: '#2563eb', icon: '🔁' },
    otp_manager_assist: { label: 'OTP requise', tagBg: '#ede9fe', tagColor: '#6b21a8', iconBg: '#ede9fe', iconColor: '#7c3aed', icon: '🛡️' },
    delivery_cancelled: { label: 'Annulée', tagBg: '#f1f5f9', tagColor: '#475569', iconBg: '#e5e7eb', iconColor: '#4b5563', icon: '⛔' },
    delivery_confirmed: { label: 'Livraison confirmée', tagBg: '#dcfce7', tagColor: '#166534', iconBg: '#dcfce7', iconColor: '#16a34a', icon: '✅' },
  }
  const DEFAULT_META = { label: 'Tâche', tagBg: '#f1f5f9', tagColor: '#475569', iconBg: '#e5e7eb', iconColor: '#4b5563', icon: '📋' }
  const FILTER_CHIPS = [
    { key: 'all', label: 'Toutes' },
    { key: 'partial_delivery', label: 'Partielle' },
    { key: 'missed_delivery', label: 'Non effectuée' },
    { key: 'delivery_cancelled', label: 'Annulée' },
    { key: 'reassign_tour', label: 'Réaffectation' },
    { key: 'otp_manager_assist', label: 'OTP' },
  ]
  const FILTER_COLORS: Record<string, string> = {
    all: '#1e3a5f',
    partial_delivery: '#b45309',
    missed_delivery: '#dc2626',
    delivery_cancelled: '#6b7280',
    reassign_tour: '#2563eb',
    otp_manager_assist: '#7c3aed',
  }

  return (
    <div>
      <div style={{ fontSize: 12.5, color: '#6b7280', marginBottom: 6 }}>
        TraceO / Gestion / <span style={{ color: '#1a1a2e', fontWeight: 600 }}>Tâches</span>
      </div>
      <h1 style={{ fontSize: 22, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 10, margin: 0 }}>
        Tâches gestionnaire
        {pendingCount > 0 && (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 10.5,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: 0.3,
              padding: '2px 9px',
              borderRadius: 99,
              background: '#fee2e2',
              color: '#b91c1c',
            }}
          >
            <span style={{ width: 6, height: 6, borderRadius: 99, background: '#b91c1c' }} />
            {pendingCount} en attente
          </span>
        )}
      </h1>
      <div style={{ fontSize: 13, color: '#6b7280', marginTop: 2 }}>
        Actions générées automatiquement à partir des livraisons : partielle, non effectuée, annulée, réaffectation de tournée, OTP de confirmation.
      </div>

      {/* Rangée KPI */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginTop: 18 }}>
        {KPIS.map((k) => (
          <div key={k.label} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '14px 16px' }}>
            <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4, color: '#6b7280', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 12 }}>{k.icon}</span> {k.label}
            </div>
            <div style={{ fontSize: 26, fontWeight: 800, marginTop: 4, color: k.tone ?? '#1a1a2e' }}>{k.value}</div>
            {k.bar ? (
              <span style={{ display: 'block', height: 6, background: '#e5e7eb', borderRadius: 99, marginTop: 10 }}>
                <span style={{ display: 'block', height: 6, width: `${resolveRate}%`, background: 'linear-gradient(90deg, #22c55e, #16a34a)', borderRadius: 99 }} />
              </span>
            ) : (
              <div style={{ fontSize: 11.5, color: '#9ca3af', marginTop: 2 }}>{k.detail}</div>
            )}
          </div>
        ))}
      </div>

      {/* Onglets */}
      <div style={{ display: 'inline-flex', gap: 6, marginTop: 20, background: '#eef1f5', borderRadius: 10, padding: 4 }}>
        <button
          type="button"
          data-testid="mgr-tasks-pending"
          onClick={() => { setView('pending'); setFilter('all') }}
          style={{
            border: 0,
            background: view === 'pending' ? '#1e3a5f' : 'transparent',
            padding: '8px 18px',
            borderRadius: 7,
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
            color: view === 'pending' ? '#fff' : '#4b5563',
            fontFamily: 'inherit',
          }}
        >
          En attente
        </button>
        <button
          type="button"
          data-testid="mgr-tasks-resolved"
          onClick={() => { setView('resolved'); setFilter('all') }}
          style={{
            border: 0,
            background: view === 'resolved' ? '#1e3a5f' : 'transparent',
            padding: '8px 18px',
            borderRadius: 7,
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
            color: view === 'resolved' ? '#fff' : '#4b5563',
            fontFamily: 'inherit',
          }}
        >
          Traitées
        </button>
      </div>

      {/* Filtres par type (vue en attente uniquement) */}
      {view === 'pending' && pendingCount > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
          {FILTER_CHIPS.map((chip) => {
            const count = chip.key === 'all' ? pendingCount : (typeCounts[chip.key] ?? 0)
            const active = filter === chip.key
            return (
              <button
                key={chip.key}
                type="button"
                onClick={() => setFilter(chip.key)}
                style={{
                  border: `1px solid ${active ? '#1e3a5f' : '#e5e7eb'}`,
                  background: active ? '#eef6ff' : '#fff',
                  borderRadius: 99,
                  padding: '5px 12px',
                  fontSize: 12,
                  fontWeight: active ? 600 : 500,
                  cursor: 'pointer',
                  color: active ? '#1e3a5f' : '#4b5563',
                  fontFamily: 'inherit',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                {chip.label}
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    minWidth: 18,
                    height: 18,
                    fontSize: 10,
                    fontWeight: 700,
                    color: '#fff',
                    borderRadius: 99,
                    background: active ? '#1e3a5f' : (FILTER_COLORS[chip.key] ?? '#1e3a5f'),
                  }}
                >
                  {count}
                </span>
              </button>
            )
          })}
        </div>
      )}

      {error && <AlertBox>{error}</AlertBox>}
      {loading && visibleTasks.length === 0 && <LoadingHint />}
      {!loading && visibleTasks.length === 0 && (
        <EmptyHint>
          {view === 'pending' ? 'Aucune tâche en attente.' : 'Aucune tâche traitée pour le moment.'}
        </EmptyHint>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 18 }}>
        {visibleTasks.map((t) => {
          const type = taskType(t)
          const meta = TASK_META[type] ?? DEFAULT_META
          const payload = (t.payload ?? {}) as TaskPayload
          const deliveryId = payload.deliveryId ?? t.deliveryId ?? undefined
          const tourDate = payload.tourDate ?? t.deliveryDate
          const refusedPreview =
            type === 'partial_delivery' && payload.refusedLines?.length
              ? payload.refusedLines.map((l) => `• ${formatPartialTaskLine(l)}`).join('\n')
              : null
          const resAt = resolvedLabel(t)

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
                display: 'grid',
                gridTemplateColumns: '44px 1fr auto',
                gap: 16,
                alignItems: 'start',
                background: '#fff',
                border: '1px solid #e5e7eb',
                borderLeft: '4px solid transparent',
                borderRadius: 12,
                padding: '16px 18px',
                boxShadow: '0 1px 3px rgba(0,0,0,.04)',
              }}
            >
              {/* Icône du type */}
              <div style={{ width: 44, height: 44, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, background: meta.iconBg, color: meta.iconColor }}>
                {meta.icon}
              </div>
              {/* Corps */}
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      fontSize: 10.5,
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: 0.3,
                      padding: '2px 9px',
                      borderRadius: 99,
                      background: meta.tagBg,
                      color: meta.tagColor,
                    }}
                  >
                    <span style={{ width: 6, height: 6, borderRadius: 99, background: meta.tagColor }} />
                    {view === 'resolved' ? 'Traitée' : meta.label}
                  </span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: '#1a1a2e' }}>{t.title || t.description}</span>
                </div>
                {t.description && t.title && (
                  <div style={{ fontSize: 12.5, color: '#6b7280', marginTop: 3 }}>{t.description}</div>
                )}
                {refusedPreview && (
                  <div style={{ background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 8, padding: '7px 12px', fontSize: 12, color: '#92400e', fontWeight: 500, marginTop: 8 }}>
                    ⚠️ Lignes refusées
                    <span style={{ whiteSpace: 'pre-wrap' }}>{refusedPreview}</span>
                  </div>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 10, fontSize: 12, color: '#6b7280' }}>
                  {t.driverName && <span style={{ fontWeight: 600, color: '#374151' }}>🚚 {t.driverName}</span>}
                  {(t.deliveryName ?? t.relatedTourId) && (
                    <span>📍 {t.deliveryName ?? `Tournée ${t.relatedTourId}`}</span>
                  )}
                  <span>🕐 {createdLabel(t)}</span>
                </div>
              </div>
              {/* Actions / date de traitement */}
              <div style={{ display: 'flex', gap: 8, flexDirection: 'column' }}>
                {view === 'resolved' ? (
                  resAt && <div style={{ fontSize: 11, color: '#6b7280', whiteSpace: 'nowrap' }}>✓ Traitée le {resAt}</div>
                ) : (
                  <>
                    {showDeliveryBtn && (
                      <button
                        type="button"
                        onClick={() => onOpenDelivery!(deliveryId!, tourDate)}
                        style={{ padding: '8px 14px', fontSize: 12, fontWeight: 600, background: '#1e3a5f', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit' }}
                      >
                        👁️ Voir la livraison
                      </button>
                    )}
                    {showTourBtn && (
                      <button
                        type="button"
                        onClick={() => onOpenTour!(t.relatedTourId!, tourDate)}
                        style={{ padding: '8px 14px', fontSize: 12, fontWeight: 600, background: '#1e3a5f', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit' }}
                      >
                        🗺️ Ouvrir la tournée
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={loading}
                      onClick={() => void resolve(t.id)}
                      style={{ border: '1px dashed #d1d5db', background: 'transparent', color: '#6b7280', padding: '8px 14px', fontSize: 12, fontWeight: 600, borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit' }}
                    >
                      ✓ Marquer traitée
                    </button>
                  </>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

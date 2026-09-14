import { Fragment, useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { TraceOMark } from '../components/brand/TraceOMark'
import { DemoBanner } from '../components/DemoBanner'
import { confirmDeletion } from '../lib/confirmDeletion'
import { toast } from '../lib/toast'
import { authFetch } from './manager/managerApi'
import { CatalogueTab } from './manager/CatalogueTab'
import { type ProductRow, type UnitRow } from './manager/managerTypes'
import { AlertBox, css, EmptyHint, Field, Toggle } from './manager/managerUi'
import { useCompanyUnits } from './manager/useCompanyUnits'
import { EditProductModal } from './manager/modals/EditProductModal'
import { EditUnitModal } from './manager/modals/EditUnitModal'
import { AchatsTab } from './manager/procurement/AchatsTab'
import { SuiviBcTab } from './manager/procurement/SuiviBcTab'
import { ComptabiliteTab } from './manager/procurement/ComptabiliteTab'
import { SuiviChantierTab } from './manager/procurement/SuiviChantierTab'
import { MaJourneeTab } from './manager/procurement/MaJourneeTab'
import { fetchDraftInboxCount } from './manager/procurement/procurementApi'
import { NotificationBell } from '../components/NotificationBell'
import type { ProcurementRole, ProcurementTourPrefill } from './manager/procurement/procurementTypes'
import { PROCUREMENT_ROLE_LABELS, canSeeSuiviChantier, isProcurementWorkspaceRole, isSiteManagerRole } from './manager/procurement/procurementUi'
import EquipeTab from './manager/EquipeTab'
import { SuiviTab } from './manager/tabs/SuiviTab'
import { PlanifierTab } from './manager/tabs/PlanifierTab'
import { PointsTab } from './manager/tabs/PointsTab'
import { TachesTab } from './manager/tabs/TachesTab'

type Tab = 'suivi' | 'suiviBc' | 'suiviChantier' | 'planifier' | 'livreurs' | 'gestionnaires' | 'points' | 'produits' | 'unites' | 'fournisseurs' | 'taches' | 'achats' | 'maJournee' | 'comptabilite'
/* Icônes et sections de la sidebar — reproduit la maquette docs/mockups/sidebar-manager-v1.html */
const SIDEBAR_ICONS: Partial<Record<string, string>> = {
  maJournee: '🗓️',
  achats: '🛒',
  comptabilite: '🧾',
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
  'maJournee',
  'comptabilite',
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
  const [suiviRefreshKey, setSuiviRefreshKey] = useState(0)
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
    if (procurementRole === 'accountant') {
      setTab('comptabilite')
    } else if (isProcurementWorkspaceRole(procurementRole)) {
      setTab('achats')
    }
  }, [procurementRole, searchParams])

  useEffect(() => {
    if (isSiteManagerRole(procurementRole) && tab !== 'maJournee' && tab !== 'suiviChantier') {
      setTab('maJournee')
      return
    }
    if (procurementRole === 'accountant') {
      if (tab !== 'comptabilite') setTab('comptabilite')
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
    : procurementRole === 'accountant'
    ? [{ id: 'comptabilite' as const, label: 'Comptabilité', tab: 'comptabilite' as Tab }]
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
            key={`suivi-${suiviRefreshKey}`}
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
        {tab === 'comptabilite' && <ComptabiliteTab key={`comptabilite-${suiviRefreshKey}`} handleAuth={handleAuth} />}

        {tab === 'suiviChantier' && (
          <SuiviChantierTab key={`suiviChantier-${suiviRefreshKey}`} handleAuth={handleAuth} procurementRole={procurementRole} refreshKey={suiviRefreshKey} />
        )}
        {tab === 'maJournee' && <MaJourneeTab key={`maJournee-${suiviRefreshKey}`} handleAuth={handleAuth} />}
        </div>
      </div>
    </div>
  )
}

// ─── Tab: Suivi livraisons (extrait dans manager/tabs/SuiviTab.tsx) ───────────
// ─── Tab: Planifier (extrait dans manager/tabs/PlanifierTab.tsx) ─────────────


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

import { Fragment, useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { TraceOMark } from '../components/brand/TraceOMark'
import { DemoBanner } from '../components/DemoBanner'
import { toast } from '../lib/toast'
import { authFetch } from './manager/managerApi'
import { CatalogueTab } from './manager/CatalogueTab'
import { css } from './manager/managerUi'
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
import { useEffect, useState, type ReactNode } from 'react'
import { authFetch, fetchSupermarkets } from '../managerApi'
import { normalizeSupermarkets, type ManagerRow, type Supermarket } from '../managerTypes'
import { siteTypeLabel } from '../../../../shared/catalogEnums'
import { fetchSiteBudget, fetchSiteIndicators } from '../procurement/procurementApi'
import { TRAFFIC_LIGHT_LABEL, TRAFFIC_LIGHT_STYLE } from '../procurement/procurementUi'
import type { BcRegisterRow, SiteBudget, SiteIndicators } from '../procurement/procurementTypes'

/**
 * Chantier achats (`sites`) relié à un point du catalogue (`sites.supermarket_id`).
 * Renvoyé par `GET /procurement/sites/by-supermarket/:id` — `null` si non rattaché.
 */
type LinkedSite = {
  id: string
  name: string
  address: string
  lat?: string | null
  lng?: string | null
  managerId?: string | null
  supervisorManagerId?: string | null
  budgetInitialFcfa?: string | number | null
  budgetFrozenAt?: string | null
  active: boolean
}

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000

const fmtNum = (n: number) => Math.round(n).toLocaleString('fr-FR').replace(/\u202F/g, ' ')

/** Montant FCFA lisible (séparateurs d'espace, jamais de décimales). */
function fmtFcfa(n: number): string {
  return `${fmtNum(n)} XOF`
}

function fmtPct(n: number | null | undefined): string {
  if (n == null) return '—'
  return `${n.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %`
}

function textOrDash(value?: string | null): string {
  const t = (value ?? '').trim()
  return t === '' ? '—' : t
}

/** Date registre BC « jj/mm/aaaa » → `Date` locale (`null` si non exploitable). */
function parseFrDate(value: string): Date | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec((value ?? '').trim())
  if (!m) return null
  const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]))
  return Number.isNaN(d.getTime()) ? null : d
}

/** Ligne « libellé → valeur » de la fiche chantier. */
function DetailRow({ label, value, testId }: { label: string; value: ReactNode; testId?: string }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr', gap: 8, alignItems: 'baseline', marginBottom: 4 }}>
      <span style={{ fontSize: 11.5, color: 'var(--muted,#64748b)' }}>{label}</span>
      <span style={{ fontSize: 12.5, color: '#1e293b', fontWeight: 600, wordBreak: 'break-word' }} data-testid={testId}>
        {value}
      </span>
    </div>
  )
}

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h4 style={{ fontSize: 12, fontWeight: 800, color: 'var(--navy,#1e3a5f)', margin: '14px 0 6px', textTransform: 'uppercase', letterSpacing: '.4px' }}>
      {children}
    </h4>
  )
}

/**
 * Fiche chantier ouverte au clic d'une ligne du chip « Chantiers » : identité,
 * coordonnées, interlocuteurs, encadrement achats, enveloppe, consommation et
 * livraisons (BC livrés) du chantier. Toutes les sources sont interrogées en
 * parallèle : une section indisponible n'empêche pas les autres de s'afficher.
 */
export function SiteDetailModal({ siteId, onClose }: { siteId: string; onClose: () => void }) {
  const [point, setPoint] = useState<Supermarket | null>(null)
  const [site, setSite] = useState<LinkedSite | null>(null)
  const [budget, setBudget] = useState<SiteBudget | null>(null)
  const [indicators, setIndicators] = useState<SiteIndicators | null>(null)
  const [managers, setManagers] = useState<ManagerRow[]>([])
  const [bcRows, setBcRows] = useState<BcRegisterRow[]>([])
  const [bc30d, setBc30d] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      setLoading(true)
      setError(null)
      try {
        const [smRes, siteRes] = await Promise.all([
          fetchSupermarkets(),
          authFetch(`/procurement/sites/by-supermarket/${encodeURIComponent(siteId)}`),
        ])
        const smBody = smRes.ok ? ((await smRes.json()) as { supermarkets?: Supermarket[] }) : { supermarkets: [] }
        const linked = siteRes.ok ? (((await siteRes.json()) as { site?: LinkedSite | null }).site ?? null) : null
        const found = normalizeSupermarkets(smBody.supermarkets ?? []).find((s) => s.id === siteId) ?? null
        if (cancelled) return
        setPoint(found)
        setSite(linked)

        const [budgetRes, indicatorsRes, managersRes, bcRes] = await Promise.allSettled([
          linked ? fetchSiteBudget(linked.id) : Promise.resolve(null),
          linked ? fetchSiteIndicators(linked.id) : Promise.resolve(null),
          authFetch('/dashboard/managers'),
          authFetch('/procurement/bc-register'),
        ])
        if (cancelled) return
        if (budgetRes.status === 'fulfilled' && budgetRes.value) setBudget(budgetRes.value)
        if (indicatorsRes.status === 'fulfilled' && indicatorsRes.value) setIndicators(indicatorsRes.value)
        if (managersRes.status === 'fulfilled' && managersRes.value.ok) {
          setManagers(((await managersRes.value.json()) as { managers?: ManagerRow[] }).managers ?? [])
        }
        if (bcRes.status === 'fulfilled' && bcRes.value.ok) {
          const rows = ((await bcRes.value.json()) as { rows?: BcRegisterRow[] }).rows ?? []
          setBcRows(rows)
          // Fenêtre glissante de 30 jours : calculée au chargement (jamais pendant le rendu).
          const threshold = Date.now() - THIRTY_DAYS_MS
          const wanted = (linked?.name ?? found?.name ?? '').trim().toLowerCase()
          setBc30d(
            rows
              .filter((r) => r.siteName.trim().toLowerCase() === wanted)
              .filter((r) => {
                const d = parseFrDate(r.date)
                return d != null && d.getTime() >= threshold
              }).length,
          )
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Fiche chantier indisponible')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [siteId])

  const siteName = site?.name ?? point?.name ?? 'Chantier'
  const managerName = (id?: string | null): string =>
    id ? managers.find((m) => m.id === id)?.name ?? '—' : '—'

  // Registre BC : une ligne par BC livré, rattachée par nom de chantier.
  const siteBcRows = bcRows.filter((r) => r.siteName.trim().toLowerCase() === siteName.trim().toLowerCase())
  const bcTotal = siteBcRows.reduce((sum, r) => sum + (Number(r.amountFcfa) || 0), 0)
  const recentBc = siteBcRows.slice(0, 5)
  const fire = budget?.trafficLight ?? 'none'
  const gps = [point?.lat, point?.lng].filter((v) => (v ?? '').toString().trim() !== '').join(', ')
  const initialBudget = budget?.budgetInitialFcfa ?? (site?.budgetInitialFcfa == null ? null : Number(site.budgetInitialFcfa))

  return (
    <div
      className="ctg-modal"
      data-testid="mgr-chantier-detail"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="ctg-modal-box" style={{ width: 640 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <h3 style={{ margin: 0 }}>
            Détail du chantier
            <span style={{ display: 'block', fontSize: 13, fontWeight: 700, color: 'var(--muted,#64748b)', marginTop: 2 }}>
              {siteName}
            </span>
          </h3>
          <button type="button" className="btn" data-testid="mgr-chantier-detail-close" onClick={onClose}>Fermer</button>
        </div>

        {loading ? (
          <p style={{ fontSize: 12.5, color: 'var(--muted,#64748b)' }}>Chargement de la fiche chantier…</p>
        ) : (
          <>
            {error && <p style={{ fontSize: 12.5, color: 'var(--red,#b91c1c)' }}>{error}</p>}

            <SectionTitle>Fiche chantier</SectionTitle>
            <DetailRow label="Type" testId="mgr-chantier-detail-type" value={siteTypeLabel(point?.siteType)} />
            <DetailRow
              label="Statut"
              testId="mgr-chantier-detail-status"
              value={point?.active === false ? 'Inactif' : 'Actif'}
            />
            <DetailRow label="Adresse" testId="mgr-chantier-detail-address" value={textOrDash(point?.address ?? site?.address)} />
            <DetailRow label="GPS" testId="mgr-chantier-detail-gps" value={gps === '' ? '—' : gps} />

            <SectionTitle>Interlocuteurs</SectionTitle>
            <DetailRow label="Responsable" testId="mgr-chantier-detail-responsable" value={textOrDash(point?.contactName)} />
            <DetailRow label="E-mail" testId="mgr-chantier-detail-email" value={textOrDash(point?.contactEmail)} />
            <DetailRow label="Téléphone (OTP)" testId="mgr-chantier-detail-phone" value={textOrDash(point?.contactPhone)} />
            {site ? (
              <>
                <SectionTitle>Encadrement (suivi achats)</SectionTitle>
                <DetailRow label="Chef de chantier" testId="mgr-chantier-detail-chef" value={managerName(site.managerId)} />
                <DetailRow label="DT superviseur" testId="mgr-chantier-detail-dt" value={managerName(site.supervisorManagerId)} />
                <DetailRow
                  label="Chantier achats"
                  testId="mgr-chantier-detail-site"
                  value={`${site.name}${site.active ? '' : ' (inactif)'}`}
                />

                <SectionTitle>Enveloppe budgétaire</SectionTitle>
                <div data-testid="mgr-chantier-detail-enveloppe">
                  <DetailRow
                    label="Budget initial"
                    testId="mgr-chantier-detail-budget-initial"
                    value={initialBudget == null ? '—' : fmtFcfa(initialBudget)}
                  />
                  <DetailRow
                    label="Budget total"
                    testId="mgr-chantier-detail-budget-total"
                    value={budget?.budgetTotalFcfa == null ? '—' : fmtFcfa(budget.budgetTotalFcfa)}
                  />
                  <DetailRow
                    label="Engagé"
                    testId="mgr-chantier-detail-engaged"
                    value={budget == null ? '—' : fmtFcfa(budget.engagedFcfa)}
                  />
                  <DetailRow
                    label="Réalisé"
                    testId="mgr-chantier-detail-realized"
                    value={budget == null ? '—' : fmtFcfa(budget.realizedFcfa)}
                  />
                  <DetailRow
                    label="Reste"
                    testId="mgr-chantier-detail-remaining"
                    value={budget?.remainingFcfa == null ? '—' : fmtFcfa(budget.remainingFcfa)}
                  />
                  <DetailRow
                    label="Feu budget"
                    testId="mgr-chantier-detail-fire"
                    value={(
                      <span
                        style={{
                          padding: '2px 10px',
                          borderRadius: 999,
                          fontSize: 11,
                          fontWeight: 700,
                          color: TRAFFIC_LIGHT_STYLE[fire].color,
                          background: TRAFFIC_LIGHT_STYLE[fire].bg,
                        }}
                      >
                        {TRAFFIC_LIGHT_LABEL[fire]}
                      </span>
                    )}
                  />
                  {budget == null && (
                    <p style={{ fontSize: 11.5, color: 'var(--muted,#64748b)' }}>
                      Enveloppe indisponible : aucun budget défini pour ce chantier.
                    </p>
                  )}
                </div>
              </>
            ) : (
              <p
                data-testid="mgr-chantier-detail-no-site"
                style={{ fontSize: 12, color: 'var(--muted,#64748b)', marginTop: 14 }}
              >
                Aucun chantier achats relié à ce point : encadrement, budget et indicateurs indisponibles.
              </p>
            )}
            {indicators && (
              <>
                <SectionTitle>Consommation</SectionTitle>
                <div data-testid="mgr-chantier-detail-indicators">
                  <DetailRow
                    label="Réalisé"
                    testId="mgr-chantier-detail-realized-pct"
                    value={`${fmtFcfa(indicators.realizedFcfa)} · ${fmtPct(indicators.realizedPct)} de l'enveloppe`}
                  />
                  <DetailRow
                    label="Matériaux"
                    testId="mgr-chantier-detail-materials"
                    value={`${fmtFcfa(indicators.materialsFcfa)} · ${fmtPct(indicators.materialsSharePct)}`}
                  />
                  <DetailRow
                    label="Première dépense"
                    testId="mgr-chantier-detail-first-expense"
                    value={textOrDash(indicators.firstExpenseOn)}
                  />
                  <DetailRow
                    label="Jours de dépense"
                    testId="mgr-chantier-detail-expense-days"
                    value={String(indicators.daily.length)}
                  />
                  {indicators.top3.length > 0 && (
                    <DetailRow
                      label="Top produits"
                      testId="mgr-chantier-detail-top3"
                      value={indicators.top3.map((p) => `${p.label} (${fmtFcfa(p.amountFcfa)})`).join(' · ')}
                    />
                  )}
                  {indicators.byCategory.length > 0 && (
                    <DetailRow
                      label="Catégories"
                      testId="mgr-chantier-detail-categories"
                      value={indicators.byCategory
                        .slice(0, 3)
                        .map((c) => `${c.label} (${fmtFcfa(c.amountFcfa)})`)
                        .join(' · ')}
                    />
                  )}
                </div>
              </>
            )}

            <SectionTitle>Livraisons (BC livrés)</SectionTitle>
            <div data-testid="mgr-chantier-detail-bc">
              <DetailRow label="BC livrés" testId="mgr-chantier-detail-bc-count" value={String(siteBcRows.length)} />
              <DetailRow label="Montant livré" testId="mgr-chantier-detail-bc-amount" value={fmtFcfa(bcTotal)} />
              <DetailRow label="30 derniers jours" testId="mgr-chantier-detail-bc-30d" value={String(bc30d)} />
              {recentBc.length === 0 ? (
                <p style={{ fontSize: 11.5, color: 'var(--muted,#64748b)' }}>
                  Aucun BC livré enregistré pour ce chantier.
                </p>
              ) : (
                <table style={{ marginTop: 6 }}>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>N° BC</th>
                      <th>Fournisseur</th>
                      <th>Montant (XOF)</th>
                      <th>Paiement</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentBc.map((r) => (
                      <tr key={r.purchaseOrderId}>
                        <td className="mono">{r.date}</td>
                        <td className="mono">{r.bon}</td>
                        <td>{r.supplierName}</td>
                        <td className="mono">{fmtNum(Number(r.amountFcfa) || 0)}</td>
                        <td>{textOrDash(r.paymentMode)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}


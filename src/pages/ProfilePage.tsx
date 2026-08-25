import { useNavigate } from 'react-router-dom'
import { StatusBadge } from '../components/StatusBadge'
import { useAuth } from '../contexts/AuthContext'
import { useTour } from '../contexts/TourContext'
import { useOnline } from '../hooks/useOnline'
import { api } from '../lib/api'
import { isDeliveryTerminal } from '../lib/deliveryAccess'

async function openCertificate(receiptId: string, certificateUrl?: string) {
  if (certificateUrl?.includes('access=') || certificateUrl?.includes('view=html')) {
    window.open(certificateUrl, '_blank', 'noopener,noreferrer')
    return
  }
  const data = await api.getCertificate(receiptId)
  // Fallback : ouvrir l’URL signée si présente, sinon JSON legacy
  if (typeof data.url === 'string' && data.url.includes('view=html')) {
    window.open(data.url, '_blank', 'noopener,noreferrer')
    return
  }
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  window.open(URL.createObjectURL(blob), '_blank', 'noopener,noreferrer')
}

/** Anneau de progression SVG (donut). */
function ProgressRing({ percent }: { percent: number }) {
  const r = 34
  const c = 2 * Math.PI * r
  const clamped = Math.max(0, Math.min(100, percent))
  return (
    <div className="prof-ring" role="img" aria-label={`Progression du jour : ${clamped} %`}>
      <svg width="96" height="96" viewBox="0 0 84 84">
        <circle cx="42" cy="42" r={r} fill="none" stroke="rgba(255,255,255,.18)" strokeWidth="8" />
        <circle
          cx="42"
          cy="42"
          r={r}
          fill="none"
          stroke="#fff"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - clamped / 100)}
          transform="rotate(-90 42 42)"
          style={{ transition: 'stroke-dashoffset .6s ease' }}
        />
      </svg>
      <div className="prof-ring__center">
        <span className="prof-ring__pct">{clamped}%</span>
      </div>
    </div>
  )
}

export function ProfilePage() {
  const { driver, logout } = useAuth()
  const { tour, loading } = useTour()
  const online = useOnline()
  const navigate = useNavigate()

  const handleLogout = async () => {
    await logout()
    navigate('/login', { replace: true })
  }

  const todayStops = tour?.stops ?? []
  const total = todayStops.length
  const deliveredCount = todayStops.filter((s) => s.status === 'delivered').length
  const rejectedCount = todayStops.filter(
    (s) => s.declarationOutcome === 'rejected' || s.status === 'failed',
  ).length
  const remainingCount = todayStops.filter((s) => !isDeliveryTerminal(s.status)).length
  const percent = total > 0 ? Math.round((deliveredCount / total) * 100) : 0
  const initials = (driver?.name ?? 'L')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('') || 'L'

  return (
    <div className="page profile-page profile-page--traceo">
      {/* ── Identité + journée (sombre premium, pleine largeur) ── */}
      <div className="prof-splash">
        <div className="prof-splash__identity">
            <span className="prof-splash__avatar" aria-hidden="true">{initials}</span>
            <span className="prof-splash__id">
              <strong>{driver?.name ?? 'Livreur'}</strong>
              <small>Livreur · {driver?.phone}</small>
            </span>
            <span className={`prof-atn${online ? ' on' : ''}`}>
              <i aria-hidden="true" />{online ? 'En ligne' : 'Hors ligne'}
            </span>
          </div>

          <section className="prof-day" aria-label="Progression du jour">
            <div className="prof-day__left">
              <p className="prof-day__title">Ma journée</p>
              {total > 0 ? (
                <>
                  <p className="prof-day__count">
                    {deliveredCount}<span>/{total} livraisons</span>
                  </p>
                  <p className="prof-day__hint">
                    {remainingCount === 0
                      ? '🎉 Tournée terminée, bravo !'
                      : `Encore ${remainingCount} arrêt${remainingCount > 1 ? 's' : ''} à faire`}
                  </p>
                </>
              ) : (
                <p className="prof-day__count prof-day__count--empty">
                  {loading ? 'Chargement…' : 'Pas de tournée'}
                </p>
              )}
            </div>
            <ProgressRing percent={total > 0 ? percent : 0} />
          </section>

          <div className="prof-stats" aria-label="Statistiques du jour">
            <button type="button" className="prof-stat prof-stat--success" onClick={() => navigate('/')}>
              <span className="prof-stat__value">{deliveredCount}</span>
              <span className="prof-stat__label">Livrées</span>
            </button>
            <button type="button" className="prof-stat" onClick={() => navigate('/')}>
              <span className="prof-stat__value">{remainingCount}</span>
              <span className="prof-stat__label">Restantes</span>
            </button>
            <button type="button" className="prof-stat prof-stat--warn">
              <span className="prof-stat__value">{rejectedCount}</span>
              <span className="prof-stat__label">Refus</span>
            </button>
          </div>
        </div>

        <div className="driver-panel">
        {/* ── Historique / timeline ──────────────────────────── */}
        <section aria-label="Historique du jour">
          <h2 className="section-title">Livraisons du jour</h2>
          {loading && todayStops.length === 0 && (
            <div className="loading-block" role="status">
              <span className="loading-block__spinner" aria-hidden="true" />
              <span>Chargement des livraisons…</span>
            </div>
          )}
          {!loading && todayStops.length === 0 && (
            <div className="empty-state" role="status">
              <p className="empty-state__title">Aucune livraison aujourd’hui</p>
              <p>Les arrêts de votre tournée du jour apparaîtront ici.</p>
            </div>
          )}
          {todayStops.length > 0 && (
            <ol className="prof-timeline">
              {todayStops.map((s) => (
                <li key={s.id} className="prof-stop">
                  <button
                    type="button"
                    className="prof-stop__main"
                    onClick={() => navigate(`/delivery/${s.id}`)}
                    aria-label={`Ouvrir la livraison ${s.name}`}
                  >
                    <span
                      className={`prof-stop__dot prof-stop__dot--${
                        s.status === 'delivered' ? 'done' : isDeliveryTerminal(s.status) ? 'ko' : 'todo'
                      }`}
                      aria-hidden="true"
                    >
                      {s.status === 'delivered' ? '✓' : isDeliveryTerminal(s.status) ? '×' : ''}
                    </span>
                    <span className="prof-stop__body">
                      <span className="prof-stop__name">#{s.sequence} {s.name}</span>
                      <span className="prof-stop__meta">
                        {s.timeWindow?.start} · {s.units} {s.unitType}
                        {s.address ? ` · ${s.address}` : ''}
                      </span>
                      <StatusBadge status={s.status} declarationOutcome={s.declarationOutcome} />
                    </span>
                    <svg className="prof-stop__chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>
                  </button>
                  {s.receiptId && (
                    <button
                      type="button"
                      className="cert-link"
                      onClick={(e) => {
                        e.stopPropagation()
                        void openCertificate(s.receiptId!, s.certificateUrl).catch(() =>
                          alert('Certificat inaccessible'),
                        )
                      }}
                    >
                      📄 Certificat
                    </button>
                  )}
                </li>
              ))}
            </ol>
          )}
        </section>

        {/* ── Compte ─────────────────────────────────────────── */}
        <section className="prof-account" aria-label="Compte">
          <h2 className="section-title">Compte</h2>
          <ul className="prof-account__list">
            <li>
              <span>Téléphone</span>
              <strong>{driver?.phone ?? '—'}</strong>
            </li>
            <li>
              <span>Synchronisation</span>
              <strong>{online ? '🟢 En ligne' : '🔴 Hors ligne'}</strong>
            </li>
            <li>
              <span>Application</span>
              <strong>TraceO® PWA</strong>
            </li>
          </ul>
        </section>

        <button
          type="button"
          className="btn btn-danger prof-logout"
          onClick={() => void handleLogout()}
        >
          Se déconnecter
        </button>
      </div>
    </div>
  )
}

import { useNavigate } from 'react-router-dom'
import { DriverHero } from '../components/DriverHero'
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
  const deliveredCount = todayStops.filter((s) => s.status === 'delivered').length
  const rejectedCount = todayStops.filter(
    (s) => s.declarationOutcome === 'rejected' || s.status === 'failed',
  ).length
  const remainingCount = todayStops.filter((s) => !isDeliveryTerminal(s.status)).length
  const helloName = driver?.name?.trim().split(/\s+/)[0] || 'Livreur'

  return (
    <div className="page profile-page profile-page--traceo">
      <DriverHero name={helloName} />

      <div className="driver-panel">
        <header className="page-header driver-panel__intro">
          <h1>Profil livreur</h1>
          {driver?.phone && <p className="profile-phone">{driver.phone}</p>}
          <div className="profile-stats" aria-label="Statistiques du jour">
            <div className="profile-stat profile-stat--success">
              <span className="profile-stat__value">{deliveredCount}</span>
              <span className="profile-stat__label">Livrées</span>
            </div>
            <div className="profile-stat">
              <span className="profile-stat__value">{remainingCount}</span>
              <span className="profile-stat__label">Restantes</span>
            </div>
            <div className="profile-stat profile-stat--warn">
              <span className="profile-stat__value">{rejectedCount}</span>
              <span className="profile-stat__label">Refus</span>
            </div>
          </div>
        </header>

        <section className="profile-tools" aria-label="Outils">
          <h2 className="section-title">Outils</h2>
          <ul className="profile-tools__list">
            <li>
              <span className="profile-tools__label">Synchronisation</span>
              <span className={`profile-tools__value${online ? ' profile-tools__value--ok' : ''}`}>
                {online ? 'En ligne' : 'Hors ligne'}
              </span>
            </li>
            <li>
              <span className="profile-tools__label">Application</span>
              <span className="profile-tools__value">TraceO® PWA</span>
            </li>
          </ul>
        </section>

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
            <ul className="history-list">
              {todayStops.map((s) => (
                <li key={s.id} className="history-item">
                  <div>
                    <strong>
                      #{s.sequence} {s.name}
                    </strong>
                    <StatusBadge status={s.status} declarationOutcome={s.declarationOutcome} />
                  </div>
                  {s.receiptId && (
                    <button
                      type="button"
                      className="cert-link"
                      onClick={() =>
                        void openCertificate(s.receiptId!, s.certificateUrl).catch(() =>
                          alert('Certificat inaccessible'),
                        )
                      }
                    >
                      Certificat {s.receiptId}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <button
          type="button"
          className="btn btn-danger profile-logout"
          onClick={() => void handleLogout()}
        >
          Déconnexion
        </button>
      </div>
    </div>
  )
}

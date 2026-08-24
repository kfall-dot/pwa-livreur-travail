import { clearDemoSession, isDemoSession } from '../lib/demoSession'

type DemoBannerProps = {
  role: 'driver' | 'manager'
}

const COPY = {
  driver: {
    title: 'Mode démo livreur',
    body: 'Tournée fictive à Abidjan — explorez la liste, la carte et une livraison comme Aya Livreur.',
  },
  manager: {
    title: 'Mode démo gestionnaire',
    body: 'Données fictives — suivez les livraisons, planifiez une tournée et consultez le détail d’un arrêt.',
  },
} as const

export function DemoBanner({ role }: DemoBannerProps) {
  if (!isDemoSession()) return null
  const copy = COPY[role]

  return (
    <div
      className="demo-banner"
      data-demo-banner
      role="status"
      aria-label={copy.title}
    >
      <div className="demo-banner__copy">
        <strong>{copy.title}</strong>
        <p>{copy.body}</p>
      </div>
      <button
        type="button"
        className="demo-banner__dismiss"
        onClick={() => clearDemoSession()}
        aria-label="Masquer l’indication mode démo"
      >
        ×
      </button>
    </div>
  )
}

import { useOnline } from '../hooks/useOnline'

export function OfflineBanner() {
  const online = useOnline()
  if (online) return null
  return (
    <div role="status" aria-live="polite" className="offline-banner">
      Mode hors ligne — synchronisation à la reconnexion
    </div>
  )
}

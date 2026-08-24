import { NavLink, Outlet } from 'react-router-dom'
import { OfflineBanner } from './OfflineBanner'

function NavIcon({ name }: { name: 'tour' | 'map' | 'profile' }) {
  if (name === 'tour') {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
        <rect x="9" y="3" width="6" height="4" rx="1" />
        <path d="M9 12h6M9 16h4" />
      </svg>
    )
  }
  if (name === 'map') {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21" />
        <line x1="9" y1="3" x2="9" y2="18" />
        <line x1="15" y1="6" x2="15" y2="21" />
      </svg>
    )
  }
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  )
}

export function Layout() {
  return (
    <div className="app-shell app-shell--traceo">
      <OfflineBanner />
      <main className="app-main" id="main-content">
        <Outlet />
      </main>
      <nav className="bottom-nav" aria-label="Navigation principale">
        <NavLink to="/" end className={({ isActive }) => (isActive ? 'active' : '')}>
          <NavIcon name="tour" />
          Tournée
        </NavLink>
        <NavLink to="/map" className={({ isActive }) => (isActive ? 'active' : '')}>
          <NavIcon name="map" />
          Carte
        </NavLink>
        <NavLink to="/profile" className={({ isActive }) => (isActive ? 'active' : '')}>
          <NavIcon name="profile" />
          Profil
        </NavLink>
      </nav>
    </div>
  )
}

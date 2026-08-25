import type { ReactNode, CSSProperties } from 'react'
import { deliveryDisplayStatusLabel, resolveDeliveryDisplayStatus } from '../../lib/deliveryStatusDisplay'
import { statusLabel } from './managerConstants'

/** Tokens TraceO (famille A) — préférer var(--*) pour rester aligné avec index.css
 *  Les contrôles interactifs (boutons, tabs, inputs) utilisent désormais les classes
 *  .mgr-btn / .mgr-tab / .mgr-input de index.css (états hover/focus/active inclus). */
export const css = {
  bg: 'var(--bg)',
  /** @deprecated alias historique — utiliser `brand` */
  gold: 'var(--brand)',
  brand: 'var(--brand)',
  action: 'var(--action)',
  dark: 'var(--text)',
  muted: 'var(--text-muted)',
  border: 'var(--border)',
  td: { padding: '10px 14px', verticalAlign: 'top' } as CSSProperties,
  label: {
    fontSize: 13,
    fontWeight: 600,
    color: 'var(--text-muted)',
    whiteSpace: 'nowrap',
  } as CSSProperties,
  section: {
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    padding: '1.5rem',
    marginBottom: '1.5rem',
    boxShadow: '0 1px 4px rgba(11, 74, 44, 0.06)',
  } as CSSProperties,
  sectionTitle: {
    margin: '0 0 0.75rem',
    fontSize: 18,
    fontWeight: 800,
    color: 'var(--text)',
    fontFamily: 'var(--font-sans)',
  } as CSSProperties,
  layout: {
    display: 'flex',
    minHeight: '100vh',
    background: 'var(--bg)',
  } as CSSProperties,
  sidebar: {
    width: 220,
    flexShrink: 0,
    background: 'var(--brand)',
    color: '#fff',
    display: 'flex',
    flexDirection: 'column',
  } as CSSProperties,
  sidebarBrand: { padding: '1.25rem 1rem 1rem' } as CSSProperties,
  sidebarNav: { display: 'flex', flexDirection: 'column', flex: 1 } as CSSProperties,
  sidebarItem: {
    display: 'block',
    width: '100%',
    textAlign: 'left' as const,
    padding: '0.7rem 1rem',
    border: 'none',
    background: 'transparent',
    color: 'rgba(255,255,255,0.85)',
    fontSize: 13,
    fontWeight: 500,
    cursor: 'pointer',
    borderLeft: '3px solid transparent',
    fontFamily: 'inherit',
  } as CSSProperties,
  sidebarItemActive: {
    display: 'block',
    width: '100%',
    textAlign: 'left' as const,
    padding: '0.7rem 1rem',
    border: 'none',
    background: 'rgba(255,255,255,0.12)',
    color: '#fff',
    fontSize: 13,
    fontWeight: 700,
    cursor: 'pointer',
    borderLeft: '3px solid var(--action)',
    fontFamily: 'inherit',
  } as CSSProperties,
  main: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' } as CSSProperties,
  mainHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '1rem 1.5rem',
    background: 'var(--bg-elevated)',
    borderBottom: '1px solid var(--border)',
  } as CSSProperties,
  mainContent: { padding: '1.5rem', flex: 1 } as CSSProperties,
  catalogueSubnav: {
    display: 'flex',
    gap: 8,
    marginBottom: '1rem',
    flexWrap: 'wrap',
  } as CSSProperties,
  deliveryCard: {
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border)',
    borderRadius: 10,
    padding: '0.9rem 1rem',
    cursor: 'pointer',
    boxShadow: '0 1px 3px rgba(11, 74, 44, 0.05)',
  } as CSSProperties,
  deliveryCardGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
    gap: 12,
  } as CSSProperties,
}

export function DashboardStatusBadge({
  status,
  declarationOutcome,
}: {
  status: string
  declarationOutcome?: string | null
}) {
  const display = resolveDeliveryDisplayStatus(status, declarationOutcome)
  const colors: Record<string, string> = {
    pending: '#92400e',
    in_progress: 'var(--action)',
    otp_sent: '#7c3aed',
    delivered_full: 'var(--success)',
    delivered_partial: 'var(--warn)',
    delivered_rejected: 'var(--danger)',
    failed: 'var(--danger)',
    delivered: 'var(--success)',
  }
  const backgrounds: Record<string, string> = {
    delivered_partial: '#fef3c7',
    delivered_rejected: '#fee2e2',
    failed: '#fee2e2',
  }
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 700,
        color: colors[display] ?? 'var(--text-muted)',
        background: backgrounds[display] ?? '#f5f0e8',
        padding: '2px 8px',
        borderRadius: 20,
      }}
    >
      {declarationOutcome != null || status === 'delivered' || status === 'failed'
        ? deliveryDisplayStatusLabel(status, declarationOutcome)
        : statusLabel(status)}
    </span>
  )
}

export function Toggle({ active, onChange }: { active: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      onClick={onChange}
      style={{
        width: 40,
        height: 22,
        borderRadius: 11,
        border: 'none',
        cursor: 'pointer',
        background: active ? 'var(--brand)' : '#d1d5db',
        position: 'relative',
        transition: 'background .2s',
      }}
      aria-label={active ? 'Actif' : 'Inactif'}
    >
      <span
        style={{
          position: 'absolute',
          top: 3,
          left: active ? 20 : 3,
          width: 16,
          height: 16,
          borderRadius: '50%',
          background: '#fff',
          transition: 'left .2s',
        }}
      />
    </button>
  )
}

export function StatCard({ label, value, testId }: { label: string; value: number; testId?: string }) {
  return (
    <div
      data-testid={testId}
      style={{
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border)',
        borderRadius: 10,
        padding: '1rem 1.5rem',
        minWidth: 120,
        boxShadow: '0 1px 3px rgba(11, 74, 44, 0.05)',
      }}
    >
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--text)' }}>{value}</div>
    </div>
  )
}

export function AlertBox({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="manager-alert">
      {children}
    </p>
  )
}

export function Row({ children }: { children: ReactNode }) {
  return <div style={{ display: 'flex', gap: 10, marginBottom: 8 }}>{children}</div>
}

export function Field({
  label,
  children,
  style,
}: {
  label: string
  children: ReactNode
  style?: CSSProperties
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 1, ...style }}>
      <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>{label}</label>
      {children}
    </div>
  )
}

export function LoadingHint({ children = 'Chargement…' }: { children?: ReactNode }) {
  return (
    <p className="loading-block" role="status" style={{ padding: '1.25rem 0.5rem' }}>
      <span className="loading-block__spinner" aria-hidden="true" />
      <span>{children}</span>
    </p>
  )
}

export function EmptyHint({ children }: { children: ReactNode }) {
  return (
    <p className="empty-state" role="status" style={{ padding: '1.25rem 0.5rem', fontSize: 13 }}>
      {children}
    </p>
  )
}

// ─── Composants de liste pro (recherche, filtres, badges, avatars) ───────────

/** Avatar circulaire à initiales, couleur déterminée par le nom. */
const AVATAR_COLORS = ['#0b4a2c', '#e85d04', '#92400e', '#1d4ed8', '#6d28d9', '#0e7490', '#b91c1c']
export function InitialsAvatar({ name }: { name: string }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('') || '?'
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0
  const color = AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
  return (
    <span className="mgr-avatar" style={{ background: color }} aria-hidden="true">
      {initials}
    </span>
  )
}

/** Badge d'état lisible (complète un Toggle pour nommer l'état). */
export function StatusBadge({
  active,
  okLabel = 'Actif',
  offLabel = 'Inactif',
}: {
  active: boolean
  okLabel?: string
  offLabel?: string
}) {
  return (
    <span className={`mgr-badge ${active ? 'mgr-badge--ok' : 'mgr-badge--off'}`}>
      {active ? okLabel : offLabel}
    </span>
  )
}

/** Champ de recherche filtrante avec icône loupe. */
export function ListSearchInput({
  value,
  onChange,
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  placeholder: string
}) {
  return (
    <div className="mgr-search">
      <svg className="mgr-search__icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <circle cx="11" cy="11" r="7" />
        <path d="m21 21-4-4" />
      </svg>
      <input
        type="search"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  )
}

/** Groupe de filtres segmentés (Tous / Actifs / Suspendus…). */
export function FilterSegmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: Array<{ label: string; value: T }>
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div className="mgr-filter-seg" role="group">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className={value === o.value ? 'on' : ''}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** Titre de liste avec compteur dynamique. */
export function ListHeading({ title, count, suffix }: { title: string; count?: number; suffix?: string }) {
  return (
    <div className="mgr-list-head">
      <h3 className="mgr-list-title">
        {title}
        {count != null && (
          <span className="mgr-count-chip">
            {count} {suffix ?? (count === 1 ? 'élément' : 'éléments')}
          </span>
        )}
      </h3>
    </div>
  )
}

/** Rangée de mini-cartes statistiques. */
export function MiniStatRow({ items }: { items: Array<{ value: number | string; label: string; accent?: boolean }> }) {
  return (
    <div className="mgr-stat-row">
      {items.map((it) => (
        <div key={it.label} className="mgr-mini-stat" style={it.accent ? undefined : undefined}>
          <div className="mgr-mini-stat__v" style={{ color: it.accent ? 'var(--brand)' : undefined }}>{it.value}</div>
          <div className="mgr-mini-stat__l">{it.label}</div>
        </div>
      ))}
    </div>
  )
}

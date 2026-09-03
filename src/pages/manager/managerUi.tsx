import type { ReactNode, CSSProperties } from 'react'
import { deliveryDisplayStatusLabel, resolveDeliveryDisplayStatus } from '../../lib/deliveryStatusDisplay'
import { statusLabel } from './managerConstants'

/** Tokens TraceO (famille A) — préférer var(--*) pour rester aligné avec index.css */
export const css = {
  bg: 'var(--bg)',
  /** @deprecated alias historique — utiliser `brand` */
  gold: 'var(--brand)',
  brand: 'var(--brand)',
  action: 'var(--action)',
  dark: 'var(--text)',
  muted: 'var(--text-muted)',
  border: 'var(--border)',
  input: {
    padding: '7px 10px',
    border: '1px solid var(--border)',
    borderRadius: 6,
    fontSize: 13,
    width: '100%',
    boxSizing: 'border-box',
    background: 'var(--bg-elevated)',
    fontFamily: 'inherit',
  } as CSSProperties,
  inputCompact: {
    padding: '6px 8px',
    border: '1px solid var(--border)',
    borderRadius: 6,
    fontSize: 13,
    width: 'auto',
    background: 'var(--bg-elevated)',
    fontFamily: 'inherit',
  } as CSSProperties,
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
  tab: {
    padding: '8px 16px',
    borderRadius: '8px 8px 0 0',
    border: '1px solid var(--border)',
    borderBottom: 'none',
    background: 'transparent',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 700,
    color: 'var(--text-muted)',
    fontFamily: 'inherit',
  } as CSSProperties,
  tabActive: {
    padding: '8px 16px',
    borderRadius: '8px 8px 0 0',
    border: '1px solid var(--border)',
    borderBottom: '2px solid var(--brand)',
    background: 'var(--bg-elevated)',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 700,
    color: 'var(--brand)',
    fontFamily: 'inherit',
  } as CSSProperties,
  btnGold: {
    padding: '8px 18px',
    background: 'var(--action)',
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 600,
    fontFamily: 'inherit',
  } as CSSProperties,
  btnGhost: {
    padding: '8px 14px',
    background: 'none',
    border: '1px solid var(--border)',
    borderRadius: 6,
    cursor: 'pointer',
    fontSize: 13,
    color: 'var(--text)',
    fontFamily: 'inherit',
  } as CSSProperties,
  btnOutline: {
    padding: '5px 12px',
    background: 'none',
    border: '1px solid var(--border)',
    borderRadius: 6,
    cursor: 'pointer',
    fontSize: 12,
    color: 'var(--text)',
    fontFamily: 'inherit',
  } as CSSProperties,
  btnDanger: {
    padding: '5px 12px',
    background: 'none',
    border: '1px solid #fecaca',
    borderRadius: 6,
    cursor: 'pointer',
    fontSize: 12,
    color: 'var(--danger)',
    fontFamily: 'inherit',
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

const TONE_COLORS: Record<string, string> = {
  warn: '#d97706',
  success: '#15803d',
  info: '#1d4ed8',
  brand: '#0b4a2c',
  danger: '#dc2626',
}

export function StatCard({ label, value, testId, tone }: { label: string; value: number; testId?: string; tone?: string }) {
  const valueColor = tone ? TONE_COLORS[tone] ?? 'var(--text)' : 'var(--text)'
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
      <div style={{ fontSize: 28, fontWeight: 800, color: valueColor }}>{value}</div>
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

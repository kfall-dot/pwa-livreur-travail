import type { CSSProperties } from 'react'
import { css as managerCss } from '../managerUi'
import type { ProcurementRole, PurchaseRequestStatus } from './procurementTypes'

export const css = {
  ...managerCss,
  subnav: managerCss.catalogueSubnav,
  card: {
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border)',
    borderRadius: 10,
    padding: '1rem 1.25rem',
    boxShadow: '0 1px 3px rgba(11, 74, 44, 0.05)',
  } as CSSProperties,
  cardClickable: {
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border)',
    borderRadius: 10,
    padding: '1rem 1.25rem',
    cursor: 'pointer',
    boxShadow: '0 1px 3px rgba(11, 74, 44, 0.05)',
  } as CSSProperties,
  messageBox: {
    background: '#f0fdf4',
    border: '1px solid #bbf7d0',
    borderRadius: 8,
    padding: '0.75rem 1rem',
    fontSize: 13,
    whiteSpace: 'pre-wrap' as const,
    fontFamily: 'inherit',
  } as CSSProperties,
  transcriptBox: {
    background: '#fffbeb',
    border: '1px solid #fde68a',
    borderRadius: 8,
    padding: '0.75rem 1rem',
    fontSize: 13,
  } as CSSProperties,
  lineTable: {
    width: '100%',
    borderCollapse: 'collapse' as const,
    fontSize: 13,
  } as CSSProperties,
  lineTh: {
    textAlign: 'left' as const,
    padding: '6px 8px',
    borderBottom: '2px solid var(--border)',
    fontSize: 11,
    fontWeight: 700,
    color: 'var(--text-muted)',
  } as CSSProperties,
  lineTd: {
    padding: '6px 8px',
    borderBottom: '1px solid var(--border)',
    verticalAlign: 'top' as const,
  } as CSSProperties,
  ficheWrap: {
    border: '2px solid #1e3a5f',
    overflow: 'hidden',
    marginTop: '1rem',
    background: '#fff',
  } as CSSProperties,
  ficheTitle: {
    background: '#1e3a5f',
    color: '#fff',
    textAlign: 'center',
    fontSize: 18,
    fontWeight: 700,
    letterSpacing: '.08em',
    padding: '10px 12px',
    margin: 0,
  } as CSSProperties,
  ficheMeta: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: 13,
  } as CSSProperties,
  ficheMetaTd: {
    border: '1px solid #1e3a5f',
    padding: '8px 10px',
    verticalAlign: 'top',
  } as CSSProperties,
  ficheLabel: {
    fontSize: 11,
    fontWeight: 700,
    textTransform: 'uppercase' as const,
    color: '#1e3a5f',
    marginBottom: 4,
  } as CSSProperties,
  ficheDemandeur: {
    width: '16%',
    background: '#e8eef4',
    fontWeight: 700,
    textAlign: 'center',
    verticalAlign: 'middle',
    letterSpacing: '.04em',
    border: '1px solid #1e3a5f',
    padding: 8,
  } as CSSProperties,
  actionRow: {
    display: 'flex',
    gap: 8,
    flexWrap: 'wrap' as const,
    marginTop: '1rem',
  } as CSSProperties,
  meta: {
    fontSize: 12,
    color: 'var(--text-muted)',
  } as CSSProperties,
}

export const PROCUREMENT_ROLE_LABELS: Record<ProcurementRole, string> = {
  site_controller: 'Contrôleur chantier',
  technical_director: 'Directeur technique',
  daf: 'DAF',
  purchasing: 'Service achats',
  pdg: 'PDG',
  controle_gestion: 'Contrôle de gestion',
  site_manager: 'Chef de chantier',
}

export function approvalDecisionLabel(role: ProcurementRole, decision: string): string {
  if (decision !== 'approved') return 'Rejeté'
  if (role === 'technical_director') return 'Validé'
  if (role === 'purchasing') return 'Traité'
  if (role === 'daf') return 'Montant approuvé'
  return 'Approuvé'
}

export function formatApprovalAt(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const date = d.toLocaleDateString('fr-FR')
  const time = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
  return `${date} ${time}`.replace(',', '')
}

/** DT, SA, DAF, PDG : espace achats (pas le cockpit tournées). */
export function isProcurementWorkspaceRole(role: string | null | undefined): boolean {
  return (
    role === 'technical_director' ||
    role === 'purchasing' ||
    role === 'daf' ||
    role === 'pdg' ||
    role === 'controle_gestion'
  )
}

export function canSeeSuiviChantier(role: string | null | undefined): boolean {
  return (
    role === 'technical_director' ||
    role === 'controle_gestion' ||
    role === 'daf' ||
    role === 'pdg' ||
    role === 'site_manager'
  )
}

/** Chef de chantier : page « Ma journée » (dossier quotidien). */
export function isSiteManagerRole(role: string | null | undefined): boolean {
  return role === 'site_manager'
}

/** Superviseur de dossiers de chantier : DT + CdG + DAF. */
export function canSeeDossiers(role: string | null | undefined): boolean {
  return canSeeSuiviChantier(role)
}

// ─── Matrice Suivi chantier : qui voit quel bloc ─────────────────────────────

export type SuiviChantierBlock =
  | 'dossiers'
  | 'enveloppe'
  | 'indicateurs'
  | 'stock'
  | 'affectation'
  | 'historique'
  | 'photos'

export const SUIVI_CHANTIER_BLOCK_LABELS: Record<SuiviChantierBlock, string> = {
  dossiers: '📁 Dossiers du jour',
  enveloppe: '💰 Enveloppe (budget, feux, avenants)',
  indicateurs: '📊 Indicateurs (ventilation, top 3)',
  stock: '📦 Stock réel',
  affectation: '👷 Affectation chef/DT',
  historique: '📅 Historique des rapports',
  photos: '📷 Photos de chantier',
}

/** Matrice définie par le métier : blocs visibles par rôle. */
export const SUIVI_CHANTIER_MATRIX: Record<SuiviChantierBlock, ProcurementRole[]> = {
  dossiers: ['technical_director', 'site_manager'],
  enveloppe: ['daf', 'controle_gestion', 'pdg'],
  indicateurs: ['controle_gestion', 'daf', 'pdg'],
  stock: ['technical_director', 'controle_gestion'],
  affectation: ['technical_director'],
  historique: ['technical_director', 'controle_gestion', 'site_manager'],
  photos: ['technical_director', 'daf', 'controle_gestion', 'pdg', 'site_manager'],
}

export function canSeeSuiviBlock(
  block: SuiviChantierBlock,
  role: ProcurementRole | null | undefined,
): boolean {
  if (!role) return false
  return SUIVI_CHANTIER_MATRIX[block].includes(role)
}

export const STATUS_LABELS: Record<PurchaseRequestStatus, string> = {
  whatsapp_ingested: 'WhatsApp reçu',
  draft_parsed: 'Brouillon parsé',
  draft_review: 'À réviser',
  submitted: 'Transmis SA',
  cdg_review: 'Validation CdG',
  daf_review: 'Validation DAF',
  sa_review: 'Émission BC',
  bt_pending: 'BT en préparation',
  daf_bt_review: 'BT — validation DAF',
  pdg_review: 'Validation PDG',
  po_ready: 'BC prêt',
  delivery_scheduled: 'Livraison planifiée',
  delivered: 'Livré',
  rejected: 'Rejeté',
}

const STATUS_COLORS: Partial<Record<PurchaseRequestStatus, { color: string; bg: string }>> = {
  draft_review: { color: '#92400e', bg: '#fef3c7' },
  cdg_review: { color: '#0f766e', bg: '#ccfbf1' },
  daf_review: { color: '#1d4ed8', bg: '#dbeafe' },
  sa_review: { color: '#6d28d9', bg: '#ede9fe' },
  pdg_review: { color: '#9d174d', bg: '#fce7f3' },
  po_ready: { color: '#166534', bg: '#dcfce7' },
  delivery_scheduled: { color: '#0f766e', bg: '#ccfbf1' },
  delivered: { color: 'var(--success)', bg: '#dcfce7' },
  rejected: { color: 'var(--danger)', bg: '#fee2e2' },
}

export function ProcurementStatusBadge({ status }: { status: PurchaseRequestStatus | string }) {
  const palette = STATUS_COLORS[status as PurchaseRequestStatus] ?? {
    color: 'var(--text-muted)',
    bg: '#f5f0e8',
  }
  const label = STATUS_LABELS[status as PurchaseRequestStatus] ?? status
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 700,
        color: palette.color,
        background: palette.bg,
        padding: '2px 8px',
        borderRadius: 20,
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </span>
  )
}

export function formatFcfa(amount?: number | null): string {
  if (amount == null) return '—'
  return `${amount.toLocaleString('fr-FR')} FCFA`
}

export function formatPct(value?: number | null): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return `${value.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} %`
}

export type BudgetTrafficLight = 'none' | 'ok' | 'watch' | 'alert'

export const TRAFFIC_LIGHT_LABEL: Record<BudgetTrafficLight, string> = {
  none: '—',
  ok: 'Neutre',
  watch: 'Vigilance',
  alert: 'Alerte',
}

export const TRAFFIC_LIGHT_STYLE: Record<BudgetTrafficLight, { color: string; bg: string }> = {
  none: { color: 'var(--text-muted)', bg: 'transparent' },
  ok: { color: '#0f766e', bg: '#ccfbf1' },
  watch: { color: '#b45309', bg: '#fef3c7' },
  alert: { color: '#b91c1c', bg: '#fee2e2' },
}

export function formatConfidence(score?: string | number | null): string {
  if (score == null || score === '') return '—'
  const n = typeof score === 'number' ? score : Number.parseFloat(String(score))
  if (!Number.isFinite(n)) return '—'
  return `${Math.round(n * 100)} %`
}

export function canApproveRequest(
  status: PurchaseRequestStatus,
  role: ProcurementRole | null | undefined,
): boolean {
  if (!role) return false
  if (role === 'daf' && (status === 'daf_review' || status === 'daf_bt_review')) return true
  if (role === 'pdg' && status === 'pdg_review') return true
  if (role === 'controle_gestion' && status === 'cdg_review') return true
  return false
}

export function canRejectRequest(
  status: PurchaseRequestStatus,
  role: ProcurementRole | null | undefined,
): boolean {
  return canApproveRequest(status, role)
}

export function canCreatePo(
  status: PurchaseRequestStatus,
  role: ProcurementRole | null | undefined,
): boolean {
  return role === 'purchasing' && (status === 'sa_review' || status === 'bt_pending' || status === 'po_ready')
}

export function canScheduleDelivery(
  status: PurchaseRequestStatus,
  role: ProcurementRole | null | undefined,
  orders: Array<{ tourId?: string | null }> = [],
): boolean {
  if (role !== 'purchasing') return false
  if (status !== 'po_ready' && status !== 'delivery_scheduled') return false
  if (orders.length === 0) return status === 'po_ready'
  return orders.some((p) => !p.tourId)
}

export function canEditDraft(role: ProcurementRole | null | undefined): boolean {
  return role === 'technical_director'
}

export function canPriceRequest(
  status: PurchaseRequestStatus,
  role: ProcurementRole | null | undefined,
): boolean {
  return role === 'purchasing' && status === 'submitted'
}

export { Field, StatCard, AlertBox, EmptyHint, LoadingHint, Row } from '../managerUi'

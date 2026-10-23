export const PROCUREMENT_LOCK_TTL_SECONDS = 120

export function canTakeProcurementEditLock(input: {
  kind: 'drafts' | 'requests'
  status: string
  role: string | null
  managerId: string
  reviewerId?: string | null
  supervisorId?: string | null
  linkedRequestId?: string | null
}): boolean {
  const { kind, status, role, managerId, reviewerId, supervisorId } = input
  if (kind === 'drafts') return !input.linkedRequestId && status !== 'deleted' && ['technical_director', 'site_manager', 'purchasing'].includes(role ?? '')
  if (status === 'sa_head_review') return role === 'purchasing' && !supervisorId && managerId === reviewerId
  if (status === 'bc_head_review') return role === 'purchasing' && (managerId === reviewerId || supervisorId === reviewerId)
  if (status === 'submitted' || status === 'sa_review' || status === 'bt_pending') return role === 'purchasing'
  if (status === 'dt_review') return role === 'technical_director'
  if (status === 'cdg_review') return role === 'controle_gestion'
  if (status === 'daf_review' || status === 'daf_bt_review') return role === 'daf' || role === 'pdg'
  if (status === 'pdg_review') return role === 'pdg'
  if (status === 'po_ready' || status === 'delivery_scheduled') return role === 'purchasing' || role === 'technical_director'
  return false
}

import { EFPC_IDENTITY } from '../../../shared/companyIdentity'
export function EfpcMark({ compact = false }: { compact?: boolean }) {
  if (compact) return <div className="efpc-workspace-mark">
    <img src={EFPC_IDENTITY.logoUrl} alt="Logo EFPC" width="122" height="106" />
    <p>{EFPC_IDENTITY.legalName}</p>
  </div>
  return <div style={{ display: 'flex', alignItems: 'center', gap: 14, textAlign: 'left' }}>
    <img src={EFPC_IDENTITY.logoUrl} alt="Logo EFPC" width={compact ? 52 : 84} height={compact ? 52 : 84} style={{ objectFit: 'contain', background: '#fff', borderRadius: 10, padding: 5, flexShrink: 0 }} />
    <div><strong style={{ display: 'block', fontSize: compact ? 21 : 28, letterSpacing: 1 }}>EFPC</strong>
      {!compact && <p style={{ fontSize: 14, lineHeight: 1.5, maxWidth: 300, marginTop: 6 }}>{EFPC_IDENTITY.legalName}</p>}
    </div>
  </div>
}

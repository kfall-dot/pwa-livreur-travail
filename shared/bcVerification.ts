export type BcVerificationAudit = { byManagerId: string; byName: string; at: string; comment: string }
/** Les anciennes notes libres restent lisibles, mais ne constituent pas un visa CdG. */
export function readBcVerification(raw: string | null | undefined): BcVerificationAudit | null {
  if (!raw) return null
  try {
    const value = JSON.parse(raw)
    if (value?.kind !== 'cdg_verification' || typeof value.byManagerId !== 'string' || !value.byManagerId || typeof value.byName !== 'string' || typeof value.at !== 'string' || !Number.isFinite(Date.parse(value.at)) || typeof value.comment !== 'string') return null
    return { byManagerId: value.byManagerId, byName: value.byName, at: value.at, comment: value.comment }
  } catch { return null }
}

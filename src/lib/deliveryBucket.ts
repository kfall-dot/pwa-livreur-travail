/**
 * Classification d'une livraison — **source unique** des tuiles et des chips de
 * la page Livraisons (OTP bloqué / Écarts / Livrées) : ce qu'une tuile compte
 * est exactement ce que le chip correspondant affiche.
 *
 * La déclaration du livreur (declarationOutcome) prime sur le statut de
 * l'arrêt : une livraison partielle ou refusée laisse le statut « delivered »
 * (l'arrêt a été exécuté) mais doit rester un **écart**. Valeurs canoniques
 * produites par le formulaire livreur : 'partial' | 'rejected' — 'refused' est
 * conservé en repli pour d'éventuelles données anciennes.
 */
export type DeliveryBucket = 'all' | 'pending' | 'progress' | 'otp' | 'delivered' | 'failed'

export function deliveryBucket(
  row: { status?: string | null; declarationOutcome?: string | null },
): Exclude<DeliveryBucket, 'all'> {
  const s = (row.status ?? '').toLowerCase()
  const outcome = row.declarationOutcome
  if (
    outcome === 'partial' ||
    outcome === 'rejected' ||
    outcome === 'refused' ||
    s.includes('partial') ||
    s.includes('refus') ||
    s.includes('fail')
  ) {
    return 'failed'
  }
  if (s.includes('deliver') || s.includes('validat')) return 'delivered'
  if (s.includes('otp')) return 'otp'
  if (s.includes('progress')) return 'progress'
  return 'pending'
}

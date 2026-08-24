export function todayIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function isTourDatePast(tourDate: string): boolean {
  return tourDate < todayIso()
}

/** Garde-fous synchrones (statut / date) avant accès DB. */
export function otpAssistStatusBlock(
  status: string,
  tourDate: string,
): string | null {
  if (status === 'delivered' || status === 'failed') {
    return 'Livraison déjà terminée.'
  }
  if (isTourDatePast(tourDate)) {
    return 'Tournée passée — OTP indisponible.'
  }
  if (status !== 'in_progress' && status !== 'otp_sent') {
    return 'Le livreur doit avoir démarré la livraison et saisi la déclaration avant l’OTP.'
  }
  return null
}

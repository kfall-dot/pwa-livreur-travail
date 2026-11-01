/** L'accès aux fichiers dépend du résultat de chargement, pas du fournisseur de stockage. */
export function deliveryPhotoGalleryNotice(recordedCount: number, listedCount: number, visibleCount: number, error?: string | null): string | null {
  if (error) return error
  const expected = Math.max(recordedCount, listedCount)
  if (visibleCount >= expected) return null
  const missing = expected - visibleCount
  return `${missing} photo(s) comptabilisée(s) mais non accessible(s) sur cet environnement. Vérifiez le stockage utilisé et l’environnement où les photos ont été déposées.`
}

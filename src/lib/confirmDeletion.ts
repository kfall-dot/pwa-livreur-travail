/** Demande une confirmation explicite avant une suppression ou désactivation définitive. */
export function confirmDeletion(message: string): boolean {
  return window.confirm(`${message}\n\nCette action est irréversible. Continuer ?`)
}

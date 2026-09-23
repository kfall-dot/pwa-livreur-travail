/**
 * Message affiché quand la réponse d'échec n'est pas exploitable : typiquement
 * une page HTML (ou un corps vide) renvoyée par la gateway pendant un
 * redéploiement (Railway renvoie 502/504 sans JSON).
 */
export const SERVER_UNAVAILABLE_MESSAGE =
  'Serveur momentanément indisponible (redéploiement en cours ?) — réessayez dans 1 minute.'

/**
 * Construit l'erreur à afficher depuis une réponse HTTP en échec.
 *
 * INVARIANT : le corps de la réponse n'est lu qu'UNE SEULE FOIS, ici. Un
 * appelant qui a déjà consommé le corps (`await res.json()`) ne doit jamais
 * appeler cette fonction : la seconde lecture lèverait « Body is unusable » et
 * masquerait le vrai message serveur (401 NIP, 403 rôle, 409 déjà gelée…)
 * derrière un faux « redéploiement en cours ». Dans ce cas on préfère exposer
 * le code HTTP plutôt qu'un diagnostic trompeur.
 */
export async function apiErrorMessage(res: Response, fallback: string): Promise<Error> {
  const raw = await res.text().catch(() => null)
  if (raw === null) {
    // Corps inaccessible : déjà lu par l'appelant (bug côté client), ne jamais
    // afficher « redéploiement en cours » dans ce cas.
    return new Error(`${fallback} (HTTP ${res.status})`)
  }

  const trimmed = raw.trim()
  if (!trimmed) return new Error(SERVER_UNAVAILABLE_MESSAGE)

  try {
    const parsed = JSON.parse(trimmed) as { message?: unknown } | null
    const message = typeof parsed?.message === 'string' ? parsed.message.trim() : ''
    return new Error(message || fallback)
  } catch {
    // Corps non JSON (page HTML d'une gateway) : serveur en cours de redéploiement.
    return new Error(SERVER_UNAVAILABLE_MESSAGE)
  }
}
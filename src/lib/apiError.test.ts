import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { apiErrorMessage, SERVER_UNAVAILABLE_MESSAGE } from './apiError.ts'

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

describe('apiErrorMessage — messages d’erreur API achats', () => {
  it('expose le message JSON du serveur (NIP erroné, 401)', async () => {
    const err = await apiErrorMessage(
      jsonResponse({ message: 'NIP incorrect ou utilisateur inconnu' }, 401),
      'Gel de l’enveloppe impossible',
    )
    assert.equal(err.message, 'NIP incorrect ou utilisateur inconnu')
  })

  it('expose le message JSON du serveur (403 rôle exact controle_gestion)', async () => {
    const err = await apiErrorMessage(
      jsonResponse({ message: 'Accès réservé aux rôles : controle_gestion' }, 403),
      'Gel de l’enveloppe impossible',
    )
    assert.equal(err.message, 'Accès réservé aux rôles : controle_gestion')
  })

  it('expose le message JSON du serveur (409 enveloppe déjà gelée)', async () => {
    const err = await apiErrorMessage(
      jsonResponse({ message: 'Enveloppe déjà gelée' }, 409),
      'Gel de l’enveloppe impossible',
    )
    assert.equal(err.message, 'Enveloppe déjà gelée')
  })

  it('JSON sans champ message → fallback métier', async () => {
    const err = await apiErrorMessage(jsonResponse({ ok: false }, 500), 'Gel de l’enveloppe impossible')
    assert.equal(err.message, 'Gel de l’enveloppe impossible')
  })

  it('page HTML 502 (gateway pendant un redéploiement) → message de redéploiement', async () => {
    const res = new Response('<html><body>502 Bad Gateway</body></html>', {
      status: 502,
      headers: { 'content-type': 'text/html' },
    })
    const err = await apiErrorMessage(res, 'Gel de l’enveloppe impossible')
    assert.equal(err.message, SERVER_UNAVAILABLE_MESSAGE)
  })

  it('corps vide → message de redéploiement', async () => {
    const err = await apiErrorMessage(new Response('', { status: 504 }), 'Gel de l’enveloppe impossible')
    assert.equal(err.message, SERVER_UNAVAILABLE_MESSAGE)
  })

  it('RÉGRESSION : corps déjà consommé par res.json() → jamais le message de redéploiement', async () => {
    const res = jsonResponse({ message: 'NIP incorrect ou utilisateur inconnu' }, 401)
    await res.json() // mimique l’ancien appelant fautif (freezeSiteBudget)
    const err = await apiErrorMessage(res, 'Gel de l’enveloppe impossible')
    assert.equal(err.message, 'Gel de l’enveloppe impossible (HTTP 401)')
    assert.notEqual(err.message, SERVER_UNAVAILABLE_MESSAGE)
  })
})

/**
 * Garde-fou : un appelant ne doit jamais consommer le corps de la réponse avant
 * d’appeler `apiErrorMessage` — sinon la seconde lecture lève « Body is unusable »
 * et le vrai message serveur (401/403/409) est remplacé par un faux
 * « redéploiement en cours » (bug du bouton « Geler l’enveloppe »).
 */
describe('procurementApi — invariant : le corps d’une réponse est lu une seule fois', () => {
  const SOURCE = new URL('../pages/manager/procurement/procurementApi.ts', import.meta.url)

  function enclosingDeclarationIndex(lines: string[], index: number): number {
    for (let i = index - 1; i >= 0; i -= 1) {
      if (/^(export )?(default )?(async )?function\b/.test(lines[i])) return i
      if (/^const \w+ = /.test(lines[i])) return i
    }
    return 0
  }

  it('aucun res.json()/res.text() ne précède un appel à apiErrorMessage', () => {
    const lines = readFileSync(SOURCE, 'utf8').split('\n')
    const offenders: string[] = []
    let callSites = 0

    lines.forEach((line, index) => {
      if (!line.includes('apiErrorMessage(')) return
      callSites += 1
      const start = enclosingDeclarationIndex(lines, index)
      const block = lines.slice(start, index).join('\n')
      if (/\bres\.(json|text)\(/.test(block)) {
        offenders.push(`ligne ${index + 1} : ${line.trim()}`)
      }
    })

    // Anti-test-vide : le fichier doit bien contenir des appels au helper.
    assert.ok(callSites > 20, `appels apiErrorMessage détectés : ${callSites}`)
    assert.deepEqual(offenders, [], `corps lu avant apiErrorMessage :\n${offenders.join('\n')}`)
  })
})
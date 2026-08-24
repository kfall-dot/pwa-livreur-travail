import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  collectErrorMessages,
  hasTransientDbCause,
  shouldDropSentryError,
} from './sentryFilters.js'

describe('sentryFilters', () => {
  it('collecte les messages dans la chaîne cause', () => {
    const inner = new Error('ETIMEDOUT')
    ;(inner as Error & { code?: string }).code = 'ETIMEDOUT'
    const outer = new Error('Failed query: select from managers')
    ;(outer as Error & { cause?: unknown }).cause = inner
    assert.deepEqual(collectErrorMessages(outer), [
      'Failed query: select from managers',
      'ETIMEDOUT',
    ])
  })

  it('détecte cause DB transitoire', () => {
    const err = new Error('Failed query: select')
    ;(err as Error & { cause?: unknown }).cause = { code: 'ETIMEDOUT', message: 'connect' }
    assert.equal(hasTransientDbCause(err), true)
  })

  it('filtre le script de test Sentry', () => {
    assert.equal(
      shouldDropSentryError(new Error('TraceO Sentry test — supprimez cet issue')),
      true,
    )
  })

  it('filtre spike sécurité', () => {
    assert.equal(shouldDropSentryError(new Error('Spike détecté: login_failures')), true)
  })

  it('filtre Failed query + timeout', () => {
    const err = new Error('Failed query: select from "managers"')
    ;(err as Error & { cause?: unknown }).cause = { code: 'ETIMEDOUT' }
    assert.equal(shouldDropSentryError(err), true)
  })

  it('conserve une vraie erreur métier', () => {
    assert.equal(shouldDropSentryError(new Error('column "foo" does not exist')), false)
  })

  it('filtre ChunkLoadError', () => {
    assert.equal(shouldDropSentryError(new Error('Loading chunk 42 failed')), true)
  })
})

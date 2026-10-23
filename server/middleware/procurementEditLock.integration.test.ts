import { test } from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { Pool } from '@neondatabase/serverless'
import { getPool, resolveDatabaseUrl } from '../db/index.js'
import { getManagerByEmail } from '../db/queries.js'
import { procurementEditLock } from './procurementEditLock.js'
import type { ManagerRequest } from './managerAuth.js'

// Exécution explicite : utilise uniquement des identifiants de document fictifs.
test('verrou PostgreSQL : concurrence chef/adjoint, expiration, libération et écriture active', { skip: !process.env.NETLIFY_DB_URL && !process.env.E2E_DATABASE_URL }, async () => {
  const pool = new Pool({ connectionString: resolveDatabaseUrl(), max: 8, connectionTimeoutMillis: 10000 })
  const prefix = `test-lock-${randomUUID()}`
  const [head, resource] = await Promise.all([getManagerByEmail('sa@btp-pilote.ci'), getManagerByEmail('sa_adj@btp-pilote.ci')])
  assert.ok(head && resource && head.companyId === resource.companyId)
  const migrationClient = await pool.connect()
  try {
    await migrationClient.query('BEGIN')
    await migrationClient.query(readFileSync('server/db/migrations/20261022220000_procurement_edit_locks/migration.sql', 'utf8'))
    await migrationClient.query("INSERT INTO __migration_history(name) VALUES ('20261022220000_procurement_edit_locks') ON CONFLICT(name) DO NOTHING")
    await migrationClient.query('COMMIT')
  } catch (err) { await migrationClient.query('ROLLBACK'); throw err }
  finally { migrationClient.release() }
  const app = express()
  app.use(express.json())
  app.use((req, _res, next) => {
    const actor = req.header('x-test-actor') === 'resource' ? resource : head
    ;(req as ManagerRequest).manager = { sub: actor.id, companyId: actor.companyId, email: actor.email, managerRole: actor.role, procurementRole: actor.procurementRole, role: 'manager' }
    next()
  })
  app.use('/requests/:id', procurementEditLock('requests', (req) => String(req.params.id), {
    pool, loadDocument: async (_company, id) => id.startsWith(prefix) ? { status: 'submitted' } : null,
  }))
  let edits = 0
  let beginWrite: (() => void) | undefined
  let finishWrite: (() => void) | undefined
  const started = new Promise<void>((resolve) => { beginWrite = resolve })
  const gate = new Promise<void>((resolve) => { finishWrite = resolve })
  app.patch('/requests/:id/pricing', async (req, res) => {
    if (req.body.wait) { beginWrite?.(); await gate }
    edits += 1
    res.json({ ok: true })
  })
  const server = app.listen(0, '127.0.0.1')
  await new Promise<void>((resolve) => server.once('listening', resolve))
  const address = server.address()
  assert.ok(address && typeof address !== 'string')
  const baseUrl = `http://127.0.0.1:${address.port}/requests/`
  const call = (actor: string, method: string, suffix: string, body?: object, doc = prefix) => fetch(`${baseUrl}${doc}${suffix}`, { method, headers: { 'x-test-actor': actor, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) })
  try {
    const claims = await Promise.all([call('head', 'POST', '/lock'), call('resource', 'POST', '/lock')])
    assert.deepEqual(claims.map((r) => r.status).sort(), [200, 423])
    const winner = claims[0]!.status === 200 ? 'head' : 'resource'
    const loser = winner === 'head' ? 'resource' : 'head'
    assert.equal((await call(loser, 'PATCH', '/pricing', {})).status, 423)
    assert.equal(edits, 0)
    assert.equal((await call(winner, 'PATCH', '/pricing', {})).status, 200)
    assert.equal(edits, 1)
    assert.equal((await call(loser, 'DELETE', '/lock')).status, 423)
    assert.equal((await call(winner, 'POST', '/lock/renew')).status, 200)
    assert.equal((await call(winner, 'DELETE', '/lock')).status, 200)
    assert.equal((await call(loser, 'POST', '/lock')).status, 200)
    await pool.query('UPDATE procurement_edit_locks SET expires_at=now()-interval \'1 second\' WHERE company_id=$1 AND document_id=$2', [head.companyId, prefix])
    assert.equal((await call(winner, 'POST', '/lock')).status, 200)
    assert.equal((await call(loser, 'PATCH', '/pricing', {})).status, 423)
    const writing = call(winner, 'PATCH', '/pricing', { wait: true })
    await started
    assert.equal((await call(loser, 'POST', '/lock')).status, 423)
    assert.equal((await call(winner, 'DELETE', '/lock')).status, 423)
    assert.equal((await call(loser, 'POST', '/lock', undefined, `${prefix}-other`)).status, 200)
    finishWrite?.()
    assert.equal((await writing).status, 200)
    const read = await call(loser, 'GET', '/lock')
    assert.equal(read.status, 200)
    assert.equal((await read.json() as { ownedByMe: boolean }).ownedByMe, false)
  } finally {
    finishWrite?.()
    await new Promise<void>((resolve, reject) => server.close((err) => err ? reject(err) : resolve()))
    await pool.query('DELETE FROM procurement_edit_locks WHERE company_id=$1 AND document_id IN ($2,$3)', [head.companyId, prefix, `${prefix}-other`])
    await pool.end()
    await getPool().end()
  }
})

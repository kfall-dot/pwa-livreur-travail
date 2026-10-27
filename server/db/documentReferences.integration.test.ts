import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { getPool } from './index.js'
import { nextDocumentReference, type DocumentPrefix } from './documentReferences.js'

test('compteurs PostgreSQL : concurrence, reprise, suppression, année, compagnie et contraintes', {
  skip: process.env.RUN_DOCUMENT_REFERENCES_INTEGRATION !== '1', timeout: 120_000,
}, async () => {
  // Toutes les écritures sont confinées dans ce schéma éphémère, jamais dans les tables de l’application.
  const schema = `test_doc_refs_${randomUUID().replaceAll('-', '')}`
  assert.match(schema, /^test_doc_refs_[a-f0-9]{32}$/)
  const pool = getPool(), client = await pool.connect()
  const workers: typeof client[] = []
  const migration = ['20261027120000_document_reference_counters', '20261027123000_document_reference_tracking'].map(name => readFileSync(`server/db/migrations/${name}/migration.sql`, 'utf8')).join('\n')
  const date = new Date('2026-06-01T12:00:00Z')
  const scopedQuery = async (connection: typeof client, text: string, values: string[] = []) => {
    await connection.query('BEGIN')
    try {
      await connection.query('SET LOCAL search_path TO "' + schema + '"')
      const result = await connection.query(text, values)
      await connection.query('COMMIT')
      return result
    } catch (error) { await connection.query('ROLLBACK'); throw error }
  }
  const query = (text: string, values: string[] = []) => scopedQuery(client, text, values)
  const executor = (connection: typeof client) => ({ query: (text: string, values: string[]) => scopedQuery(connection, text, values) })
  const create = async (sql: string) => { await query(sql) }
  try {
    await client.query(`CREATE SCHEMA "${schema}"`)

    await create('CREATE TABLE companies(id text PRIMARY KEY)')
    await create('CREATE TABLE purchase_requests(id text PRIMARY KEY, company_id text NOT NULL, reference text NOT NULL)')
    await create('CREATE TABLE purchase_orders(id text PRIMARY KEY, company_id text NOT NULL, reference text NOT NULL)')
    await create("CREATE TABLE treasury_orders(id text PRIMARY KEY, company_id text NOT NULL, reference text NOT NULL, purpose text NOT NULL DEFAULT 'advance')")
    await create("INSERT INTO companies VALUES ('a'), ('b')")
    await create("INSERT INTO purchase_requests VALUES ('e3','a','EB-2026-0003'),('e9','a','EB-2026-0009'),('old','a','EB-2025-0999'),('foreign','b','EB-2026-0009'),('duplicate','a','EB-2026-0009')")
    await create("INSERT INTO purchase_orders VALUES ('bc','a','BC-2026-0017'),('legacy-bt','a','BT-2026-0015')")
    await create("INSERT INTO treasury_orders VALUES ('bt','a','BT-2026-0028','advance'),('invoice1','a','INV','material_invoice'),('invoice2','a','INV','material_invoice')")

    await assert.rejects(query(migration), /historiques en doublon/)
    assert.equal((await query("SELECT count(*)::int AS n FROM purchase_requests WHERE reference='EB-2026-0009' AND company_id='a'")).rows[0].n, 2)
    assert.equal((await query(`SELECT to_regclass('"${schema}".document_reference_counters') AS table_name`)).rows[0].table_name, null)
    await create("DELETE FROM purchase_requests WHERE id='duplicate'")

    const apply = async () => { await query(migration) }
    await apply()
    assert.equal(await nextDocumentReference('a', 'EB', date, executor(client)), 'EB-2026-0010')
    assert.equal(await nextDocumentReference('a', 'BC', date, executor(client)), 'BC-2026-0018')
    assert.equal(await nextDocumentReference('a', 'BT', date, executor(client)), 'BT-2026-0029')
    await apply() // Ne ramène jamais les compteurs aux seuls documents déjà enregistrés.
    assert.equal(await nextDocumentReference('a', 'EB', date, executor(client)), 'EB-2026-0011')

    for (let i = 0; i < 6; i++) {
      const worker = await pool.connect(); workers.push(worker)

    }
    const seen = new Set<string>()
    await Promise.all(workers.map(async (worker, i) => {
      const prefix = (['EB', 'BC', 'BT'] as DocumentPrefix[])[i % 3]
      const table = prefix === 'EB' ? 'purchase_requests' : prefix === 'BC' ? 'purchase_orders' : 'treasury_orders'
      for (let n = 0; n < 10; n++) {
        const reference = await nextDocumentReference('a', prefix, date, executor(worker))
        assert.ok(!seen.has(reference), `Référence concurrente dupliquée : ${reference}`)
        seen.add(reference)
        await scopedQuery(worker, `INSERT INTO ${table} (id, company_id, reference) VALUES ($1, 'a', $2)`, [randomUUID(), reference])
      }
    }))
    assert.equal(seen.size, 60)
    for (const [table, reference] of [['purchase_requests', 'EB-2026-0009'], ['purchase_orders', 'BC-2026-0017'], ['treasury_orders', 'BT-2026-0028']]) {
      await assert.rejects(query(`INSERT INTO ${table} (id,company_id,reference) VALUES ($1,'a',$2)`, [randomUUID(), reference]), error => (error as { code: string }).code === '23505')
    }
    assert.equal(await nextDocumentReference('b', 'EB', date, executor(client)), 'EB-2026-0010')
    assert.equal(await nextDocumentReference('b', 'BC', date, executor(client)), 'BC-2026-0001')
    assert.equal(await nextDocumentReference('a', 'EB', new Date('2027-06-01'), executor(client)), 'EB-2027-0001')
    assert.equal(await nextDocumentReference('a', 'BC', new Date('2027-06-01'), executor(client)), 'BC-2027-0001')

    // Import supérieur : le trigger remonte le compteur. Une suppression ne le réduit pas.
    await create("INSERT INTO purchase_requests VALUES ('imported','a','EB-2026-9000')")
    assert.equal(await nextDocumentReference('a', 'EB', date, executor(client)), 'EB-2026-9001')
    await create("DELETE FROM purchase_requests WHERE company_id='a' AND reference LIKE 'EB-2026-%'")
    assert.equal(await nextDocumentReference('a', 'EB', date, executor(client)), 'EB-2026-9002')
    const last = await nextDocumentReference('a', 'BT', date, executor(client))
    // Aucune insertion du document : la réservation durable n’est pas réutilisée.
    assert.equal(BigInt((await nextDocumentReference('a', 'BT', date, executor(workers[0]))).split('-')[2]), BigInt(last.split('-')[2]) + 1n)
    assert.equal((await query("SELECT reference FROM purchase_orders WHERE id='bc'")).rows[0].reference, 'BC-2026-0017')
  } finally {
    for (const worker of workers) { await worker.query('RESET search_path'); worker.release() }
    await client.query('ROLLBACK')
    await client.query('RESET search_path')
    await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
    client.release()
    await pool.end()
  }
})

import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Response } from 'express'
import { z } from 'zod'
import { parseBody } from './validation.js'

function fakeRes() {
  const state: { status: number | null; body: unknown } = { status: null, body: null }
  const res = {
    status(code: number) {
      state.status = code
      return res
    },
    json(payload: unknown) {
      state.body = payload
      return res
    },
  }
  return { res: res as unknown as Response, state }
}

const schema = z.object({
  email: z.string().email('E-mail invalide'),
  password: z.string().min(8, '8 caractères minimum'),
})

test('parseBody renvoie les données typées quand le corps est valide', () => {
  const { res, state } = fakeRes()
  const data = parseBody(schema, { email: 'a@b.co', password: 'abcd1234' }, res)
  assert.deepEqual(data, { email: 'a@b.co', password: 'abcd1234' })
  assert.equal(state.status, null)
})

test('parseBody répond 400 et renvoie null sur corps invalide', () => {
  const { res, state } = fakeRes()
  const data = parseBody(schema, { email: 'pas-un-email', password: 'abcd1234' }, res)
  assert.equal(data, null)
  assert.equal(state.status, 400)
  const body = state.body as { message: string }
  assert.match(body.message, /email/i)
})

test('parseBody signale le champ fautif dans le message', () => {
  const { res, state } = fakeRes()
  parseBody(schema, { email: 'a@b.co', password: 'court' }, res)
  const body = state.body as { message: string }
  assert.match(body.message, /password/)
})

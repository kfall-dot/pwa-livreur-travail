import assert from 'node:assert/strict'
import fs from 'node:fs'
import { describe, it } from 'node:test'
import {
  deleteLineAttachment,
  getLineAttachment,
  localAttachmentPath,
  putLineAttachment,
} from './lineAttachmentStore.ts'

describe('lineAttachmentStore (copie locale)', () => {
  it('écrit puis relit un PDF', async () => {
    const key = `eb-line/test/${Date.now()}/unit.pdf`
    const payload = Buffer.from('%PDF-1.1\n%%EOF')
    await putLineAttachment(key, payload, { contentType: 'application/pdf', fileName: 'devis.pdf' })
    const stored = await getLineAttachment(key)
    assert.ok(stored?.data)
    assert.equal(stored.data.toString(), payload.toString())
    await deleteLineAttachment(key)
    assert.equal(fs.existsSync(localAttachmentPath(key)), false)
  })
})

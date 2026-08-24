import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { resolveLineAttachmentMime } from './uploadMime.ts'

describe('resolveLineAttachmentMime', () => {
  it('accepte un PDF déclaré', () => {
    assert.equal(resolveLineAttachmentMime('devis.pdf', 'application/pdf'), 'application/pdf')
  })

  it('déduit le MIME depuis l’extension si le type est vide ou octet-stream', () => {
    assert.equal(resolveLineAttachmentMime('photo.PNG', ''), 'image/png')
    assert.equal(resolveLineAttachmentMime('devis.xlsx', 'application/octet-stream'), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    assert.equal(resolveLineAttachmentMime('chantier.heic', ''), 'image/heic')
  })

  it('refuse un type non autorisé sans extension connue', () => {
    assert.equal(resolveLineAttachmentMime('virus.exe', 'application/x-msdownload'), null)
    assert.equal(resolveLineAttachmentMime('notes.txt', 'text/plain'), null)
  })
})

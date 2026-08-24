import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { arrayBufferToDataUrl, buildPhotoListItem, resolvePhotoKey } from './deliveryPhotoResponse.js'

describe('deliveryPhotoResponse', () => {
  it('encodes arrayBuffer as jpeg data URL', () => {
    const buf = new Uint8Array([0xff, 0xd8, 0xff]).buffer
    assert.match(arrayBufferToDataUrl(buf), /^data:image\/jpeg;base64,\/9j\//)
  })

  it('builds photo list item with query URL and inline data', () => {
    const buf = new Uint8Array([1, 2, 3]).buffer
    const item = buildPhotoListItem(
      'del-1/abc',
      { paletteNumber: 'P1', uploadedAt: '2026-01-01' },
      buf,
      '/dashboard/photos',
    )
    assert.equal(item.photoId, 'del-1/abc')
    assert.equal(item.url, '/dashboard/photos?key=del-1%2Fabc')
    assert.match(item.dataUrl ?? '', /^data:image\/jpeg;base64,/)
    assert.equal(item.paletteNumber, 'P1')
  })

  it('decodes photo keys safely', () => {
    assert.equal(resolvePhotoKey('del-1%2Fabc'), 'del-1/abc')
    assert.equal(resolvePhotoKey('del-1/abc'), 'del-1/abc')
  })
})

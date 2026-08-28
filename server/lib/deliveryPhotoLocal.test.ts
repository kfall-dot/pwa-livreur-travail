import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, it } from 'node:test'
import {
  isLocalPhotoStorageEnabled,
  listPhotosLocal,
  readPhotoLocal,
  savePhotoLocal,
} from './deliveryPhotoLocal.js'

const originalPhotosDir = process.env.PHOTOS_DIR
const originalPhotoStorage = process.env.PHOTO_STORAGE

afterEach(() => {
  if (process.env.PHOTOS_DIR) {
    rmSync(process.env.PHOTOS_DIR, { recursive: true, force: true })
  }
  if (originalPhotosDir === undefined) delete process.env.PHOTOS_DIR
  else process.env.PHOTOS_DIR = originalPhotosDir
  if (originalPhotoStorage === undefined) delete process.env.PHOTO_STORAGE
  else process.env.PHOTO_STORAGE = originalPhotoStorage
})

function useTempPhotosDir(): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'delivery-photos-test-'))
  process.env.PHOTOS_DIR = dir
  delete process.env.PHOTO_STORAGE
  return dir
}

describe('deliveryPhotoLocal', () => {
  it('is enabled when PHOTOS_DIR or PHOTO_STORAGE=local is set', () => {
    delete process.env.PHOTOS_DIR
    delete process.env.PHOTO_STORAGE
    assert.equal(isLocalPhotoStorageEnabled(), false)
    process.env.PHOTO_STORAGE = 'local'
    assert.equal(isLocalPhotoStorageEnabled(), true)
  })

  it('saves, lists and reads photos per delivery', () => {
    useTempPhotosDir()
    assert.equal(isLocalPhotoStorageEnabled(), true)

    savePhotoLocal('del-1/uuid-a', Buffer.from('fakejpg-a'), {
      deliveryId: 'del-1',
      paletteNumber: 'PRODUIT-1',
      uploadedAt: '2026-08-28T10:00:00Z',
    })
    savePhotoLocal('del-1/uuid-b', Buffer.from('fakejpg-b'), {
      deliveryId: 'del-1',
      paletteNumber: 'PRODUIT-2',
      uploadedAt: '2026-08-28T10:01:00Z',
    })
    savePhotoLocal('del-2/uuid-c', Buffer.from('fakejpg-c'), {
      deliveryId: 'del-2',
      uploadedAt: '2026-08-28T10:02:00Z',
    })

    const list1 = listPhotosLocal('del-1')
    assert.equal(list1.length, 2)
    assert.equal(list1[0]?.photoId, 'del-1/uuid-a')
    assert.equal(list1[0]?.meta.paletteNumber, 'PRODUIT-1')
    assert.equal(list1[1]?.photoId, 'del-1/uuid-b')

    const one = readPhotoLocal('del-1/uuid-a')
    assert.ok(one)
    assert.equal(one.buffer.toString(), 'fakejpg-a')
    assert.equal(one.meta.paletteNumber, 'PRODUIT-1')

    assert.equal(readPhotoLocal('del-1/missing'), null)
    assert.equal(listPhotosLocal('del-2').length, 1)
    assert.equal(listPhotosLocal('del-3').length, 0)
  })

  it('returns empty list when directory does not exist', () => {
    process.env.PHOTOS_DIR = path.join(os.tmpdir(), `absent-${Date.now()}`)
    assert.deepEqual(listPhotosLocal('del-1'), [])
  })
})
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { detachSupplierChangeAttachments, supplierChangeDetachTargets } from './procurementLines.ts'

describe('supplierChangeDetachTargets — retrait de pièce jointe à la réaffectation', () => {
  it('détache la pièce jointe quand le fournisseur change (facture partagée)', () => {
    const current = [
      { id: 'l1', supplierName: 'Fournisseur A', attachmentBlobKey: 'blob-1' },
      { id: 'l2', supplierName: 'Fournisseur A', attachmentBlobKey: 'blob-1' },
    ]
    assert.deepEqual(supplierChangeDetachTargets(current, [{ id: 'l1', supplierName: 'Fournisseur B' }]), [
      { lineId: 'l1', blobKey: 'blob-1' },
    ])
  })

  it('détache aussi une pièce jointe non partagée (une seule ligne)', () => {
    const current = [{ id: 'l1', supplierName: 'Fournisseur A', attachmentBlobKey: 'blob-1' }]
    assert.deepEqual(supplierChangeDetachTargets(current, [{ id: 'l1', supplierName: 'Fournisseur B' }]), [
      { lineId: 'l1', blobKey: 'blob-1' },
    ])
  })

  it('ne détache pas si le fournisseur ne change pas', () => {
    const current = [
      { id: 'l1', supplierName: 'Fournisseur A', attachmentBlobKey: 'blob-1' },
      { id: 'l2', supplierName: 'Fournisseur A', attachmentBlobKey: 'blob-1' },
    ]
    assert.deepEqual(supplierChangeDetachTargets(current, [{ id: 'l1', supplierName: 'Fournisseur A' }]), [])
  })

  it('ne détache pas une ligne sans pièce jointe', () => {
    const current = [{ id: 'l1', supplierName: 'Fournisseur A', attachmentBlobKey: null }]
    assert.deepEqual(supplierChangeDetachTargets(current, [{ id: 'l1', supplierName: 'Fournisseur B' }]), [])
  })

  it('ne détache pas si l’ancien ou le nouveau fournisseur est vide', () => {
    const current = [
      { id: 'l1', supplierName: '', attachmentBlobKey: 'blob-1' },
      { id: 'l2', supplierName: 'Fournisseur A', attachmentBlobKey: 'blob-1' },
    ]
    assert.deepEqual(supplierChangeDetachTargets(current, [{ id: 'l1', supplierName: 'Fournisseur B' }]), [])
    assert.deepEqual(supplierChangeDetachTargets(current, [{ id: 'l2', supplierName: '' }]), [])
  })

  it('ignore les différences de casse (même fournisseur)', () => {
    const current = [
      { id: 'l1', supplierName: 'Fournisseur A', attachmentBlobKey: 'blob-1' },
      { id: 'l2', supplierName: 'Fournisseur A', attachmentBlobKey: 'blob-1' },
    ]
    assert.deepEqual(supplierChangeDetachTargets(current, [{ id: 'l1', supplierName: 'fournisseur a' }]), [])
  })
})

describe('detachSupplierChangeAttachments — flux complet du détachement', () => {
  it('appelle detach() pour chaque ligne réaffectée et renvoie les clés', async () => {
    const current = [
      { id: 'l1', supplierName: 'Fournisseur A', attachmentBlobKey: 'blob-1' },
      { id: 'l2', supplierName: 'Fournisseur A', attachmentBlobKey: 'blob-1' },
      { id: 'l3', supplierName: 'Fournisseur C', attachmentBlobKey: 'blob-2' },
    ]
    const patches = [
      { id: 'l1', supplierName: 'Fournisseur B' },
      { id: 'l2', supplierName: 'Fournisseur B' },
    ]
    const detached: string[] = []
    const keys = await detachSupplierChangeAttachments(current, patches, async (lineId) => {
      detached.push(lineId)
    })
    assert.deepEqual(detached, ['l1', 'l2'])
    // blob-1 est partagé par l1 + l2 → dédupliqué ; blob-2 (l3) non touché
    assert.deepEqual(keys, ['blob-1'])
  })

  it('ne détache rien quand aucun fournisseur ne change', async () => {
    const current = [{ id: 'l1', supplierName: 'Fournisseur A', attachmentBlobKey: 'blob-1' }]
    const detached: string[] = []
    const keys = await detachSupplierChangeAttachments(current, [{ id: 'l1', supplierName: 'Fournisseur A' }], async (lineId) => {
      detached.push(lineId)
    })
    assert.deepEqual(detached, [])
    assert.deepEqual(keys, [])
  })
})
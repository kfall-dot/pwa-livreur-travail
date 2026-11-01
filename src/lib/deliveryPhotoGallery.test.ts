import { test } from 'node:test'
import assert from 'node:assert/strict'
import { deliveryPhotoGalleryNotice } from './deliveryPhotoGallery.js'

test('les fichiers chargés ne produisent aucune alerte quel que soit leur stockage', () => {
  assert.equal(deliveryPhotoGalleryNotice(1, 1, 1), null)
  assert.equal(deliveryPhotoGalleryNotice(0, 1, 1), null)
})
test('une photo comptabilisée mais absente indique un écart d’environnement sans imposer Netlify', () => {
  const notice = deliveryPhotoGalleryNotice(1, 0, 0)
  assert.match(notice!, /1 photo.*non accessible/)
  assert.doesNotMatch(notice!, /Netlify|reprendre/)
})
test('la galerie signale aussi un chargement partiel', () => {
  assert.match(deliveryPhotoGalleryNotice(3, 3, 2)!, /^1 photo/)
})
test('une erreur de chargement ne devient pas une absence de photo', () => {
  assert.equal(deliveryPhotoGalleryNotice(0, 0, 0, 'Impossible de charger les photos.'), 'Impossible de charger les photos.')
  assert.equal(deliveryPhotoGalleryNotice(0, 0, 0), null)
})

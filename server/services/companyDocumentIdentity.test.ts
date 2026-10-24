import { test } from 'node:test'
import assert from 'node:assert/strict'
import { applyCompanyDocumentIdentity } from './companyDocumentIdentity.js'
import { companyIdentity } from '../../shared/companyIdentity.js'
test('EFPC : identité réservée au pilote, logo autonome et coordonnées communes', () => {
  const original = '<html><body><p>EB test</p></body></html>'
  assert.equal(applyCompanyDocumentIdentity(original, 'autre-compagnie'), original)
  assert.equal(companyIdentity('co-demo'), null)
  const branded = applyCompanyDocumentIdentity(original, 'co-btp-pilote')
  assert.match(branded, /data-company-identity="EFPC"/)
  assert.match(branded, /data:image\/png;base64,/)
  assert.match(branded, /Entreprise de Fournitures de Prestation et de Construction/)
  assert.match(branded, /EB test/)
  assert.match(branded, /Cocody Riviera Palmeraie/)
  assert.match(branded, /01 BP 13200 Abidjan 01/)
  assert.match(branded, /CI-ABJ-2013-B-15105/)
  assert.match(branded, /1346011 T/)
  assert.match(branded, /\+225 07 49 46 76 57/)
  assert.equal(applyCompanyDocumentIdentity(branded, 'co-btp-pilote'), branded)
})

test('en-tête unique dans la feuille imprimable, même sur un document déjà enregistré', () => {
  const original = '<html><body><div class="print-bar">Imprimer</div><main class="sheet"><h1>BL TEST</h1><p>Signature conservée</p></main></body></html>'
  const old = original.replace('<main', '<header data-company-identity="EFPC">Ancien en-tête</header><main')
  const branded = applyCompanyDocumentIdentity(old, 'co-btp-pilote')
  assert.equal((branded.match(/data-company-identity=/g) ?? []).length, 1)
  assert.match(branded, /<main class="sheet"><header/)
  assert.match(branded, /Signature conservée/)
  assert.doesNotMatch(branded, /Ancien en-tête/)
})

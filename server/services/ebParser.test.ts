import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { matchSiteFromDestination, parseEbText } from './ebParser.ts'

describe('parseEbText', () => {
  it('parse un message chantier classique', () => {
    const result = parseEbText('50 sacs ciment, 20 barres fer pour chantier')
    assert.equal(result.lines.length, 2)
    assert.equal(result.lines[0]?.quantity, 50)
    assert.equal(result.lines[0]?.unit, 'sacs')
    assert.match(result.lines[0]?.label ?? '', /ciment/i)
    assert.equal(result.lines[0]?.spendCategory, 'ciments')
    assert.equal(result.lines[1]?.quantity, 20)
    assert.equal(result.lines[1]?.unit, 'barres')
    assert.match(result.lines[1]?.label ?? '', /fer/i)
    assert.equal(result.lines[1]?.spendCategory, 'ferraille')
    assert.ok(result.confidenceScore >= 0.7)
  })

  it('accepte le point décimal', () => {
    const result = parseEbText('12.5 tonnes sable')
    assert.equal(result.lines.length, 1)
    assert.equal(result.lines[0]?.quantity, 12.5)
    assert.equal(result.lines[0]?.unit, 'tonnes')
    assert.match(result.lines[0]?.label ?? '', /sable/i)
  })

  it('détecte l’urgence', () => {
    const result = parseEbText('10 sacs ciment urgent')
    assert.equal(result.urgency, 'urgent')
  })

  it('retourne une confiance faible si rien n’est extrait', () => {
    const result = parseEbText('bonjour équipe')
    assert.equal(result.lines.length, 0)
    assert.ok(result.confidenceScore < 0.5)
  })

  it('parse un message WhatsApp informel (de, nombres en lettres, chantier, délai)', () => {
    const result = parseEbText(
      'Chef, il nous faut 50 sacs de ciment, 4 bottes de fer 8/14 et une tonne de gravier pour Cocody demain matin',
    )
    assert.equal(result.lines.length, 3)
    assert.deepEqual(
      result.lines.map((l) => ({ qty: l.quantity, unit: l.unit, label: l.label.toLowerCase() })),
      [
        { qty: 50, unit: 'sacs', label: 'ciment' },
        { qty: 4, unit: 'bottes', label: 'fer 8/14' },
        { qty: 1, unit: 'tonne', label: 'gravier' },
      ],
    )
    assert.match(result.lines[1]?.observation ?? '', /Ø8mm/i)
    assert.match(result.destination ?? '', /cocody/i)
    assert.equal(result.urgency, 'urgent')
    assert.ok(result.neededBy)
    assert.ok((result.missingInfo ?? []).length > 0)
    assert.ok((result.dtActions ?? []).length > 0)
    assert.match(result.objet ?? '', /BESOIN - Ciment/i)
  })

  it('corrige les fautes WhatsApp courantes (simen, gravie, demin)', () => {
    const result = parseEbText('50 sacs simen, une tone de gravie pour Cocody demin matin')
    assert.equal(result.lines.length, 2)
    assert.match(result.lines[0]?.label ?? '', /ciment/i)
    assert.match(result.lines[1]?.label ?? '', /gravier/i)
    assert.equal(result.urgency, 'urgent')
  })

  it('associe un chantier dont le nom contient la destination', () => {
    const site = matchSiteFromDestination(
      [{ id: 's1', name: 'Résidence Cocody — Tour A' }],
      'Cocody',
    )
    assert.equal(site?.id, 's1')
  })
})

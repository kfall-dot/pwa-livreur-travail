import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import bcrypt from 'bcryptjs'
import {
  assertEtapeForRole,
  createApprobation,
  formatSignatureBlock,
  hashEbContenu,
  procurementRoleToSignatureRole,
  verifySignaturePin,
} from './ebSignature.ts'

describe('ebSignature (signature_simple)', () => {
  it('accepte le PIN DT de démo et refuse un PIN faux', async () => {
    const hash = await bcrypt.hash('admin1234', 4)
    assert.equal(
      await verifySignaturePin({ managerId: 'mgr-btp-dt', pin: '1234', passwordHash: hash }),
      true,
    )
    assert.equal(
      await verifySignaturePin({ managerId: 'mgr-btp-dt', pin: '0000', passwordHash: hash }),
      false,
    )
  })

  it('accepte le mot de passe gestionnaire si le PIN démo ne correspond pas', async () => {
    const hash = await bcrypt.hash('secret99', 4)
    assert.equal(
      await verifySignaturePin({ managerId: 'mgr-autre', pin: 'secret99', passwordHash: hash }),
      true,
    )
  })

  it('refuse une étape hors rôle (DT ≠ validation_pdg)', () => {
    assert.match(assertEtapeForRole('DT', 'validation_pdg') ?? '', /non autorisée/)
    assert.equal(assertEtapeForRole('DT', 'validation_dt'), null)
  })

  it('mappe le rôle achats vers DT/SA/DAF/PDG', () => {
    assert.equal(procurementRoleToSignatureRole('technical_director'), 'DT')
    assert.equal(procurementRoleToSignatureRole('purchasing'), 'SA')
  })

  it('formate le bloc signature avec PIN vérifié', () => {
    const a = createApprobation({
      ebReference: 'EB-2026-0001',
      etape: 'validation_dt',
      approbateur: 'Kouamé DT',
      role: 'DT',
      ipAddress: '127.0.0.1',
      contenuHash: hashEbContenu({ lines: 1 }),
    })
    const block = formatSignatureBlock(a)
    assert.match(block, /Kouamé DT \(DT\)/)
    assert.match(block, /PIN vérifié/)
    assert.equal(a.codePinVerifie, true)
  })
})

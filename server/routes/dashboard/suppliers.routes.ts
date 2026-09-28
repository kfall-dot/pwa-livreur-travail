// Fournisseurs (catalogue)
// Extrait de routes/dashboard.ts lors de son decoupage en modules — aucun
// changement de comportement (memes chemins, memes middlewares).
import { Router } from 'express'
import { isSupplierFamily } from '../../../shared/catalogEnums.js'
import { isValidContactEmail, normalizeContactEmail } from '../../../shared/email.js'
import { isValidDriverPhone, normalizeDriverPhone } from '../../../shared/phone.js'
import { createSupplier, getSupplierById, listAllSuppliers, updateSupplier } from '../../db/procurementQueries.js'
import { requireManager, type ManagerRequest } from '../../middleware/managerAuth.js'

export const suppliersRoutes = Router()

// ── Suppliers (catalogue) ─────────────────────────────────────────────────────

suppliersRoutes.get('/dashboard/suppliers', requireManager, async (req, res) => {
  try {
    const { manager } = req as ManagerRequest
    const rows = await listAllSuppliers(manager.companyId)
    res.set('Cache-Control', 'no-store')
    res.json({ suppliers: rows })
  } catch (err) {
    console.error('[dashboard] suppliers error', err)
    res.status(500).json({ message: 'Erreur serveur' })
  }
})

suppliersRoutes.post('/dashboard/suppliers', requireManager, async (req, res) => {
  const { manager } = req as ManagerRequest
  const body = req.body as Record<string, unknown>
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  if (!name) {
    res.status(400).json({ message: 'Raison sociale obligatoire' })
    return
  }
  const contactEmail = typeof body.contactEmail === 'string' ? body.contactEmail.trim() : ''
  if (contactEmail && !isValidContactEmail(contactEmail)) {
    res.status(400).json({ message: 'E-mail contact invalide' })
    return
  }
  let contactPhone: string | null = typeof body.contactPhone === 'string' ? body.contactPhone.trim() : ''
  if (contactPhone) {
    const normalized = normalizeDriverPhone(contactPhone)
    if (!isValidDriverPhone(normalized)) {
      res.status(400).json({ message: 'Téléphone contact invalide (+225 + 10 chiffres)' })
      return
    }
    contactPhone = normalized
  } else {
    contactPhone = null
  }
  try {
    const supplier = await createSupplier({
      companyId: manager.companyId,
      name,
      contactName: typeof body.contactName === 'string' ? body.contactName.trim() || null : null,
      contactPhone,
      contactEmail: contactEmail ? normalizeContactEmail(contactEmail) : null,
      address: typeof body.address === 'string' ? body.address.trim() || null : null,
      depotAddress: typeof body.depotAddress === 'string' ? body.depotAddress.trim() || null : null,
      family: isSupplierFamily(body.family) ? body.family : 'materiaux',
      notes: typeof body.notes === 'string' ? body.notes.trim() || null : null,
      active: body.active === false ? false : true,
    })
    res.status(201).json({ ok: true, supplier })
  } catch (err) {
    console.error('[dashboard] create supplier error', err)
    res.status(500).json({ message: 'Erreur serveur' })
  }
})

suppliersRoutes.patch('/dashboard/suppliers/:id', requireManager, async (req, res) => {
  const { manager } = req as ManagerRequest
  const supplierId = String(req.params.id)
  const existing = await getSupplierById(manager.companyId, supplierId)
  if (!existing) {
    res.status(404).json({ message: 'Fournisseur introuvable' })
    return
  }
  const body = req.body as Record<string, unknown>
  const patch: Parameters<typeof updateSupplier>[2] = {}
  if (typeof body.name === 'string') patch.name = body.name.trim()
  if ('contactName' in body) patch.contactName = typeof body.contactName === 'string' ? body.contactName.trim() || null : null
  if ('contactEmail' in body) {
    const email = typeof body.contactEmail === 'string' ? body.contactEmail.trim() : ''
    if (email && !isValidContactEmail(email)) {
      res.status(400).json({ message: 'E-mail contact invalide' })
      return
    }
    patch.contactEmail = email ? normalizeContactEmail(email) : null
  }
  if ('contactPhone' in body) {
    const raw = typeof body.contactPhone === 'string' ? body.contactPhone.trim() : ''
    if (raw) {
      const normalized = normalizeDriverPhone(raw)
      if (!isValidDriverPhone(normalized)) {
        res.status(400).json({ message: 'Téléphone contact invalide (+225 + 10 chiffres)' })
        return
      }
      patch.contactPhone = normalized
    } else {
      patch.contactPhone = null
    }
  }
  if ('address' in body) patch.address = typeof body.address === 'string' ? body.address.trim() || null : null
  if ('depotAddress' in body) patch.depotAddress = typeof body.depotAddress === 'string' ? body.depotAddress.trim() || null : null
  if ('family' in body) {
    if (body.family != null && !isSupplierFamily(body.family)) {
      res.status(400).json({ message: 'Famille invalide' })
      return
    }
    patch.family = isSupplierFamily(body.family) ? body.family : null
  }
  if ('notes' in body) patch.notes = typeof body.notes === 'string' ? body.notes.trim() || null : null
  if (typeof body.active === 'boolean') patch.active = body.active
  try {
    const supplier = await updateSupplier(manager.companyId, supplierId, patch)
    res.set('Cache-Control', 'no-store')
    res.json({ ok: true, supplier })
  } catch (err) {
    console.error('[dashboard] update supplier error', err)
    res.status(500).json({ message: 'Erreur serveur' })
  }
})

// Produits & unites (catalogue)
// Extrait de routes/dashboard.ts lors de son decoupage en modules — aucun
// changement de comportement (memes chemins, memes middlewares).
import { Router } from 'express'
import { getAllCompanyUnits, getAllProducts, getCompanyUnitById, getProductById, isActiveCompanyUnit, seedDefaultCompanyUnits, upsertCompanyUnit, upsertProduct } from '../../db/queries.js'
import { DEMO_COMPANY_ID } from '../../db/schema.js'
import { seedDemoProducts } from '../../db/seed.js'
import { isPgUniqueViolation } from '../../lib/pgErrors.js'
import { slugifyCompanyName } from '../../lib/tenant.js'
import { parseBody } from '../../lib/validation.js'
import { requireManager, type ManagerRequest } from '../../middleware/managerAuth.js'
import { randomUUID } from 'crypto'
import { z } from 'zod'

export const catalogRoutes = Router()

const productCreateSchema = z.object({
  label: z.string().trim().min(1, 'Libellé requis'),
  unit: z.string().trim().min(1, 'Unité requise'),
  category: z.string().trim().optional(),
  displayOrder: z.number().int().optional(),
})

function normalizeUnitCode(value: string): string {
  return slugifyCompanyName(value).replace(/-/g, '_') || 'unite'
}

// ── Products ──────────────────────────────────────────────────────────────────

catalogRoutes.get('/dashboard/products', requireManager, async (req, res) => {
  try {
    const { manager } = req as ManagerRequest
    let list = await getAllProducts(manager.companyId)
    // Filet pilote : si le catalogue démo a été vidé (reset), le recharger.
    if (list.length === 0 && manager.companyId === DEMO_COMPANY_ID) {
      await seedDemoProducts()
      list = await getAllProducts(manager.companyId)
    }
    res.json({ products: list })
  } catch (err) {
    console.error('[dashboard] products error', err)
    res.status(500).json({ message: 'Erreur serveur' })
  }
})

catalogRoutes.post('/dashboard/products', requireManager, async (req, res) => {
  const { manager } = req as ManagerRequest
  const parsed = parseBody(productCreateSchema, req.body, res)
  if (!parsed) return
  const { label, displayOrder } = parsed
  const unitCode = parsed.unit.toLowerCase()
  if (!(await isActiveCompanyUnit(manager.companyId, unitCode))) {
    res.status(400).json({
      message: 'Unité inconnue ou inactive — ajoutez-la dans Catalogue → Unités de mesure.',
    })
    return
  }
  try {
    const p = await upsertProduct(`prod-${randomUUID()}`, {
      companyId: manager.companyId,
      label: label.trim(),
      unit: unitCode,
      category: parsed.category?.trim() || undefined,
      displayOrder: displayOrder ?? 0,
      active: true,
    })
    res.status(201).json({ ok: true, product: p })
  } catch (err) {
    console.error('[dashboard] create product error', err)
    res.status(500).json({ message: 'Erreur serveur' })
  }
})

catalogRoutes.patch('/dashboard/products/:id', requireManager, async (req, res) => {
  const { manager } = req as ManagerRequest
  const { id } = req.params
  const data = req.body as { label?: string; unit?: string; category?: string | null; displayOrder?: number; active?: boolean }
  const existing = await getProductById(String(id))
  if (!existing || existing.companyId !== manager.companyId) {
    res.status(404).json({ message: 'Produit introuvable' })
    return
  }
  if (data.unit != null) {
    const unitCode = String(data.unit).trim().toLowerCase()
    if (!(await isActiveCompanyUnit(manager.companyId, unitCode))) {
      res.status(400).json({
        message: 'Unité inconnue ou inactive — ajoutez-la dans Catalogue → Unités de mesure.',
      })
      return
    }
    data.unit = unitCode
  }
  try {
    const p = await upsertProduct(String(id), { ...data, companyId: manager.companyId })
    res.json({ ok: true, product: p })
  } catch (err) {
    console.error('[dashboard] update product error', err)
    res.status(500).json({ message: 'Erreur serveur' })
  }
})

// ── Company units ─────────────────────────────────────────────────────────────

catalogRoutes.get('/dashboard/units', requireManager, async (req, res) => {
  try {
    const { manager } = req as ManagerRequest
    let list = await getAllCompanyUnits(manager.companyId)
    if (list.length === 0) {
      await seedDefaultCompanyUnits(manager.companyId)
      list = await getAllCompanyUnits(manager.companyId)
    }
    res.json({ units: list })
  } catch (err) {
    console.error('[dashboard] units error', err)
    res.status(500).json({ message: 'Erreur serveur' })
  }
})

catalogRoutes.post('/dashboard/units', requireManager, async (req, res) => {
  const { manager } = req as ManagerRequest
  const { code, label, displayOrder } = req.body as { code?: string; label?: string; displayOrder?: number }
  const trimmedLabel = String(label ?? '').trim()
  if (!trimmedLabel) {
    res.status(400).json({ message: 'Libellé requis' })
    return
  }
  const unitCode = normalizeUnitCode(String(code ?? '').trim() || trimmedLabel)
  try {
    const row = await upsertCompanyUnit(`unit-${randomUUID()}`, {
      companyId: manager.companyId,
      code: unitCode,
      label: trimmedLabel,
      displayOrder: displayOrder ?? 0,
      active: true,
    })
    res.status(201).json({ ok: true, unit: row })
  } catch (err) {
    if (isPgUniqueViolation(err)) {
      res.status(409).json({ message: `L’unité « ${unitCode} » existe déjà` })
      return
    }
    console.error('[dashboard] create unit error', err)
    res.status(500).json({ message: 'Erreur serveur' })
  }
})

catalogRoutes.patch('/dashboard/units/:id', requireManager, async (req, res) => {
  const { manager } = req as ManagerRequest
  const { id } = req.params
  const data = req.body as { label?: string; displayOrder?: number; active?: boolean }
  try {
    const existing = await getCompanyUnitById(String(id))
    if (!existing || existing.companyId !== manager.companyId) {
      res.status(404).json({ message: 'Unité introuvable' })
      return
    }
    const row = await upsertCompanyUnit(existing.id, {
      companyId: existing.companyId,
      code: existing.code,
      label: data.label != null ? String(data.label).trim() : existing.label,
      displayOrder: data.displayOrder ?? existing.displayOrder,
      active: data.active ?? existing.active,
    })
    res.json({ ok: true, unit: row })
  } catch (err) {
    console.error('[dashboard] update unit error', err)
    res.status(500).json({ message: 'Erreur serveur' })
  }
})

// Points de livraison / chantiers (catalogue) — CRUD, activation, reconciliation
// Extrait de routes/dashboard.ts lors de son decoupage en modules — aucun
// changement de comportement (memes chemins, memes middlewares).
import { Router } from 'express'
import { isSiteType } from '../../../shared/catalogEnums.js'
import { isValidContactEmail, normalizeContactEmail } from '../../../shared/email.js'
import { isValidDriverPhone, normalizeDriverPhone } from '../../../shared/phone.js'
import { getAllSupermarkets, getSupermarketById, reconcileOpenStopsWithCatalog, setSupermarketActive, setSupermarketSiteType, syncSupermarketContactToOpenStops, updateSupermarketDetails, upsertSupermarket } from '../../db/queries.js'
import { DEMO_COMPANY_ID } from '../../db/schema.js'
import { seedDemoStopCatalog, seedLivraisonSupermarkets } from '../../db/seed.js'
import { requireManager, type ManagerRequest } from '../../middleware/managerAuth.js'
import { randomUUID } from 'crypto'
import { type Request, type Response } from 'express'

export const supermarketsRoutes = Router()

function optionalNumericField(value: string | undefined | null): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

function parseSupermarketActiveFlag(value: unknown): boolean | undefined {
  if (value === true || value === 1 || value === '1' || value === 'true') return true
  if (value === false || value === 0 || value === '0' || value === 'false') return false
  return undefined
}

async function setSupermarketActiveForManager(
  req: Request,
  res: Response,
  active: boolean,
): Promise<void> {
  const { manager } = req as ManagerRequest
  const { id } = req.params
  const existing = await getSupermarketById(String(id))
  if (!existing || existing.companyId !== manager.companyId) {
    res.status(404).json({ message: 'Point de livraison introuvable' })
    return
  }
  const sm = await setSupermarketActive(String(id), active)
  if (!sm) {
    res.status(404).json({ message: 'Point de livraison introuvable' })
    return
  }
  res.set('Cache-Control', 'no-store')
  res.json({ ok: true, supermarket: sm })
}

function contactEmailValidationError(raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw.trim()) {
    return 'E-mail responsable obligatoire.'
  }
  const normalized = normalizeContactEmail(raw)
  if (!isValidContactEmail(normalized)) {
    return 'E-mail responsable invalide.'
  }
  return null
}

// ── Supermarkets ──────────────────────────────────────────────────────────────

supermarketsRoutes.get('/dashboard/supermarkets', requireManager, async (req, res) => {
  try {
    const { manager } = req as ManagerRequest
    const list = await getAllSupermarkets(manager.companyId)
    res.set('Cache-Control', 'no-store')
    res.json({ supermarkets: list })
  } catch (err) {
    console.error('[dashboard] supermarkets error', err)
    res.status(500).json({ message: 'Erreur serveur' })
  }
})

/** Aligne téléphones des arrêts ouverts ; seed démo seulement si le catalogue est vide. */
supermarketsRoutes.post('/dashboard/catalog/reconcile', requireManager, async (req, res) => {
  try {
    const { manager } = req as ManagerRequest
    let catalogUpserted = 0
    if (manager.companyId === DEMO_COMPANY_ID) {
      const existing = await getAllSupermarkets(manager.companyId)
      if (existing.length === 0) {
        const demoCatalog = await seedDemoStopCatalog()
        const livraisonCatalog = await seedLivraisonSupermarkets()
        catalogUpserted = demoCatalog + livraisonCatalog
      }
    }
    const sync = await reconcileOpenStopsWithCatalog(manager.companyId)
    res.json({
      ok: true,
      catalogUpserted,
      ...sync,
    })
  } catch (err) {
    console.error('[dashboard] catalog reconcile error', err)
    res.status(500).json({ message: 'Erreur synchronisation catalogue' })
  }
})

supermarketsRoutes.post('/dashboard/supermarkets', requireManager, async (req, res) => {
  const { manager } = req as ManagerRequest
  const { name, address, contactPhone, contactName, contactEmail, lat, lng } =
    req.body as Record<string, string | undefined>
  if (!name || !address || !contactPhone) {
    res.status(400).json({ message: 'Nom, adresse et téléphone contact sont requis' })
    return
  }
  const emailErr = contactEmailValidationError(contactEmail)
  if (emailErr) {
    res.status(400).json({ message: emailErr })
    return
  }
  try {
    const normalizedContact = normalizeDriverPhone(contactPhone)
    if (!isValidDriverPhone(normalizedContact)) {
      res.status(400).json({ message: 'Téléphone contact invalide (+225 + 10 chiffres)' })
      return
    }
    const sm = await upsertSupermarket(`sm-${randomUUID()}`, {
      companyId: manager.companyId,
      name: name.trim(),
      address: address.trim(),
      contactPhone: normalizedContact,
      contactName: contactName?.trim() || undefined,
      contactEmail: normalizeContactEmail(contactEmail!),
      lat: optionalNumericField(lat),
      lng: optionalNumericField(lng),
      active: true,
      siteType: isSiteType(req.body?.siteType) ? req.body.siteType : 'prive',
    })
    res.status(201).json({ ok: true, supermarket: sm })
  } catch (err) {
    console.error('[dashboard] create supermarket error', err)
    res.status(500).json({ message: 'Erreur serveur' })
  }
})

supermarketsRoutes.post('/dashboard/supermarkets/:id/deactivate', requireManager, async (req, res) => {
  await setSupermarketActiveForManager(req, res, false)
})

supermarketsRoutes.post('/dashboard/supermarkets/:id/activate', requireManager, async (req, res) => {
  await setSupermarketActiveForManager(req, res, true)
})

supermarketsRoutes.patch('/dashboard/supermarkets/:id', requireManager, async (req, res) => {
  const { manager } = req as ManagerRequest
  const { id } = req.params
  const data = req.body as Record<string, unknown>
  try {
    const existing = await getSupermarketById(String(id))
    if (!existing || existing.companyId !== manager.companyId) {
      res.status(404).json({ message: 'Point de livraison introuvable' })
      return
    }

    const keys = Object.keys(data)
    const activeFlag = keys.length === 1 && keys[0] === 'active' ? parseSupermarketActiveFlag(data.active) : undefined
    if (activeFlag !== undefined) {
      const sm = await setSupermarketActive(String(id), activeFlag)
      if (!sm) {
        res.status(404).json({ message: 'Point de livraison introuvable' })
        return
      }
      res.set('Cache-Control', 'no-store')
      res.json({ ok: true, supermarket: sm })
      return
    }

    if (keys.length === 1 && keys[0] === 'siteType') {
      if (!isSiteType(data.siteType)) {
        res.status(400).json({ message: 'Type de chantier invalide (Privé ou Public)' })
        return
      }
      const sm = await setSupermarketSiteType(String(id), data.siteType)
      if (!sm) {
        res.status(404).json({ message: 'Chantier introuvable' })
        return
      }
      res.set('Cache-Control', 'no-store')
      res.json({ ok: true, supermarket: sm })
      return
    }

    const name = typeof data.name === 'string' ? data.name.trim() : existing.name
    const address = typeof data.address === 'string' ? data.address.trim() : existing.address
    const contactPhoneRaw = typeof data.contactPhone === 'string' ? data.contactPhone : existing.contactPhone
    const contactName = 'contactName' in data
      ? (typeof data.contactName === 'string' ? data.contactName.trim() || null : null)
      : existing.contactName
    let contactEmail = existing.contactEmail
    if ('contactEmail' in data) {
      const mergedEmail = typeof data.contactEmail === 'string' ? data.contactEmail : existing.contactEmail
      if (typeof mergedEmail === 'string' && mergedEmail.trim()) {
        const emailErr = contactEmailValidationError(mergedEmail)
        if (emailErr) {
          res.status(400).json({ message: emailErr })
          return
        }
        contactEmail = normalizeContactEmail(String(mergedEmail))
      } else {
        // Valeur vide saisie : on efface l'e-mail (champ optionnel).
        contactEmail = null
      }
    }
    const normalizedContact = normalizeDriverPhone(contactPhoneRaw)
    if (!isValidDriverPhone(normalizedContact)) {
      res.status(400).json({ message: 'Téléphone contact invalide (+225 + 10 chiffres)' })
      return
    }
    const lat = typeof data.lat === 'string' ? optionalNumericField(data.lat) : existing.lat
    const lng = typeof data.lng === 'string' ? optionalNumericField(data.lng) : existing.lng
    const siteType = isSiteType(data.siteType) ? data.siteType : existing.siteType
    const sm = await updateSupermarketDetails(String(id), {
      companyId: existing.companyId,
      name,
      address,
      contactPhone: normalizedContact,
      contactName,
      contactEmail,
      lat,
      lng,
      siteType,
    })
    if (!sm) {
      res.status(404).json({ message: 'Point de livraison introuvable' })
      return
    }
    if (typeof data.contactPhone === 'string') {
      await syncSupermarketContactToOpenStops(String(id), normalizedContact)
    }
    res.set('Cache-Control', 'no-store')
    res.json({ ok: true, supermarket: sm })
  } catch (err) {
    console.error('[dashboard] update supermarket error', err)
    res.status(500).json({ message: 'Erreur serveur' })
  }
})

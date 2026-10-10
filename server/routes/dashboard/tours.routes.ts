// Tournees — liste, creation, replan, edition, suppression
// Extrait de routes/dashboard.ts lors de son decoupage en modules — aucun
// changement de comportement (memes chemins, memes middlewares).
import { Router } from 'express'
import { expectedProductLabelKey, validateStopProducts } from '../../../shared/expectedProducts.js'
import { generateOrderRef } from '../../../shared/orderRef.js'
import { getPurchaseRequestById, getPurchaseRequestLines } from '../../db/procurementQueries.js'
import { createTourWithStops, deleteDeliveryPoints, deleteTourIfNoDeliveries, getBcProductKeysForTour, getDashboardTours, getDeliveryStopForCompany, getDriverById, getPartialDeliveryReplanTemplate, getStopsForTour, getTourById, getTourReplanTemplate, getTourWithStops, getVirtualSupplierDriver, isActiveCompanyUnit, parseExpectedProducts, resolvePendingReassignForTour, resolveTourPurchaseOrderId, stopPayloadDiffersFromExisting, supersedeNonDeliveredStopsFromTour, updateDeliveryPointSequence, updateTourMeta, upsertDeliveryPoint } from '../../db/queries.js'
import { resolveStopFromCatalog } from '../../lib/resolveTourStop.js'
import { requireManager, type ManagerRequest } from '../../middleware/managerAuth.js'
import { markDeliveryScheduled, ProcurementWorkflowError } from '../../services/procurementWorkflow.js'
import { sendSmsMessage } from '../../services/sms.js'
import { buildTourAssignedSmsBody } from '../../services/smsMessages.js'
import { localTodayIso } from '../../utils/dates.js'
import { randomUUID } from 'crypto'

export const toursRoutes = Router()

async function resolveTourUnitType(
  companyId: string,
  requested: unknown,
  existing?: string | null,
): Promise<string | null> {
  const code = String(requested ?? '').trim().toLowerCase()
  if (code && await isActiveCompanyUnit(companyId, code)) return code
  const fallback = String(existing ?? '').trim().toLowerCase()
  if (fallback) return fallback
  return null
}

// ── Tours ─────────────────────────────────────────────────────────────────────

toursRoutes.get('/dashboard/tours', requireManager, async (req, res) => {
  const today = localTodayIso()
  const date = String(req.query.date ?? today)
  const { manager } = req as ManagerRequest
  try {
    const tours = await getDashboardTours(date, manager.companyId)
    res.json({ date, tours })
  } catch (err) {
    console.error('[dashboard] tours error', err)
    res.status(500).json({ message: 'Erreur serveur' })
  }
})

toursRoutes.post('/dashboard/tours', requireManager, async (req, res) => {
  const { manager } = req as ManagerRequest
  const body = req.body as Record<string, unknown>
  const { driverId, deliverySource, date, depotName, depotAddress, depotLat, depotLng, stops, replannedFromTourId } = body
  const isSupplierDelivery = deliverySource === 'supplier'

  // Livraison directe fournisseur : pas de chauffeur physique, on rattache la
  // tournée au livreur virtuel « LIVRAISON FOURNISSEUR ».
  let resolvedDriverId: string
  if (isSupplierDelivery) {
    if (!date || !depotName || !depotAddress || !Array.isArray(stops) || stops.length === 0) {
      res.status(400).json({ message: 'Champs obligatoires manquants (date, depot, stops)' })
      return
    }
    const virtualDriver = await getVirtualSupplierDriver(manager.companyId)
    resolvedDriverId = virtualDriver.id
  } else {
    if (!driverId || !date || !depotName || !depotAddress || !Array.isArray(stops) || stops.length === 0) {
      res.status(400).json({ message: 'Champs obligatoires manquants (driverId, date, depot, stops)' })
      return
    }
    const driverCheck = await getDriverById(String(driverId))
    if (!driverCheck || driverCheck.companyId !== manager.companyId) {
      res.status(403).json({ message: 'Livreur introuvable pour votre entreprise' })
      return
    }
    resolvedDriverId = String(driverId)
  }

  // Tournée issue d'un BC : les produits doivent provenir du BC (pas d'ajout libre).
  const purchaseRequestId = typeof body.purchaseRequestId === 'string' ? body.purchaseRequestId.trim() : ''
  const purchaseOrderId = typeof body.purchaseOrderId === 'string' ? body.purchaseOrderId.trim() : ''
  let bcProductKeys: Set<string> | null = null
  if (purchaseRequestId) {
    const bc = await getPurchaseRequestById(manager.companyId, purchaseRequestId)
    if (!bc) {
      res.status(404).json({ message: 'Bon de commande introuvable pour votre entreprise' })
      return
    }
    const bcLines = await getPurchaseRequestLines(purchaseRequestId)
    bcProductKeys = new Set(bcLines.map((l) => expectedProductLabelKey(l.label)))
  }

  const resolvedStops = []
  for (const [i, s] of (stops as Record<string, unknown>[]).entries()) {
    if (!s.unitType) {
      res.status(400).json({ message: `Arrêt ${i + 1} : champs obligatoires manquants (unitType)` })
      return
    }
    const unitType = await resolveTourUnitType(manager.companyId, s.unitType)
    if (!unitType) {
      res.status(400).json({ message: `Arrêt ${i + 1} : unité « ${String(s.unitType)} » inconnue ou inactive — configurez-la dans Catalogue → Unités.` })
      return
    }
    const resolved = await resolveStopFromCatalog(s.supermarketId, i, manager.companyId)
    if (!resolved.ok) {
      res.status(400).json({ message: resolved.message })
      return
    }
    const orderRef = String(s.orderRef ?? '').trim() || generateOrderRef()
    const products = parseExpectedProducts(s.products)
    const duplicateError = validateStopProducts(products ?? [], resolved.stop.name)
    if (duplicateError) {
      res.status(400).json({ message: duplicateError })
      return
    }
    if (bcProductKeys && products) {
      const unknown = products.find((p) => !bcProductKeys.has(expectedProductLabelKey(p.label)))
      if (unknown) {
        res.status(400).json({
          message: `Le produit « ${unknown.label} » ne figure pas sur le bon de commande — les lignes d'une tournée issue d'un BC ne peuvent pas être modifiées.`,
        })
        return
      }
    }
    resolvedStops.push({
      supermarketId: resolved.stop.supermarketId,
      name: resolved.stop.name,
      address: resolved.stop.address,
      instructions: s.instructions ? String(s.instructions) : undefined,
      units: Number(s.units ?? 1),
      unitType,
      weightKg: String(s.weightKg ?? '0'),
      orderRef,
      contactPhone: resolved.stop.contactPhone,
      timeWindowStart: s.timeWindowStart ? String(s.timeWindowStart) : undefined,
      timeWindowEnd: s.timeWindowEnd ? String(s.timeWindowEnd) : undefined,
      requiredPhotos: isSupplierDelivery ? 2 : Number(s.requiredPhotos ?? 1),
      lat: resolved.stop.lat,
      lng: resolved.stop.lng,
      products,
    })
  }

  try {
    const result = await createTourWithStops({
      companyId: manager.companyId,
      driverId: resolvedDriverId,
      deliverySource: isSupplierDelivery ? 'supplier' : 'driver',
      date: String(date),
      depotName: String(depotName),
      depotAddress: String(depotAddress),
      depotLat: String(depotLat ?? '0'),
      depotLng: String(depotLng ?? '0'),
      stops: resolvedStops,
    })
    if (replannedFromTourId) {
      // Ne clôturer que les arrêts du MÊME BC : planifier un nouveau BC ne doit
      // pas masquer les livraisons déjà planifiées pour les autres.
      const newOrderRefs = [...new Set(resolvedStops.map((s) => s.orderRef).filter((o): o is string => !!o))]
      const superseded = await supersedeNonDeliveredStopsFromTour(String(replannedFromTourId), newOrderRefs)
      if (superseded > 0) {
        console.log(`[dashboard] replan: ${superseded} arrêt(s) obsolète(s) clôturé(s) sur ${String(replannedFromTourId)}`)
      }
    }

    if (purchaseRequestId) {
      try {
        await markDeliveryScheduled(
          manager.companyId,
          purchaseRequestId,
          result.tourId,
          purchaseOrderId || undefined,
        )
      } catch (linkErr) {
        console.error('[dashboard] lien BC → tournée', linkErr)
        if (linkErr instanceof ProcurementWorkflowError) {
          res.status(linkErr.statusCode).json({ message: linkErr.message, tourId: result.tourId })
          return
        }
        throw linkErr
      }
    }

    let driverNotify: { sent: boolean; error?: string } = { sent: false }
    const driver = await getDriverById(resolvedDriverId)
    if (driver?.phone) {
      const smsBody = buildTourAssignedSmsBody({
        tourDate: String(date),
        stopCount: resolvedStops.length,
        depotName: String(depotName),
      })
      try {
        const sms = await sendSmsMessage(driver.phone, smsBody)
        driverNotify = sms.success
          ? { sent: true }
          : { sent: false, error: sms.details ?? sms.error ?? 'échec SMS' }
      } catch (smsErr) {
        driverNotify = {
          sent: false,
          error: smsErr instanceof Error ? smsErr.message : String(smsErr),
        }
        console.error('[dashboard] notification livreur échouée', smsErr)
      }
    }

    res.status(201).json({ ok: true, tourId: result.tourId, driverNotify })
  } catch (err) {
    console.error('[dashboard] create tour error', err)
    res.status(500).json({ message: 'Erreur serveur' })
  }
})

// GET /dashboard/tours/:id/replan-template — pré-remplir une replanification
toursRoutes.get('/dashboard/tours/:id/replan-template', requireManager, async (req, res) => {
  const { manager } = req as ManagerRequest
  try {
    const tourId = String(req.params.id)
    const tour = await getTourById(tourId)
    if (!tour || tour.companyId !== manager.companyId) {
      res.status(404).json({ message: 'Tournée introuvable' })
      return
    }
    const template = await getTourReplanTemplate(tourId)
    if (!template) { res.status(404).json({ message: 'Tournée introuvable' }); return }
    if (template.stops.length === 0) {
      res.status(400).json({ message: 'Aucun arrêt à replanifier (tous les arrêts sont déjà livrés).' })
      return
    }
    res.json(template)
  } catch (err) {
    console.error('[dashboard] replan template error', err)
    res.status(500).json({ message: 'Erreur serveur' })
  }
})

// GET /dashboard/deliveries/:deliveryId/partial-replan-template — reliquat livraison partielle
toursRoutes.get('/dashboard/deliveries/:deliveryId/partial-replan-template', requireManager, async (req, res) => {
  const { manager } = req as ManagerRequest
  try {
    const deliveryId = String(req.params.deliveryId)
    const owned = await getDeliveryStopForCompany(deliveryId, manager.companyId)
    if (!owned) {
      res.status(404).json({ message: 'Livraison introuvable ou sans reliquat à replanifier' })
      return
    }
    const template = await getPartialDeliveryReplanTemplate(deliveryId)
    if (!template) {
      res.status(404).json({ message: 'Livraison introuvable ou sans reliquat à replanifier' })
      return
    }
    res.json(template)
  } catch (err) {
    console.error('[dashboard] partial replan template error', err)
    res.status(500).json({ message: 'Erreur serveur' })
  }
})

// GET /dashboard/tours/:id — détail tournée + arrêts
toursRoutes.get('/dashboard/tours/:id', requireManager, async (req, res) => {
  const { manager } = req as ManagerRequest
  try {
    const tourId = String(req.params.id)
    const result = await getTourWithStops(tourId)
    if (!result || result.tour.companyId !== manager.companyId) {
      res.status(404).json({ message: 'Tournée introuvable' })
      return
    }
    // Lien BC résolu (colonne directe ou recherche inverse) — utilisé par
    // « Modifier la tournée » pour verrouiller les lignes produit.
    const purchaseOrderId = await resolveTourPurchaseOrderId(tourId)
    res.json({ ...result, tour: { ...result.tour, purchaseOrderId } })
  } catch (err) {
    console.error('[dashboard] get tour error', err)
    res.status(500).json({ message: 'Erreur serveur' })
  }
})

// PATCH /dashboard/tours/:id — modifier tournée + arrêts
toursRoutes.patch('/dashboard/tours/:id', requireManager, async (req, res) => {
  const { manager } = req as ManagerRequest
  const tourId = String(req.params.id)
  const body = req.body as Record<string, unknown>
  const { driverId, date, depotName, depotAddress, depotLat, depotLng, stops } = body

  if (!Array.isArray(stops) || stops.length === 0) {
    res.status(400).json({ message: 'Au moins un arrêt est requis' })
    return
  }

  try {
    const existingTour = await getTourWithStops(tourId)
    if (!existingTour || existingTour.tour.companyId !== manager.companyId) {
      res.status(404).json({ message: 'Tournée introuvable' })
      return
    }

    // Tournée issue d'un BC : les produits doivent provenir du BC (pas d'ajout libre).
    // Même règle que POST /dashboard/tours — sinon « Modifier la tournée »
    // permettrait de créer une livraison différente du bon de commande.
    const bcProductKeys = await getBcProductKeysForTour(tourId)
    // Update tour metadata
    const meta: Record<string, unknown> = {}
    if (driverId) meta.driverId = String(driverId)
    if (date) meta.date = String(date)
    if (depotName) meta.depotName = String(depotName)
    if (depotAddress) meta.depotAddress = String(depotAddress)
    if (depotLat) meta.depotLat = String(depotLat)
    if (depotLng) meta.depotLng = String(depotLng)
    if (Object.keys(meta).length) await updateTourMeta(tourId, meta)

    const existingStops = await getStopsForTour(tourId)
    const existingById = new Map(existingStops.map((s) => [s.id, s]))

    // Upsert stops
    const keptIds: string[] = []
    for (let i = 0; i < (stops as Record<string, unknown>[]).length; i++) {
      const s = (stops as Record<string, unknown>[])[i]!
      const existing = s.id ? existingById.get(String(s.id)) : undefined

      if (existing?.status === 'delivered') {
        if (stopPayloadDiffersFromExisting(existing, s)) {
          res.status(403).json({ message: `L'arrêt « ${existing.name} » est livré et ne peut pas être modifié.` })
          return
        }
        keptIds.push(existing.id)
        if (existing.sequence !== i + 1) {
          await updateDeliveryPointSequence(existing.id, i + 1)
        }
        continue
      }

      const stopId = s.id ? String(s.id) : `dp-${randomUUID()}`
      keptIds.push(stopId)

      const resolved = await resolveStopFromCatalog(s.supermarketId ?? existing?.supermarketId, i, manager.companyId)
      if (!resolved.ok) {
        res.status(400).json({ message: resolved.message })
        return
      }
      const unitType = await resolveTourUnitType(manager.companyId, s.unitType, existing?.unitType)
      if (!unitType) {
        res.status(400).json({ message: `Arrêt ${i + 1} : unité invalide ou inactive` })
        return
      }

      const products = parseExpectedProducts(s.products)
      const duplicateError = validateStopProducts(products ?? [], resolved.stop.name)
      if (duplicateError) {
        res.status(400).json({ message: duplicateError })
        return
      }

      if (bcProductKeys && products) {
        // Conformité BC : sur un arrêt existant, les lignes produit sont immuables
        // (libellés, quantités et unités doivent rester celles du bon de commande).
        if (existing) {
          const before = Array.isArray(existing.products)
            ? (existing.products as Array<{ label: string; qty: number; unit: string }>)
            : []
          const after = products
          const sameProducts =
            before.length === after.length &&
            before.every((p, i) => {
              const q = after[i]
              return (
                !!q &&
                expectedProductLabelKey(p.label) === expectedProductLabelKey(q.label) &&
                Number(p.qty) === Number(q.qty) &&
                p.unit === q.unit
              )
            })
          if (!sameProducts) {
            res.status(403).json({
              message: `Les produits de l'arrêt « ${existing.name} » proviennent du bon de commande et ne peuvent pas être modifiés.`,
            })
            return
          }
        }
        const unknown = products.find((p) => !bcProductKeys.has(expectedProductLabelKey(p.label)))
        if (unknown) {
          res.status(400).json({
            message: `Le produit « ${unknown.label} » ne figure pas sur le bon de commande — les lignes d'une tournée issue d'un BC ne peuvent pas être modifiées.`,
          })
          return
        }
      }

      await upsertDeliveryPoint({
        id: stopId,
        tourId,
        sequence: i + 1,
        supermarketId: resolved.stop.supermarketId,
        name: resolved.stop.name,
        address: resolved.stop.address,
        instructions: s.instructions ? String(s.instructions) : undefined,
        units: Number(s.units ?? existing?.units ?? 1),
        unitType,
        weightKg: String(s.weightKg ?? existing?.weightKg ?? '0'),
        orderRef: String(s.orderRef ?? '').trim() || existing?.orderRef || generateOrderRef(),
        contactPhone: resolved.stop.contactPhone,
        timeWindowStart: s.timeWindowStart ? String(s.timeWindowStart) : undefined,
        timeWindowEnd: s.timeWindowEnd ? String(s.timeWindowEnd) : undefined,
        requiredPhotos: Number(s.requiredPhotos ?? existing?.requiredPhotos ?? 1),
        lat: resolved.stop.lat,
        lng: resolved.stop.lng,
        products,
      })
    }

    // Ensure delivered stops from tour are not dropped silently
    for (const existing of existingStops) {
      if (existing.status === 'delivered' && !keptIds.includes(existing.id)) {
        res.status(403).json({ message: `L'arrêt « ${existing.name} » est livré et ne peut pas être supprimé.` })
        return
      }
    }

    // Delete removed stops (delivered stops are protected inside deleteDeliveryPoints)
    await deleteDeliveryPoints(tourId, keptIds)

    const result = await getTourWithStops(tourId)
    if (driverId) await resolvePendingReassignForTour(tourId)
    res.json({ ok: true, tour: result })
  } catch (err) {
    console.error('[dashboard] patch tour error', err)
    res.status(500).json({ message: 'Erreur serveur' })
  }
})

// DELETE /dashboard/tours/:id — supprimer une tournée (aucun arrêt livré)
toursRoutes.delete('/dashboard/tours/:id', requireManager, async (req, res) => {
  const { manager } = req as ManagerRequest
  const tourId = String(req.params.id)
  try {
    const existing = await getTourWithStops(tourId)
    if (!existing || existing.tour.companyId !== manager.companyId) {
      res.status(404).json({ message: 'Tournée introuvable' })
      return
    }
    const result = await deleteTourIfNoDeliveries(tourId)
    if (!result.ok) {
      if (result.reason === 'not_found') {
        res.status(404).json({ message: 'Tournée introuvable' })
        return
      }
      res.status(403).json({
        message: 'Impossible de supprimer : au moins un arrêt est déjà livré.',
      })
      return
    }
    res.json({ ok: true, tourId })
  } catch (err) {
    console.error('[dashboard] delete tour error', err)
    res.status(500).json({ message: 'Erreur serveur' })
  }
})

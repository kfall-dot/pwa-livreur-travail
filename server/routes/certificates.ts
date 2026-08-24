import { Router } from 'express'
import { getCertificate, getDeclaration, getStopWithDriverContext } from '../db/queries.js'
import { authorizeCertificateAccess } from '../middleware/certificateAccess.js'
import { rateLimitByIp } from '../middleware/rateLimit.js'
import { paramId } from '../utils/params.js'
import { certificateFlags, renderCertificateHtml } from '../services/certificateHtml.js'

export const certificatesRouter = Router()

certificatesRouter.use(rateLimitByIp(60, 15 * 60_000, 'certificates'))

type ProductLine = { label: string; qty: number; unit: string }

function expectedLines(
  products: unknown,
  units: number,
  unitType: string,
): ProductLine[] {
  if (Array.isArray(products) && products.length > 0) {
    return products.map((p) => {
      const r = p as Record<string, unknown>
      return {
        label: String(r.label ?? 'Produit'),
        qty: Number(r.qty) || 0,
        unit: String(r.unit ?? unitType),
      }
    })
  }
  return [{ label: 'Produit', qty: units, unit: unitType }]
}

function deliveredLines(
  declarationLines: unknown,
  expected: ProductLine[],
  outcome: string | null,
  isRejected: boolean,
  isPartial: boolean,
): ProductLine[] {
  if (isRejected || outcome === 'rejected') return []
  if (!Array.isArray(declarationLines) || declarationLines.length === 0) {
    return isPartial || outcome === 'partial' ? [] : expected
  }
  return declarationLines
    .map((raw) => {
      const r = raw as Record<string, unknown>
      const label = String(r.productLabel ?? r.product_label ?? r.label ?? 'Produit').trim()
      const unit = String(r.unit ?? 'colis')
      const acc = r.quantityAccepted ?? r.quantity_accepted
      let qty: number
      if (acc != null && acc !== '') {
        qty = Math.max(0, Number(acc) || 0)
      } else {
        const expectedQty = Number(r.quantityExpected ?? r.quantity_expected ?? 0)
        const refused = Number(r.quantityRefused ?? r.quantity_refused ?? 0)
        qty = expectedQty > 0 ? Math.max(0, expectedQty - refused) : Math.max(0, Number(r.qty ?? 0))
      }
      return { label: label || 'Produit', qty, unit }
    })
    .filter((l) => l.qty > 0)
}

certificatesRouter.get('/:receiptId', async (req, res) => {
  try {
    const receiptId = paramId(req, 'receiptId')
    const cert = await getCertificate(receiptId)
  if (!cert) {
    res.status(404).json({ message: 'Certificat introuvable', valid: false })
    return
  }
    if (!(await authorizeCertificateAccess(req, res, cert))) return

    const ctx = await getStopWithDriverContext(cert.deliveryId)
    const decl = await getDeclaration(cert.deliveryId)
    const flags = certificateFlags(cert)
    const outcome = (decl?.outcome ?? (flags.isRejected ? 'rejected' : flags.isPartial ? 'partial' : 'full')) as
      | 'full'
      | 'partial'
      | 'rejected'
      | null
    const expected = expectedLines(ctx?.products, ctx?.units ?? 0, ctx?.unitType ?? 'colis')
    const delivered = deliveredLines(decl?.lines, expected, outcome, flags.isRejected, flags.isPartial)

    const queryAccess = typeof req.query.access === 'string' ? req.query.access : ''
    const accept = String(req.headers.accept ?? '')
    // Lien e-mail / navigateur : HTML. Clients API (Accept */* ou application/json) : JSON.
    const wantsHtml =
      req.query.view === 'html' ||
      (Boolean(queryAccess) && accept.includes('text/html'))

    if (wantsHtml) {
      const html = renderCertificateHtml({
        receiptId: cert.receiptId,
        deliveryName: ctx?.name ?? 'Livraison',
        deliveryAddress: ctx?.address ?? '—',
        tourDate: ctx?.tourDate ?? '—',
        driverName: ctx?.driverName ?? '—',
        orderRef: ctx?.orderRef ?? '—',
        outcome,
        isPartial: flags.isPartial,
        isRejected: flags.isRejected,
        expectedLines: expected,
        deliveredLines: delivered,
      })
      res.setHeader('Content-Type', 'text/html; charset=utf-8')
      res.setHeader('Cache-Control', 'private, no-store')
      res.send(html)
      return
    }

  res.json({
    valid: true,
    url: cert.certificateUrl,
    receiptId: cert.receiptId,
      delivery: ctx
        ? { name: ctx.name, address: ctx.address, date: ctx.tourDate }
      : undefined,
      outcome,
      expectedLines: expected,
      deliveredLines: delivered,
  })
  } catch (err) {
    console.error('[certificates] error', err)
    res.status(500).json({ message: 'Erreur serveur' })
  }
})

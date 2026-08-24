export type EmailStopContext = {
  name: string
  address: string
  units: number
  unitType: string
  orderRef: string
  products?: Array<{ label: string; qty: number; unit: string }> | null
  tourDate: string
  driverName: string
}

type DeclarationOutcome = 'full' | 'partial' | 'rejected'
type ProductLine = { label: string; qty: number; unit: string }

function outcomeLabel(outcome: DeclarationOutcome | null): string {
  if (outcome === 'rejected') return 'refusée'
  if (outcome === 'partial') return 'partielle'
  return 'complète'
}

function pluralUnit(unit: string, qty: number): string {
  const u = unit.trim() || 'unité'
  if (qty <= 1) return u
  if (u.endsWith('s') || u.endsWith('x')) return u
  return `${u}s`
}

function formatQtyLines(lines: ProductLine[]): string {
  if (lines.length === 0) return '—'
  return lines.map((l) => `${l.label} ${l.qty} ${pluralUnit(l.unit, l.qty)}`).join('\n')
}

function expectedLinesFromStop(ctx: EmailStopContext): ProductLine[] {
  const products = Array.isArray(ctx.products) ? ctx.products : []
  const fallbackUnits = Number(ctx.units)
  const safeUnits = Number.isFinite(fallbackUnits) && fallbackUnits > 0 ? fallbackUnits : 0
  const safeUnit = String(ctx.unitType || 'colis')
  if (products.length > 0) {
    return products.map((p) => {
      const raw = p as { label?: string; qty?: number; quantity?: number; unit?: string }
      const qty = Number(raw.qty ?? raw.quantity)
      return {
        label: String(raw.label || 'Produit').trim() || 'Produit',
        qty: Number.isFinite(qty) && qty > 0 ? qty : safeUnits || 1,
        unit: String(raw.unit || safeUnit),
      }
    })
  }
  return [{ label: 'Produit', qty: safeUnits || 1, unit: safeUnit }]
}

function deliveredLinesFromDeclaration(
  expected: ProductLine[],
  declarationLines: unknown,
  outcome: DeclarationOutcome | null,
): ProductLine[] {
  if (outcome === 'rejected') return []
  if (!Array.isArray(declarationLines) || declarationLines.length === 0) {
    return outcome === 'partial' ? [] : expected
  }
  return declarationLines
    .map((raw) => {
      const r = raw as Record<string, unknown>
      const label = String(r.productLabel ?? r.product_label ?? r.label ?? '').trim()
      const unit = String(r.unit ?? r.productUnit ?? 'colis')
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

export function buildEmailBody(
  ctx: EmailStopContext,
  receiptId: string,
  outcome: DeclarationOutcome | null,
  declarationLines?: unknown,
  certificateUrl?: string,
): { subject: string; text: string } {
  const label = outcomeLabel(outcome)
  const subject = `Bon de livraison — ${ctx.name} (${receiptId})`
  const expected = expectedLinesFromStop(ctx)
  const delivered = deliveredLinesFromDeclaration(expected, declarationLines, outcome)
  const certBlock = certificateUrl
    ? `Certificat : ${receiptId}\nVoir le certificat : ${certificateUrl}\n\n`
    : `Certificat : ${receiptId}\n\n`
  const text =
    `Bonjour,\n\n` +
    `La livraison « ${ctx.name} » a été validée (${label}).\n\n` +
    `Livreur : ${ctx.driverName}\n` +
    `Tournée : ${ctx.tourDate}\n` +
    `Adresse : ${ctx.address}\n` +
    `Réf. commande : ${ctx.orderRef}\n` +
    certBlock +
    `Quantité attendue\n${formatQtyLines(expected)}\n\n` +
    `Quantité livrée\n${formatQtyLines(delivered)}\n\n` +
    `— Dashboard Livraison`
  return { subject, text }
}

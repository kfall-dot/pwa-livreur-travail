import type { Certificate } from '../db/schema.js'

export type CertificateHtmlInput = {
  receiptId: string
  deliveryName: string
  deliveryAddress: string
  tourDate: string
  driverName: string
  orderRef: string
  outcome: 'full' | 'partial' | 'rejected' | null
  isPartial: boolean
  isRejected: boolean
  expectedLines: Array<{ label: string; qty: number; unit: string }>
  deliveredLines: Array<{ label: string; qty: number; unit: string }>
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function pluralUnit(unit: string, qty: number): string {
  const u = unit.trim() || 'unité'
  if (qty <= 1) return u
  if (u.endsWith('s') || u.endsWith('x')) return u
  return `${u}s`
}

function formatLines(lines: Array<{ label: string; qty: number; unit: string }>): string {
  if (lines.length === 0) return '<li>—</li>'
  return lines
    .map(
      (l) =>
        `<li><strong>${escapeHtml(l.label)}</strong> — ${l.qty} ${escapeHtml(pluralUnit(l.unit, l.qty))}</li>`,
    )
    .join('')
}

function outcomeLabel(input: CertificateHtmlInput): string {
  if (input.isRejected || input.outcome === 'rejected') return 'Livraison refusée'
  if (input.isPartial || input.outcome === 'partial') return 'Livraison partielle'
  return 'Livraison complète'
}

function outcomeClass(input: CertificateHtmlInput): string {
  if (input.isRejected || input.outcome === 'rejected') return 'rejected'
  if (input.isPartial || input.outcome === 'partial') return 'partial'
  return 'full'
}

/** Page HTML imprimable du bon de livraison (lien e-mail / ouverture navigateur). */
export function renderCertificateHtml(input: CertificateHtmlInput): string {
  const title = outcomeLabel(input)
  const klass = outcomeClass(input)
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Certificat ${escapeHtml(input.receiptId)}</title>
  <style>
    :root { color-scheme: light; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "Segoe UI", system-ui, sans-serif;
      background: #f1f5f9;
      color: #0f172a;
      line-height: 1.45;
    }
    .sheet {
      max-width: 720px;
      margin: 24px auto;
      background: #fff;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      padding: 28px 32px;
      box-shadow: 0 8px 24px rgba(15, 23, 42, 0.06);
    }
    h1 { margin: 0 0 4px; font-size: 1.5rem; }
    .eyebrow { margin: 0 0 16px; color: #64748b; font-size: 0.9rem; }
    .badge {
      display: inline-block;
      font-size: 0.8rem;
      font-weight: 700;
      padding: 4px 10px;
      border-radius: 999px;
      margin-bottom: 18px;
    }
    .badge.full { background: #dcfce7; color: #166534; }
    .badge.partial { background: #fef3c7; color: #92400e; }
    .badge.rejected { background: #fee2e2; color: #991b1b; }
    dl {
      display: grid;
      grid-template-columns: 160px 1fr;
      gap: 8px 16px;
      margin: 0 0 20px;
    }
    dt { color: #64748b; font-size: 0.85rem; }
    dd { margin: 0; font-weight: 600; }
    h2 { font-size: 1rem; margin: 20px 0 8px; }
    ul { margin: 0; padding-left: 1.2rem; }
    li { margin: 4px 0; }
    .actions { margin-top: 28px; display: flex; gap: 10px; flex-wrap: wrap; }
    button, a.btn {
      appearance: none;
      border: none;
      background: #0b4a2c;
      color: #fff;
      font-weight: 600;
      font-size: 0.95rem;
      padding: 10px 16px;
      border-radius: 8px;
      cursor: pointer;
      text-decoration: none;
    }
    button.secondary { background: #e2e8f0; color: #0f172a; }
    @media print {
      body { background: #fff; }
      .sheet { box-shadow: none; border: none; margin: 0; max-width: none; }
      .actions { display: none; }
    }
  </style>
</head>
<body>
  <main class="sheet">
    <p class="eyebrow">Bon de livraison · certificat</p>
    <h1>${escapeHtml(input.deliveryName)}</h1>
    <span class="badge ${klass}">${escapeHtml(title)}</span>
    <dl>
      <dt>Certificat</dt><dd>${escapeHtml(input.receiptId)}</dd>
      <dt>Réf. commande</dt><dd>${escapeHtml(input.orderRef || '—')}</dd>
      <dt>Date tournée</dt><dd>${escapeHtml(input.tourDate)}</dd>
      <dt>Livreur</dt><dd>${escapeHtml(input.driverName)}</dd>
      <dt>Adresse</dt><dd>${escapeHtml(input.deliveryAddress)}</dd>
    </dl>
    <h2>Quantité attendue</h2>
    <ul>${formatLines(input.expectedLines)}</ul>
    <h2>Quantité livrée</h2>
    <ul>${formatLines(input.deliveredLines)}</ul>
    <div class="actions">
      <button type="button" onclick="window.print()">Imprimer</button>
    </div>
  </main>
</body>
</html>`
}

export function certificateFlags(cert: Pick<Certificate, 'isPartial' | 'isRejected'>): {
  isPartial: boolean
  isRejected: boolean
} {
  return { isPartial: Boolean(cert.isPartial), isRejected: Boolean(cert.isRejected) }
}

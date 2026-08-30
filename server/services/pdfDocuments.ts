import type {
  DocumentTemplate,
  PurchaseOrder,
  PurchaseRequest,
  PurchaseRequestLine,
  Site,
  Supplier,
  TreasuryOrder,
} from '../db/schema.js'
import { comptantLines, linesForSupplier } from '../lib/procurementLines.js'
import { withPrintBar } from '../lib/htmlPrint.js'

export type BcTemplateData = {
  reference: string
  companyName: string
  siteName: string
  siteAddress: string
  receveur: string
  supplierName: string
  supplierAddress?: string | null
  amountFcfa: number
  payeAvance: boolean
  paiementLivraison: boolean
  lines: Array<{
    label: string
    quantity: string
    unit: string
    unitPriceFcfa: number
    amountFcfa: number
    observation?: string | null
  }>
  notes?: string | null
  createdAt: string
}

export type BtTemplateData = {
  reference: string
  siteName: string
  amountFcfa: number
  requesterName?: string
  objet?: string
  currency?: string
  requiredDate?: string
  reconciliationDate?: string
  employeeId?: string
  structureCode?: string
  lines?: Array<{ reference?: string; objet: string; amountFcfa: number }>
  quotationUrls?: string[] | null
  notes?: string | null
  createdAt: string
  /** Laissé vide : le n° d’avance est attribué par les Finances. */
  avanceNumber?: string
  dafName?: string
  dafDate?: string
  dafSignature?: string
  pdgName?: string
  pdgDate?: string
  pdgSignature?: string
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function renderTemplate(html: string, data: Record<string, string>, rawKeys: string[] = []): string {
  const raw = new Set(rawKeys)
  let out = html
  for (const [key, value] of Object.entries(data)) {
    out = out.replaceAll(`{{${key}}}`, raw.has(key) ? value : escapeHtml(value))
  }
  return out
}

function formatFcfa(n: number): string {
  return `${Math.round(n).toLocaleString('fr-FR')} F`
}

function formatDateFr(isoDate: string): string {
  const d = new Date(`${isoDate.slice(0, 10)}T12:00:00`)
  if (Number.isNaN(d.getTime())) return isoDate
  return d.toLocaleDateString('fr-FR')
}

const DEFAULT_BC_TEMPLATE = `<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8"><title>BON DE COMMANDE {{reference}}</title>
<style>
  @page { size: A4; margin: 12mm; }
  body { font-family: "Times New Roman", Times, serif; margin: 0; color: #111; background: #e7efe4; }
  .sheet { background: #e7efe4; border: 2px solid #111; padding: 10px 12px 14px; }
  .head { display: flex; align-items: flex-start; gap: 8px; margin-bottom: 8px; }
  .brand { font-size: 11px; font-weight: 700; line-height: 1.2; width: 22%; }
  .title { flex: 1; text-align: center; color: #7a1f12; font-size: 22px; font-weight: 800; letter-spacing: .04em; padding-top: 4px; }
  table.meta, table.lines { width: 100%; border-collapse: collapse; background: #fff; }
  table.meta th, table.meta td, table.lines th, table.lines td { border: 1px solid #111; padding: 5px 6px; font-size: 12px; }
  table.meta th { font-size: 10px; text-transform: uppercase; background: #f3f7f1; }
  table.lines th { font-size: 10px; text-transform: uppercase; background: #f3f7f1; }
  table.lines td.qty, table.lines td.unit, table.lines td.pu, table.lines td.tot { text-align: right; white-space: nowrap; }
  table.lines td.desc { min-width: 40%; }
  .dotrow td { height: 22px; border-bottom-style: dotted; }
  .totals td { font-weight: 700; }
  .foot { display: flex; gap: 10px; margin-top: 10px; }
  .terms { flex: 1.2; font-size: 10px; line-height: 1.35; }
  .sign { flex: 1; }
  .sign-box { border: 1px solid #111; background: #fff; min-height: 58px; padding: 4px 6px; margin-bottom: 6px; font-size: 11px; font-weight: 700; }
  .sign-box.tall { min-height: 72px; }
</style>
</head><body>
<div class="sheet">
  <div class="head">
    <div class="brand">{{companyName}}</div>
    <div class="title">BON DE COMMANDE N°{{reference}}</div>
  </div>
  <table class="meta">
    <tr>
      <th>Date B.C.</th>
      <th>Receveur</th>
      <th>Payé d'avance</th>
      <th>Paiement à la livraison</th>
    </tr>
    <tr>
      <td>{{dateBc}}</td>
      <td>{{receveur}}</td>
      <td>{{payeAvance}}</td>
      <td>{{paiementLivraison}}</td>
    </tr>
  </table>
  <table class="lines" style="margin-top:8px">
    <thead>
      <tr>
        <th>Quantité</th>
        <th>Unité</th>
        <th>Description</th>
        <th>Prix unitaire</th>
        <th>Total</th>
      </tr>
    </thead>
    <tbody>{{linesRows}}</tbody>
  </table>
  <div class="foot">
    <div class="terms">
      <ol>
        <li>Envoyer trois copies de votre facture.</li>
        <li>Exécuter la commande conformément aux prix, modalités, mode de livraison et spécifications précisées ci-dessus.</li>
        <li>Nous notifier aussitôt si vous ne pouvez livrer tel que précisé.</li>
        <li>Envoyer toutes les correspondances à {{companyName}}.</li>
      </ol>
      <p>Fournisseur : {{supplierName}}{{supplierAddressBlock}}</p>
      <p>Chantier : {{siteName}} — {{siteAddress}}</p>
    </div>
    <div class="sign">
      <div class="sign-box tall">Autorisation</div>
      <div class="sign-box">Autorisé par / Comptabilité<br>Date {{dateBc}}</div>
    </div>
  </div>
</div>
</body></html>`

const DEFAULT_BT_TEMPLATE = `<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8"><title>Fiche trésorerie {{reference}}</title>
<style>
  @page { size: A4; margin: 12mm; }
  body { font-family: Arial, Helvetica, sans-serif; margin: 0; color: #111; }
  .sheet { border: 2px solid #1e3a5f; }
  .banner { background: #1e3a5f; color: #fff; text-align: center; padding: 10px 12px; }
  .banner h1 { margin: 0; font-size: 20px; letter-spacing: .02em; }
  .banner p { margin: 4px 0 0; font-size: 11px; opacity: .9; }
  .pad { padding: 10px 12px 14px; }
  table.meta, table.lines { width: 100%; border-collapse: collapse; }
  table.meta th, table.meta td, table.lines th, table.lines td { border: 1px solid #1e3a5f; padding: 6px 8px; font-size: 12px; }
  table.meta th { width: 32%; background: #eef3f8; text-align: left; font-size: 11px; text-transform: uppercase; }
  table.lines th { background: #eef3f8; font-size: 11px; text-transform: uppercase; }
  table.lines td.amt { text-align: right; white-space: nowrap; }
  .valid { display: flex; gap: 10px; margin-top: 12px; }
  .valid .box { flex: 1; border: 1px solid #1e3a5f; min-height: 72px; padding: 6px 8px; font-size: 12px; font-weight: 700; white-space: pre-line; }
  .instr { margin-top: 12px; font-size: 10px; line-height: 1.4; color: #333; }
  .instr h3 { margin: 0 0 6px; font-size: 12px; }
  .sign { margin-top: 10px; border: 1px solid #1e3a5f; min-height: 56px; padding: 6px 8px; font-size: 11px; }
</style>
</head><body>
<div class="sheet">
  <div class="banner">
    <h1>Demande d’avance de trésorerie</h1>
    <p>Manuel financier de terrain : Formulaire 3.3 A — FICHE DE TRESO ACHATS</p>
  </div>
  <div class="pad">
    <table class="meta">
      <tr><th>N° de l’avance</th><td>{{avanceNumber}}</td></tr>
      <tr><th>Nom du demandeur</th><td>{{requesterName}}</td></tr>
      <tr><th>Devise</th><td>{{currency}}</td></tr>
      <tr><th>N° Employé ID</th><td>{{employeeId}}</td></tr>
      <tr><th>Date requise</th><td>{{requiredDate}}</td></tr>
      <tr><th>Code de bureau (Structure)</th><td>{{structureCode}}</td></tr>
      <tr><th>Date de rapprochement estimée</th><td>{{reconciliationDate}}</td></tr>
      <tr><th>Chantier</th><td>{{siteName}}</td></tr>
    </table>
    <table class="lines" style="margin-top:10px">
      <thead><tr><th>N° de référence</th><th>Objet</th><th>Montant</th></tr></thead>
      <tbody>{{linesRows}}</tbody>
    </table>
    <div class="valid">
      {{dafBox}}
      {{pdgBox}}
    </div>
    <div class="instr">
      <h3>Instructions</h3>
      <ol>
        <li>Le demandeur remplit la partie supérieure, sauf le n° d’avance (attribué par les Finances).</li>
        <li>La section « Objet » doit être détaillée. Pour une avance d’exploitation, joindre la demande d’achat.</li>
        <li>Une avance ne peut être accordée que dans une seule monnaie ({{currency}}).</li>
        <li>Le formulaire est remis au supérieur hiérarchique, puis au DAF / PDG selon le seuil.</li>
        <li>Les Finances vérifient la date de régularisation et attribuent le n° de suivi.</li>
        <li>Le demandeur signe à réception de l’intégralité de la somme.</li>
        <li>Produit en trois exemplaires (demandeur, Finances, dossier chantier).</li>
      </ol>
    </div>
    <div class="sign">Réception des fonds — signature du demandeur<br>Date {{requiredDate}}</div>
  </div>
</div>
</body></html>`

function linesToRows(
  lines: BcTemplateData['lines'],
  totalTtc: number,
): string {
  const body = lines
    .map(
      (l) =>
        `<tr class="dotrow"><td class="qty">${escapeHtml(l.quantity)}</td><td class="unit">${escapeHtml(l.unit)}</td><td class="desc">${escapeHtml(l.label)}</td><td class="pu">${escapeHtml(formatFcfa(l.unitPriceFcfa))}</td><td class="tot">${escapeHtml(formatFcfa(l.amountFcfa))}</td></tr>`,
    )
    .join('')
  const tva = Math.round(totalTtc - totalTtc / 1.18)
  const ht = totalTtc - tva
  const pad = Math.max(0, 6 - lines.length)
  const empty = Array.from({ length: pad }, () =>
    `<tr class="dotrow"><td class="qty"></td><td class="unit"></td><td class="desc"></td><td class="pu"></td><td class="tot"></td></tr>`,
  ).join('')
  const totals = `<tr class="totals"><td colspan="4">TVA (18 %)</td><td class="tot">${escapeHtml(formatFcfa(tva))}</td></tr>
<tr class="totals"><td colspan="4">TOTAL TTC</td><td class="tot">${escapeHtml(formatFcfa(totalTtc || ht + tva))}</td></tr>`
  return `${body}${empty}${totals}`
}

export function generateBcHtml(
  _template: DocumentTemplate | null,
  data: BcTemplateData,
): string {
  const total = data.amountFcfa || data.lines.reduce((s, l) => s + l.amountFcfa, 0)
  return withPrintBar(renderTemplate(
    DEFAULT_BC_TEMPLATE,
    {
      reference: data.reference,
      companyName: data.companyName,
      siteName: data.siteName,
      siteAddress: data.siteAddress,
      receveur: data.receveur,
      supplierName: data.supplierName,
      supplierAddressBlock: data.supplierAddress ? ` — ${data.supplierAddress}` : '',
      amountFcfa: String(total),
      dateBc: formatDateFr(data.createdAt),
      createdAt: data.createdAt,
      payeAvance: data.payeAvance ? 'Oui' : '—',
      paiementLivraison: data.paiementLivraison ? 'Oui' : '—',
      linesRows: linesToRows(data.lines, total),
    },
    ['linesRows'],
  ))
}

function btLinesRows(data: BtTemplateData): string {
  const rows = (data.lines?.length
    ? data.lines
    : [{ objet: data.objet || data.notes || 'Avance trésorerie achats', amountFcfa: data.amountFcfa }])
  const body = rows
    .map(
      (l) =>
        `<tr><td>${escapeHtml(l.reference ?? data.reference)}</td><td>${escapeHtml(l.objet)}</td><td class="amt">${escapeHtml(formatFcfa(l.amountFcfa))}</td></tr>`,
    )
    .join('')
  const total = rows.reduce((s, l) => s + l.amountFcfa, 0) || data.amountFcfa
  return `${body}<tr class="totals"><td colspan="2"><strong>Total</strong></td><td class="amt"><strong>${escapeHtml(formatFcfa(total))}</strong></td></tr>`
}

function btValidationBox(
  title: string,
  name?: string,
  date?: string,
  signature?: string,
): string {
  const sig = (signature ?? '').replace(/\bPIN vérifié\b/g, 'NIP vérifié').trim()
  const text = sig || [name, date].map((v) => (v ?? '').trim()).filter(Boolean).join('\n')
  const body = text
    ? `<div style="font-weight:400;margin-top:6px">${escapeHtml(text).replace(/\n/g, '<br>')}</div>`
    : ''
  return `<div class="box">${escapeHtml(title)}${body}</div>`
}

export function generateBtHtml(
  _template: DocumentTemplate | null,
  data: BtTemplateData,
): string {
  const date = formatDateFr(data.requiredDate || data.createdAt)
  return withPrintBar(renderTemplate(
    DEFAULT_BT_TEMPLATE,
    {
      reference: data.reference,
      avanceNumber: data.avanceNumber ?? '',
      siteName: data.siteName,
      requesterName: data.requesterName || '—',
      currency: data.currency || 'XOF',
      employeeId: data.employeeId || '—',
      requiredDate: date,
      structureCode: data.structureCode || data.siteName,
      reconciliationDate: formatDateFr(data.reconciliationDate || data.createdAt),
      amountFcfa: String(data.amountFcfa),
      linesRows: btLinesRows(data),
      createdAt: data.createdAt,
      dafBox: btValidationBox('VALIDATION DAF', data.dafName, data.dafDate, data.dafSignature),
      pdgBox: btValidationBox('VALIDATION PDG', data.pdgName, data.pdgDate, data.pdgSignature),
    },
    ['linesRows', 'dafBox', 'pdgBox'],
  ))
}

function paymentFlags(lines: PurchaseRequestLine[]): { payeAvance: boolean; paiementLivraison: boolean } {
  const modes = lines.map((l) => (l.paymentMode ?? '').toUpperCase()).filter(Boolean)
  // Paiement à la livraison : uniquement COMPTANT ou CHEQUE (demande métier).
  // VIREMENT = payé d'avance ; CREDIT = ni l'un ni l'autre.
  const payeAvance = modes.some((m) => m === 'VIREMENT')
  const paiementLivraison = modes.some((m) => m === 'COMPTANT' || m === 'CHEQUE' || m === 'CHÈQUE')
  return { payeAvance, paiementLivraison }
}

export function buildBcDataFromRequest(
  request: PurchaseRequest,
  site: Site,
  supplier: Supplier,
  lines: PurchaseRequestLine[],
  companyName = 'TraceO',
): BcTemplateData {
  const poLines = linesForSupplier(lines, supplier.name)
  const { payeAvance, paiementLivraison } = paymentFlags(poLines)
  const mapped = poLines.map((l) => ({
    label: l.label,
    quantity: String(l.quantity),
    unit: l.unit,
    unitPriceFcfa: Number(l.unitPriceFcfa ?? 0),
    amountFcfa: Number(l.amountFcfa ?? 0),
    observation: l.observation,
  }))
  const amountFcfa = mapped.reduce((s, l) => s + l.amountFcfa, 0) || Number(request.totalAmountFcfa ?? 0)
  return {
    reference: request.reference,
    companyName,
    siteName: site.name,
    siteAddress: site.address,
    receveur: request.requestedByName?.trim() || site.name,
    supplierName: supplier.name,
    supplierAddress: supplier.address,
    amountFcfa,
    payeAvance,
    paiementLivraison,
    lines: mapped,
    notes: request.notes,
    createdAt: new Date().toISOString().slice(0, 10),
  }
}

export function buildBtDataFromRequest(
  request: PurchaseRequest,
  site: Site,
  treasury: TreasuryOrder,
  lines: PurchaseRequestLine[] = [],
): BtTemplateData {
  const urls = Array.isArray(treasury.quotationUrls)
    ? (treasury.quotationUrls as string[])
    : null
  const cash = comptantLines(lines)
  const source = cash.length > 0 ? cash : lines
  const mapped = source
    .filter((l) => l.label.trim())
    .map((l) => ({
      reference: request.reference,
      objet: `${l.label} — ${l.quantity} ${l.unit}${l.supplierName ? ` (${l.supplierName})` : ''}`,
      amountFcfa: Number(l.amountFcfa ?? 0) || Number(l.unitPriceFcfa ?? 0) * Number(l.quantity ?? 0),
    }))
  const amountFcfa = mapped.reduce((s, l) => s + l.amountFcfa, 0) || Number(treasury.amountFcfa)
  return {
    reference: treasury.reference,
    siteName: site.name,
    amountFcfa,
    requesterName: request.requestedByName?.trim() || undefined,
    objet: request.notes ?? undefined,
    structureCode: site.name,
    lines: mapped,
    quotationUrls: urls,
    notes: request.notes,
    createdAt: new Date().toISOString().slice(0, 10),
  }
}

export function wrapPoDocument(po: PurchaseOrder): { id: string; reference: string; html: string | null } {
  return { id: po.id, reference: po.reference, html: po.pdfHtml }
}

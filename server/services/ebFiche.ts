/**
 * Fiche « Expression du besoin » calquée sur
 * `docs/originaux/FICHE DE BESOIN ACHAT - Copie.xlsx`
 * SERVICE = Direction Technique ; fournisseur et mode de paiement par ligne.
 */

import { withPrintBar } from '../lib/htmlPrint.js'

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export const EB_FICHE_SERVICE = 'Direction Technique'

export type EbFicheLine = {
  ref: string
  label: string
  unit: string
  quantity: string
  unitPrice?: string
  amount?: string
  observation?: string
  supplierName?: string
  paymentMode?: string
}

export type EbFicheData = {
  reference: string
  siteName: string
  service?: string
  objet: string
  requesterName: string
  treatmentDate: string
  neededBy?: string | null
  urgency?: string | null
  lines: EbFicheLine[]
  treatedByName?: string | null
  treatedByDate?: string | null
  treatedBySignature?: string | null
  validatedByName?: string | null
  validatedByDate?: string | null
  validatedBySignature?: string | null
  dafName?: string | null
  dafDate?: string | null
  dafSignature?: string | null
  pdgName?: string | null
  pdgDate?: string | null
  pdgSignature?: string | null
  showPdg?: boolean
}

const EMPTY_LINE_COUNT = 4

export function generateEbFicheHtml(data: EbFicheData): string {
  const service = data.service ?? EB_FICHE_SERVICE
  const pad = Math.max(0, EMPTY_LINE_COUNT - data.lines.length)
  const rows = [
    ...data.lines.map(
      (l) => `<tr>
        <td class="ref">${escapeHtml(l.ref)}</td>
        <td class="des">${escapeHtml(l.label)}</td>
        <td>${escapeHtml(l.unit)}</td>
        <td class="qty">${escapeHtml(l.quantity)}</td>
        <td class="num">${escapeHtml(l.unitPrice ?? '')}</td>
        <td class="num">${escapeHtml(l.amount ?? '')}</td>
        <td>${escapeHtml(l.supplierName ?? '')}</td>
        <td>${escapeHtml(l.paymentMode ?? '')}</td>
        <td>${escapeHtml(l.observation ?? '')}</td>
      </tr>`,
    ),
    ...Array.from({ length: pad }, () =>
      `<tr><td class="ref"></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>`,
    ),
  ].join('')

  return withPrintBar(`<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <title>Expression du besoin ${escapeHtml(data.reference)}</title>
  <style>
    @page { size: A4 landscape; margin: 12mm; }
    body { font-family: Arial, Helvetica, sans-serif; color: #1a1a1a; margin: 0; }
    .fiche { border: 2px solid #1e3a5f; }
    .title { background: #1e3a5f; color: #fff; text-align: center; font-size: 22px; font-weight: 700;
      letter-spacing: .08em; padding: 10px 12px; }
    .meta { width: 100%; border-collapse: collapse; }
    .meta td { border: 1px solid #1e3a5f; padding: 8px 10px; vertical-align: top; }
    .meta .label { font-size: 11px; font-weight: 700; text-transform: uppercase; color: #1e3a5f; }
    .meta .value { font-size: 13px; margin-top: 2px; }
    .demandeur { width: 16%; background: #e8eef4; font-weight: 700; text-align: center;
      vertical-align: middle; letter-spacing: .04em; }
    table.lines { width: 100%; border-collapse: collapse; }
    table.lines th, table.lines td { border: 1px solid #1e3a5f; padding: 6px 8px; font-size: 12px; }
    table.lines th { background: #d6e0ea; font-size: 11px; text-transform: uppercase; }
    table.lines td.ref { width: 5%; text-align: center; }
    table.lines td.des { width: 22%; }
    table.lines td.qty, table.lines td.num { text-align: right; width: 8%; }
    table.lines tbody tr { height: 32px; }
    .sign { width: 100%; border-collapse: collapse; }
    .sign td { border: 1px solid #1e3a5f; padding: 8px 10px; font-size: 12px; vertical-align: top; }
    .sign .head { background: #e8eef4; font-weight: 700; font-size: 11px; text-transform: uppercase; }
    .sign .box { min-height: 40px; white-space: pre-line; }
    .sign .role { width: 14%; text-align: center; vertical-align: middle; letter-spacing: .03em; }
    .sign .finance { width: 16%; text-align: center; font-weight: 700; vertical-align: middle; min-height: 140px; }
    .ref-foot { font-size: 11px; color: #555; padding: 8px 10px; }
  </style>
</head>
<body>
  <div class="fiche">
    <div class="title">EXPRESSION DU BESOIN</div>
    <table class="meta">
      <tr>
        <td class="demandeur" rowspan="3">DEMANDEUR</td>
        <td colspan="3">
          <div class="label">SITE :</div>
          <div class="value">${escapeHtml(data.siteName || '—')}</div>
        </td>
        <td colspan="2">
          <div class="label">SERVICE:</div>
          <div class="value">${escapeHtml(service)}</div>
        </td>
      </tr>
      <tr>
        <td colspan="3">
          <div class="label">OBJET</div>
          <div class="value">${escapeHtml(data.objet)}</div>
        </td>
        <td colspan="2">
          <div class="label">NOM DEMANDEUR :</div>
          <div class="value">${escapeHtml(data.requesterName || 'À identifier')}</div>
        </td>
      </tr>
      <tr>
        <td colspan="3">
          <div class="label">DATE DE BESOIN</div>
          <div class="value">${escapeHtml(data.neededBy || 'À préciser')}${data.urgency === 'urgent' ? ' · Urgent' : ''}</div>
        </td>
        <td colspan="2">
          <div class="label">DATE DE TRAITEMENT :</div>
          <div class="value">${escapeHtml(data.treatmentDate)}</div>
        </td>
      </tr>
    </table>
    <table class="lines">
      <thead>
        <tr>
          <th>Réf</th>
          <th>Désignations</th>
          <th>Unité</th>
          <th>Quantité</th>
          <th>Prix Unitaire</th>
          <th>Montant</th>
          <th>Fournisseur</th>
          <th>Mode de paiement</th>
          <th>Observations</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <table class="sign">
      <tr>
        <td class="head role" rowspan="2">TRAITE PAR</td>
        <td class="head">NOM</td>
        <td class="head">DATE</td>
        <td class="head">SIGNATURE</td>
        <td class="head finance" rowspan="4">DAF${financeBox(data.dafName, data.dafDate, data.dafSignature)}</td>
        ${data.showPdg ? `<td class="head finance" rowspan="4">PDG${financeBox(data.pdgName, data.pdgDate, data.pdgSignature)}</td>` : ''}
      </tr>
      <tr>
        <td class="box">${escapeHtml(data.treatedByName || '')}</td>
        <td>${escapeHtml(data.treatedByDate || '')}</td>
        <td class="box">${escapeHtml(data.treatedBySignature || '')}</td>
      </tr>
      <tr>
        <td class="head role" rowspan="2">VALIDE PAR</td>
        <td class="head">NOM</td>
        <td class="head">DATE</td>
        <td class="head">SIGNATURE</td>
      </tr>
      <tr>
        <td class="box">${escapeHtml(data.validatedByName || '')}</td>
        <td>${escapeHtml(data.validatedByDate || '')}</td>
        <td class="box">${escapeHtml(data.validatedBySignature || '')}</td>
      </tr>
    </table>
    <div class="ref-foot">Réf. ${escapeHtml(data.reference)} — TraceO BTP</div>
  </div>
</body>
</html>`)
}

export function ficheLinesFromParsed(
  lines: Array<{
    label: string
    quantity: number
    unit: string
    observation?: string
    supplierName?: string
    paymentMode?: string
    unitPrice?: number
    amount?: number
  }>,
): EbFicheLine[] {
  return lines.map((l, i) => ({
    ref: String(i + 1),
    label: l.label,
    unit: l.unit,
    quantity: String(l.quantity),
    unitPrice: l.unitPrice != null ? String(l.unitPrice) : '',
    amount: l.amount != null ? String(l.amount) : '',
    observation: l.observation ?? '',
    supplierName: l.supplierName ?? '',
    paymentMode: l.paymentMode ?? '',
  }))
}

function firstLineName(comment?: string | null): string {
  return comment?.split('\n')[0]?.replace(/\s*\((DT|SA|DAF|PDG|CDG)\)\s*$/, '').trim() ?? ''
}

function financeBox(name?: string | null, date?: string | null, signature?: string | null): string {
  const sig = (signature ?? '').replace(/\bPIN vérifié\b/g, 'NIP vérifié').trim()
  const text = sig || [name, date].map((v) => (v ?? '').trim()).filter(Boolean).join('\n')
  if (!text) return ''
  return `<div class="box">${escapeHtml(text)}</div>`
}

type SignoffStep = {
  role: string
  decision: string
  comment: string | null
  createdAt: Date | string
  managerName?: string | null
}

function withNipVerified(text: string): string {
  const n = text.replace(/\bPIN vérifié\b/g, 'NIP vérifié').trim()
  if (!n) return 'NIP vérifié'
  return /NIP vérifié/.test(n) ? n : `${n}\nNIP vérifié`
}

function stepDisplayName(step?: SignoffStep): string {
  return firstLineName(step?.comment) || (step?.managerName ?? '').trim()
}

function stepSignature(step?: SignoffStep, withNip = false): string {
  const comment = (step?.comment ?? '').replace(/\bPIN vérifié\b/g, 'NIP vérifié').trim()
  const body = comment || stepDisplayName(step)
  if (withNip) return withNipVerified(body)
  return body
}

/** TRAITE PAR = SA ; VALIDE PAR = DT — DAF/PDG (sheet1) remplis après approbation. */
export function signoffFromApprovalSteps(steps: Array<SignoffStep>): {
  treatedByName: string
  treatedByDate: string
  treatedBySignature: string
  validatedByName: string
  validatedByDate: string
  validatedBySignature: string
  dafName: string
  dafDate: string
  dafSignature: string
  pdgName: string
  pdgDate: string
  pdgSignature: string
} {
  const sa = steps.find((s) => s.role === 'purchasing' && s.decision === 'approved')
  const dt = steps.find((s) => s.role === 'technical_director' && s.decision === 'approved')
  const daf = steps.find((s) => s.role === 'daf' && s.decision === 'approved')
  const pdg = steps.find((s) => s.role === 'pdg' && s.decision === 'approved')
  const fmt = (d?: Date | string) => (d ? new Date(d).toLocaleDateString('fr-FR') : '')
  return {
    treatedByName: stepDisplayName(sa),
    treatedByDate: sa ? fmt(sa.createdAt) : '',
    treatedBySignature: sa ? stepSignature(sa) : '',
    validatedByName: stepDisplayName(dt),
    validatedByDate: dt ? fmt(dt.createdAt) : '',
    validatedBySignature: dt ? stepSignature(dt, true) : '',
    dafName: daf ? stepDisplayName(daf) : '',
    dafDate: daf ? fmt(daf.createdAt) : '',
    dafSignature: daf ? stepSignature(daf, true) : '',
    pdgName: pdg ? stepDisplayName(pdg) : '',
    pdgDate: pdg ? fmt(pdg.createdAt) : '',
    pdgSignature: pdg ? stepSignature(pdg, true) : '',
  }
}

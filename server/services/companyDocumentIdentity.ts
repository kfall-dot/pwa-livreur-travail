import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { companyIdentity } from '../../shared/companyIdentity.js'
let logoData: string | null = null
const escapeHtml = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
/** En-tête commun aux documents EFPC ; idempotent, y compris à la consultation d'un document enregistré. */
export function applyCompanyDocumentIdentity(html: string, companyId?: string | null): string {
  const identity = companyIdentity(companyId)
  if (!identity) return html
  if (!logoData) logoData = 'data:image/png;base64,' + readFileSync(resolve('public/branding/efpc-logo.png')).toString('base64')
  const header = `<header data-company-identity="EFPC" style="display:flex;align-items:center;gap:18px;padding:0 0 12px;margin-bottom:14px;border-bottom:2px solid #273548;break-inside:avoid;page-break-inside:avoid;color:#1f2937;font-family:Arial,sans-serif;text-align:left"><img src="${logoData}" alt="Logo EFPC" style="width:88px;height:80px;object-fit:contain;flex-shrink:0"><div style="min-width:0"><strong style="display:block;font-size:12px;line-height:1.5">${escapeHtml(identity.legalName)}</strong><div style="font-size:10px;line-height:1.7;margin-top:5px">${escapeHtml(identity.address)} · ${escapeHtml(identity.postalAddress)}<br>N° RCCM : ${escapeHtml(identity.rccm)} · CC n° : ${escapeHtml(identity.taxpayerNumber)}<br>Tél. : ${escapeHtml(identity.phone)}</div></div></header>`
  const clean = html.replace(/<header\b[^>]*data-company-identity="EFPC"[^>]*>[\s\S]*?<\/header>/gi, '')
  // Insérer dans la feuille imprimable pour respecter ses marges et sa largeur.
  const sheet = /<(?:main|div)\b[^>]*class="(?:sheet|fiche)"[^>]*>/i
  if (sheet.test(clean)) return clean.replace(sheet, match => match + header)
  return clean.replace(/<body([^>]*)>/i, (_, attributes: string) => `<body${attributes}>${header}`)
}

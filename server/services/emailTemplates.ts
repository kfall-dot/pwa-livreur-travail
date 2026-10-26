import { EFPC_IDENTITY } from '../../shared/companyIdentity.js'
import { publicBaseUrl } from '../config/public.js'

export function escapeEmailHtml(value: string): string {
  return value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!)
}

const STATUS_LABELS: Record<string, string> = {
  whatsapp_ingested: 'Message reçu', draft_parsed: 'Brouillon préparé', draft_review: 'À réviser',
  dt_review: 'Validation du DT', sa_head_review: 'Validation du chiffrage par le chef SA',
  bc_head_review: 'Signature du BC par le chef SA', submitted: 'Transmis au Service achats',
  cdg_review: 'Validation du Contrôle de gestion', daf_review: 'Validation du DAF',
  sa_review: 'Émission du bon de commande', bt_pending: 'Bon de trésorerie en préparation',
  bt_ready: 'Bon de trésorerie émis — à payer', deboursed: 'Paiement effectué — facture à joindre',
  paid: 'Payé', daf_bt_review: 'Validation du bon de trésorerie par le DAF', pdg_review: 'Validation du PDG',
  po_ready: 'Bon de commande prêt', delivery_scheduled: 'Livraison planifiée', delivered: 'Livré',
  rejected: 'Refus définitif', correction_required: 'À corriger', correction_head_review: 'Validation de la correction par le chef SA',
}

export function readableEmailText(value: string): string {
  return value.replace(/\b[a-z]+(?:_[a-z]+)+\b/g, token => STATUS_LABELS[token] ?? token).replace(/\bEB\s+(EB-\d)/g, '$1')
}

export function emailActionUrl(path?: string): string | undefined {
  if (!path) return undefined
  try {
    const url = new URL(path, `${publicBaseUrl()}/`)
    return ['https:', 'http:'].includes(url.protocol) ? url.href : undefined
  } catch { return undefined }
}

/** Table et styles intégrés pour les clients Outlook/Gmail ; texte dynamique toujours échappé. */
export function renderEmailTemplate(input: { subject: string; text: string; actionUrl?: string; actionLabel?: string; contentHtml?: string }): string {
  const identity = EFPC_IDENTITY
  const e = escapeEmailHtml
  const action = emailActionUrl(input.actionUrl)
  const logo = emailActionUrl(identity.logoUrl)
  const content = input.contentHtml ?? input.text.split(/\n\s*\n/).filter(Boolean).map(paragraph => `<p style="margin:0 0 18px;line-height:1.7">${e(paragraph).replace(/\n/g, '<br>')}</p>`).join('')
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${e(input.subject)}</title></head><body style="margin:0;background:#f1f5f9;color:#263449;font-family:Arial,Helvetica,sans-serif"><!-- efpc-email-template -->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 12px"><table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#fff;border:1px solid #dbe3ed;border-radius:12px">
<tr><td align="center" style="padding:28px 28px 22px;border-bottom:3px solid #b68a45">${logo ? `<img src="${e(logo)}" width="170" alt="EFPC" style="display:block;width:170px;max-width:100%;height:auto;margin:0 auto 16px">` : '<strong>EFPC</strong>'}<div style="font-size:12px;line-height:1.6;color:#56657a">${e(identity.legalName)}</div></td></tr>
<tr><td style="padding:30px 28px"><div style="font-size:11px;letter-spacing:1.5px;color:#8a6836;margin-bottom:12px">EFPC · NOTIFICATION</div><h1 style="font-size:23px;line-height:1.35;color:#172b46;margin:0 0 24px">${e(input.subject)}</h1><div style="font-size:15px">${content}</div>
${action ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0"><tr><td bgcolor="#172b46" style="border-radius:6px"><a href="${e(action)}" style="display:inline-block;padding:14px 22px;color:#fff;text-decoration:none;font-weight:bold;font-size:14px">${e(input.actionLabel ?? 'Ouvrir l’application')}</a></td></tr></table><p style="font-size:12px;color:#64748b;word-break:break-all">Si le bouton ne fonctionne pas :<br><a href="${e(action)}" style="color:#335a80">${e(action)}</a></p>` : ''}
<p style="margin:26px 0 0;color:#64748b;font-size:12px">Message automatique de l’application EFPC.</p></td></tr>
<tr><td align="center" style="padding:22px;background:#f8fafc;border-top:1px solid #e2e8f0;color:#64748b;font-size:11px;line-height:1.8">${e(identity.address)} · ${e(identity.postalAddress)}<br>Tél. ${e(identity.phone)}<br>RCCM ${e(identity.rccm)} · CC ${e(identity.taxpayerNumber)}</td></tr>
</table></td></tr></table></body></html>`
}

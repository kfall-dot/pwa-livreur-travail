import { sendEmail } from './email.js'
import { publicBaseUrl } from '../config/public.js'

export async function sendManagerInviteEmail(input: {
  to: string
  name: string
  inviterName: string
  companyName: string
  token: string
}): Promise<void> {
  const inviteUrl = `${publicBaseUrl()}/manager/invite?token=${encodeURIComponent(input.token)}`
  const subject = `Invitation TraceO — rejoignez ${input.companyName}`
  const text = [
    `Bonjour ${input.name},`,
    '',
    `${input.inviterName} vous invite à rejoindre l'espace gestionnaire de ${input.companyName} sur TraceO.`,
    '',
    `Pour activer votre compte et choisir votre mot de passe :`,
    inviteUrl,
    '',
    'Ce lien expire sous 72 heures.',
    '',
    '— TraceO',
  ].join('\n')
  const html = `
    <p>Bonjour ${input.name},</p>
    <p><strong>${input.inviterName}</strong> vous invite à rejoindre l'espace gestionnaire de <strong>${input.companyName}</strong> sur TraceO.</p>
    <p><a href="${inviteUrl}">Activer mon compte</a></p>
    <p style="color:#666;font-size:13px">Ce lien expire sous 72 heures.</p>
  `
  await sendEmail({ to: input.to, subject, text, html })
}

export async function sendManagerPasswordResetEmail(input: {
  to: string
  name: string
  token: string
}): Promise<void> {
  const resetUrl = `${publicBaseUrl()}/manager/reset-password?token=${encodeURIComponent(input.token)}`
  const subject = 'Réinitialisation de votre mot de passe TraceO'
  const text = [
    `Bonjour ${input.name},`,
    '',
    'Vous avez demandé la réinitialisation de votre mot de passe gestionnaire TraceO.',
    '',
    resetUrl,
    '',
    'Ce lien expire sous 1 heure. Si vous n\'êtes pas à l\'origine de cette demande, ignorez cet e-mail.',
    '',
    '— TraceO',
  ].join('\n')
  const html = `
    <p>Bonjour ${input.name},</p>
    <p>Vous avez demandé la réinitialisation de votre mot de passe gestionnaire TraceO.</p>
    <p><a href="${resetUrl}">Choisir un nouveau mot de passe</a></p>
    <p style="color:#666;font-size:13px">Ce lien expire sous 1 heure.</p>
  `
  await sendEmail({ to: input.to, subject, text, html })
}

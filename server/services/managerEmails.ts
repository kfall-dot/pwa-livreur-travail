import { sendEmail } from './email.js'
import { renderEmailTemplate } from './emailTemplates.js'
import { publicBaseUrl } from '../config/public.js'

export async function sendManagerInviteEmail(input: {
  to: string
  name: string
  inviterName: string
  companyName: string
  token: string
}): Promise<void> {
  const inviteUrl = `${publicBaseUrl()}/manager/invite?token=${encodeURIComponent(input.token)}`
  const subject = `Invitation EFPC — rejoignez ${input.companyName}`
  const text = [
    `Bonjour ${input.name},`,
    '',
    `${input.inviterName} vous invite à rejoindre l'espace gestionnaire de ${input.companyName} sur EFPC.`,
    '',
    `Pour activer votre compte et choisir votre mot de passe :`,
    inviteUrl,
    '',
    'Ce lien expire sous 72 heures.',
    '',
    '— EFPC',
  ].join('\n')
  const html = renderEmailTemplate({ subject, text, actionUrl: inviteUrl, actionLabel: 'Activer mon compte' })
  await sendEmail({ to: input.to, subject, text, html })
}

export async function sendManagerPasswordResetEmail(input: {
  to: string
  name: string
  token: string
}): Promise<void> {
  const resetUrl = `${publicBaseUrl()}/manager/reset-password?token=${encodeURIComponent(input.token)}`
  const subject = 'Réinitialisation de votre mot de passe EFPC'
  const text = [
    `Bonjour ${input.name},`,
    '',
    'Vous avez demandé la réinitialisation de votre mot de passe gestionnaire EFPC.',
    '',
    resetUrl,
    '',
    'Ce lien expire sous 1 heure. Si vous n\'êtes pas à l\'origine de cette demande, ignorez cet e-mail.',
    '',
    '— EFPC',
  ].join('\n')
  const html = renderEmailTemplate({ subject, text, actionUrl: resetUrl, actionLabel: 'Choisir un nouveau mot de passe' })
  await sendEmail({ to: input.to, subject, text, html })
}

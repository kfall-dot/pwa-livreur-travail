import nodemailer from 'nodemailer'
import { assertSmtpConfigured, emailConfig } from '../config/email.js'
import { captureMockEmail } from '../lib/mockEmailCapture.js'
import { sendBrevoEmail } from './brevoEmail.js'
import { readableEmailText, renderEmailTemplate } from './emailTemplates.js'

export interface EmailPayload {
  to: string
  subject: string
  text: string
  html?: string
}

export interface EmailSendResult {
  success: boolean
  provider: string
  to: string
  messageId?: string
}

async function sendMock(payload: EmailPayload): Promise<EmailSendResult> {
  captureMockEmail(payload)
  console.log(`[EMAIL MOCK] to=${payload.to} subject=${payload.subject}`)
  console.log('[EMAIL MOCK] --- text ---')
  console.log(payload.text)
  return { success: true, provider: 'mock', to: payload.to }
}

async function sendSmtp(payload: EmailPayload): Promise<EmailSendResult> {
  assertSmtpConfigured()
  const transporter = nodemailer.createTransport({
    host: emailConfig.smtp.host,
    port: emailConfig.smtp.port,
    secure: emailConfig.smtp.secure,
    // Évite un hang 30s (timeout lambda) si SMTP/quota Mailtrap bloque
    connectionTimeout: 8_000,
    greetingTimeout: 8_000,
    socketTimeout: 10_000,
    auth: emailConfig.smtp.user
      ? { user: emailConfig.smtp.user, pass: emailConfig.smtp.pass }
      : undefined,
  })
  const info = await transporter.sendMail({
    from: emailConfig.from,
    to: payload.to,
    subject: payload.subject,
    text: payload.text,
    html: payload.html,
  })
  return { success: true, provider: 'smtp', to: payload.to, messageId: info.messageId }
}

export async function sendEmail(payload: EmailPayload): Promise<EmailSendResult> {
  const subject = readableEmailText(payload.subject)
  const text = readableEmailText(payload.text)
  payload = { ...payload, subject, text, html: payload.html?.includes('<!-- efpc-email-template -->') ? payload.html : renderEmailTemplate({ subject, text, contentHtml: payload.html }) }
  if (emailConfig.provider === 'smtp') return sendSmtp(payload)
  if (emailConfig.provider === 'brevo') return sendBrevoEmail(payload, emailConfig.from, emailConfig.brevoApiKey)
  if (emailConfig.provider === 'mock') return sendMock(payload)
  throw new Error('EMAIL_PROVIDER invalide ; valeurs autorisées : mock, smtp, brevo.')
}

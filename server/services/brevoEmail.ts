import type { EmailPayload, EmailSendResult } from './email.js'

function failure(code: string, responseCode?: number) {
  return Object.assign(new Error(`Échec de l’envoi Brevo (${code}).`), { code, responseCode })
}

export async function sendBrevoEmail(payload: EmailPayload, from: string, apiKey: string, fromName = 'EFPC'): Promise<EmailSendResult> {
  if (!apiKey || !from) throw failure('BREVO_CONFIG_MISSING')
  try {
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': apiKey, accept: 'application/json', 'content-type': 'application/json' },
      signal: AbortSignal.timeout(10_000),
      body: JSON.stringify({
        sender: { email: from, name: fromName }, to: [{ email: payload.to }], subject: payload.subject,
        ...(payload.html ? { htmlContent: payload.html } : { textContent: payload.text }),
      }),
    })
    // Ne jamais propager le corps d’erreur externe (adresses, contenu ou secrets).
    if (!response.ok) {
      await response.body?.cancel()
      throw failure('BREVO_HTTP_ERROR', response.status)
    }
    const body: unknown = await response.json()
    if (!body || typeof body !== 'object' || !('messageId' in body) || typeof body.messageId !== 'string' || !body.messageId.trim()) {
      throw failure('BREVO_INVALID_RESPONSE')
    }
    return { success: true, provider: 'brevo', to: payload.to, messageId: body.messageId }
  } catch (error) {
    const details = error as { code?: string; name?: string }
    if (typeof details.code === 'string' && details.code.startsWith('BREVO_')) throw error
    throw failure(details.name === 'TimeoutError' || details.name === 'AbortError' ? 'ETIMEDOUT' : 'BREVO_NETWORK_ERROR')
  }
}

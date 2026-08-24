import twilio from 'twilio'
import { normalizeDriverPhone } from '../../shared/phone.js'
import {
  assertTextbeeConfigured,
  assertTwilioConfigured,
  getSmsProvider,
  getTextbeeConfig,
  getTwilioConfig,
  type SmsProvider,
} from '../config/sms.js'
import { buildOtpSmsBody, type OtpSmsContext } from './smsMessages.js'

export interface SmsSendResult {
  success: boolean
  provider: SmsProvider | 'mock'
  messageId?: string
  status?: string
  error?: string
  details?: string
}

function normalizePhone(phone: string): string {
  return normalizeDriverPhone(phone)
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function sendMockSms(phone: string, message: string): Promise<SmsSendResult> {
  console.log(`[SMS MOCK] to=${phone} body=${message.replace(/\n/g, ' | ')}`)
  return { success: true, provider: 'mock', messageId: 'mock-local', status: 'mock' }
}

async function sendTextbeeSms(
  phone: string,
  message: string,
  fetchImpl: typeof fetch = fetch,
): Promise<SmsSendResult> {
  const textbee = getTextbeeConfig()
  assertTextbeeConfigured()
  const recipient = normalizePhone(phone)
  if (!recipient) {
    return { success: false, provider: 'textbee', error: 'SMS_INVALID_PHONE', details: 'Numéro vide' }
  }

  const url = `${textbee.baseUrl}/gateway/devices/${encodeURIComponent(textbee.deviceId)}/send-sms`
  const maxAttempts = 2
  let lastNetworkErr: unknown

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const res = await fetchImpl(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': textbee.apiKey,
        },
        body: JSON.stringify({ recipients: [recipient], message }),
        signal: AbortSignal.timeout(10_000),
      })

      if (!res.ok) {
        const body = await res.text().catch(() => '')
        console.error('[textbee] envoi SMS échoué:', res.status, body)
        return {
          success: false,
          provider: 'textbee',
          error: 'SMS_SEND_FAILED',
          details: body || `HTTP ${res.status}`,
        }
      }

      let data: Record<string, unknown> = {}
      try {
        data = (await res.json()) as Record<string, unknown>
      } catch {
        /* réponse vide acceptable */
      }
      const nested = data.data as Record<string, unknown> | undefined
      return {
        success: true,
        provider: 'textbee',
        messageId: String(
          data.id ?? data.messageId ?? nested?.smsBatchId ?? data.smsId ?? 'textbee'
        ),
        status: String(data.status ?? nested?.message ?? 'sent'),
      }
    } catch (networkErr) {
      lastNetworkErr = networkErr
      const code =
        networkErr instanceof Error
          ? networkErr.cause instanceof Error
            ? networkErr.cause.message
            : networkErr.message
          : String(networkErr)
      console.warn(`[textbee] tentative ${attempt}/${maxAttempts} échouée: ${code}`)
      if (attempt < maxAttempts) await sleep(400 * attempt)
    }
  }

  const details =
    lastNetworkErr instanceof Error
      ? `Connexion Textbee échouée (${lastNetworkErr.message})`
      : 'Connexion à Textbee impossible'
  return { success: false, provider: 'textbee', error: 'SMS_SEND_FAILED', details }
}

async function sendTwilioSms(phone: string, message: string): Promise<SmsSendResult> {
  const twilioCfg = getTwilioConfig()
  assertTwilioConfigured()
  const recipient = normalizePhone(phone)
  if (!recipient) {
    return { success: false, provider: 'twilio', error: 'SMS_INVALID_PHONE', details: 'Numéro vide' }
  }

  try {
    const client = twilio(twilioCfg.sid, twilioCfg.token)
    const result = await client.messages.create({
      body: message,
      from: twilioCfg.number,
      to: recipient,
    })
    return {
      success: true,
      provider: 'twilio',
      messageId: result.sid,
      status: result.status,
    }
  } catch (err) {
    const details = err instanceof Error ? err.message : String(err)
    console.error('[twilio] envoi SMS échoué:', details)
    return { success: false, provider: 'twilio', error: 'SMS_SEND_FAILED', details }
  }
}

export async function sendSmsMessage(
  phone: string,
  message: string,
  options?: { fetchImpl?: typeof fetch },
): Promise<SmsSendResult> {
  const provider = getSmsProvider()
  if (provider === 'textbee') {
    return sendTextbeeSms(phone, message, options?.fetchImpl ?? fetch)
  }
  if (provider === 'twilio') {
    return sendTwilioSms(phone, message)
  }
  return sendMockSms(phone, message)
}

export async function sendOtpSms(
  phone: string,
  otpCode: string,
  context: OtpSmsContext,
  options?: { fetchImpl?: typeof fetch },
): Promise<SmsSendResult> {
  const message = buildOtpSmsBody(otpCode, context)
  return sendSmsMessage(phone, message, options)
}

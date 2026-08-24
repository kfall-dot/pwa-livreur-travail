export type SmsProvider = 'mock' | 'textbee' | 'twilio'

export function getSmsProvider(): SmsProvider {
  return (process.env.SMS_PROVIDER ?? 'mock').trim().toLowerCase() as SmsProvider
}

export function getTextbeeConfig() {
  return {
    apiKey: process.env.TEXTBEE_API_KEY?.trim() ?? '',
    deviceId: process.env.TEXTBEE_DEVICE_ID?.trim() ?? '',
    baseUrl: (process.env.TEXTBEE_API_BASE?.trim() || 'https://api.textbee.dev/api/v1').replace(/\/$/, ''),
  }
}

export function getTwilioConfig() {
  return {
    sid: process.env.TWILIO_SID?.trim() || process.env.TWILIO_ACCOUNT_SID?.trim() || '',
    token: process.env.TWILIO_TOKEN?.trim() || process.env.TWILIO_AUTH_TOKEN?.trim() || '',
    number: process.env.TWILIO_NUMBER?.trim() || process.env.TWILIO_FROM_NUMBER?.trim() || '',
  }
}

/** @deprecated Préférer getSmsProvider() — lecture à l’exécution */
export const smsConfig = {
  get provider() {
    return getSmsProvider()
  },
  get textbee() {
    return getTextbeeConfig()
  },
  get twilio() {
    return getTwilioConfig()
  },
}

export function isSmsOtpFailOpen(): boolean {
  return process.env.SMS_OTP_FAIL_OPEN === 'true' || process.env.SMS_OTP_FAIL_OPEN === '1'
}

export function assertTextbeeConfigured(): void {
  const textbee = getTextbeeConfig()
  const missing: string[] = []
  if (!textbee.apiKey) missing.push('TEXTBEE_API_KEY')
  if (!textbee.deviceId) missing.push('TEXTBEE_DEVICE_ID')
  if (missing.length) {
    throw new Error(`Configuration Textbee incomplète : ${missing.join(', ')}`)
  }
}

export function assertTwilioConfigured(): void {
  const twilioCfg = getTwilioConfig()
  const missing: string[] = []
  if (!twilioCfg.sid) missing.push('TWILIO_SID (ou TWILIO_ACCOUNT_SID)')
  if (!twilioCfg.token) missing.push('TWILIO_TOKEN (ou TWILIO_AUTH_TOKEN)')
  if (!twilioCfg.number) missing.push('TWILIO_NUMBER (ou TWILIO_FROM_NUMBER)')
  if (missing.length) {
    throw new Error(`Configuration Twilio incomplète : ${missing.join(', ')}`)
  }
}

export function describeSmsProvider(): string {
  const provider = getSmsProvider()
  if (provider === 'textbee') {
    return `textbee (${getTextbeeConfig().baseUrl})`
  }
  if (provider === 'twilio') {
    return `twilio (${getTwilioConfig().number || 'numéro non défini'})`
  }
  return 'mock (logs console)'
}

export type EmailProvider = 'mock' | 'smtp'

export const emailConfig = {
  provider: (process.env.EMAIL_PROVIDER ?? 'mock') as EmailProvider,
  from: process.env.EMAIL_FROM ?? 'support@btp-pilote.ci',
  smtp: {
    host: process.env.SMTP_HOST ?? '',
    port: parseInt(process.env.SMTP_PORT ?? '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER ?? '',
    pass: process.env.SMTP_PASS ?? '',
  },
}

export function assertSmtpConfigured(): void {
  const missing: string[] = []
  if (!emailConfig.smtp.host) missing.push('SMTP_HOST')
  if (!emailConfig.from) missing.push('EMAIL_FROM')
  if (missing.length) {
    throw new Error(`Configuration SMTP incomplète : ${missing.join(', ')}`)
  }
}

export function describeEmailProvider(): string {
  if (emailConfig.provider === 'smtp') {
    return `smtp (${emailConfig.smtp.host}:${emailConfig.smtp.port})`
  }
  return 'mock (logs console)'
}

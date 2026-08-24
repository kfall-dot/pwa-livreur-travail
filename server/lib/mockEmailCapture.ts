import type { EmailPayload } from '../services/email.js'

const store = new Map<string, EmailPayload>()

export function captureMockEmail(payload: EmailPayload): void {
  store.set(payload.to.trim().toLowerCase(), payload)
}

export function getLastMockEmailTo(to: string): EmailPayload | null {
  return store.get(to.trim().toLowerCase()) ?? null
}

export function clearMockEmails(): void {
  store.clear()
}

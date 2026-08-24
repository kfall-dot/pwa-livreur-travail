import { createHmac, randomBytes, timingSafeEqual } from 'crypto'

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

function base32Encode(buf: Buffer): string {
  let bits = 0
  let value = 0
  let output = ''
  for (const byte of buf) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31]
  return output
}

function base32Decode(input: string): Buffer {
  const cleaned = input.replace(/=+$/g, '').toUpperCase().replace(/[^A-Z2-7]/g, '')
  let bits = 0
  let value = 0
  const out: number[] = []
  for (const char of cleaned) {
    const idx = BASE32_ALPHABET.indexOf(char)
    if (idx < 0) continue
    value = (value << 5) | idx
    bits += 5
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255)
      bits -= 8
    }
  }
  return Buffer.from(out)
}

function hotp(secret: Buffer, counter: number): string {
  const buf = Buffer.alloc(8)
  buf.writeBigUInt64BE(BigInt(counter))
  const hmac = createHmac('sha1', secret).update(buf).digest()
  const offset = hmac[hmac.length - 1]! & 0x0f
  const code =
    ((hmac[offset]! & 0x7f) << 24) |
    ((hmac[offset + 1]! & 0xff) << 16) |
    ((hmac[offset + 2]! & 0xff) << 8) |
    (hmac[offset + 3]! & 0xff)
  return String(code % 1_000_000).padStart(6, '0')
}

export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20))
}

export function totpAt(secretBase32: string, timeMs = Date.now(), stepSec = 30): string {
  const counter = Math.floor(timeMs / 1000 / stepSec)
  return hotp(base32Decode(secretBase32), counter)
}

export function verifyTotpCode(secretBase32: string, code: string, window = 1): boolean {
  const normalized = String(code ?? '').replace(/\s/g, '')
  if (!/^\d{6}$/.test(normalized)) return false
  const now = Date.now()
  for (let w = -window; w <= window; w++) {
    const expected = totpAt(secretBase32, now + w * 30_000)
    try {
      const a = Buffer.from(expected)
      const b = Buffer.from(normalized)
      if (a.length === b.length && timingSafeEqual(a, b)) return true
    } catch {
      if (expected === normalized) return true
    }
  }
  return false
}

export function totpOtpAuthUri(secretBase32: string, email: string, issuer = 'TraceO'): string {
  const label = encodeURIComponent(`${issuer}:${email}`)
  const query = new URLSearchParams({
    secret: secretBase32,
    issuer,
    algorithm: 'SHA1',
    digits: '6',
    period: '30',
  })
  return `otpauth://totp/${label}?${query.toString()}`
}

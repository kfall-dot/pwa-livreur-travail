import { allowTestBypass } from '../config/production.js'

/** Entrée démo publique (QR sales deck) — données co-demo uniquement. */
export function isPublicDemoEnabled(): boolean {
  const flag = process.env.PUBLIC_DEMO_ENABLED?.trim().toLowerCase()
  if (flag === 'true' || flag === '1') return true
  return allowTestBypass()
}

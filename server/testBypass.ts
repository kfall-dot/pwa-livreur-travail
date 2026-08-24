/**
 * Contournements côté API.
 * GEOFENCE_BYPASS peut être activé en production pilote (warn au boot).
 * OTP_CODE / DRIVER_PIN restent interdits en production.
 */

import { allowTestBypass } from './config/production.js'

const truthy = (v: string | undefined) => v === 'true' || v === '1'

export const testBypass = {
  /** Ignore les contrôles de distance GPS (200 m démarrage, 100 m confirmation). */
  geofence: truthy(process.env.GEOFENCE_BYPASS),
  fixedOtp: allowTestBypass() ? (process.env.OTP_CODE?.trim() || '123456') : null,
  allowReset: allowTestBypass() && truthy(process.env.ALLOW_RESET),
} as const

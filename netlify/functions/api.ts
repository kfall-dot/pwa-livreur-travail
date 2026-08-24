import serverless from 'serverless-http'
import { connectLambda } from '@netlify/blobs'
import { validateJwtSecretAtStartup } from '../../server/config/jwt.js'
import { validateProductionBypassAtStartup } from '../../server/config/production.js'
import { validateProductionSecurityAtStartup } from '../../server/config/productionAudit.js'
import { initSentry, flushSentry } from '../../server/lib/sentry.js'
import { createApp } from '../../server/app.js'

initSentry()
validateJwtSecretAtStartup()
validateProductionBypassAtStartup()
validateProductionSecurityAtStartup()
const app = createApp()
/** PDF/images must be base64 in the Lambda response — utf8 corrupts binary and
 *  netlify-cli then returns 500 "Could not proxy request" (UI: pièce jointe introuvable). */
const serverlessHandler = serverless(app, {
  binary: (headers: Record<string, string | undefined>) => {
    const ct = String(headers['content-type'] ?? headers['Content-Type'] ?? '').split(';')[0].trim().toLowerCase()
    if (!ct) return false
    if (ct.startsWith('image/')) return true
    if (ct === 'application/pdf' || ct === 'application/octet-stream') return true
    if (ct.includes('excel') || ct.includes('spreadsheet')) return true
    return false
  },
})

type LambdaEvent = Parameters<typeof connectLambda>[0] & Record<string, unknown>

/**
 * Functions v1 (`export const handler`) n’injecte pas Blobs automatiquement.
 * `connectLambda` lit le contexte Blobs depuis l’événement Lambda avant Express.
 */
export const handler = async (event: LambdaEvent, context: object) => {
  try {
    connectLambda(event)
  } catch (err) {
    console.warn('[api] connectLambda failed — Blobs may be unavailable:', (err as Error).message)
  }
  try {
    return await serverlessHandler(event, context)
  } finally {
    await flushSentry()
  }
}

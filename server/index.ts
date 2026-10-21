import { createApp } from './app.js'
import { describeEmailProvider } from './config/email.js'
import { describeSmsProvider } from './config/sms.js'
import { validateJwtSecretAtStartup } from './config/jwt.js'
import { validateProductionBypassAtStartup } from './config/production.js'
import { validateProductionSecurityAtStartup } from './config/productionAudit.js'
import { initSentry } from './lib/sentry.js'
import { testBypass } from './testBypass.js'
import { applyMigrations } from './db/applyMigrations.js'

initSentry()
validateJwtSecretAtStartup()
validateProductionBypassAtStartup()
validateProductionSecurityAtStartup()

export const app = createApp()

// Serveur HTTP Node (Railway / Netlify Functions) : migrations au démarrage
// puis écoute HTTP. La cible de déploiement est Node — pas d'adaptateur
// serverless/edge (expérimentation Cloudflare Workers abandonnée).
if (process.env.SKIP_MIGRATIONS !== '1') {
  try {
    await applyMigrations()
  } catch (err) {
    console.error('[migrations] échec au démarrage :', err instanceof Error ? err.message : err)
    process.exit(1)
  }
}
const PORT = Number(process.env.PORT ?? 3002)
app.listen(PORT, () => {
  console.log(`API Livreur → http://localhost:${PORT}/api`)
  console.log(`Health      → http://localhost:${PORT}/api/health`)
  console.log(`E-mail      → ${describeEmailProvider()}`)
  console.log(`SMS OTP     → ${describeSmsProvider()}`)
  if (testBypass.geofence) {
    console.log('GEOFENCE_BYPASS actif (tests)')
  }
})
